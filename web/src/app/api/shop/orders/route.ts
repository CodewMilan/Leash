import { NextRequest, NextResponse } from "next/server";
import { shopOwners, shopService, resolveShopSource } from "@/lib/server/shop-access";
import { shopReceipt } from "@/lib/server/shop";
import { sameOrigin } from "@/lib/server/sandbox-session";
import { HttpError, privateHeaders, purchaseError, smallBody } from "@/lib/server/purchase-api";
export async function GET(request: NextRequest) {
  try {
    const owners = shopOwners(request);
    if (!owners.length) throw new HttpError(401, "Sign in with your gift wallet or operator sandbox account.");
    const orders = (await shopService().list(owners)).map(shopReceipt);
    return NextResponse.json({ orders }, { headers: privateHeaders });
  } catch (error) { return purchaseError(error); }
}
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) throw new HttpError(403, "Invalid request origin.");
    if (!shopOwners(request).length) throw new HttpError(401, "Sign in with your gift wallet or operator sandbox account.");
    const body = await smallBody(request);
    const { owner, source } = await resolveShopSource(request, body.sourceId);
    const order = await shopService().create(owner, source, body.cart);
    return NextResponse.json({ order: shopReceipt(order) }, { status: 201, headers: privateHeaders });
  } catch (error) { return purchaseError(error); }
}
