import { NextResponse } from "next/server";
export const privateHeaders = { "Cache-Control": "no-store" };
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function purchaseError(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed. Try refreshing." }, { status: error instanceof HttpError ? error.status : 400, headers: privateHeaders });
}
export async function smallBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); throw new HttpError(413, "Request is too large."); }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HttpError(400, "Invalid request body."); }
}
