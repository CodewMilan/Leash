import { z } from "zod";
import { AppError, required } from "../config";
import { json } from "../http/response";
import { STRIPE_API_VERSION, assertSandbox, stripe } from "./stripe";
import { PHASE0_PURPOSE } from "./webhooks";

function enabled() {
  if (process.env.NODE_ENV === "production")
    throw new AppError("Page not found.", 404);
}

async function phase0Card() {
  enabled();
  const card = await stripe().issuing.cards.retrieve(required("STRIPE_PHASE0_CARD_ID"));
  assertSandbox(card);
  if (card.metadata?.purpose !== PHASE0_PURPOSE || card.type !== "virtual")
    throw new AppError("The configured card is not the Phase 0 sandbox card.", 503);
  return card;
}

export async function readPhase0(path: string) {
  if (path !== "cards/phase0") return null;
  const card = await phase0Card();
  const limit = card.spending_controls.spending_limits?.find((l) => l.interval === "all_time");
  return json({
    cardId: card.id,
    brand: card.brand,
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year,
    status: card.status,
    currency: card.currency,
    allTimeLimit: limit?.amount ?? null,
    publishableKey: required("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
  });
}

export async function phase0Post(path: string, data: Record<string, unknown>) {
  if (path !== "cards/phase0/ephemeral-key") return null;
  const card = await phase0Card();
  const { nonce } = z.object({ nonce: z.string().min(8).max(500) }).parse(data);
  const key = await stripe().ephemeralKeys.create(
    { nonce, issuing_card: card.id },
    { apiVersion: STRIPE_API_VERSION },
  );
  if (!key.secret) throw new AppError("Stripe did not return an ephemeral key.", 503);
  return json({ ephemeralKeySecret: key.secret, expires: key.expires });
}
