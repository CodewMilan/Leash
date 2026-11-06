import { NextRequest, NextResponse } from "next/server";
import { PRODUCTS } from "@/lib/shop/catalog";
import { availableShopCards, shopOwners } from "@/lib/server/shop-access";
import { privateHeaders, purchaseError } from "@/lib/server/purchase-api";
export async function GET(request: NextRequest) {
  try {
    const sources = (await shopOwners(request)).length ? await availableShopCards(request) : [];
    const cards = sources.map(({ sourceId, label, lastFour, state }) => ({
      sourceId,
      label,
      lastFour,
      state,
    }));
    const program = process.env.LITHIC_PROGRAM_TOKEN;
    const transactionDashboardUrl =
      program && /^[0-9a-f-]{36}$/i.test(program)
        ? `https://app.lithic.com/programs/${program}/sandbox/transactions`
        : null;
    return NextResponse.json(
      {
        transactionDashboardUrl,
        products: PRODUCTS,
        cards,
        authenticated: (await shopOwners(request)).length > 0,
        environment: "lithic-sandbox",
        merchant: "Shagun sandbox shop",
        gateway: "issuer-simulator",
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return purchaseError(error);
  }
}
