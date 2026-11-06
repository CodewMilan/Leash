import { NextRequest, NextResponse } from "next/server";
import { shopOwners, shopService } from "@/lib/server/shop-access";
import { shopReceipt } from "@/lib/server/shop";
import { HttpError, privateHeaders, purchaseError } from "@/lib/server/purchase-api";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const owners = shopOwners(request);
    if (!owners.length) throw new HttpError(401, "Sign in to view this order.");
    const { id } = await context.params;
    const order = await shopService().refresh(owners, id);
    return NextResponse.json({ order: shopReceipt(order) }, { headers: privateHeaders });
  } catch (error) { return purchaseError(error); }
}
