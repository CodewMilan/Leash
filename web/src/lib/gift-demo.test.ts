import { describe, expect, it } from "vitest";
import { initialGift, parseGift, redeemGift, completeGift, purchaseGift } from "./gift-demo";
describe("gift demo lifecycle", () => {
  it("reserves once, reconciles after reload and spends without funding again", () => {
    const pending = redeemGift({ ...initialGift, stage: "onboarding" });
    expect(() => redeemGift(pending)).toThrow();
    const card = completeGift(parseGift(JSON.stringify(pending)));
    expect(card.balance).toBe(10000);
    expect(() => redeemGift(card)).toThrow();
    const spent = purchaseGift(card);
    expect(spent.balance).toBe(7500);
    expect(() => purchaseGift(spent)).toThrow();
  });
  it("rejects invalid persisted state", () => {
    expect(() => parseGift('{"version":1}')).toThrow();
    expect(parseGift(null)).toEqual(initialGift);
  });
});
