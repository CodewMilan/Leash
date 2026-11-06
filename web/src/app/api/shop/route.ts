import { NextRequest, NextResponse } from "next/server";
import { sandboxConfig } from "@/lib/server/sandbox-config";
import { PRODUCTS } from "@/lib/shop/catalog";
import { availableShopCards, shopOwners } from "@/lib/server/shop-access";
import { privateHeaders, purchaseError } from "@/lib/server/purchase-api";
export async function GET(request: NextRequest) {
  try {
    const sources = shopOwners(request).length ? await availableShopCards(request) : [];
    const cards = sources.map(({ sourceId, label, lastFour, state }) => ({ sourceId, label, lastFour, state }));
    const program = sandboxConfig().programToken;
    const transactionDashboardUrl = program && /^[0-9a-f-]{36}$/i.test(program) ? `https://app.lithic.com/programs/${program}/sandbox/transactions` : null;
    return NextResponse.json({ transactionDashboardUrl, products: PRODUCTS, cards, authenticated: shopOwners(request).length > 0, environment: "lithic-sandbox", merchant: "Leash Supply", gateway: "issuer-simulator" }, { headers: privateHeaders });
  } catch (error) { return purchaseError(error); }
}
