import { createHash } from "node:crypto";

export interface WorldClaims {
  sub?: string;
  jti?: string;
  acr?: string;
  amr?: string[];
  auth_time?: number;
}

export interface WorldCheckContext {
  /** When this approval attempt started (ms). The World login must be newer. */
  startedAt: number;
  /** Owner's pinned World ID; null skips the owner check (enrollment only). */
  ownerSub: string | null;
  requiredAcr: string[];
  usedReferences: ReadonlySet<string>;
}

export type ClaimVerdict = { verified: true } | { verified: false; reason: string };

/** Rules for an already signature-checked World ID token to count as a fresh human approval. */
export function checkWorldClaims(claims: WorldClaims, ctx: WorldCheckContext): ClaimVerdict {
  if (!claims.jti || ctx.usedReferences.has(claims.jti)) return { verified: false, reason: "World approval was already used" };
  if (typeof claims.auth_time !== "number" || claims.auth_time * 1000 < ctx.startedAt - 60_000) {
    return { verified: false, reason: "World authentication is not fresh" };
  }
  if (!Array.isArray(claims.amr) || !claims.amr.includes("pop")) {
    return { verified: false, reason: "World did not provide proof of personhood" };
  }
  if (ctx.requiredAcr.length && !ctx.requiredAcr.includes(claims.acr ?? "")) {
    return { verified: false, reason: `World assurance ${claims.acr} is not accepted` };
  }
  if (ctx.ownerSub !== null && claims.sub !== ctx.ownerSub) {
    return { verified: false, reason: "Approved by a different World ID than the owner's" };
  }
  return { verified: true };
}

/** Binds one approval to one payment: episode, amount, token, recipient and network. */
export function paymentIntentHash(intent: { episodeId: string; amountUsdc: string; payTo: string }, usdcTokenId: string, network: string) {
  return createHash("sha256")
    .update(JSON.stringify([intent.episodeId, intent.amountUsdc, usdcTokenId, intent.payTo, network]))
    .digest("hex");
}
