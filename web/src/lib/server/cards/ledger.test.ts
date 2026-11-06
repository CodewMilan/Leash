import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { migrations } from "../../../../../db/migrations";
import { setTestDatabase, sql } from "../db";
import { decrypt } from "../security/crypto";
import {
  authorizeGiftCard,
  reconcileTransaction,
  processCardEvents,
  reconcileCardTransactions,
} from "./ledger";

const gift = `0x${"a".repeat(64)}`;
const cardToken = "11111111-1111-4111-8111-111111111111";
const token = "22222222-2222-4222-8222-222222222222";
const request = (amount = 800, transaction = token) => ({
  token: transaction,
  cardToken,
  amount,
  currency: "USD",
  status: "AUTHORIZATION",
});
let db: PGlite;
function snapshot(
  settled: number,
  hold: number,
  updated = "2026-11-06T12:00:00Z",
  events: unknown[] = [],
) {
  return {
    token,
    card_token: cardToken,
    status: hold ? "PENDING" : "SETTLED",
    result: "APPROVED",
    updated,
    amounts: {
      hold: { amount: -hold, currency: "USD" },
      cardholder: { amount: -settled, currency: "USD" },
      settlement: { amount: -settled, currency: "USD" },
    },
    events,
  };
}
describe("gift card balance ledger", () => {
  beforeAll(async () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("LITHIC_API_KEY", "test-key");
    db = new PGlite();
    for (const migration of migrations) await db.exec(migration.sql);
    setTestDatabase(db);
  });
  beforeEach(async () => {
    await db.exec("TRUNCATE gifts CASCADE; TRUNCATE card_events;");
    await sql(
      `INSERT INTO gifts(id,sender,label,amount,expiry,secret_hash,campaign_id,terms,status,rate,paise,redemption)
      VALUES($1,'sender','Gift',25000000,$2,'secret','campaign','{}','claimed','84',210000,'card')`,
      [gift, Math.floor(Date.now() / 1000) + 3600],
    );
    await sql(
      `INSERT INTO gift_cards(gift_id,card_token,operation_id,status,budget_cents) VALUES($1,$2,$3,'ready',2500)`,
      [gift, cardToken, randomUUID()],
    );
  });
  afterAll(async () => {
    setTestDatabase();
    await db.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("reserves the gift budget once on replay and rejects changed replay", async () => {
    expect(await authorizeGiftCard(request())).toMatchObject({ result: "APPROVED" });
    expect(await authorizeGiftCard(request())).toMatchObject({ result: "APPROVED" });
    expect(await authorizeGiftCard(request(900))).toMatchObject({
      result: "UNAUTHORIZED_MERCHANT",
    });
    expect(
      (await sql<{ reserved_cents: string }>("SELECT reserved_cents FROM gift_cards"))[0]
        .reserved_cents,
    ).toBe(800);
  });
  it("serializes concurrent purchases so only one can consume the remaining budget", async () => {
    const decisions = await Promise.all([
      authorizeGiftCard(request(1600)),
      authorizeGiftCard(request(1600, randomUUID())),
    ]);
    expect(decisions.filter((d) => d.result === "APPROVED")).toHaveLength(1);
    expect(decisions.filter((d) => d.result === "INSUFFICIENT_FUNDS")).toHaveLength(1);
  });
  it("declines expired, non-USD and unsupported requests", async () => {
    expect((await authorizeGiftCard({ ...request(), currency: "EUR" })).result).toBe(
      "UNAUTHORIZED_MERCHANT",
    );
    expect(
      (await authorizeGiftCard({ ...request(800, randomUUID()), status: "CREDIT_AUTHORIZATION" }))
        .result,
    ).toBe("UNAUTHORIZED_MERCHANT");
    await sql("UPDATE gifts SET expiry=$1", [Math.floor(Date.now() / 1000) - 1]);
    expect((await authorizeGiftCard(request(800, randomUUID()))).result).toBe("CARD_CLOSED");
  });
  it("settles authoritative partial clearing deltas once and releases only reported hold", async () => {
    await authorizeGiftCard(request());
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot(300, 500))));
    vi.stubGlobal("fetch", fetch);
    await reconcileTransaction(token);
    fetch.mockResolvedValue(new Response(JSON.stringify(snapshot(300, 500))));
    await reconcileTransaction(token);
    let jobs = await sql<{ payload: string }>("SELECT payload FROM jobs");
    expect(jobs).toHaveLength(1);
    expect(decrypt(jobs[0].payload)).toMatchObject({ amount: "3000000" });
    fetch.mockResolvedValue(new Response(JSON.stringify(snapshot(800, 0, "2026-11-06T12:01:00Z"))));
    await reconcileTransaction(token);
    jobs = await sql("SELECT payload FROM jobs");
    expect(jobs).toHaveLength(2);
    expect(await sql("SELECT reserved_cents,cleared_cents FROM gift_cards")).toEqual([
      { reserved_cents: 0, cleared_cents: 800 },
    ]);
  });
  it("freezes excess clearing and returns without releasing the reserved balance", async () => {
    await authorizeGiftCard(request());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot(900, 0)))),
    );
    await reconcileTransaction(token);
    expect(await sql("SELECT status,reserved_cents FROM gift_cards")).toEqual([
      { status: "reconciliation", reserved_cents: 800 },
    ]);
    expect(await sql("SELECT id FROM jobs")).toHaveLength(0);
  });
  it("freezes refund events instead of reversing settled chain spending", async () => {
    await authorizeGiftCard(request());
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify(snapshot(0, 0, "2026-11-06T12:01:00Z", [{ type: "RETURN" }])),
          ),
        ),
    );
    await reconcileTransaction(token);
    expect(await sql("SELECT status,reserved_cents,cleared_cents FROM gift_cards")).toEqual([
      { status: "reconciliation", reserved_cents: 800, cleared_cents: 0 },
    ]);
    expect(await sql("SELECT id FROM jobs")).toHaveLength(0);
  });
  it("ignores an older provider snapshot without releasing a newer hold", async () => {
    await authorizeGiftCard(request());
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(snapshot(300, 500, "2026-11-06T12:01:00Z"))));
    vi.stubGlobal("fetch", fetch);
    await reconcileTransaction(token);
    fetch.mockResolvedValue(new Response(JSON.stringify(snapshot(0, 800, "2026-11-06T12:00:00Z"))));
    await reconcileTransaction(token);
    expect(await sql("SELECT status,reserved_cents,cleared_cents FROM gift_cards")).toEqual([
      { status: "ready", reserved_cents: 500, cleared_cents: 300 },
    ]);
    expect(await sql("SELECT id FROM jobs")).toHaveLength(1);
  });
  it("requires a closed provider card and zero pending work before a closure checkpoint", async () => {
    await authorizeGiftCard(request(3000));
    await sql("UPDATE gift_cards SET status='closing'");
    const fetch = vi
      .fn()
      .mockImplementation(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes("/cards/")
                ? { token: cardToken, state: "CLOSED" }
                : { data: [], has_more: false },
            ),
          ),
      );
    vi.stubGlobal("fetch", fetch);
    await sql("INSERT INTO card_events(id,transaction_token) VALUES('pending',$1)", [token]);
    expect(await reconcileCardTransactions(gift)).toBe(false);
    await sql("UPDATE card_events SET status='done'");
    await sql("INSERT INTO card_events(id,transaction_token) VALUES('unrelated',$1)", [
      randomUUID(),
    ]);
    expect(await reconcileCardTransactions(gift)).toBe(true);
    expect(
      (await sql<{ reconciled_at: Date | null }>("SELECT reconciled_at FROM gift_cards"))[0]
        .reconciled_at,
    ).not.toBeNull();
  });
  it("keeps event work queued when provider evidence is unavailable", async () => {
    await sql("INSERT INTO card_events(id,transaction_token) VALUES('event',$1)", [token]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await processCardEvents();
    expect(await sql("SELECT status,attempts FROM card_events")).toEqual([
      { status: "queued", attempts: 1 },
    ]);
  });
});
