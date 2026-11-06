/**
 * Preflight: checks every real service the device depends on, with the keys in .env.
 * Nothing is simulated. Exits 1 if anything that would block a payment is wrong.
 */
import { config as loadDotenv } from "dotenv";
import { access } from "node:fs/promises";
import path from "node:path";
import { ConfigError, DEVICE_ROOT, parseConfig, type Config } from "../src/core/config.js";

loadDotenv({ path: path.join(DEVICE_ROOT, ".env"), quiet: true });
loadDotenv({ path: path.join(DEVICE_ROOT, "..", ".env"), quiet: true });

class Warn extends Error {}

let config: Config;
try {
  config = parseConfig(process.env);
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(`✗ config\n${err.message}`);
  process.exit(1);
}
console.log("✓ config: every required variable is set");

const { deviceKey, mirrorNodeUrl } = await import("../src/hedera/client.js");
const { loadContacts } = await import("../src/contacts.js");
const { decide, verifyBrainAccess } = await import("../src/brain/zg.js");
const { fillEndpoint } = await import("../src/core/contacts.js");
const { pickRequirement } = await import("../src/core/transfer.js");
const { fromBaseUnits } = await import("../src/core/policy.js");
const { decodePaymentRequiredHeader } = await import("@x402/core/http");
const { JsonRpcProvider, Wallet, formatEther } = await import("ethers");

async function mirror<T>(p: string): Promise<T> {
  const res = await fetch(`${mirrorNodeUrl}${p}`, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) throw new Error(`not found on the ${config.hedera.network} mirror node (${p})`);
  if (!res.ok) throw new Error(`mirror node HTTP ${res.status} on ${p}`);
  return (await res.json()) as T;
}

type MirrorKey = { _type: string; key: string } | null;
const sameKey = (k: MirrorKey) => !!k && k.key.toLowerCase() === deviceKey.publicKey.toStringRaw().toLowerCase();

