import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { config } from "../config.js";

interface Discovery {
  issuer: string;
  device_authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

let discovery: Promise<Discovery> | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function discover(): Promise<Discovery> {
  discovery ??= fetch(`${config.world.issuer}/.well-known/openid-configuration`).then(async (res) => {
    if (!res.ok) throw new Error(`World discovery failed: HTTP ${res.status}`);
    return (await res.json()) as Discovery;
  });
  const doc = await discovery.catch((err) => {
    discovery = null;
    throw err;
  });
  jwks ??= createRemoteJWKSet(new URL(doc.jwks_uri));
  return doc;
}

/** Client authentication as registered in the World portal (client_secret_basic by default). */
function authenticated(form: Record<string, string>): RequestInit {
  const body = new URLSearchParams(form);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (config.world.authMethod === "post") {
    body.set("client_id", config.world.clientId);
    body.set("client_secret", config.world.clientSecret);
  } else {
    const id = encodeURIComponent(config.world.clientId);
    const secret = encodeURIComponent(config.world.clientSecret);
    headers.authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  }
  return { method: "POST", headers, body };
}

export interface WorldResult {
  verified: boolean;
  /** ID token `jti`: the single-use reference written to the spend log. */
  reference?: string;
  sub?: string;
  acr?: string;
  amr?: string[];
  intentHash?: string;
  reason?: string;
}

export interface WorldApproval {
  url: string;
  userCode: string;
  expiresAt: string;
  result: Promise<WorldResult>;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

const usedReferences = new Set<string>();

/**
 * Starts a fresh World ID check (OIDC device grant) bound to one payment.
 * World does not carry the payment details, so the binding lives here: this attempt's private device code
 * is redeemed once, for this payment only, and the approver must be the enrolled owner.
 */
export async function startWorldCheck(
  intent: { amountUsdc: string; payTo: string; merchant: string; episodeId: string } | null,
  signal: AbortSignal,
  opts: { requireOwner: boolean } = { requireOwner: true },
): Promise<WorldApproval> {
  if (opts.requireOwner && !config.world.ownerSub) {
    throw new Error("WORLD_OWNER_SUB is not set; run `pnpm enroll:world` to pin the owner's World ID");
  }
  const doc = await discover();
  const startedAt = Date.now();
  const intentHash = intent
    ? createHash("sha256")
        .update(JSON.stringify([intent.episodeId, intent.amountUsdc, config.hedera.usdcTokenId, intent.payTo, config.hedera.network]))
        .digest("hex")
    : undefined;

  const res = await fetch(doc.device_authorization_endpoint, authenticated({ scope: "openid" }));
  const started = (await res.json().catch(() => ({}))) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    verification_uri_complete?: string;
    expires_in?: number;
    interval?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !started.device_code) {
    throw new Error(`World check could not start (HTTP ${res.status}): ${started.error ?? ""} ${started.error_description ?? ""}`.trim());
  }
  const deviceCode = started.device_code;
  const expiresAt = startedAt + Math.min(started.expires_in ?? 600, 1200, config.world.approvalTimeoutMs / 1000) * 1000;
  let interval = (started.interval ?? 5) * 1000;

  const result = (async (): Promise<WorldResult> => {
    while (Date.now() < expiresAt) {
      await sleep(interval, signal);
      if (signal.aborted) return { verified: false, intentHash, reason: "Cancelled on the device" };

      const poll = await fetch(
        doc.token_endpoint,
        authenticated({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: deviceCode }),
      );
      const body = (await poll.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
      if (poll.ok && body.id_token) return validate(body.id_token, doc, startedAt, intentHash, opts.requireOwner);
      if (poll.status === 503) return { verified: false, intentHash, reason: "World is temporarily unavailable" };
      if (poll.status === 429) return { verified: false, intentHash, reason: "World rate-limited the check" };
      switch (body.error) {
        case "authorization_pending":
          continue;
        case "slow_down":
          interval += 5000;
          continue;
        case "access_denied":
          return { verified: false, intentHash, reason: "Denied in World App" };
        case "expired_token":
          return { verified: false, intentHash, reason: "World approval expired" };
        default:
          return { verified: false, intentHash, reason: `World check failed: ${body.error ?? `HTTP ${poll.status}`}` };
      }
    }
    return { verified: false, intentHash, reason: "World approval timed out" };
  })();

  return {
    url: started.verification_uri_complete ?? started.verification_uri ?? config.world.issuer,
    userCode: started.user_code ?? "",
    expiresAt: new Date(expiresAt).toISOString(),
    result,
  };
}

async function validate(
  idToken: string,
  doc: Discovery,
  startedAt: number,
  intentHash: string | undefined,
  requireOwner: boolean,
): Promise<WorldResult> {
  let claims: JWTPayload & { acr?: string; amr?: string[]; auth_time?: number };
  try {
    ({ payload: claims } = await jwtVerify(idToken, jwks!, {
      issuer: doc.issuer,
      audience: config.world.clientId,
      algorithms: ["RS256"],
      clockTolerance: 60,
    }));
  } catch (err) {
    return { verified: false, intentHash, reason: `World ID token invalid: ${err instanceof Error ? err.message : String(err)}` };
  }
  const base = { sub: claims.sub, acr: claims.acr, amr: claims.amr, intentHash, reference: claims.jti };
  console.log(`[world] token for sub=${claims.sub} acr=${claims.acr} amr=${JSON.stringify(claims.amr)}`);

  if (!claims.jti || usedReferences.has(claims.jti)) return { ...base, verified: false, reason: "World approval was already used" };
  if (typeof claims.auth_time !== "number" || claims.auth_time * 1000 < startedAt - 60_000) {
    return { ...base, verified: false, reason: "World authentication is not fresh" };
  }
  if (!Array.isArray(claims.amr) || !claims.amr.includes("pop")) {
    return { ...base, verified: false, reason: "World did not provide proof of personhood" };
  }
  if (config.world.requiredAcr.length && !config.world.requiredAcr.includes(claims.acr ?? "")) {
    return { ...base, verified: false, reason: `World assurance ${claims.acr} is not accepted` };
  }
  if (requireOwner && claims.sub !== config.world.ownerSub) {
    return { ...base, verified: false, reason: "Approved by a different World ID than the owner's" };
  }
  usedReferences.add(claims.jti);
  return { ...base, verified: true };
}

export function requestWorldApproval(
  intent: { amountUsdc: string; payTo: string; merchant: string; episodeId: string },
  signal: AbortSignal,
) {
  return startWorldCheck(intent, signal);
}
