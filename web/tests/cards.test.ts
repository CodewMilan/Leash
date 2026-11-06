import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomBytes } from "node:crypto";
import { schema } from "../../db/migrations/001_initial";
import { handleApi } from "../src/lib/server/api";
import { setTestDatabase, sql } from "../src/lib/server/db";
import { STRIPE_API_VERSION, stripe } from "../src/lib/server/cards/stripe";
import { PHASE0_PURPOSE } from "../src/lib/server/cards/webhooks";

const authorizationSecret = `whsec_${randomBytes(16).toString("hex")}`;
const eventsSecret = `whsec_${randomBytes(16).toString("hex")}`;

function authorizationEvent(overrides: { amount?: number; currency?: string; purpose?: string; livemode?: boolean } = {}) {
  return {
    id: `evt_${randomBytes(6).toString("hex")}`,
    object: "event",
    type: "issuing_authorization.request",
    livemode: overrides.livemode ?? false,
    data: {
      object: {
        id: "iauth_fixture",
        object: "issuing_authorization",
        livemode: overrides.livemode ?? false,
        approved: false,
        amount: 0,
        card: { id: "ic_fixture", brand: "Visa", metadata: { purpose: overrides.purpose ?? PHASE0_PURPOSE } },
        pending_request: { amount: overrides.amount ?? 800, currency: overrides.currency ?? "usd" },
        merchant_data: { category: "gift_card_novelty_and_souvenir_shops" },
      },
    },
  };
}

function signed(path: string, event: unknown, secret: string, signature?: string) {
  const payload = JSON.stringify(event);
  return handleApi(
    new Request(`http://localhost:3000/api/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature ?? stripe().webhooks.generateTestHeaderString({ payload, secret }),
      },
      body: payload,
    }),
  );
}

describe("Stripe Issuing sandbox webhooks", () => {
  let db: PGlite;
  beforeAll(async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("STRIPE_AUTHORIZATION_WEBHOOK_SECRET", authorizationSecret);
    vi.stubEnv("STRIPE_EVENTS_WEBHOOK_SECRET", eventsSecret);
    db = new PGlite();
    await db.exec(schema);
    setTestDatabase(db);
  });
  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.exec("TRUNCATE webhook_events");
  });
  afterAll(async () => {
    setTestDatabase();
    await db.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("approves a sandbox USD purchase within the Phase 0 budget and pins the API version", async () => {
    const response = await signed("webhooks/stripe/authorization", authorizationEvent(), authorizationSecret);
    expect(response.status).toBe(200);
    expect(response.headers.get("stripe-version")).toBe(STRIPE_API_VERSION);
    expect(await response.json()).toEqual({ approved: true });
  });

  it("declines over-budget, non-USD and unknown-card requests", async () => {
    for (const overrides of [{ amount: 2_501 }, { currency: "eur" }, { purpose: "someone-else" }]) {
      const response = await signed("webhooks/stripe/authorization", authorizationEvent(overrides), authorizationSecret);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ approved: false });
    }
  });

  it("rejects bad signatures, the wrong endpoint secret and live events", async () => {
    const event = authorizationEvent();
    expect((await signed("webhooks/stripe/authorization", event, authorizationSecret, "t=1,v1=bad")).status).toBe(400);
    expect((await signed("webhooks/stripe/authorization", event, eventsSecret)).status).toBe(400);
    expect((await signed("webhooks/stripe/authorization", authorizationEvent({ livemode: true }), authorizationSecret)).status).toBe(403);
  });

  it("records each lifecycle event once", async () => {
    const event = { id: "evt_lifecycle", object: "event", type: "issuing_authorization.created", livemode: false, data: { object: { id: "iauth_fixture", object: "issuing_authorization", status: "pending" } } };
    expect((await signed("webhooks/stripe/events", event, eventsSecret)).status).toBe(200);
    expect((await signed("webhooks/stripe/events", event, eventsSecret)).status).toBe(200);
    expect(await sql("SELECT id FROM webhook_events")).toEqual([{ id: "stripe:evt_lifecycle" }]);
  });
});
