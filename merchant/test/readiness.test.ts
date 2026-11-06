import { describe, expect, it } from "vitest";
import { usdcReadiness } from "../src/readiness.js";

const USDC = "0.0.429274";

describe("usdcReadiness", () => {
  it("is ready when the account already holds the token", () => {
    expect(usdcReadiness({ tokenId: USDC, tokens: [{ token_id: USDC, balance: 2_500_000 }], maxAutomaticTokenAssociations: 0 })).toEqual({
      ok: true,
      how: "associated",
      balanceUnits: 2_500_000n,
    });
  });

  it("is ready with unlimited automatic association", () => {
    expect(usdcReadiness({ tokenId: USDC, tokens: [], maxAutomaticTokenAssociations: -1 })).toEqual({ ok: true, how: "auto-association" });
  });

  it("is not ready when limited slots may be used up", () => {
    expect(usdcReadiness({ tokenId: USDC, tokens: [], maxAutomaticTokenAssociations: 2 })).toMatchObject({ ok: false, reason: expect.stringContaining("slot") });
  });

  it("is not ready without association, pointing at the wallet flow", () => {
    expect(usdcReadiness({ tokenId: USDC, tokens: [{ token_id: "0.0.1", balance: 1 }], maxAutomaticTokenAssociations: 0 })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("/merchant"),
    });
  });
});
