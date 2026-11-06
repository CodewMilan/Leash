import { NextRequest, NextResponse } from "next/server";
import { sandboxConfig } from "@/lib/server/sandbox-config";
import { createSession, equalSecret, sameOrigin, sessionCookie, validSession } from "@/lib/server/sandbox-session";
const headers = { "Cache-Control": "no-store" };
let attempts = 0;
let windowStart = 0;
export async function GET(request: NextRequest) {
  const config = sandboxConfig();
  return NextResponse.json({ configured: config.missing.length === 0, missing: config.missing,
    authenticated: validSession(request.cookies.get(sessionCookie)?.value, config.accessCode) }, { headers });
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  const config = sandboxConfig();
  if (config.missing.length) return NextResponse.json({ error: "Configure the Lithic sandbox environment and restart the app." }, { status: 503, headers });
  if (Date.now() - windowStart > 60000) { attempts = 0; windowStart = Date.now(); }
  if (++attempts > 10) return NextResponse.json({ error: "Too many sign-in attempts. Wait one minute and try again." }, { status: 429, headers });
  let accessCode: unknown;
  try { accessCode = (await request.json()).accessCode; }
  catch { return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400, headers }); }
  if (typeof accessCode !== "string" || accessCode.length > 512 || !equalSecret(accessCode, config.accessCode)) {
    return NextResponse.json({ error: "That sandbox access code is incorrect." }, { status: 401, headers });
  }
  const response = NextResponse.json({ authenticated: true }, { headers });
  response.cookies.set(sessionCookie, createSession(config.accessCode), {
    httpOnly: true, sameSite: "strict", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: 8 * 60 * 60,
  });
  return response;
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  const response = NextResponse.json({ authenticated: false }, { headers });
  response.cookies.set(sessionCookie, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
