import { z } from "zod";
import { AppError, required } from "../config";
import { sql } from "../db";
import { readLimitedBody } from "../http/response";
import { verifyLithicSignature } from "./lithic";

export const PHASE0_PURPOSE = "shagun-phase0";
export const PHASE0_LIMIT_CENTS = 2_500;

const asaRequest = z.object({
  token: z.string(),
  status: z.string(),
  amount: z.number().int(),
  cardholder_currency: z.string().optional(),
  amounts: z
    .object({ cardholder: z.object({ amount: z.number().int(), currency: z.string() }) })
    .partial()
    .optional(),
  card: z.object({
    token: z.string(),
    last_four: z.string().optional(),
    tags: z.record(z.string(), z.string()).nullish(),
  }),
  merchant: z.object({ mcc: z.string().optional(), descriptor: z.string().optional() }).partial(),
});
type AsaRequest = z.infer<typeof asaRequest>;

const lithicEvent = z.object({
  event_type: z.string(),
  payload: z.object({ token: z.string().optional(), status: z.string().optional() }).loose(),
});

async function verifiedBody(request: Request, secretName: string) {
  const raw = await readLimitedBody(request, 256_000);
  const id = verifyLithicSignature(raw, request.headers, required(secretName));
  if (!id) throw new AppError("Invalid webhook signature.", 400);
  try {
    return { id, body: JSON.parse(raw) as unknown };
  } catch {
    throw new AppError("Invalid webhook body.", 400);
  }
}

function charge(asa: AsaRequest) {
  const cardholder = asa.amounts?.cardholder;
  return {
    amount: cardholder?.amount ?? asa.amount,
    currency: (cardholder?.currency ?? asa.cardholder_currency ?? "").toUpperCase(),
  };
}

function decide(asa: AsaRequest) {
  const { amount, currency } = charge(asa);
  if (!["AUTHORIZATION", "FINANCIAL_AUTHORIZATION"].includes(asa.status))
    return { result: "UNAUTHORIZED_MERCHANT", reason: "unsupported_status" };
  if (asa.card.tags?.purpose !== PHASE0_PURPOSE)
    return { result: "UNAUTHORIZED_MERCHANT", reason: "unknown_card" };
  if (currency !== "USD") return { result: "UNAUTHORIZED_MERCHANT", reason: "unsupported_currency" };
  if (amount <= 0 || amount > PHASE0_LIMIT_CENTS)
    return { result: "INSUFFICIENT_FUNDS", reason: "over_budget" };
  return { result: "APPROVED", reason: "within_budget" };
}

/**
 * Auth Stream Access responder. Lithic times out at six seconds and retries 5xx responses, so the
 * decision is a pure function of the request and every failure after verification declines.
 */
export async function receiveAuthorizationRequest(request: Request) {
  const started = Date.now();
  const { id, body } = await verifiedBody(request, "LITHIC_ASA_SECRET");
  const parsed = asaRequest.safeParse(body);
  const token = parsed.success
    ? parsed.data.token
    : z.object({ token: z.string() }).safeParse(body).data?.token;
  let decision = { result: "UNAUTHORIZED_MERCHANT", reason: "malformed_request" };
  if (parsed.success) {
    try {
      decision = decide(parsed.data);
    } catch {
      decision = { result: "UNAUTHORIZED_MERCHANT", reason: "error" };
    }
  }
  const asa = parsed.success ? parsed.data : null;
  console.log(
    JSON.stringify({
      event: "lithic.asa.request",
      webhookId: id,
      transaction: token ?? null,
      status: asa?.status ?? null,
      card: asa?.card.token ?? null,
      lastFour: asa?.card.last_four ?? null,
      ...(asa ? charge(asa) : { amount: null, currency: null }),
      mcc: asa?.merchant.mcc ?? null,
      result: decision.result,
      reason: decision.reason,
      elapsedMs: Date.now() - started,
    }),
  );
  return Response.json(
    { ...(token ? { token } : {}), result: decision.result },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}

/** Asynchronous Lithic events. Phase 0 records and logs their shape only. */
export async function receiveLithicEvent(request: Request) {
  const { id, body } = await verifiedBody(request, "LITHIC_EVENTS_SECRET");
  const event = lithicEvent.safeParse(body);
  if (!event.success) throw new AppError("Invalid webhook body.", 400);
  const [fresh] = await sql<{ id: string }>(
    "INSERT INTO webhook_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id",
    [`lithic:${id}`],
  );
  console.log(
    JSON.stringify({
      event: "lithic.event",
      webhookId: id,
      type: event.data.event_type,
      objectId: event.data.payload.token ?? null,
      status: event.data.payload.status ?? null,
      duplicate: !fresh,
    }),
  );
  return Response.json({ received: true }, { headers: { "cache-control": "no-store" } });
}
