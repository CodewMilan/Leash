import { NextRequest, NextResponse } from "next/server";
import { privateHeaders, purchaseAccess, purchaseError, smallBody } from "@/lib/server/purchase-api";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { wallet, service } = purchaseAccess(request, true);
    const { id } = await context.params;
    const body = await smallBody(request);
    const order = await service.pay(wallet, id, typeof body.txHash === "string" ? body.txHash : undefined);
    return NextResponse.json({ order, confirmed: order.status !== "AWAITING_PAYMENT" }, { status: order.status === "AWAITING_PAYMENT" ? 202 : 200, headers: privateHeaders });
  } catch (error) { return purchaseError(error); }
}
