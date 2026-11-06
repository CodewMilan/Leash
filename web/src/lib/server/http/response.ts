import { z } from "zod";
import { AppError } from "../config";
export const json = (data: unknown, status = 200, headers?: HeadersInit) => Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("Expected a JSON request.", 415);
  const raw = await readLimitedBody(request, 48_000);
  try { return z.record(z.string(), z.unknown()).parse(JSON.parse(raw)); }
  catch { throw new AppError("Invalid JSON request."); }
}
export async function readLimitedBody(request: Request, maxBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new AppError("Request is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
