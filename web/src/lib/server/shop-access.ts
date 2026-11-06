import { join } from "node:path";
import type { NextRequest } from "next/server";
import { sandboxConfig, sandboxService } from "./sandbox-config";
import { sessionCookie, validSession } from "./sandbox-session";
import { HttpError } from "./purchase-api";
import { LithicShopGateway } from "./lithic-shop";
import { ShopOrders, type ShopSource } from "./shop";
export type ShopCardOption = { sourceId: string; label: string; lastFour: string; state: string };
type InternalSource = ShopCardOption & { owner: string; cardToken: string };
export function shopOwners(request: NextRequest) {
  const config = sandboxConfig();
  const operator = validSession(request.cookies.get(sessionCookie)?.value, config.accessCode);
  return operator ? ["operator"] : [];
}
export function shopService() {
  const config = sandboxConfig();
  if (config.missing.length) throw new HttpError(503, "Configure the Lithic sandbox key and access code first.");
  return new ShopOrders(join(config.directory, "shop"), new LithicShopGateway(config.apiKey));
}
export async function availableShopCards(request: NextRequest): Promise<InternalSource[]> {
  const owners = shopOwners(request);
  const cards: InternalSource[] = [];
  if (owners.includes("operator")) {
    const card = await sandboxService().get();
    if (card) cards.push({ sourceId: "operator", owner: "operator", cardToken: card.token, lastFour: card.lastFour, state: card.state, label: `Received pass card · •••• ${card.lastFour}` });
  }
  return cards;
}
export async function resolveShopSource(request: NextRequest, sourceId: unknown): Promise<{ owner: string; source: ShopSource }> {
  if (typeof sourceId !== "string") throw new HttpError(400, "Choose a sandbox payment card.");
  const selected = (await availableShopCards(request)).find(card => card.sourceId === sourceId);
  if (!selected) throw new HttpError(403, "This card is not available to your authenticated session.");
  return { owner: selected.owner, source: { sourceId: selected.sourceId, cardToken: selected.cardToken, lastFour: selected.lastFour } };
}
