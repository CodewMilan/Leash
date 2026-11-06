export type UsdcReadiness =
  | { ok: true; how: "associated"; balanceUnits: bigint }
  | { ok: true; how: "auto-association" }
  | { ok: false; reason: string };

/**
 * Whether an account can receive a token, from mirror node data.
 * Hedera accounts receive a token if they associated it, or if they have automatic association slots (-1 = unlimited).
 */
export function usdcReadiness(args: {
  tokenId: string;
  tokens: { token_id: string; balance: number | string }[];
  maxAutomaticTokenAssociations: number;
}): UsdcReadiness {
  const held = args.tokens.find((t) => t.token_id === args.tokenId);
  if (held) return { ok: true, how: "associated", balanceUnits: BigInt(held.balance) };
  if (args.maxAutomaticTokenAssociations === -1) return { ok: true, how: "auto-association" };
  if (args.maxAutomaticTokenAssociations > 0) {
    return {
      ok: false,
      reason: `not associated with ${args.tokenId}, and it has only ${args.maxAutomaticTokenAssociations} automatic association slot(s) that may already be used; enable USDC at /merchant in the web app`,
    };
  }
  return { ok: false, reason: `not associated with ${args.tokenId}; enable USDC at /merchant in the web app (your wallet signs it)` };
}
