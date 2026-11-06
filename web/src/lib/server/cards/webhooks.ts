import type Stripe from "stripe";
import { AppError, required } from "../config";
import { sql } from "../db";
import { readLimitedBody } from "../http/response";
import { STRIPE_API_VERSION, assertSandbox, stripe } from "./stripe";

export const PHASE0_PURPOSE = "shagun-phase0";
export const PHASE0_LIMIT_CENTS = 2_500;

async function verifiedEvent(request: Request, secretName: string) {
  const raw = await readLimitedBody(request, 256_000);
  const signature = request.headers.get("stripe-signature");
  if (!signature) throw new AppError("Invalid webhook signature.", 400);
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, required(secretName));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Invalid webhook signature.", 400);
  }
  assertSandbox(event);
  return event;
}

function decide(authorization: Stripe.Issuing.Authorization) {
  const request = authorization.pending_request;
  if (!request) return { approved: false, reason: "no_pending_request" };
  if (authorization.card.metadata?.purpose !== PHASE0_PURPOSE)
    return { approved: false, reason: "unknown_card" };
  if (request.currency !== "usd") return { approved: false, reason: "unsupported_currency" };
  if (request.amount <= 0 || request.amount > PHASE0_LIMIT_CENTS)
    return { approved: false, reason: "over_budget" };
  return { approved: true, reason: "within_budget" };
}

function decision(approved: boolean) {
  return Response.json(
    { approved },
    { status: 200, headers: { "Stripe-Version": STRIPE_API_VERSION, "cache-control": "no-store" } },
  );
}

/** Synchronous `issuing_authorization.request` endpoint. Stripe waits at most two seconds. */
export async function receiveAuthorizationRequest(request: Request) {
  const started = Date.now();
  const event = await verifiedEvent(request, "STRIPE_AUTHORIZATION_WEBHOOK_SECRET");
  if (event.type !== "issuing_authorization.request")
    throw new AppError("Unsupported authorization webhook event.", 400);
  const authorization = event.data.object;
  let result = { approved: false, reason: "error" };
  try {
    assertSandbox(authorization);
    result = decide(authorization);
  } catch {
    result = { approved: false, reason: "error" };
  }
  console.log(
    JSON.stringify({
      event: "stripe.authorization.request",
      eventId: event.id,
      authorization: authorization.id,
      card: authorization.card.id,
      brand: authorization.card.brand,
      amount: authorization.pending_request?.amount ?? null,
      currency: authorization.pending_request?.currency ?? null,
      merchantCategory: authorization.merchant_data.category,
      approved: result.approved,
      reason: result.reason,
      elapsedMs: Date.now() - started,
    }),
  );
  return decision(result.approved);
}

/** Asynchronous Issuing lifecycle events. Phase 0 records and logs their shape only. */
export async function receiveIssuingEvent(request: Request) {
  const event = await verifiedEvent(request, "STRIPE_EVENTS_WEBHOOK_SECRET");
  const [fresh] = await sql<{ id: string }>(
    "INSERT INTO webhook_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id",
    [`stripe:${event.id}`],
  );
  const object = event.data.object as { id?: string; object?: string; status?: string };
  console.log(
    JSON.stringify({
      event: "stripe.issuing.event",
      eventId: event.id,
      type: event.type,
      object: object.object ?? null,
      objectId: object.id ?? null,
      status: object.status ?? null,
      duplicate: !fresh,
    }),
  );
  return Response.json({ received: true }, { headers: { "cache-control": "no-store" } });
}
