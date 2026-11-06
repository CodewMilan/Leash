/** Preflight for the merchant: real Hedera mirror node and facilitator, with the values in .env. */
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { MERCHANT_ROOT, parseMerchantConfig } from "../src/config.js";

loadDotenv({ path: path.join(MERCHANT_ROOT, ".env"), quiet: true });
loadDotenv({ path: path.join(MERCHANT_ROOT, "..", ".env"), quiet: true });

let config: ReturnType<typeof parseMerchantConfig>;
try {
  config = parseMerchantConfig(process.env);
} catch (err) {
  console.error(`✗ config\n${(err as Error).message}`);
  process.exit(1);
}
console.log("✓ config: every required variable is set");

const mirror = config.network === "mainnet" ? "https://mainnet.mirrornode.hedera.com" : "https://testnet.mirrornode.hedera.com";

const checks: [string, () => Promise<string>][] = [
  [
    "merchant account",
    async () => {
      const res = await fetch(`${mirror}/api/v1/accounts/${config.accountId}/tokens?token.id=${config.usdcTokenId}`);
      if (res.status === 404) throw new Error(`${config.accountId} does not exist on ${config.network}`);
      if (!res.ok) throw new Error(`mirror node HTTP ${res.status}`);
      const { tokens } = (await res.json()) as { tokens: { token_id: string; balance: number }[] };
      const usdc = tokens.find((t) => t.token_id === config.usdcTokenId);
      if (!usdc) throw new Error(`not associated with USDC ${config.usdcTokenId}, so payments to it would fail; run \`pnpm setup\``);
      return `${config.accountId}, USDC associated, balance ${usdc.balance / 1e6} USDC`;
    },
  ],
  [
    "facilitator",
    async () => {
      const res = await fetch(`${config.facilitatorUrl}/supported`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`${config.facilitatorUrl} returned HTTP ${res.status}`);
      const { kinds } = (await res.json()) as { kinds: { x402Version: number; scheme: string; network: string; extra?: { feePayer?: string } }[] };
      const kind = kinds.find((k) => k.x402Version === 2 && k.scheme === "exact" && k.network === `hedera:${config.network}`);
      if (!kind) throw new Error(`${config.facilitatorUrl} does not settle exact payments on hedera:${config.network}`);
      return `${config.facilitatorUrl} settles on hedera:${config.network}, fee payer ${kind.extra?.feePayer}`;
    },
  ],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    console.log(`✓ ${name}: ${await run()}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${name}: ${(err as Error).message}`);
  }
}
console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
