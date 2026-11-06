import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import {
  AccountId,
  Client,
  inspectHederaTransaction,
  TokenId,
  TransactionId,
  TransferTransaction,
  type Transaction,
} from "@x402/hedera";
import { config } from "../config.js";
import { deviceAccountId, deviceKey } from "../hedera/client.js";
import type { PaymentToSign } from "../policy.js";

type PaymentRequired = ReturnType<typeof decodePaymentRequiredHeader>;
type Requirement = PaymentRequired["accepts"][number];

export class PaymentRejected extends Error {}

const NETWORK = `hedera:${config.hedera.network}`;

function pickRequirement(required: PaymentRequired): Requirement {
  const req = required.accepts.find(
    (a) => a.scheme === "exact" && a.network === NETWORK && a.asset === config.hedera.usdcTokenId,
  );
  if (!req) {
    const offered = required.accepts.map((a) => `${a.scheme}/${a.network}/${a.asset}`).join(", ");
    throw new PaymentRejected(`Merchant does not accept USDC on ${NETWORK} (offered: ${offered || "nothing"})`);
  }
  if (typeof req.extra?.feePayer !== "string") throw new PaymentRejected("Merchant's payment terms have no Hedera fee payer");
  return req;
}

/** The exact x402 transfer: device -> payTo, fee paid by the facilitator. Frozen, not signed. */
function buildTransfer(req: Requirement): Transaction {
  const token = TokenId.fromString(req.asset);
  const amount = BigInt(req.amount);
  const tx = new TransferTransaction()
    .addTokenTransfer(token, deviceAccountId, -amount)
    .addTokenTransfer(token, AccountId.fromString(req.payTo), amount)
    .setTransactionId(TransactionId.generate(AccountId.fromString(req.extra.feePayer as string)));
  const client = config.hedera.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  try {
    tx.freezeWith(client);
  } finally {
    client.close();
  }
  return tx;
}

/** Decodes the transaction bytes back into who pays whom, so nothing but the bytes themselves is trusted. */
function decodeTransfer(bytes: Uint8Array, req: Requirement): PaymentToSign {
  const tx = inspectHederaTransaction(Buffer.from(bytes).toString("base64"));
  if (tx.hasNonTransferOperations || tx.hbarTransfers.length > 0) throw new PaymentRejected("Payment contains more than a token transfer");
  if (tx.transactionIdAccountId !== req.extra.feePayer) throw new PaymentRejected("Payment transaction is not paid for by the facilitator");
  const tokens = Object.keys(tx.tokenTransfers);
  if (tokens.length !== 1) throw new PaymentRejected("Payment moves more than one token");
  const legs = tx.tokenTransfers[tokens[0]];
  const debits = legs.filter((l) => BigInt(l.amount) < 0n);
  const credits = legs.filter((l) => BigInt(l.amount) > 0n);
  if (debits.length !== 1 || credits.length !== 1 || BigInt(debits[0].amount) + BigInt(credits[0].amount) !== 0n) {
    throw new PaymentRejected("Payment is not a single transfer from this device to one recipient");
  }
  return { tokenId: tokens[0], payFrom: debits[0].accountId, payTo: credits[0].accountId, amount: BigInt(credits[0].amount) };
}

const samePayment = (a: PaymentToSign, b: PaymentToSign) =>
  a.amount === b.amount && a.payTo === b.payTo && a.payFrom === b.payFrom && a.tokenId === b.tokenId;

/**
 * Requests an x402 resource and pays for it.
 * `approve` sees the payment decoded from the transaction bytes and throws to refuse; nothing is signed before it returns.
 */
export async function payX402(
  url: string,
  opts: { signal: AbortSignal; approve: (payment: PaymentToSign) => Promise<void> },
): Promise<{ hederaTxId: string; status: number; body: string }> {
  const first = await fetch(url, { signal: opts.signal });
  if (first.status !== 402) {
    throw new PaymentRejected(`Merchant answered ${first.status} instead of asking for payment`);
  }
  const header = first.headers.get("PAYMENT-REQUIRED");
  if (!header) throw new PaymentRejected("Merchant's 402 has no PAYMENT-REQUIRED header");
  const required = decodePaymentRequiredHeader(header);
  const req = pickRequirement(required);

  const draft = decodeTransfer(buildTransfer(req).toBytes(), req);
  await opts.approve(draft);
  if (opts.signal.aborted) throw new PaymentRejected("Cancelled");

  // Hedera transactions are valid for 120s from creation, so the signed one is built after the human approves.
  const tx = buildTransfer(req);
  if (!samePayment(decodeTransfer(tx.toBytes(), req), draft)) throw new PaymentRejected("Payment changed after approval");
  const signed = await tx.sign(deviceKey);
  const payload = {
    x402Version: required.x402Version,
    resource: required.resource,
    accepted: req,
    ...(required.extensions ? { extensions: required.extensions } : {}),
    payload: { transaction: Buffer.from(signed.toBytes()).toString("base64") },
  };

  const paid = await fetch(url, {
    headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await paid.text();
  const responseHeader = paid.headers.get("PAYMENT-RESPONSE") ?? paid.headers.get("X-PAYMENT-RESPONSE");
  if (!paid.ok || !responseHeader) {
    throw new Error(`Payment was not settled (HTTP ${paid.status}): ${body.slice(0, 300)}`);
  }
  const settle = decodePaymentResponseHeader(responseHeader);
  if (!settle.success || !settle.transaction) {
    throw new Error(`Facilitator could not settle: ${settle.errorReason ?? settle.errorMessage ?? "unknown"}`);
  }
  return { hederaTxId: settle.transaction, status: paid.status, body };
}
