import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { migrations } from "../../../../db/migrations";
import { setTestDatabase, sql } from "./db";
import { sha256 } from "./security/crypto";
import { availableShopCards, resolveShopSource, shopOwners } from "./shop-access";

describe("Shagun shop recipient ownership", () => {
  let db: PGlite;
  const token = "ab".repeat(32);
  const otherToken = "cd".repeat(32);
  const request = (cookie = token) =>
    new NextRequest("http://localhost:3000/api/shop", {
      headers: { cookie: `shagun_session=${cookie}` },
    });
  beforeAll(async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    db = new PGlite();
    for (const migration of migrations) await db.exec(migration.sql);
    setTestDatabase(db);
    await sql(
      "INSERT INTO sessions(id,token_hash,credential_id,authenticated_at,expires_at) VALUES('claimant',$1,'recipient-key',now(),now()+interval '1 hour'),('recovered',$2,'recipient-key',now(),now()+interval '1 hour'),('sender',$3,NULL,NULL,now()+interval '1 hour')",
      [sha256("ef".repeat(32)), sha256(token), sha256(otherToken)],
    );
    await sql(
      `INSERT INTO gifts(id,sender,label,amount,expiry,secret_hash,campaign_id,terms,status,claim_session,rate,paise,redemption)
      VALUES('gift-a','sender','Gift',25000000,$1,'hash','campaign','{}','claimed','claimant','84',210000,'card')`,
      [Math.floor(Date.now() / 1000) + 3600],
    );
    await sql(
      "INSERT INTO gift_cards(gift_id,operation_id,card_token,status,budget_cents,last_four) VALUES('gift-a','op','11111111-1111-4111-8111-111111111111','ready',2500,'1234')",
    );
  });
  afterAll(async () => {
    setTestDatabase();
    await db.close();
    vi.unstubAllEnvs();
  });
  it("recovers shop access through the claiming passkey, not a shared operator cookie", async () => {
    expect(await shopOwners(request())).toEqual(["recipient:recipient-key"]);
    const cards = await availableShopCards(request());
    expect(cards.map((c) => c.sourceId)).toEqual(["gift-a"]);
    expect((await resolveShopSource(request(), "gift-a")).source.lastFour).toBe("1234");
    expect(
      await shopOwners(
        new NextRequest("http://localhost:3000/api/shop", {
          headers: { cookie: "leash_lithic_operator=old" },
        }),
      ),
    ).toEqual([]);
  });
  it("denies a sender session access to recipient payment cards", async () => {
    expect(await availableShopCards(request(otherToken))).toEqual([]);
    await expect(resolveShopSource(request(otherToken), "gift-a")).rejects.toThrow(
      "belongs to another recipient",
    );
  });
  it("stops new purchases as soon as gift expiry passes", async () => {
    await sql("UPDATE gifts SET expiry=$1 WHERE id='gift-a'", [Math.floor(Date.now() / 1000) - 1]);
    expect(await availableShopCards(request())).toEqual([]);
    await expect(resolveShopSource(request(), "gift-a")).rejects.toThrow("expired");
  });
});
