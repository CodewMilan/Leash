import { afterEach, describe, expect, it, vi } from "vitest";
import { integerSetting } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("operational limit validation", () => {
  it("rejects non-numeric and unbounded limits rather than silently disabling caps", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const invalid of ["NaN", "Infinity", "-1", "0", "1.5", "999999999999999999999"]) {
      vi.stubEnv("MAX_CLAIMS_PER_PASSKEY_DAY", invalid);
      expect(() => integerSetting("MAX_CLAIMS_PER_PASSKEY_DAY", 5)).toThrow();
    }
  });
  it("uses a bounded default and accepts explicit positive integers", () => {
    vi.stubEnv("CHAIN_CONFIRMATIONS", "");
    expect(integerSetting("CHAIN_CONFIRMATIONS", 1, 64)).toBe(1);
    vi.stubEnv("CHAIN_CONFIRMATIONS", "3");
    expect(integerSetting("CHAIN_CONFIRMATIONS", 1, 64)).toBe(3);
  });
});
