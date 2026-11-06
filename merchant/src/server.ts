import { serve } from "@hono/node-server";
import { networkInterfaces } from "node:os";
import { createApp } from "./app.js";
import { config } from "./env.js";

function baseUrl() {
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, "");
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal);
  return `http://${lan?.address ?? "localhost"}:${config.port}`;
}

const app = createApp(config, baseUrl);

serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, () => {
  console.log(`[merchant] ${config.accountId} on hedera:${config.network}, facilitator ${config.facilitatorUrl}`);
  console.log(`[merchant] listening on ${baseUrl()}  (chai ${config.chaiPriceUsdc} USDC/cup, photo up to ${config.photoMaxUsdc} USDC)`);
});
