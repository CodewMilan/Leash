import { config } from "../config.js";
import { mirrorNodeUrl } from "./client.js";
import { fromBaseUnits } from "../core/policy.js";

/** USDC balance of an account as a decimal string, or null if the account is not associated with USDC. */
export async function usdcBalance(accountId: string): Promise<string | null> {
  const res = await fetch(`${mirrorNodeUrl}/api/v1/accounts/${accountId}/tokens?token.id=${config.hedera.usdcTokenId}`);
  if (!res.ok) throw new Error(`Mirror node ${res.status} for ${accountId}`);
  const body = (await res.json()) as { tokens: { token_id: string; balance: number }[] };
  const entry = body.tokens.find((t) => t.token_id === config.hedera.usdcTokenId);
  return entry ? fromBaseUnits(BigInt(entry.balance)) : null;
}
