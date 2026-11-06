import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrations } from "../../../../../db/migrations";
import { setTestDatabase } from "../db";
import { cardPost, cardRead } from "./controller";
import { giftBudgetCents, issueGiftCard } from "./issuance";

vi.mock("../db", async (original) => ({
  ...(await original<typeof import("../db")>()),
  pool: () => ({
    connect: async () => ({ query: async () => ({ rows: [{ locked: true }] }), release: () => {} }),
  }),
}));
const giftId = `0x${"a".repeat(64)}`;
const cardToken = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
const recipient = {
  id: "recipient",
  sender: null,
  credential_id: "key",
  authenticated_at: new Date(),
};
const card = {
  token: cardToken,
  type: "VIRTUAL",
  state: "PAUSED",
  last_four: "1234",
  exp_month: "11",
  exp_year: "2030",
  spend_limit: 3725,
  spend_limit_duration: "FOREVER",
  card_program_token: "00000000-0000-0000-2000-000000000000",
};

beforeEach(async () => {
  db = new PGlite();
  for (const migration of migrations) await db.exec(migration.sql);
  setTestDatabase(db);
  await db.query(
    "INSERT INTO sessions(id,token_hash,credential_id,expires_at) VALUES('recipient','one','key',now()+interval '1 day'),('sender','two',NULL,now()+interval '1 day'),('recovered','three','key',now()+interval '1 day')",
  );
  await db.query(
    `INSERT INTO gifts(id,sender,label,amount,expiry,secret_hash,campaign_id,terms,status,claim_session,rate,paise,design,redemption,claim_tx)
    VALUES($1,'0xsender','test',37250000,$2,'secret','campaign','{}','claimed','recipient','84',100,'diwali','card','0xclaim')`,
    [giftId, Math.floor(Date.now() / 1000) + 3600],
  );
  vi.stubEnv("LITHIC_API_KEY", "test-key");
  vi.stubEnv("LITHIC_ASA_SECRET", "asa");
  vi.stubEnv("LITHIC_EVENTS_SECRET", "events");
  vi.stubEnv("APP_URL", "https://shagun.test");
});
afterEach(async () => {
  setTestDatabase();
  await db.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("gift-sized card issuance", () => {
  it("maps gift units exactly and rejects fractional cents", () => {
    expect(giftBudgetCents("37250000")).toBe(3725);
    expect(() => giftBudgetCents("10001")).toThrow(/whole cents/);
    expect(() => giftBudgetCents("0")).toThrow();
  });
  it("creates paused at the gift amount, opens it after persistence, and does not reissue", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
          state: "PAUSED",
          spend_limit: 3725,
          spend_limit_duration: "FOREVER",
          tags: { gift_id: giftId },
        });
        expect(new Headers(init.headers).get("Idempotency-Key")).toBeTruthy();
      }
      if (init?.method === "PATCH") {
        const result = await db.query<{ card_token: string }>(
          "SELECT card_token FROM gift_cards WHERE gift_id=$1",
          [giftId],
        );
        expect(result.rows[0].card_token).toBe(cardToken);
      }
      return Response.json({ ...card, state: init?.method === "POST" ? "PAUSED" : "OPEN" });
    });
    vi.stubGlobal("fetch", request);
    await issueGiftCard(giftId);
    await issueGiftCard(giftId);
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect((await db.query("SELECT status,budget_cents FROM gift_cards")).rows[0]).toMatchObject({
      status: "ready",
      budget_cents: 3725,
    });
  });
  it("recovers an ambiguous create using its persisted memo without a second POST", async () => {
    let memo = "";
    const request = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        memo = JSON.parse(String(init.body)).memo;
        throw new Error("timeout");
      }
      if (String(url).includes("cards?"))
        return Response.json({ data: [{ ...card, memo }], has_more: false });
      return Response.json({ ...card, state: init?.method === "PATCH" ? "OPEN" : "PAUSED" });
    });
    vi.stubGlobal("fetch", request);
    await expect(issueGiftCard(giftId)).rejects.toThrow(/reconciliation/);
    await issueGiftCard(giftId);
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(
      (await db.query<{ status: string }>("SELECT status FROM gift_cards")).rows[0].status,
    ).toBe("ready");
  });
  it("leaves unresolved issuance reserved instead of resending card creation", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "POST") throw new Error("timeout");
      return Response.json({ data: [], has_more: false });
    });
    vi.stubGlobal("fetch", request);
    await expect(issueGiftCard(giftId)).rejects.toThrow(/reconciliation/);
    await expect(issueGiftCard(giftId)).rejects.toThrow(/reconciliation/);
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(
      (await db.query<{ request_started: boolean }>("SELECT request_started FROM gift_cards"))
        .rows[0].request_started,
    ).toBe(true);
  });
  it("keeps a card paused when its gift expires during provider creation", async () => {
    const started = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(started);
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "POST") clock.mockReturnValue(started + 7200000);
      return Response.json(card);
    });
    vi.stubGlobal("fetch", request);
    await issueGiftCard(giftId);
    expect(request.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
    expect((await db.query("SELECT status,card_token FROM gift_cards")).rows[0]).toMatchObject({
      status: "closing",
      card_token: cardToken,
    });
  });
  it("recovers an expired ambiguous card without opening it or creating a replacement", async () => {
    const memo = `shagun-gift-${giftId}`;
    await db.query(
      "INSERT INTO gift_cards(gift_id,operation_id,budget_cents,request_started) VALUES($1,'operation',3725,true)",
      [giftId],
    );
    await db.query("UPDATE gifts SET expiry=$1", [Math.floor(Date.now() / 1000) - 1]);
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [{ ...card, memo }], has_more: false }));
    vi.stubGlobal("fetch", request);
    await issueGiftCard(giftId);
    expect(request.mock.calls).toHaveLength(1);
    expect(request.mock.calls[0][1]?.method).toBe("GET");
    expect((await db.query("SELECT status,card_token FROM gift_cards")).rows[0]).toMatchObject({
      status: "closing",
      card_token: cardToken,
    });
  });
  it("does not issue for an unconfirmed claim or a legacy payout", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await db.query("UPDATE gifts SET claim_tx=NULL");
    await issueGiftCard(giftId);
    expect(request).not.toHaveBeenCalled();
    await db.query("UPDATE gifts SET claim_tx='0xclaim',redemption='upi'");
    await issueGiftCard(giftId);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("recipient card access", () => {
  it("rejects the sender even though they can view the receipt", async () => {
    await expect(
      cardRead(`gifts/${giftId}/card`, {
        ...recipient,
        id: "sender",
        sender: "0xsender",
        credential_id: null,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("allows the claimant's passkey in a recovered session and excludes provider credentials", async () => {
    await db.query(
      "INSERT INTO gift_cards(gift_id,operation_id,budget_cents,card_token,status,last_four) VALUES($1,'operation',3725,$2,'ready','1234')",
      [giftId, cardToken],
    );
    const response = await cardRead(`gifts/${giftId}/card`, { ...recipient, id: "recovered" });
    const body = await response!.json();
    expect(body.card).toMatchObject({ budgetCents: 3725, availableCents: 3725, lastFour: "1234" });
    expect(JSON.stringify(body)).not.toContain(cardToken);
  });
  it("requires a fresh passkey and HTTPS before creating hosted frames", async () => {
    await expect(
      cardPost(`gifts/${giftId}/card/embed`, { ...recipient, authenticated_at: new Date(0) }),
    ).rejects.toMatchObject({ status: 401 });
    await db.query(
      "INSERT INTO gift_cards(gift_id,operation_id,budget_cents,card_token,status) VALUES($1,'operation',3725,$2,'ready')",
      [giftId, cardToken],
    );
    vi.stubEnv("APP_URL", "http://localhost:3000");
    await expect(cardPost(`gifts/${giftId}/card/embed`, recipient)).rejects.toThrow(/HTTPS/);
  });
});
