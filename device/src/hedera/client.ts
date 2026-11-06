import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";
import { config } from "../config.js";

export function parsePrivateKey(raw: string): PrivateKey {
  const key = raw.trim();
  const hex = key.replace(/^0x/, "");
  if (/^30[0-9a-f]+$/i.test(hex) && hex.length > 64) return PrivateKey.fromStringDer(hex);
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Hedera private key must be DER hex or 32-byte raw hex");
  const type = (process.env.HEDERA_KEY_TYPE ?? "ECDSA").toUpperCase();
  if (type === "ED25519") return PrivateKey.fromStringED25519(hex);
  if (type === "ECDSA") return PrivateKey.fromStringECDSA(hex);
  throw new Error(`HEDERA_KEY_TYPE must be ECDSA or ED25519, got ${type}`);
}

export const deviceAccountId = AccountId.fromString(config.hedera.accountId);
export const deviceKey = parsePrivateKey(config.hedera.privateKey);

let client: Client | null = null;

export function hederaClient(): Client {
  if (!client) {
    client = config.hedera.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
    client.setOperator(deviceAccountId, deviceKey);
  }
  return client;
}

export const mirrorNodeUrl =
  config.hedera.network === "mainnet"
    ? "https://mainnet.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";

export function hashscanTx(txId: string): string {
  return `https://hashscan.io/${config.hedera.network}/transaction/${txId}`;
}

export function hashscanTopic(topicId: string): string {
  return `https://hashscan.io/${config.hedera.network}/topic/${topicId}`;
}
