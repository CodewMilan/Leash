import type { decodePaymentRequiredHeader } from "@x402/core/http";
import {
  AccountId,
  Client,
  inspectHederaTransaction,
  TokenId,
  TransactionId,
  TransferTransaction,
  type Transaction,
} from "@x402/hedera";
import type { PaymentToSign } from "./policy.js";

export type PaymentRequired = ReturnType<typeof decodePaymentRequiredHeader>;
export type Requirement = PaymentRequired["accepts"][number];
export type HederaNetwork = "testnet" | "mainnet";

export class PaymentRejected extends Error {}

/** Picks the merchant's exact-scheme USDC offer on our network, or refuses. */
export function pickRequirement(required: PaymentRequired, network: HederaNetwork, usdcTokenId: string): Requirement {
  const caip = `hedera:${network}`;
  const req = required.accepts.find((a) => a.scheme === "exact" && a.network === caip && a.asset === usdcTokenId);
  if (!req) {
    const offered = required.accepts.map((a) => `${a.scheme}/${a.network}/${a.asset}`).join(", ");
    throw new PaymentRejected(`Merchant does not accept USDC on ${caip} (offered: ${offered || "nothing"})`);
  }
  if (typeof req.extra?.feePayer !== "string") throw new PaymentRejected("Merchant's payment terms have no Hedera fee payer");
  return req;
}

/** The exact x402 transfer: device -> payTo, fee paid by the facilitator. Frozen, not signed. */
export function buildTransfer(req: Requirement, from: string, network: HederaNetwork): Transaction {
  const token = TokenId.fromString(req.asset);
  const amount = BigInt(req.amount);
  const tx = new TransferTransaction()
    .addTokenTransfer(token, AccountId.fromString(from), -amount)
    .addTokenTransfer(token, AccountId.fromString(req.payTo), amount)
    .setTransactionId(TransactionId.generate(AccountId.fromString(req.extra.feePayer as string)));
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  try {
    tx.freezeWith(client);
  } finally {
    client.close();
  }
  return tx;
}

/** Decodes transaction bytes back into who pays whom, so nothing but the bytes themselves is trusted. */
export function decodeTransfer(bytes: Uint8Array, feePayer: string): PaymentToSign {
  const tx = inspectHederaTransaction(Buffer.from(bytes).toString("base64"));
  if (tx.hasNonTransferOperations || tx.hbarTransfers.length > 0) throw new PaymentRejected("Payment contains more than a token transfer");
  if (tx.transactionIdAccountId !== feePayer) throw new PaymentRejected("Payment transaction is not paid for by the facilitator");
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

export const samePayment = (a: PaymentToSign, b: PaymentToSign) =>
  a.amount === b.amount && a.payTo === b.payTo && a.payFrom === b.payFrom && a.tokenId === b.tokenId;
