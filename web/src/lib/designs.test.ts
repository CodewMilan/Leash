import { describe, expect, it } from "vitest";
import { designById, designIds, GIFT_DESIGNS, GIFT_PRESETS, giftUnits } from "./designs";

describe("gift catalogue", () => {
  it("accepts $1 to $1,000 and rejects everything else", () => {
    expect(giftUnits("1")).toBe(1_000_000n);
    expect(giftUnits(" 25.5 ")).toBe(25_500_000n);
    expect(giftUnits("1000")).toBe(1_000_000_000n);
    for (const bad of ["0.99", "1000.01", "0", "-5", "abc", "1e3", ""])
      expect(() => giftUnits(bad)).toThrow();
  });
  it("has unique designs, valid presets and a safe fallback", () => {
    expect(new Set(designIds).size).toBe(GIFT_DESIGNS.length);
    for (const preset of GIFT_PRESETS) expect(() => giftUnits(preset)).not.toThrow();
    expect(designById("birthday").name).toBe("Birthday");
    expect(designById("unknown").id).toBe("diwali");
  });
});
