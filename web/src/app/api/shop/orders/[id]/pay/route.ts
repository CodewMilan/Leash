import { NextRequest, NextResponse } from "next/server";
import { shopOwners, shopService } from "@/lib/server/shop-access";
import { shopReceipt } from "@/lib/server/shop";
import { sameOrigin } from "@/lib/server/sandbox-session";
import { HttpError, privateHeaders, purchaseError } from "@/lib/server/purchase-api";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!sameOrigin(request)) throw new HttpError(403, "Invalid request origin.");
    const owners = shopOwners(request);
    if (!owners.length) throw new HttpError(401, "Sign in to pay for this order.");
    const { id } = await context.params;
    const order = await shopService().pay(owners, id);
    return NextResponse.json({ order: shopReceipt(order), environment: "lithic-sandbox", merchantBankFundsMoved: false }, { headers: privateHeaders });
  } catch (error) { return purchaseError(error); }
}
