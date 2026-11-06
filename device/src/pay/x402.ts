import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { config } from "../config.js";
import type { PaymentToSign } from "../core/policy.js";
import { buildTransfer, decodeTransfer, PaymentRejected, pickRequirement, samePayment } from "../core/transfer.js";
import { deviceKey } from "../hedera/client.js";

export { PaymentRejected } from "../core/transfer.js";

/**
 * Requests an x402 resource and pays for it.
 * `approve` sees the payment decoded from the transaction bytes and throws to refuse; nothing is signed before it returns.
 */
export async function payX402(
  url: string,
  opts: { signal: AbortSignal; approve: (payment: PaymentToSign) => Promise<void> },
): Promise<{ hederaTxId: string; status: number; body: string }> {
  const { network, accountId, usdcTokenId } = config.hedera;
  const first = await fetch(url, { signal: opts.signal });
  if (first.status !== 402) {
    throw new PaymentRejected(`Merchant answered ${first.status} instead of asking for payment`);
  }
  const header = first.headers.get("PAYMENT-REQUIRED");
  if (!header) throw new PaymentRejected("Merchant's 402 has no PAYMENT-REQUIRED header");
  const required = decodePaymentRequiredHeader(header);
  const req = pickRequirement(required, network, usdcTokenId);
  const feePayer = req.extra.feePayer as string;

  const draft = decodeTransfer(buildTransfer(req, accountId, network).toBytes(), feePayer);
  await opts.approve(draft);
  if (opts.signal.aborted) throw new PaymentRejected("Cancelled");

  // Hedera transactions are valid for 120s from creation, so the signed one is built after the human approves.
  const tx = buildTransfer(req, accountId, network);
  if (!samePayment(decodeTransfer(tx.toBytes(), feePayer), draft)) throw new PaymentRejected("Payment changed after approval");
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
