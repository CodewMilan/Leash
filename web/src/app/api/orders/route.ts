import { NextRequest, NextResponse } from "next/server";
import { privateHeaders, purchaseAccess, purchaseError, smallBody } from "@/lib/server/purchase-api";
export async function GET(request: NextRequest) {
  try {
    const { wallet, service } = purchaseAccess(request);
    return NextResponse.json({ orders: await service.list(wallet) }, { headers: privateHeaders });
  } catch (error) { return purchaseError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const { wallet, service } = purchaseAccess(request, true);
    const body = await smallBody(request);
    const recipient = typeof body.recipient === "string" && body.recipient.trim() ? body.recipient.trim() : wallet;
    return NextResponse.json({ order: await service.create(wallet, recipient) }, { status: 201, headers: privateHeaders });
  } catch (error) { return purchaseError(error); }
}