const checks: [string, () => Promise<string>][] = [
  [
    "hedera account",
    async () => {
      const acct = await mirror<{ key: MirrorKey; balance: { balance: number; tokens: { token_id: string; balance: number }[] } }>(
        `/api/v1/accounts/${config.hedera.accountId}`,
      );
      if (!sameKey(acct.key)) {
        throw new Error(`HEDERA_PRIVATE_KEY does not match ${config.hedera.accountId} (account key ${acct.key?._type} ${acct.key?.key}); check HEDERA_KEY_TYPE`);
      }
      const hbar = acct.balance.balance / 1e8;
      if (hbar < 1) throw new Error(`only ${hbar} HBAR; needs a few HBAR for USDC association and spend log messages`);
      return `${config.hedera.accountId}, key matches, ${hbar.toFixed(2)} HBAR`;
    },
  ],
  [
    "device USDC",
    async () => {
      const { tokens } = await mirror<{ tokens: { token_id: string; balance: number }[] }>(
        `/api/v1/accounts/${config.hedera.accountId}/tokens?token.id=${config.hedera.usdcTokenId}`,
      );
      const usdc = tokens.find((t) => t.token_id === config.hedera.usdcTokenId);
      if (!usdc) throw new Error(`not associated with USDC ${config.hedera.usdcTokenId}; run \`pnpm setup:hedera\``);
      const balance = fromBaseUnits(BigInt(usdc.balance));
      if (usdc.balance === 0) throw new Error("associated but holds 0 USDC; fund it at https://faucet.circle.com (Hedera Testnet)");
      return `${balance} USDC`;
    },
  ],
  [
    "spend log topic",
    async () => {
      const topicId = config.hedera.spendLogTopicId;
      if (!topicId) throw new Error("HEDERA_SPEND_LOG_TOPIC_ID is not set; run `pnpm setup:hedera`");
      const topic = await mirror<{ submit_key: MirrorKey; deleted: boolean }>(`/api/v1/topics/${topicId}`);
      if (topic.deleted) throw new Error(`topic ${topicId} is deleted`);
      if (!sameKey(topic.submit_key)) throw new Error(`topic ${topicId} submit key is not the device key, so anyone or no one could write to it`);
      return `${topicId}, only the device can write`;
    },
  ],
  [
    "0G compute",
    async () => {
      if (!(await verifyBrainAccess())) throw new Error(`0G Router at ${config.zg.baseUrl} is unreachable (the device would stay in safe mode)`);
      return `${config.zg.baseUrl}, model ${config.zg.model}, key accepted`;
    },
  ],
  [
    "0G decision",
    async () => {
      const contacts = await loadContacts();
      const { decision, requestId, teeVerified, provider } = await decide({ heard: "buy two chais", saw: null, contacts });
      return `request ${requestId}, action ${decision.action} ${decision.contactId ?? ""} qty ${decision.qty ?? "-"}, TEE verified: ${teeVerified ?? "not reported"}, provider ${provider ?? "?"}`;
    },
  ],
  [
    "0G storage wallet",
    async () => {
      const wallet = new Wallet(config.zg.privateKey, new JsonRpcProvider(config.zg.rpcUrl));
      const balance = await wallet.provider!.getBalance(wallet.address);
      if (balance === 0n) throw new Error(`${wallet.address} has no 0G; get testnet tokens at https://faucet.0g.ai`);
      const res = await fetch(`${config.zg.indexerUrl}/nodes`, { method: "GET", signal: AbortSignal.timeout(15_000) }).catch((e: Error) => e);
      if (res instanceof Error) throw new Error(`0G Storage indexer ${config.zg.indexerUrl} unreachable: ${res.message}`);
      return `${wallet.address}, ${formatEther(balance)} 0G, indexer reachable`;
    },
  ],
  [
    "world client",
    async () => {
      const doc = await fetch(`${config.world.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15_000) });
      if (!doc.ok) throw new Error(`discovery at ${config.world.issuer} returned HTTP ${doc.status}`);
      const { device_authorization_endpoint } = (await doc.json()) as { device_authorization_endpoint?: string };
      if (!device_authorization_endpoint) throw new Error(`${config.world.issuer} does not offer the device flow`);
      const body = new URLSearchParams({ scope: "openid" });
      const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
      if (config.world.authMethod === "post") {
        body.set("client_id", config.world.clientId);
        body.set("client_secret", config.world.clientSecret);
      } else {
        headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(config.world.clientId)}:${encodeURIComponent(config.world.clientSecret)}`).toString("base64")}`;
      }
      const res = await fetch(device_authorization_endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`World rejected the client (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}; check WORLD_CLIENT_ID/SECRET and WORLD_AUTH_METHOD`);
      if (!config.world.ownerSub) throw new Warn("client works, but WORLD_OWNER_SUB is not set; run `pnpm enroll:world` before over-limit payments");
      return `client accepted by ${config.world.issuer}, owner pinned`;
    },
  ],
  [
    "merchants",
    async () => {
      const contacts = await loadContacts();
      const lines: string[] = [];
      for (const c of contacts) {
        const url = fillEndpoint(c, "1", 1);
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch((e: Error) => e);
        if (res instanceof Error) throw new Warn(`${c.name} at ${url} is unreachable (${res.message}); start the merchant`);
        const header = res.headers.get("PAYMENT-REQUIRED");
        if (res.status !== 402 || !header) throw new Error(`${c.name} answered HTTP ${res.status} without x402 terms`);
        const req = pickRequirement(decodePaymentRequiredHeader(header), config.hedera.network, config.hedera.usdcTokenId);
        if (req.payTo !== c.payTo) throw new Error(`${c.name} asks to be paid at ${req.payTo} but contacts.json says ${c.payTo}`);
        lines.push(`${c.name} quotes ${fromBaseUnits(BigInt(req.amount))} USDC to ${req.payTo}`);
      }
      return lines.join("; ");
    },
  ],
  [
    "hardware",
    async () => {
      if (!config.hardware.enabled) throw new Warn("LEASH_HARDWARE=none: typed input only, over-limit payments are refused");
      const missing: string[] = [];
      await access(config.hardware.whisperModel).catch(() => missing.push(`Whisper model ${config.hardware.whisperModel}`));
      if (config.hardware.fingerprintPort) await access(config.hardware.fingerprintPort).catch(() => missing.push(`fingerprint sensor at ${config.hardware.fingerprintPort}`));
      else missing.push("FINGERPRINT_PORT (over-limit payments can't be approved)");
      if (missing.length) throw new Error(`missing: ${missing.join(", ")}`);
      return "Whisper model and fingerprint sensor present";
    },
  ],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    console.log(`✓ ${name}: ${await run()}`);
  } catch (err) {
    if (err instanceof Warn) {
      console.log(`! ${name}: ${err.message}`);
    } else {
      failed++;
      console.log(`✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
console.log(failed ? `\n${failed} check(s) failed. Nothing will be paid until they pass.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
