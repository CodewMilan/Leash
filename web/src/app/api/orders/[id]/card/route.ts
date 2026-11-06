import { NextRequest, NextResponse } from "next/server";
import { privateHeaders, purchaseAccess, purchaseError } from "@/lib/server/purchase-api";
async function respond(request: NextRequest, context: { params: Promise<{ id: string }> }, issue: boolean) {
  try {
    const { wallet, service, config } = purchaseAccess(request, issue);
    const { id } = await context.params;
    const card = issue ? await service.issue(wallet, id) : await service.getCard(wallet, id);
    const order = await service.read(wallet, id);
    const program = config.programToken;
    return NextResponse.json({ card, order, provider: "lithic", environment: "sandbox", cryptoFundingConnected: false,
      dashboardUrl: card && program && /^[0-9a-f-]{36}$/i.test(program) ? `https://app.lithic.com/programs/${program}/sandbox/cards/${card.token}` : null }, { headers: privateHeaders });
  } catch (error) { return purchaseError(error); }
}
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) { return respond(request, context, false); }
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return respond(request, context, true); }
