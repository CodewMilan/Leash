import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { migrations } from "../../db/migrations";
import { handleApi } from "../src/lib/server/api";
import { setTestDatabase, sql } from "../src/lib/server/db";
import { PHASE0_PURPOSE } from "../src/lib/server/cards/webhooks";

const phase0Token = randomUUID();
const asaSecret = `whsec_${randomBytes(24).toString("base64")}`;
const eventsSecret = `whsec_${randomBytes(24).toString("base64")}`;

function asaRequest(
  overrides: { amount?: number; currency?: string; purpose?: string; status?: string } = {},
) {
  const amount = overrides.amount ?? 800;
  return {
    token: randomUUID(),
    status: overrides.status ?? "AUTHORIZATION",
    amount,
    cardholder_currency: overrides.currency ?? "USD",
    amounts: {
      cardholder: { amount, currency: overrides.currency ?? "USD", conversion_rate: "1.0" },
      merchant: { amount, currency: overrides.currency ?? "USD" },
    },
    card: {
      token: phase0Token,
      last_four: "4142",
      memo: "Shagun Phase 0 sandbox",
      spend_limit: 2_500,
      spend_limit_duration: "FOREVER",
      state: "OPEN",
      type: "VIRTUAL",
      tags: { purpose: overrides.purpose ?? PHASE0_PURPOSE },
    },
    merchant: { mcc: "5947", descriptor: "Shagun Test Merchant", country: "USA" },
  };
}

function signature(id: string, timestamp: number, body: string, secret: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

function signed(
  path: string,
  payload: unknown,
  secret: string,
  options: { id?: string; timestamp?: number; signature?: string } = {},
) {
  const body = JSON.stringify(payload);
  const id = options.id ?? `msg_${randomBytes(8).toString("hex")}`;
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  return handleApi(
    new Request(`http://localhost:3000/api/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": options.signature ?? signature(id, timestamp, body, secret),
      },
      body,
    }),
  );
}

describe("Lithic sandbox webhooks", () => {
  let db: PGlite;
  beforeAll(async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("LITHIC_ASA_SECRET", asaSecret);
    vi.stubEnv("LITHIC_PHASE0_CARD_TOKEN", phase0Token);
    vi.stubEnv("LITHIC_EVENTS_SECRET", eventsSecret);
    db = new PGlite();
    for (const migration of migrations) await db.exec(migration.sql);
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

  it("approves a sandbox USD purchase within the Phase 0 budget and echoes the token", async () => {
    const request = asaRequest();
    const response = await signed("webhooks/lithic/asa", request, asaSecret);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: request.token, result: "APPROVED" });
  });

  it("gives the same answer when Lithic retries the same request", async () => {
    const request = asaRequest();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await signed("webhooks/lithic/asa", request, asaSecret, { id: "msg_retry" });
      expect(await response.json()).toEqual({ token: request.token, result: "APPROVED" });
    }
  });

  it("declines over-budget, non-USD, unknown-card and balance-inquiry requests", async () => {
    const cases = [
      [{ amount: 2_501 }, "INSUFFICIENT_FUNDS"],
      [{ currency: "EUR" }, "UNAUTHORIZED_MERCHANT"],
      [{ purpose: "someone-else" }, "UNAUTHORIZED_MERCHANT"],
      [{ status: "BALANCE_INQUIRY" }, "UNAUTHORIZED_MERCHANT"],
    ] as const;
    for (const [overrides, result] of cases) {
      const response = await signed("webhooks/lithic/asa", asaRequest(overrides), asaSecret);
      expect(response.status).toBe(200);
      expect((await response.json()).result).toBe(result);
    }
  });

  it("declines a signed but malformed request instead of erroring", async () => {
    const token = randomUUID();
    const response = await signed("webhooks/lithic/asa", { token, amount: "lots" }, asaSecret);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token, result: "UNAUTHORIZED_MERCHANT" });
  });

  it("rejects bad signatures, the wrong secret and stale timestamps", async () => {
    const request = asaRequest();
    expect(
      (await signed("webhooks/lithic/asa", request, asaSecret, { signature: "v1,bad" })).status,
    ).toBe(400);
    expect((await signed("webhooks/lithic/asa", request, eventsSecret)).status).toBe(400);
    const stale = Math.floor(Date.now() / 1000) - 10 * 60;
    expect(
      (await signed("webhooks/lithic/asa", request, asaSecret, { timestamp: stale })).status,
    ).toBe(400);
  });

  it("accepts any matching signature in a rotated header", async () => {
    const request = asaRequest();
    const body = JSON.stringify(request);
    const timestamp = Math.floor(Date.now() / 1000);
    const valid = signature("msg_rotated", timestamp, body, asaSecret);
    const response = await signed("webhooks/lithic/asa", request, asaSecret, {
      id: "msg_rotated",
      timestamp,
      signature: `v1,b2xkc2lnbmF0dXJl ${valid}`,
    });
    expect(response.status).toBe(200);
  });

  it("records each event once", async () => {
    const event = {
      event_type: "card_transaction.updated",
      payload: {
        token: randomUUID(),
        status: "PENDING",
        pan: "must-not-persist",
        cvv: "must-not-persist",
      },
    };
    const options = { id: "msg_lifecycle" };
    expect((await signed("webhooks/lithic/events", event, eventsSecret, options)).status).toBe(200);
    expect((await signed("webhooks/lithic/events", event, eventsSecret, options)).status).toBe(200);
    expect(await sql("SELECT id FROM webhook_events")).toEqual([{ id: "lithic:msg_lifecycle" }]);
    const queued = await sql("SELECT id,transaction_token,status FROM card_events");
    expect(queued).toEqual([
      { id: "lithic:msg_lifecycle", transaction_token: event.payload.token, status: "queued" },
    ]);
    expect(JSON.stringify(await sql("SELECT * FROM card_events"))).not.toContain(
      "must-not-persist",
    );
  });
});
