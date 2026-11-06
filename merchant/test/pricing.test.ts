import { describe, expect, it } from "vitest";
import { chaiPrice, chaiQty, fromUnits, photoAmount, toUnits } from "../src/pricing.js";

describe("USDC units", () => {
  it("round-trips decimal amounts", () => {
    expect(toUnits("0.5")).toBe(500_000n);
    expect(fromUnits(toUnits("12.34"))).toBe("12.34");
    expect(fromUnits(20_000_000n)).toBe("20");
  });

  it("rejects malformed amounts", () => {
    for (const bad of ["", "abc", "-1", "1.1234567", "1e2"]) expect(() => toUnits(bad)).toThrow();
  });
});

describe("chai", () => {
  it("prices per cup", () => {
    expect(chaiPrice("2", "0.5")).toBe(1_000_000n);
    expect(chaiPrice(null, "0.5")).toBe(500_000n);
  });

  it("only sells 1 to 10 whole cups", () => {
    expect(chaiQty("10")).toBe(10);
    for (const bad of ["0", "11", "1.5", "two", "-1"]) expect(() => chaiQty(bad)).toThrow(/qty/);
  });
});

describe("photographer", () => {
  it("charges the agreed amount up to the maximum", () => {
    expect(photoAmount("20", "50")).toBe(20_000_000n);
    expect(photoAmount("50", "50")).toBe(50_000_000n);
  });

  it("rejects zero, missing and over-maximum amounts", () => {
    for (const bad of ["0", null, "50.000001", "100"]) expect(() => photoAmount(bad, "50")).toThrow();
  });
});
