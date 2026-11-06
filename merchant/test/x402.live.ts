import { decodePaymentRequiredHeader } from "@x402/core/http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseMerchantConfig } from "../src/config.js";
import { buildTransfer, decodeTransfer, pickRequirement } from "../../device/src/core/transfer.js";

// Talks to the real facilitator configured in X402_FACILITATOR_URL (default x402.org). No keys needed:
// quoting a price is public; only paying needs a funded device.
const config = parseMerchantConfig({
  MERCHANT_ACCOUNT_ID: process.env.MERCHANT_ACCOUNT_ID ?? "0.0.2002",
  X402_FACILITATOR_URL: process.env.X402_FACILITATOR_URL,
  MERCHANT_DATA_DIR: mkdtempSync(path.join(tmpdir(), "leash-merchant-")),
});
const app = createApp(config, () => "http://merchant.test");

describe(`x402 quote through ${config.facilitatorUrl}`, () => {
  it("answers an unpaid chai order with 402 and exact USDC terms on Hedera", async () => {
    const res = await app.request("/chai?qty=2");
    expect(res.status).toBe(402);
    const header = res.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    const required = decodePaymentRequiredHeader(header!);
    expect(required.accepts).toHaveLength(1);
    expect(required.accepts[0]).toMatchObject({
      scheme: "exact",
      network: `hedera:${config.network}`,
      asset: config.usdcTokenId,
      amount: "1000000",
      payTo: config.accountId,
    });
    expect(required.accepts[0].extra?.feePayer).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("quotes the photographer exactly what was asked", async () => {
    const res = await app.request("/photo?amount=20");
    expect(res.status).toBe(402);
    expect(decodePaymentRequiredHeader(res.headers.get("PAYMENT-REQUIRED")!).accepts[0].amount).toBe("20000000");
  });

  it("produces terms the device turns into exactly the quoted transfer", async () => {
    const res = await app.request("/chai?qty=3");
    const required = decodePaymentRequiredHeader(res.headers.get("PAYMENT-REQUIRED")!);
    const req = pickRequirement(required, config.network, config.usdcTokenId);
    const device = "0.0.1001";
    const tx = buildTransfer(req, device, config.network);
    expect(decodeTransfer(tx.toBytes(), req.extra.feePayer as string)).toEqual({
      tokenId: config.usdcTokenId,
      payFrom: device,
      payTo: config.accountId,
      amount: 1_500_000n,
    });
  });

  it("refuses a forged payment header without settling anything", async () => {
    const res = await app.request("/chai?qty=1", { headers: { "PAYMENT-SIGNATURE": "bm90IGEgcGF5bWVudA==" } });
    expect(res.status).not.toBe(200);
  });
});
