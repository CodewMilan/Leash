import type { GiftCardView } from "../../types";
import { requirePasskey, type Session } from "../auth/session";
import { AppError, appOrigin } from "../config";
import { sql } from "../db";
import { getGift } from "../gifts/repository";
import { json } from "../http/response";
import { lithic } from "./lithic";
import type { GiftCardRow } from "./issuance";

/** Receipt ownership does not imply access to recipient card data. */
export async function requireGiftRecipient(giftId: string, current: Session) {
  const gift = await getGift(giftId);
  if (gift.claim_session && gift.claim_session === current.id && current.credential_id) return gift;
  if (gift.claim_session && current.credential_id) {
    const matching = await sql("SELECT id FROM sessions WHERE id=$1 AND credential_id=$2", [
      gift.claim_session,
      current.credential_id,
    ]);
    if (matching.length) return gift;
  }
  throw new AppError("Confirm the recipient's passkey to open this gift card.", 403);
}

export function publicGiftCard(row: GiftCardRow): GiftCardView {
  const budget = Number(row.budget_cents),
    reserved = Number(row.reserved_cents),
    cleared = Number(row.cleared_cents);
  return {
    giftId: row.gift_id,
    settlementPending: !!row.settlement_pending,
    status: row.status,
    lastFour: row.last_four,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    network: row.network,
    budgetCents: budget,
    reservedCents: reserved,
    clearedCents: cleared,
    availableCents: row.status === "ready" ? Math.max(0, budget - reserved - cleared) : 0,
    error: row.error,
  };
}

export async function cardRead(path: string, current: Session): Promise<Response | null> {
  const match = path.match(/^gifts\/(0x[a-f0-9]{64})\/card$/i);
  if (!match) return null;
  await requireGiftRecipient(match[1], current);
  const [card] = await sql<GiftCardRow>(
    `SELECT c.*,EXISTS(SELECT 1 FROM jobs j WHERE j.gift_id=c.gift_id AND j.kind LIKE 'spend:%' AND j.status<>'done') AS settlement_pending FROM gift_cards c WHERE c.gift_id=$1`,
    [match[1]],
  );
  return json({ card: card ? publicGiftCard(card) : null });
}

export async function cardPost(path: string, current: Session): Promise<Response | null> {
  const match = path.match(/^gifts\/(0x[a-f0-9]{64})\/card\/embed$/i);
  if (!match) return null;
  requirePasskey(current);
  await requireGiftRecipient(match[1], current);
  const [card] = await sql<GiftCardRow>(
    `SELECT c.*,EXISTS(SELECT 1 FROM jobs j WHERE j.gift_id=c.gift_id AND j.kind LIKE 'spend:%' AND j.status<>'done') AS settlement_pending FROM gift_cards c WHERE c.gift_id=$1`,
    [match[1]],
  );
  if (!card?.card_token || card.status !== "ready")
    throw new AppError("Your gift card is not ready to show yet.", 409);
  const origin = appOrigin();
  if (!origin.startsWith("https://"))
    throw new AppError(
      "Card details need HTTPS. Open this gift through the configured HTTPS app URL.",
      503,
    );
  const result = await lithic<{ session: string }>(
    `cards/${encodeURIComponent(card.card_token)}/embed`,
    {
      body: {
        type: "CARD_EMBED",
        target_origin: origin,
        expiration: Math.floor(Date.now() / 1000) + 300,
      },
    },
  );
  if (!result.session || typeof result.session !== "string")
    throw new AppError("Card details could not be opened. Please try again.", 503);
  return json({ session: result.session });
}
