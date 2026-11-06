import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseMerchantConfig } from "../src/config.js";

const config = parseMerchantConfig({
  MERCHANT_ACCOUNT_ID: "0.0.2002",
  MERCHANT_DATA_DIR: mkdtempSync(path.join(tmpdir(), "leash-merchant-")),
});
const app = createApp(config, () => "http://merchant.test");

describe("merchant app (no facilitator involved)", () => {
  it("refuses invalid orders before quoting a price", async () => {
    for (const url of ["/chai?qty=0", "/chai?qty=11", "/photo", "/photo?amount=0", "/photo?amount=51"]) {
      const res = await app.request(url);
      expect(res.status, url).toBe(400);
      expect(res.headers.get("PAYMENT-REQUIRED"), url).toBeNull();
    }
  });
});
