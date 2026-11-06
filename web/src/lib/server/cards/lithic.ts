import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, required } from "../config";

/** Shagun only ever talks to the Lithic sandbox. There is no production base URL here on purpose. */
export const LITHIC_SANDBOX_URL = "https://sandbox.lithic.com/v1";
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function apiKey() {
  if ((process.env.LITHIC_ENVIRONMENT || "sandbox") !== "sandbox")
    throw new AppError("Only the Lithic sandbox is supported.", 503);
  return required("LITHIC_API_KEY");
}

export class LithicError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly debuggingRequestId: string | null,
  ) {
    super(message);
  }
}

export async function lithic<T>(
  path: string,
  init: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const response = await fetch(`${LITHIC_SANDBOX_URL}/${path.replace(/^\//, "")}`, {
    method: init.method || (init.body === undefined ? "GET" : "POST"),
    cache: "no-store",
    headers: {
      authorization: apiKey(),
      accept: "application/json",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok)
    throw new LithicError(
      typeof data.message === "string" ? data.message : `Lithic returned ${response.status}.`,
      response.status,
      typeof data.debugging_request_id === "string" ? data.debugging_request_id : null,
    );
  return data as T;
}

/**
 * Verifies Lithic's `webhook-id` / `webhook-timestamp` / `webhook-signature` headers. Events and
 * ASA requests use the same scheme with different secrets.
 */
export function verifyLithicSignature(
  raw: string,
  headers: Headers,
  secret: string,
  now = Math.floor(Date.now() / 1000),
) {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return null;
  if (Math.abs(now - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return null;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest();
  const valid = signatures.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const given = Buffer.from(signature, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  return valid ? id : null;
}
