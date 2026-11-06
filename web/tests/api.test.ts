import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { Wallet, ZeroHash, hexlify, keccak256 } from "ethers";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { schema } from "../../db/migrations/001_initial";
import { handleApi } from "../src/lib/server/api";
import { setTestDatabase, sql } from "../src/lib/server/db";
import { encrypt, sha256 } from "../src/lib/server/security/crypto";
import { executePayout, recordPayoutStatus } from "../src/lib/server/payouts/razorpay";
import { verifyWorld, worldRequest, type WorldRequest } from "../src/lib/server/world/verification";
import { authorizationTypes, giftNonce, TOKEN_DOMAIN, type GiftTerms } from "../src/lib/chain";

describe("API authorization, concurrency and payout durability", () => {
  let db: PGlite;
  const sender = Wallet.createRandom();
  const vault = Wallet.createRandom().address;
  const random = () => hexlify(randomBytes(32));
  beforeAll(async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
    vi.stubEnv("WORLD_SIGNING_KEY", random());
    vi.stubEnv("WORLD_APP_ID", "app_test");
    vi.stubEnv("WORLD_RP_ID", "rp_test");
    vi.stubEnv("WORLD_ENVIRONMENT", "staging");
    vi.stubEnv("VAULT_ADDRESS", vault);
    vi.stubEnv("RELAYER_PRIVATE_KEY", Wallet.createRandom().privateKey);
    vi.stubEnv("ATTESTER_PRIVATE_KEY", Wallet.createRandom().privateKey);
    vi.stubEnv("RAZORPAYX_KEY_ID", "rzp_test_fixture");
    vi.stubEnv("RAZORPAYX_KEY_SECRET", random());
    vi.stubEnv("RAZORPAYX_ACCOUNT_NUMBER", "test_account");
    vi.stubEnv("RAZORPAYX_WEBHOOK_SECRET", random());
    db = new PGlite();
    await db.exec(schema);
    setTestDatabase(db);
  });
  beforeEach(async () => {
    await db.exec(
      "TRUNCATE jobs,payouts,campaign_claims,gifts,challenges,credentials,sessions,rate_limits,webhook_events CASCADE",
    );
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    setTestDatabase();
    await db.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  function request(
    path: string,
    body?: unknown,
    cookie?: string,
    headers?: Record<string, string>,
  ) {
    return handleApi(
      new Request(`http://localhost:3000/api/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body === undefined
            ? {}
            : { origin: "http://localhost:3000", "content-type": "application/json" }),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  }
  async function newSession(passkey = false) {
    const response = await request("session", {});
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const [{ id }] = await sql<{ id: string }>("SELECT id FROM sessions WHERE token_hash=$1", [
      sha256(cookie.slice(15)),
    ]);
    if (passkey)
      await sql(
        "UPDATE sessions SET credential_id='test-passkey',authenticated_at=now() WHERE id=$1",
        [id],
      );
    return { cookie, id };
  }
  async function senderSession() {
    const s = await newSession();
    const options = await (
      await request("auth/sender/options", { address: sender.address }, s.cookie)
    ).json();
    const signature = await sender.signMessage(options.message);
    const result = await request(
      "auth/sender/verify",
      { challengeId: options.challengeId, signature },
      s.cookie,
    );
    expect(result.status).toBe(200);
    return { ...s, options, signature };
  }
  async function seedGift(campaignId = ZeroHash, status = "sent") {
    const id = random(),
      secret = random();
    await sql(
      `INSERT INTO gifts(id,sender,label,amount,expiry,secret_hash,campaign_id,terms,status,rate,paise,created_tx)
      VALUES($1,$2,'Test envelope',25000000,$3,$4,$5,'{}',$6,'84.00',210000,$7)`,
      [
        id,
        sender.address.toLowerCase(),
        Math.floor(Date.now() / 1000) + 3600,
        keccak256(secret),
        campaignId,
        status,
        random(),
      ],
    );
    return { id, secret };
  }
  function proof(config: WorldRequest, nullifier = "0x1234") {
    return {
      protocol_version: "4.0",
      nonce: config.rp_context.nonce,
      action: config.action,
      environment: config.environment,
      responses: [
        {
          identifier: "proof_of_human",
          signal_hash: hashSignal(config.signal),
          nullifier,
          issuer_schema_id: 1,
          proof: ["test-only"],
        },
      ],
    };
  }
  it("rejects cross-origin mutations and exposes no secret values in status", async () => {
    const response = await request("session", {}, undefined, {
      origin: "https://attacker.example",
    });
    expect(response.status).toBe(403);
    const status = await (await request("status")).text();
    expect(status).not.toContain(process.env.DATA_ENCRYPTION_KEY);
    expect(status).not.toContain(process.env.RELAYER_PRIVATE_KEY);
  });
  it("requires a session and rejects replayed sender challenges", async () => {
    expect((await request("gifts")).status).toBe(401);
    const s = await senderSession();
    expect(
      (
        await request(
          "auth/sender/verify",
          { challengeId: s.options.challengeId, signature: s.signature },
          s.cookie,
        )
      ).status,
    ).toBe(409);
    const other = await newSession();
    expect(
      (
        await request(
          "auth/sender/verify",
          { challengeId: s.options.challengeId, signature: s.signature },
          other.cookie,
        )
      ).status,
    ).toBe(409);
  });
  it("queues a valid signed gift once and rejects signature term tampering", async () => {
    const s = await senderSession();
    const terms: GiftTerms = {
      from: sender.address,
      amount: "25000000",
      expiry: Math.floor(Date.now() / 1000) + 3600,
      secretHash: random(),
      campaignId: ZeroHash,
      boundHuman: ZeroHash,
      salt: random(),
    };
    const nonce = giftNonce(vault, terms),
      validBefore = Math.floor(Date.now() / 1000) + 300;
    const signature = await sender.signTypedData(TOKEN_DOMAIN, authorizationTypes, {
      from: sender.address,
      to: vault,
      value: terms.amount,
      validAfter: 0,
      validBefore,
      nonce,
    });
    const body = { terms, validAfter: 0, validBefore, signature, label: "One gift" };
    expect((await request("gifts", body, s.cookie)).status).toBe(202);
    expect((await request("gifts", body, s.cookie)).status).toBe(202);
    const [row] = await sql<{ count: number }>("SELECT count(*)::int AS count FROM jobs");
    expect(row.count).toBe(1);
    expect(
      (await request("gifts", { ...body, terms: { ...terms, expiry: terms.expiry + 1 } }, s.cookie))
        .status,
    ).toBe(403);
  });
  it("rejects wrong World action, signal, environment and credential before external verification", async () => {
    const config = worldRequest("test-gift-session");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const invalid of [
      { ...proof(config), action: "different" },
      { ...proof(config), environment: "production" },
      { ...proof(config), responses: [{ ...proof(config).responses[0], signal_hash: "0x00" }] },
      { ...proof(config), responses: [{ ...proof(config).responses[0], identifier: "selfie" }] },
    ])
      await expect(verifyWorld(invalid, config)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("allows exactly one concurrent campaign claim and preserves privacy for another session", async () => {
    const a = await seedGift(random()),
      b = await seedGift(
        (await sql<{ campaign_id: string }>("SELECT campaign_id FROM gifts WHERE id=$1", [a.id]))[0]
          .campaign_id,
      );
    const s1 = await newSession(true),
      s2 = await newSession(true);
    const w1 = await (await request(`gifts/${a.id}/world`, {}, s1.cookie)).json();
    const w2 = await (await request(`gifts/${b.id}/world`, {}, s2.cookie)).json();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () => Response.json({ success: true, environment: "staging" })),
    );
    const result = await Promise.all([
      request(
        `gifts/${a.id}/claim`,
        {
          secret: a.secret,
          challengeId: w1.challengeId,
          proof: proof(w1.config),
          name: "Test Person",
          upi: "test@bank",
        },
        s1.cookie,
      ),
      request(
        `gifts/${b.id}/claim`,
        {
          secret: b.secret,
          challengeId: w2.challengeId,
          proof: proof(w2.config),
          name: "Test Person",
          upi: "test@bank",
        },
        s2.cookie,
      ),
    ]);
    expect(result.map((r) => r.status).sort()).toEqual([202, 409]);
    expect(
      (
        await sql<{ count: number }>("SELECT count(*)::int AS count FROM jobs WHERE kind='claim'")
      )[0].count,
    ).toBe(1);
    expect(
      (await sql<{ count: number }>("SELECT count(*)::int AS count FROM payouts"))[0].count,
    ).toBe(1);
    const viewer = await newSession();
    const view = await (await request(`gifts/${a.id}`, undefined, viewer.cookie)).json();
    expect(view.canViewReceipt).toBe(false);
    expect(view.payoutId).toBeNull();
    expect(JSON.stringify(view)).not.toContain("test@bank");
  });
  it("refuses payout before settlement and reuses the same idempotency key after a timeout", async () => {
    const gift = await seedGift();
    await sql("INSERT INTO payouts(gift_id,idempotency_key,details) VALUES($1,$2,$3)", [
      gift.id,
      randomUUID(),
      encrypt({ name: "Test Person", upi: "test@bank" }),
    ]);
    const calls: { path: string; body: string; key: string }[] = [];
    let timeout = true;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/contacts")) return Response.json({ id: "cont_fixture" });
      if (path.endsWith("/fund_accounts")) return Response.json({ id: "fa_fixture" });
      if (path.endsWith("/payouts")) {
        calls.push({
          path,
          body: String(init.body),
          key: (init.headers as Record<string, string>)["X-Payout-Idempotency"],
        });
        if (timeout) {
          timeout = false;
          throw new Error("ProviderTimeout");
        }
        return Response.json({ id: "pout_fixture", status: "processing" });
      }
      return Response.json({ id: "pout_fixture", status: "processed" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(executePayout(gift.id)).rejects.toThrow(/settlement/);
    expect(fetchMock).not.toHaveBeenCalled();
    await sql("UPDATE gifts SET status='settled',settlement_tx=$2 WHERE id=$1", [
      gift.id,
      random(),
    ]);
    await expect(executePayout(gift.id)).rejects.toThrow("ProviderTimeout");
    await executePayout(gift.id);
    await executePayout(gift.id);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    await recordPayoutStatus("pout_fixture", "processing");
    expect(
      (await sql<{ status: string }>("SELECT status FROM payouts WHERE gift_id=$1", [gift.id]))[0]
        .status,
    ).toBe("processed");
  });
  it("verifies webhook signatures, deduplicates delivery and prevents final-state rollback", async () => {
    const g = await seedGift();
    await sql(
      "INSERT INTO payouts(gift_id,idempotency_key,details,payout_id,status) VALUES($1,$2,$3,'pout_fixture','processing')",
      [g.id, randomUUID(), encrypt({ name: "Test Person", upi: "test@bank" })],
    );
    const body = {
      event: "payout.processed",
      payload: { payout: { entity: { id: "pout_fixture", status: "processed" } } },
    };
    const signature = createHmac("sha256", process.env.RAZORPAYX_WEBHOOK_SECRET!)
      .update(JSON.stringify(body))
      .digest("hex");
    expect(
      (
        await request("webhooks/razorpay", body, undefined, {
          "x-razorpay-event-id": "event1",
          "x-razorpay-signature": "00".repeat(32),
        })
      ).status,
    ).toBe(403);
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request("webhooks/razorpay", body, undefined, {
            "x-razorpay-event-id": "event1",
            "x-razorpay-signature": signature,
          })
        ).status,
      ).toBe(200);
    expect(
      (await sql<{ count: number }>("SELECT count(*)::int AS count FROM webhook_events"))[0].count,
    ).toBe(1);
    expect((await sql<{ status: string }>("SELECT status FROM payouts"))[0].status).toBe(
      "processed",
    );
    await recordPayoutStatus("pout_fixture", "processing");
    expect((await sql<{ status: string }>("SELECT status FROM payouts"))[0].status).toBe(
      "processed",
    );
    await recordPayoutStatus("pout_fixture", "reversed");
    expect((await sql<{ status: string }>("SELECT status FROM payouts"))[0].status).toBe(
      "reversed",
    );
  });
});
