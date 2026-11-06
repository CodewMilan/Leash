import { describe, expect, it } from "vitest";
import { checkPayment, fromBaseUnits, toBaseUnits, type PaymentToSign } from "../src/core/policy.js";

const rules = { deviceAccountId: "0.0.1001", usdcTokenId: "0.0.429274", spendLimitUsdc: 5 };
const photographer = { name: "Photographer", payTo: "0.0.2002" };
const payment = (over: Partial<PaymentToSign> = {}): PaymentToSign => ({
  amount: toBaseUnits("2"),
  tokenId: "0.0.429274",
  payFrom: "0.0.1001",
  payTo: "0.0.2002",
  ...over,
});

describe("USDC units", () => {
  it("converts decimal strings to 6-decimal base units", () => {
    expect(toBaseUnits("0.5")).toBe(500_000n);
    expect(toBaseUnits("20")).toBe(20_000_000n);
    expect(toBaseUnits("1.000001")).toBe(1_000_001n);
    expect(toBaseUnits(" 3.10 ")).toBe(3_100_000n);
    expect(toBaseUnits(5)).toBe(5_000_000n);
  });

  it("rejects malformed and over-precise amounts", () => {
    for (const bad of ["", "-1", "1e3", "abc", "1.2.3", "0x10"]) expect(() => toBaseUnits(bad)).toThrow();
    expect(() => toBaseUnits("1.0000001")).toThrow(/decimals/);
  });

  it("formats base units back without trailing zeros", () => {
    expect(fromBaseUnits(500_000n)).toBe("0.5");
    expect(fromBaseUnits(20_000_000n)).toBe("20");
    expect(fromBaseUnits(1n)).toBe("0.000001");
    expect(fromBaseUnits(toBaseUnits("123.456"))).toBe("123.456");
  });
});

describe("checkPayment", () => {
  const check = (p: PaymentToSign, decided: string | null = null) =>
    checkPayment({ payment: p, contact: photographer, decidedAmountUsdc: decided, rules });

  it("auto-approves a payment at or under the limit", () => {
    expect(check(payment())).toEqual({ ok: true, overLimit: false });
    expect(check(payment({ amount: toBaseUnits("5") }))).toEqual({ ok: true, overLimit: false });
  });

  it("flags anything over the limit for thumb + World ID", () => {
    expect(check(payment({ amount: toBaseUnits("5.000001") }))).toEqual({ ok: true, overLimit: true });
    expect(check(payment({ amount: toBaseUnits("20") }), "20")).toEqual({ ok: true, overLimit: true });
  });

  it("refuses a payment from another account", () => {
    expect(check(payment({ payFrom: "0.0.9999" }))).toMatchObject({ ok: false, reason: expect.stringContaining("0.0.9999") });
  });

  it("refuses any token but USDC", () => {
    expect(check(payment({ tokenId: "0.0.123" }))).toMatchObject({ ok: false, reason: expect.stringContaining("only USDC") });
  });

  it("refuses a recipient that is not the saved contact", () => {
    expect(check(payment({ payTo: "0.0.6666" }))).toMatchObject({ ok: false, reason: expect.stringContaining("0.0.6666") });
  });

  it("refuses a merchant price that differs from what the owner said", () => {
    expect(check(payment({ amount: toBaseUnits("25") }), "20")).toMatchObject({
      ok: false,
      reason: "Merchant asks 25 USDC but you agreed to 20 USDC",
    });
  });

  it("refuses zero amounts", () => {
    expect(check(payment({ amount: 0n }))).toMatchObject({ ok: false });
  });
});
