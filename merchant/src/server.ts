import { serve } from "@hono/node-server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { HTTPRequestContext } from "@x402/core/http";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { config } from "./config.js";

const NETWORK = `hedera:${config.network}` as const;
const DECIMALS = 6;
const receiptsFile = path.join(config.dataDir, "receipts.jsonl");

function toUnits(usdc: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(usdc.trim());
  if (!m) throw new Error(`invalid USDC amount "${usdc}"`);
  return BigInt(m[1]) * 10n ** BigInt(DECIMALS) + BigInt((m[2] ?? "").padEnd(DECIMALS, "0"));
}
const fromUnits = (u: bigint) => {
  const s = (u % 10n ** BigInt(DECIMALS)).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return `${u / 10n ** BigInt(DECIMALS)}${s ? `.${s}` : ""}`;
};

const query = (ctx: HTTPRequestContext, name: string) => new URL(ctx.adapter.getUrl(), "http://local").searchParams.get(name);

function chaiQty(raw: string | null): number {
  const qty = Number(raw ?? "1");
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) throw new Error("qty must be 1-10");
  return qty;
}

function photoAmount(raw: string | null): bigint {
  const units = toUnits(raw ?? "");
  if (units <= 0n || units > toUnits(config.photoMaxUsdc)) throw new Error(`amount must be between 0 and ${config.photoMaxUsdc}`);
  return units;
}

interface Receipt {
  at: string;
  resource: string;
  amountUsdc: string;
  payer?: string;
  payTo: string;
  hederaTxId: string;
  hashscan: string;
}

const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
const resourceServer = new x402ResourceServer(facilitator)
  .register("hedera:*", new ExactHederaScheme({ defaultAssets: { [NETWORK]: { asset: config.usdcTokenId, decimals: DECIMALS } } }))
  .onAfterSettle(async ({ result, requirements, paymentPayload }) => {
    const receipt: Receipt = {
      at: new Date().toISOString(),
      resource: paymentPayload.resource?.url ?? "",
      amountUsdc: fromUnits(BigInt(requirements.amount)),
      payer: result.payer,
      payTo: requirements.payTo,
      hederaTxId: result.transaction,
      hashscan: `https://hashscan.io/${config.network}/transaction/${result.transaction}`,
    };
    await mkdir(config.dataDir, { recursive: true });
    await appendFile(receiptsFile, JSON.stringify(receipt) + "\n");
    console.log(`[merchant] settled ${receipt.amountUsdc} USDC from ${receipt.payer} tx ${receipt.hederaTxId}`);
  });

const app = new Hono();
app.use("/receipts", cors({ origin: "*", allowMethods: ["GET"] }));

// Reject bad parameters before the 402 so a price is never quoted for an invalid order.
app.use("/chai", async (c, next) => {
  try {
    chaiQty(c.req.query("qty") ?? null);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
  await next();
});
app.use("/photo", async (c, next) => {
  try {
    photoAmount(c.req.query("amount") ?? null);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
  await next();
});

app.use(
  paymentMiddleware(
    {
      "GET /chai": {
        accepts: {
          scheme: "exact",
          network: NETWORK,
          payTo: config.accountId,
          price: (ctx) => ({ asset: config.usdcTokenId, amount: (toUnits(config.chaiPriceUsdc) * BigInt(chaiQty(query(ctx, "qty")))).toString() }),
          maxTimeoutSeconds: 120,
        },
        description: "Cutting chai from the Leash demo chai stall",
        mimeType: "application/json",
      },
      "GET /photo": {
        accepts: {
          scheme: "exact",
          network: NETWORK,
          payTo: config.accountId,
          price: (ctx) => ({ asset: config.usdcTokenId, amount: photoAmount(query(ctx, "amount")).toString() }),
          maxTimeoutSeconds: 120,
        },
        description: "Photographer's fee for an event photo session",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.get("/chai", (c) => {
  const qty = chaiQty(c.req.query("qty") ?? null);
  return c.json({ ok: true, item: "cutting chai", qty, message: `${qty} chai${qty > 1 ? "s" : ""} coming up` });
});

app.get("/photo", (c) => c.json({ ok: true, item: "photo session", amountUsdc: c.req.query("amount"), message: "Thanks! Your photos will be shared after the event." }));

app.get("/receipts", async (c) => {
  const raw = await readFile(receiptsFile, "utf8").catch(() => "");
  const receipts = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Receipt).reverse();
  return c.json({ merchant: config.accountId, network: config.network, receipts });
});

function baseUrl() {
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, "");
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal);
  return `http://${lan?.address ?? "localhost"}:${config.port}`;
}

// Printable QR for the stall counter; the device's camera reads it to identify the merchant.
app.get("/qr/:item", async (c) => {
  const item = c.req.param("item");
  const target = item === "chai" ? `${baseUrl()}/chai?qty=1` : item === "photo" ? `${baseUrl()}/photo` : null;
  if (!target) return c.notFound();
  c.header("content-type", "image/svg+xml");
  return c.body(await QRCode.toString(target, { type: "svg", margin: 2 }));
});

app.get("/", (c) =>
  c.json({
    merchant: config.accountId,
    network: NETWORK,
    asset: config.usdcTokenId,
    facilitator: config.facilitatorUrl,
    menu: {
      chai: { url: `${baseUrl()}/chai?qty={qty}`, unitPriceUsdc: config.chaiPriceUsdc },
      photo: { url: `${baseUrl()}/photo?amount={amount}`, maxUsdc: config.photoMaxUsdc },
    },
  }),
);

serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, () => {
  console.log(`[merchant] ${config.accountId} on ${NETWORK}, facilitator ${config.facilitatorUrl}`);
  console.log(`[merchant] listening on ${baseUrl()}  (chai ${config.chaiPriceUsdc} USDC/cup, photo up to ${config.photoMaxUsdc} USDC)`);
});
