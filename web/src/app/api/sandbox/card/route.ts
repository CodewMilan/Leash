import { NextResponse } from "next/server";
function retired() {
  return NextResponse.json(
    {
      error: "Leash Gifts has been retired. Open your Chinki gift link to claim and use its card.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
export const GET = retired;
export const POST = retired;
export const DELETE = retired;
