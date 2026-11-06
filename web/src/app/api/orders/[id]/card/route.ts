import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json({ error: "Wallet purchases have been removed. Open your received pass at /gifts." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
export const GET = retired;
export const POST = retired;
