import { AppError, appOrigin, required } from "../config";
import { json } from "../http/response";
import { lithic } from "./lithic";
import { PHASE0_PURPOSE } from "./webhooks";

type LithicCard = {
  token: string;
  type: string;
  state: string;
  last_four: string;
  exp_month?: string;
  exp_year?: string;
  spend_limit: number;
  spend_limit_duration: string;
  tags?: Record<string, string> | null;
};

function enabled() {
  if (process.env.NODE_ENV === "production") throw new AppError("Page not found.", 404);
}

async function phase0Card() {
  enabled();
  const card = await lithic<LithicCard>(
    `cards/${encodeURIComponent(required("LITHIC_PHASE0_CARD_TOKEN"))}`,
  );
  if (card.tags?.purpose !== PHASE0_PURPOSE || card.type !== "VIRTUAL")
    throw new AppError("The configured card is not the Phase 0 sandbox card.", 503);
  return card;
}

export async function readPhase0(path: string) {
  if (path !== "cards/phase0") return null;
  const card = await phase0Card();
  return json({
    cardToken: card.token,
    lastFour: card.last_four,
    expMonth: card.exp_month ?? null,
    expYear: card.exp_year ?? null,
    state: card.state,
    spendLimit: card.spend_limit,
    spendLimitDuration: card.spend_limit_duration,
  });
}

export async function phase0Post(path: string) {
  if (path !== "cards/phase0/embed") return null;
  const card = await phase0Card();
  const { session } = await lithic<{ session: string }>(
    `cards/${encodeURIComponent(card.token)}/embed`,
    {
      body: {
        type: "CARD_EMBED",
        target_origin: appOrigin(),
        expiration: Math.floor(Date.now() / 1000) + 5 * 60,
      },
    },
  );
  return json({ session });
}
