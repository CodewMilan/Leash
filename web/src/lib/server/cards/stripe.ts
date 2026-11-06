import Stripe from "stripe";
import { AppError, required } from "../config";

export const STRIPE_API_VERSION = "2026-10-28.endive";

const globalStripe = globalThis as typeof globalThis & { shagunStripe?: Stripe };

export function stripe() {
  const key = required("STRIPE_SECRET_KEY");
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_"))
    throw new AppError("Only Stripe sandbox keys are permitted in this build.", 503);
  const pinned = process.env.STRIPE_API_VERSION;
  if (pinned && pinned !== STRIPE_API_VERSION)
    throw new AppError("STRIPE_API_VERSION does not match the installed Stripe SDK.", 503);
  return (globalStripe.shagunStripe ??= new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 1,
    timeout: 15_000,
    appInfo: { name: "shagun" },
  }));
}

export function assertSandbox(object: { livemode?: boolean | null }) {
  if (object.livemode !== false)
    throw new AppError("Live Stripe objects are rejected in this build.", 403);
}
