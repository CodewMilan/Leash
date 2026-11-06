import { isAddress } from "ethers";
import { USDT_ADDRESS, WHITECHAIN } from "../chain";
import type { AppStatus } from "../types";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(JSON.stringify({ event: "configuration.missing", variable: name }));
    throw new AppError("This service is being configured. Please try again shortly.", 503);
  }
  return value;
}
export function integerSetting(name: string, fallback: number, maximum = 10_000) {
  const raw = process.env[name] || String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    console.error(JSON.stringify({ event: "configuration.invalid_limit", variable: name }));
    throw new AppError("A service limit is misconfigured. Please try again shortly.", 503);
  }
  return value;
}
export function appOrigin() {
  const value =
    process.env.APP_URL ||
    (process.env.NODE_ENV === "production" ? required("APP_URL") : "http://localhost:3000");
  const url = new URL(value);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
    throw new AppError("APP_URL requires HTTPS outside localhost.", 503);
  return url.origin;
}
export function vaultAddress() {
  const address = required("VAULT_ADDRESS");
  if (!isAddress(address)) throw new AppError("Vault configuration is invalid.", 503);
  return address;
}
export function rpcUrl() {
  return process.env.WHITECHAIN_RPC_URL || WHITECHAIN.rpcUrls.default.http[0];
}
export function indicativeRate() {
  return process.env.PAYOUT_INR_PER_USDT || "84.00";
}
export function worldAction() {
  return "shagun-human";
}
export function worldEnvironment() {
  const environment = process.env.WORLD_ENVIRONMENT || "production";
  if (!["production", "staging"].includes(environment))
    throw new AppError("World environment is invalid.", 503);
  return environment as "production" | "staging";
}
export function appStatus(): AppStatus {
  const has = (...keys: string[]) => keys.every((key) => !!process.env[key]);
  const services = [
    {
      name: "Sender sign-in",
      ready: has("NEXT_PUBLIC_PRIVY_APP_ID"),
      detail: "Privy wallet connect · MetaMask",
    },
    {
      name: "Gift storage",
      ready: has("DATABASE_URL", "DATA_ENCRYPTION_KEY"),
      detail: "PostgreSQL and encrypted jobs",
    },
    {
      name: "Whitechain",
      ready: has("VAULT_ADDRESS", "RELAYER_PRIVATE_KEY", "ATTESTER_PRIVATE_KEY"),
      detail: "Vault and sponsored gas",
    },
    {
      name: "World ID",
      ready: has("WORLD_APP_ID", "WORLD_RP_ID", "WORLD_SIGNING_KEY"),
      detail: "Proof of Human",
    },
    {
      name: "Virtual cards",
      ready:
        has(
          "STRIPE_SECRET_KEY",
          "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
          "STRIPE_AUTHORIZATION_WEBHOOK_SECRET",
          "STRIPE_EVENTS_WEBHOOK_SECRET",
        ) &&
        !!process.env.STRIPE_SECRET_KEY?.match(/^(sk|rk)_test_/) &&
        !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_"),
      detail: "Stripe Issuing sandbox",
    },
    {
      name: "UPI test payouts",
      ready:
        has(
          "RAZORPAYX_KEY_ID",
          "RAZORPAYX_KEY_SECRET",
          "RAZORPAYX_ACCOUNT_NUMBER",
          "RAZORPAYX_WEBHOOK_SECRET",
        ) && !!process.env.RAZORPAYX_KEY_ID?.startsWith("rzp_test_"),
      detail: "RazorpayX test mode",
    },
  ];
  return {
    chainId: 1874,
    rate: indicativeRate(),
    testMode: true,
    ready: services.every((s) => s.ready),
    services,
  };
}
export function officialToken() {
  if (
    process.env.USDT_ADDRESS &&
    process.env.USDT_ADDRESS.toLowerCase() !== USDT_ADDRESS.toLowerCase()
  ) {
    throw new AppError("Only official Whitechain test USDT is supported.", 503);
  }
  return USDT_ADDRESS;
}
