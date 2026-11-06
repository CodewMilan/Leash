import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "../src/core/config.js";

const complete = {
  ZG_API_KEY: "sk-test",
  ZG_PRIVATE_KEY: "0x" + "11".repeat(32),
  HEDERA_ACCOUNT_ID: "0.0.1001",
  HEDERA_PRIVATE_KEY: "22".repeat(32),
};

describe("parseConfig", () => {
  it("reads a complete env with the documented defaults", () => {
    const config = parseConfig(complete);
    expect(config.hedera).toMatchObject({ network: "testnet", usdcTokenId: "0.0.429274", spendLogTopicId: null });
    expect(config.spendLimitUsdc).toBe(5);
    expect(config.zg.baseUrl).toBe("https://router-api.0g.ai/v1");
    expect(config.hardware.enabled).toBe(true);
  });

  it("names every missing secret at once", () => {
    let error: unknown;
    try {
      parseConfig({});
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    for (const name of Object.keys(complete)) expect((error as Error).message).toContain(`${name} is missing`);
  });

  it("treats blank values as missing", () => {
    expect(() => parseConfig({ ...complete, ZG_API_KEY: "   " })).toThrow(/ZG_API_KEY is missing/);
  });

  it("rejects invalid limits, networks and hardware modes", () => {
    expect(() => parseConfig({ ...complete, SPEND_LIMIT_USDC: "-1" })).toThrow(/SPEND_LIMIT_USDC/);
    expect(() => parseConfig({ ...complete, SPEND_LIMIT_USDC: "five" })).toThrow(/SPEND_LIMIT_USDC/);
    expect(() => parseConfig({ ...complete, HEDERA_NETWORK: "previewnet" })).toThrow(/HEDERA_NETWORK/);
    expect(() => parseConfig({ ...complete, LEASH_HARDWARE: "laptop" })).toThrow(/LEASH_HARDWARE/);
  });

  it("starts without World credentials, leaving World unset", () => {
    expect(parseConfig(complete).world).toMatchObject({ clientId: null, clientSecret: null });
    expect(parseConfig({ ...complete, WORLD_CLIENT_ID: "app_1", WORLD_CLIENT_SECRET: "s" }).world).toMatchObject({ clientId: "app_1", clientSecret: "s" });
  });

  it("runs without hardware when LEASH_HARDWARE=none", () => {
    expect(parseConfig({ ...complete, LEASH_HARDWARE: "none" }).hardware.enabled).toBe(false);
  });
});
