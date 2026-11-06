import { NextRequest, NextResponse } from "next/server";
import { shopOwners, shopService, resolveShopSource } from "@/lib/server/shop-access";
import { reconcileTransaction } from "@/lib/server/cards/ledger";
import { shopReceipt } from "@/lib/server/shop";
import { sameOrigin } from "@/lib/server/purchase-api";
import { HttpError, privateHeaders, purchaseError } from "@/lib/server/purchase-api";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!sameOrigin(request)) throw new HttpError(403, "Invalid request origin.");
    const owners = await shopOwners(request);
    if (!owners.length) throw new HttpError(401, "Sign in to pay for this order.");
    const { id } = await context.params;
    const existing = await shopService().read(owners, id);
    if (!existing.authorizationAttempted)
      await resolveShopSource(request, existing.source.sourceId);
    const order = await shopService().pay(owners, id);
    if (order.transactionToken) await reconcileTransaction(order.transactionToken);
    return NextResponse.json(
      { order: shopReceipt(order), environment: "lithic-sandbox", merchantBankFundsMoved: false },
      { headers: privateHeaders },
    );
  } catch (error) {
    return purchaseError(error);
  }
}
