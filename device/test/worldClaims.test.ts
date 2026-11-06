import { describe, expect, it } from "vitest";
import { checkWorldClaims, paymentIntentHash, type WorldClaims } from "../src/core/worldClaims.js";

const startedAt = Date.parse("2026-11-06T10:00:00Z");
const ctx = { startedAt, ownerSub: "owner-sub", requiredAcr: [], usedReferences: new Set<string>() };
const claims = (over: Partial<WorldClaims> = {}): WorldClaims => ({
  sub: "owner-sub",
  jti: "jti-1",
  acr: "https://world.org/oidc/acr/orb-v3",
  amr: ["pop"],
  auth_time: startedAt / 1000 + 30,
  ...over,
});

describe("checkWorldClaims", () => {
  it("accepts a fresh proof of personhood from the owner", () => {
    expect(checkWorldClaims(claims(), ctx)).toEqual({ verified: true });
  });

  it("refuses an approval that was already used", () => {
    expect(checkWorldClaims(claims(), { ...ctx, usedReferences: new Set(["jti-1"]) })).toEqual({
      verified: false,
      reason: "World approval was already used",
    });
    expect(checkWorldClaims(claims({ jti: undefined }), ctx)).toMatchObject({ verified: false });
  });

  it("refuses a login from before this payment was requested", () => {
    expect(checkWorldClaims(claims({ auth_time: startedAt / 1000 - 120 }), ctx)).toMatchObject({ reason: "World authentication is not fresh" });
    expect(checkWorldClaims(claims({ auth_time: undefined }), ctx)).toMatchObject({ verified: false });
  });

  it("refuses a login without proof of personhood", () => {
    expect(checkWorldClaims(claims({ amr: ["pwd"] }), ctx)).toMatchObject({ reason: "World did not provide proof of personhood" });
    expect(checkWorldClaims(claims({ amr: undefined }), ctx)).toMatchObject({ verified: false });
  });

  it("refuses someone else's World ID", () => {
    expect(checkWorldClaims(claims({ sub: "stranger" }), ctx)).toMatchObject({ reason: "Approved by a different World ID than the owner's" });
  });

  it("skips the owner check only when no owner is pinned (enrollment)", () => {
    expect(checkWorldClaims(claims({ sub: "anyone" }), { ...ctx, ownerSub: null })).toEqual({ verified: true });
  });

  it("enforces the required assurance level when set", () => {
    const strict = { ...ctx, requiredAcr: ["https://world.org/oidc/acr/orb-v3"] };
    expect(checkWorldClaims(claims(), strict)).toEqual({ verified: true });
    expect(checkWorldClaims(claims({ acr: "device" }), strict)).toMatchObject({ verified: false });
  });
});

describe("paymentIntentHash", () => {
  const intent = { episodeId: "ep-1", amountUsdc: "20", payTo: "0.0.2002" };

  it("is stable for the same payment", () => {
    expect(paymentIntentHash(intent, "0.0.429274", "testnet")).toBe(paymentIntentHash({ ...intent }, "0.0.429274", "testnet"));
  });

  it("changes when any part of the payment changes", () => {
    const base = paymentIntentHash(intent, "0.0.429274", "testnet");
    expect(paymentIntentHash({ ...intent, amountUsdc: "21" }, "0.0.429274", "testnet")).not.toBe(base);
    expect(paymentIntentHash({ ...intent, payTo: "0.0.3" }, "0.0.429274", "testnet")).not.toBe(base);
    expect(paymentIntentHash({ ...intent, episodeId: "ep-2" }, "0.0.429274", "testnet")).not.toBe(base);
    expect(paymentIntentHash(intent, "0.0.429274", "mainnet")).not.toBe(base);
  });
});
