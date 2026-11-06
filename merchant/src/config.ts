import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MERCHANT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: path.join(MERCHANT_ROOT, ".env"), quiet: true });
loadDotenv({ path: path.join(MERCHANT_ROOT, "..", ".env"), quiet: true });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return value;
}

const opt = (name: string, fallback: string) => process.env[name]?.trim() || fallback;

export const config = {
  accountId: required("MERCHANT_ACCOUNT_ID"),
  network: opt("HEDERA_NETWORK", "testnet") as "testnet" | "mainnet",
  usdcTokenId: opt("HEDERA_USDC_TOKEN_ID", "0.0.429274"),
  facilitatorUrl: opt("X402_FACILITATOR_URL", "https://x402.org/facilitator"),
  port: Number(opt("MERCHANT_PORT", "4021")),
  publicUrl: opt("MERCHANT_PUBLIC_URL", ""),
  chaiPriceUsdc: opt("CHAI_PRICE_USDC", "0.5"),
  photoMaxUsdc: opt("PHOTO_MAX_USDC", "50"),
  dataDir: opt("MERCHANT_DATA_DIR", path.join(MERCHANT_ROOT, "data")),
};
