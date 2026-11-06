import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError, required } from "../config";
import { decrypt } from "../security/crypto";
import { sql } from "../db";
import { readLimitedBody } from "../http/response";

const payoutStatuses = z.enum(["queued", "pending", "processing", "processed", "reversed", "failed", "rejected", "cancelled"]);
type PayoutStatus = z.infer<typeof payoutStatuses>;
type PayoutRow = { gift_id: string; idempotency_key: string; details: string; contact_id: string | null; fund_account_id: string | null; payout_id: string | null; status: string };
const payoutResponse = z.object({ id: z.string().startsWith("pout_"), status: payoutStatuses });
function authorization() {
  const id = required("RAZORPAYX_KEY_ID");
  if (!id.startsWith("rzp_test_")) throw new AppError("Only RazorpayX test keys are permitted in this build.", 503);
  return `Basic ${Buffer.from(`${id}:${required("RAZORPAYX_KEY_SECRET")}`).toString("base64")}`;
}
async function razorpay(path: string, data?: unknown, idempotencyKey?: string) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: { authorization: authorization(), "content-type": "application/json", ...(idempotencyKey ? { "X-Payout-Idempotency": idempotencyKey } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new AppError("The test payout provider is unavailable. Your payout will be reconciled before retrying.", 503);
  return response.json();
}
export async function recordPayoutStatus(id: string, status: PayoutStatus) {
  // A delayed processing webhook must never overwrite a final outcome. Reversal can follow processed.
  await sql(`UPDATE payouts SET status=$2,updated_at=now(),error=NULL WHERE payout_id=$1 AND (
    status NOT IN ('processed','reversed','failed','rejected','cancelled') OR status=$2 OR (status='processed' AND $2='reversed'))`, [id, status]);
}
export async function executePayout(giftId: string) {
  const [row] = await sql<PayoutRow & { gift_status: string; paise: string; settlement_tx: string }>(
    "SELECT p.*,g.status AS gift_status,g.paise,g.settlement_tx FROM payouts p JOIN gifts g ON g.id=p.gift_id WHERE p.gift_id=$1", [giftId]);
  if (!row || row.gift_status !== "settled" || !row.settlement_tx) throw new AppError("Token settlement must confirm before payout.", 409);
  if (["processed", "reversed", "failed", "rejected", "cancelled"].includes(row.status)) return;
  if (row.payout_id) {
    const payout = payoutResponse.parse(await razorpay(`payouts/${encodeURIComponent(row.payout_id)}`));
    if (payout.id !== row.payout_id) throw new AppError("Payout reconciliation did not match.", 503);
    await recordPayoutStatus(payout.id, payout.status);
    return;
  }
  const details = decrypt<{ name: string; upi: string }>(row.details);
  if (!row.contact_id) {
    const contact = z.object({ id: z.string().startsWith("cont_") }).parse(await razorpay("contacts", { name: details.name, type: "customer", reference_id: giftId.slice(2, 34) }));
    row.contact_id = contact.id;
    await sql("UPDATE payouts SET contact_id=$2 WHERE gift_id=$1", [giftId, contact.id]);
  }
  if (!row.fund_account_id) {
    const account = z.object({ id: z.string().startsWith("fa_") }).parse(await razorpay("fund_accounts", { contact_id: row.contact_id, account_type: "vpa", vpa: { address: details.upi } }));
    row.fund_account_id = account.id;
    await sql("UPDATE payouts SET fund_account_id=$2 WHERE gift_id=$1", [giftId, account.id]);
  }
  const amount = Number(row.paise);
  if (!Number.isSafeInteger(amount) || amount < 100) throw new AppError("Payout amount is invalid.");
  // The same key and exact payload are used even after a timeout or a worker restart.
  const payout = payoutResponse.parse(await razorpay("payouts", { account_number: required("RAZORPAYX_ACCOUNT_NUMBER"),
    fund_account_id: row.fund_account_id, amount, currency: "INR", mode: "UPI", purpose: "payout", queue_if_low_balance: true,
    reference_id: giftId.slice(2, 34), narration: "Shagun test gift" }, row.idempotency_key));
  await sql("UPDATE payouts SET payout_id=$2,updated_at=now() WHERE gift_id=$1", [giftId, payout.id]);
  await recordPayoutStatus(payout.id, payout.status);
}
export async function receiveWebhook(request: Request) {
  const raw = await readLimitedBody(request, 64_000);
  const signature = request.headers.get("x-razorpay-signature") || "";
  const expected = createHmac("sha256", required("RAZORPAYX_WEBHOOK_SECRET")).update(raw).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(signature) || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) throw new AppError("Invalid webhook signature.", 403);
  const eventId = request.headers.get("x-razorpay-event-id");
  if (!eventId || eventId.length > 200) throw new AppError("Webhook event ID is missing.");
  const event = z.object({ event: z.string(), payload: z.object({ payout: z.object({ entity: payoutResponse }) }) }).parse(JSON.parse(raw));
  const payout = event.payload.payout.entity;
  if (event.event !== `payout.${payout.status}`) throw new AppError("Webhook event does not match payout state.");
  await sql(`WITH event AS (INSERT INTO webhook_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id)
    UPDATE payouts SET status=$3,updated_at=now(),error=NULL WHERE payout_id=$2 AND EXISTS(SELECT 1 FROM event)
    AND (status NOT IN ('processed','reversed','failed','rejected','cancelled') OR status=$3 OR (status='processed' AND $3='reversed'))`,
  [eventId, payout.id, payout.status]);
  return Response.json({ received: true });
}
