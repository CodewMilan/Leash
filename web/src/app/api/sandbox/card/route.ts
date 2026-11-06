import { NextRequest, NextResponse } from "next/server";
import { sandboxConfig, sandboxService } from "@/lib/server/sandbox-config";
import { sameOrigin, sessionCookie, validSession } from "@/lib/server/sandbox-session";
const headers = { "Cache-Control": "no-store" };
function authorize(request: NextRequest, write = false) {
  const config = sandboxConfig();
  if (write && !sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  if (config.missing.length) return NextResponse.json({ error: "Configure Lithic sandbox credentials first." }, { status: 503, headers });
  if (!validSession(request.cookies.get(sessionCookie)?.value, config.accessCode)) return NextResponse.json({ error: "Sign in with the sandbox operator access code." }, { status: 401, headers });
}
async function respond(request: NextRequest, issue: boolean) {
  const denied = authorize(request, issue);
  if (denied) return denied;
  try {
    const service = sandboxService();
    const card = issue ? await service.issue() : await service.get();
    const program = sandboxConfig().programToken;
    return NextResponse.json({ card, provider: "lithic", environment: "sandbox", giftFundingConnected: false,
      dashboardUrl: program && /^[0-9a-f-]{36}$/i.test(program) && card
        ? `https://app.lithic.com/programs/${program}/sandbox/cards/${card.token}` : null }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to contact Lithic sandbox.";
    // The service uses curated messages, never raw provider error bodies.
    return NextResponse.json({ error: message }, { status: 502, headers });
  }
}
export async function GET(request: NextRequest) { return respond(request, false); }
export async function POST(request: NextRequest) { return respond(request, true); }
