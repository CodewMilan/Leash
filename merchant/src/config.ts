import path from "node:path";
import { fileURLToPath } from "node:url";
import { toUnits } from "./pricing.js";

export const MERCHANT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Env = Record<string, string | undefined>;

/** Reads the merchant config from `env`. Throws one error naming every missing or invalid variable. */
export function parseMerchantConfig(env: Env) {
  const problems: string[] = [];
  const opt = (name: string, fallback: string) => env[name]?.trim() || fallback;

  const accountId = env.MERCHANT_ACCOUNT_ID?.trim() ?? "";
  if (!accountId) problems.push("MERCHANT_ACCOUNT_ID is missing");
  else if (!/^\d+\.\d+\.\d+$/.test(accountId)) problems.push(`MERCHANT_ACCOUNT_ID must look like 0.0.12345, got "${accountId}"`);

  const network = opt("HEDERA_NETWORK", "testnet");
  if (network !== "testnet" && network !== "mainnet") problems.push(`HEDERA_NETWORK must be testnet or mainnet, got "${network}"`);

  const port = Number(opt("MERCHANT_PORT", "4021"));
  if (!Number.isInteger(port) || port <= 0) problems.push(`MERCHANT_PORT must be a port number, got "${opt("MERCHANT_PORT", "4021")}"`);

  const chaiPriceUsdc = opt("CHAI_PRICE_USDC", "0.5");
  const photoMaxUsdc = opt("PHOTO_MAX_USDC", "50");
  for (const [name, value] of [["CHAI_PRICE_USDC", chaiPriceUsdc], ["PHOTO_MAX_USDC", photoMaxUsdc]] as const) {
    try {
      if (toUnits(value) <= 0n) problems.push(`${name} must be above 0`);
    } catch {
      problems.push(`${name} must be a USDC amount, got "${value}"`);
    }
  }

  if (problems.length) throw new Error(`Merchant config is incomplete (see .env.example):\n  - ${problems.join("\n  - ")}`);

  return {
    accountId,
    network: network as "testnet" | "mainnet",
    usdcTokenId: opt("HEDERA_USDC_TOKEN_ID", "0.0.429274"),
    facilitatorUrl: opt("X402_FACILITATOR_URL", "https://x402.org/facilitator").replace(/\/$/, ""),
    port,
    publicUrl: opt("MERCHANT_PUBLIC_URL", ""),
    chaiPriceUsdc,
    photoMaxUsdc,
    dataDir: opt("MERCHANT_DATA_DIR", path.join(MERCHANT_ROOT, "data")),
  };
}

export type MerchantConfig = ReturnType<typeof parseMerchantConfig>;
