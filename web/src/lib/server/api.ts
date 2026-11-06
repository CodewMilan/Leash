import { randomUUID } from "node:crypto";
import { AppError, appOrigin, appStatus, integerSetting } from "./config";
import { createSession, rateLimit, session } from "./auth/session";
import { sha256 } from "./security/crypto";
import { authenticate } from "./auth/controller";
import { createGift } from "./gifts/create";
import { claimGift } from "./gifts/claim";
import { readResource } from "./http/read";
import { json, readJson } from "./http/response";
import { receiveWebhook } from "./payouts/razorpay";
import { receiveAuthorizationRequest, receiveLithicEvent } from "./cards/webhooks";
import { phase0Post, readPhase0 } from "./cards/phase0";
import { cardRead, cardPost } from "./cards/controller";
import { sql } from "./db";

export async function handleApi(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\//, "").replace(/\/$/, "");
    if (request.method === "GET" && path === "health") return json({ status: "ok" });
    if (request.method === "GET" && path === "status") return json(appStatus());
    if (request.method === "GET" && path === "ready") {
      const configured = appStatus().ready;
      const [heartbeat] = await sql<{ fresh: boolean }>(
        "SELECT checked_at>now()-interval '2 minutes' AS fresh FROM service_heartbeats WHERE name='worker'",
      );
      return json(
        { configured, worker: !!heartbeat?.fresh },
        configured && heartbeat?.fresh ? 200 : 503,
      );
    }
    if (request.method === "POST" && path === "webhooks/razorpay")
      return await receiveWebhook(request);
    if (request.method === "POST" && path === "webhooks/lithic/asa")
      return await receiveAuthorizationRequest(request);
    if (request.method === "POST" && path === "webhooks/lithic/events")
      return await receiveLithicEvent(request);
    if (request.method === "POST" && request.headers.get("origin") !== appOrigin())
      throw new AppError("Request origin is not allowed.", 403);
    if (request.method === "POST" && path === "session") {
      try {
        const current = await session(request);
        return json({ sender: current.sender, passkey: !!current.credential_id });
      } catch (error) {
        if (!(error instanceof AppError) || error.status !== 401) throw error;
      }
      const client =
        process.env.TRUST_PROXY === "1"
          ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
          : "direct";
      await rateLimit(`session:${sha256(client)}`, integerSetting("MAX_SESSIONS_PER_HOUR", 120));
      const created = await createSession();
      return json({ sender: null, passkey: false }, 200, { "set-cookie": created.cookie });
    }
    const current = await session(request);
    if (request.method === "GET") {
      const result =
        (await readResource(path, current)) ||
        (await cardRead(path, current)) ||
        (await readPhase0(path));
      if (result) return result;
    } else if (request.method === "POST") {
      await rateLimit(`request:${current.id}`, 100, 60);
      const data = await readJson(request);
      const result =
        (await authenticate(path, current, data)) ||
        (await createGift(path, current, data)) ||
        (await claimGift(path, current, data)) ||
        (await cardPost(path, current)) ||
        (await phase0Post(path));
      if (result) return result;
    } else throw new AppError("Method not supported.", 405);
    throw new AppError("Page not found.", 404);
  } catch (error) {
    return handleError(error, requestId);
  }
}
export function handleError(error: unknown, requestId: string): Response {
  if (error instanceof AppError) return json({ error: error.message, requestId }, error.status);
  if (error && typeof error === "object" && "issues" in error) {
    return json({ error: "Check the fields and try again.", requestId }, 400);
  }
  if ((error as { code?: string })?.code === "23505")
    return json({ error: "This gift or campaign has already been claimed.", requestId }, 409);
  // Provider errors may include RPC credentials, signatures, proofs, and database URLs.
  console.error(
    JSON.stringify({
      event: "api.error",
      requestId,
      type: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return json(
    { error: "This service is temporarily unavailable. Please try again.", requestId },
    503,
  );
}
