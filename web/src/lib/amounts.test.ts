import { describe, expect, it } from "vitest";
import { csvCell, inr, parseAmount, toPaise, tokenAmount } from "./amounts";

describe("amounts", () => {
  it("parses USDT with six decimal places", () => {
    expect(parseAmount("25")).toBe(25_000_000n);
    expect(parseAmount("0.000001")).toBe(1n);
    expect(() => parseAmount("0")).toThrow(/between/);
    expect(() => parseAmount("1.1234567")).toThrow(/6 decimal/);
  });

  it("formats token units and rounds rupees to paise", () => {
    expect(tokenAmount(25_500_000n)).toBe("25.50");
    expect(toPaise(25_000_000n, "84.00")).toBe(210_000n);
    expect(inr(210_000n)).toBe("₹2,100.00");
  });

  it("neutralizes spreadsheet formulas in CSV cells", () => {
    expect(csvCell('=cmd|"/c calc"!A0')).toBe(`"'=cmd|""/c calc""!A0"`);
    expect(csvCell("gift")).toBe(`"gift"`);
  });
});
