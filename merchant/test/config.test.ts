import { describe, expect, it } from "vitest";
import { parseMerchantConfig } from "../src/config.js";

describe("parseMerchantConfig", () => {
  it("reads a minimal env with defaults", () => {
    expect(parseMerchantConfig({ MERCHANT_ACCOUNT_ID: "0.0.2002" })).toMatchObject({
      accountId: "0.0.2002",
      network: "testnet",
      usdcTokenId: "0.0.429274",
      facilitatorUrl: "https://x402.org/facilitator",
      port: 4021,
      chaiPriceUsdc: "0.5",
      photoMaxUsdc: "50",
    });
  });

  it("fails loudly when the merchant account is missing or malformed", () => {
    expect(() => parseMerchantConfig({})).toThrow(/MERCHANT_ACCOUNT_ID is missing/);
    expect(() => parseMerchantConfig({ MERCHANT_ACCOUNT_ID: "0xabc" })).toThrow(/0\.0\.12345/);
  });

  it("names every invalid value at once", () => {
    const run = () =>
      parseMerchantConfig({ MERCHANT_ACCOUNT_ID: "0.0.2002", HEDERA_NETWORK: "devnet", CHAI_PRICE_USDC: "free", PHOTO_MAX_USDC: "0" });
    expect(run).toThrow(/HEDERA_NETWORK/);
    expect(run).toThrow(/CHAI_PRICE_USDC/);
    expect(run).toThrow(/PHOTO_MAX_USDC/);
  });
});
