import { join, resolve } from "node:path";
import type { NextRequest } from "next/server";
import { session } from "./auth/session";
import { AppError, required } from "./config";
import { sql } from "./db";
import { HttpError } from "./purchase-api";
import { LithicShopGateway } from "./lithic-shop";
import { ShopOrders, type ShopSource } from "./shop";
export type ShopCardOption = { sourceId: string; label: string; lastFour: string; state: string };
type InternalSource = ShopCardOption & { owner: string; cardToken: string };
export async function shopOwners(request: NextRequest) {
  try {
    const current = await session(request);
    return current.credential_id ? [`recipient:${current.credential_id}`] : [];
  } catch (error) {
    if (error instanceof AppError && error.status === 401) return [];
    throw error;
  }
}
export function shopService() {
  if ((process.env.LITHIC_ENVIRONMENT || "sandbox") !== "sandbox")
    throw new HttpError(503, "Only Lithic sandbox purchases are supported.");
  required("LITHIC_ASA_SECRET");
  required("LITHIC_EVENTS_SECRET");
  const directory = resolve(
    /* turbopackIgnore: true */ process.env.LITHIC_DATA_DIR || ".data/lithic",
  );
  return new ShopOrders(join(directory, "shop"), new LithicShopGateway(required("LITHIC_API_KEY")));
}
export async function availableShopCards(request: NextRequest): Promise<InternalSource[]> {
  const current = await session(request);
  if (!current.credential_id) return [];
  const rows = await sql<{ gift_id: string; card_token: string; last_four: string }>(
    `SELECT c.gift_id,c.card_token,c.last_four FROM gift_cards c
    JOIN gifts g ON g.id=c.gift_id JOIN sessions claimant ON claimant.id=g.claim_session
    WHERE claimant.credential_id=$1 AND c.status='ready' AND g.status='claimed' AND g.expiry>$2`,
    [current.credential_id, Math.floor(Date.now() / 1000)],
  );
  return rows.map((card) => ({
    sourceId: card.gift_id,
    owner: `recipient:${current.credential_id}`,
    cardToken: card.card_token,
    lastFour: card.last_four,
    state: "OPEN",
    label: `Shagun gift · •••• ${card.last_four}`,
  }));
}
export async function resolveShopSource(
  request: NextRequest,
  sourceId: unknown,
): Promise<{ owner: string; source: ShopSource }> {
  if (typeof sourceId !== "string") throw new HttpError(400, "Choose a Shagun gift card.");
  const selected = (await availableShopCards(request)).find((card) => card.sourceId === sourceId);
  if (!selected)
    throw new HttpError(
      403,
      "This gift card is unavailable, expired, or belongs to another recipient.",
    );
  return {
    owner: selected.owner,
    source: {
      sourceId: selected.sourceId,
      cardToken: selected.cardToken,
      lastFour: selected.lastFour,
    },
  };
}
