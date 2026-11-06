import { isAddress } from "ethers";
import { USDT_ADDRESS, WHITECHAIN } from "../chain";
import type { AppStatus } from "../types";

export class AppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new AppError(`Service setup is incomplete (${name}).`, 503);
  return value;
}
export function appOrigin() { return new URL(process.env.APP_URL || "http://localhost:3000").origin; }
export function vaultAddress() {
  const address = required("VAULT_ADDRESS");
  if (!isAddress(address)) throw new AppError("Vault configuration is invalid.", 503);
  return address;
}
export function rpcUrl() { return process.env.WHITECHAIN_RPC_URL || WHITECHAIN.rpcUrls.default.http[0]; }
export function indicativeRate() { return process.env.PAYOUT_INR_PER_USDT || "84.00"; }
export function worldAction() { return "shagun-human"; }
export function worldEnvironment() {
  const environment = process.env.WORLD_ENVIRONMENT || "production";
  if (!["production", "staging"].includes(environment)) throw new AppError("World environment is invalid.", 503);
  return environment as "production" | "staging";
}
export function appStatus(): AppStatus {
  const has = (...keys: string[]) => keys.every((key) => !!process.env[key]);
  const services = [
    { name: "Sender sign-in", ready: has("NEXT_PUBLIC_PRIVY_APP_ID"), detail: "Privy embedded wallet" },
    { name: "Gift storage", ready: has("DATABASE_URL", "DATA_ENCRYPTION_KEY"), detail: "PostgreSQL and encrypted jobs" },
    { name: "Whitechain", ready: has("VAULT_ADDRESS", "RELAYER_PRIVATE_KEY", "ATTESTER_PRIVATE_KEY"), detail: "Vault and sponsored gas" },
    { name: "World ID", ready: has("WORLD_APP_ID", "WORLD_RP_ID", "WORLD_SIGNING_KEY"), detail: "Proof of Human" },
    { name: "UPI test payouts", ready: has("RAZORPAYX_KEY_ID", "RAZORPAYX_KEY_SECRET", "RAZORPAYX_ACCOUNT_NUMBER", "RAZORPAYX_WEBHOOK_SECRET") && !!process.env.RAZORPAYX_KEY_ID?.startsWith("rzp_test_"), detail: "RazorpayX test mode" },
  ];
  return { chainId: 1874, rate: indicativeRate(), testMode: true, ready: services.every((s) => s.ready), services };
}
export function officialToken() {
  if (process.env.USDT_ADDRESS && process.env.USDT_ADDRESS.toLowerCase() !== USDT_ADDRESS.toLowerCase()) {
    throw new AppError("Only official Whitechain test USDT is supported.", 503);
  }
  return USDT_ADDRESS;
}
