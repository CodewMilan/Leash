import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEVICE_ROOT = path.resolve(here, "..");

loadDotenv({ path: path.join(DEVICE_ROOT, ".env"), quiet: true });
loadDotenv({ path: path.join(DEVICE_ROOT, "..", ".env"), quiet: true });

export class ConfigError extends Error {}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigError(`Missing required environment variable ${name} (see .env.example)`);
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function positiveNumber(name: string, fallback: string): number {
  const raw = optional(name, fallback);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new ConfigError(`${name} must be a positive number, got "${raw}"`);
  return value;
}

export const config = {
  zg: {
    apiKey: required("ZG_API_KEY"),
    privateKey: required("ZG_PRIVATE_KEY"),
    baseUrl: optional("ZG_BASE_URL", "https://router-api.0g.ai/v1"),
    model: optional("ZG_MODEL", "0gm-1.0-35b-a3b"),
    rpcUrl: optional("ZG_RPC_URL", "https://evmrpc-testnet.0g.ai"),
    indexerUrl: optional("ZG_INDEXER_URL", "https://indexer-storage-testnet-turbo.0g.ai"),
    timeoutMs: positiveNumber("ZG_TIMEOUT_MS", "20000"),
  },
  hedera: {
    network: optional("HEDERA_NETWORK", "testnet") as "testnet" | "mainnet",
    accountId: required("HEDERA_ACCOUNT_ID"),
    privateKey: required("HEDERA_PRIVATE_KEY"),
    usdcTokenId: optional("HEDERA_USDC_TOKEN_ID", "0.0.429274"),
    spendLogTopicId: process.env.HEDERA_SPEND_LOG_TOPIC_ID?.trim() || null,
  },
  world: {
    clientId: required("WORLD_CLIENT_ID"),
    clientSecret: required("WORLD_CLIENT_SECRET"),
    issuer: optional("WORLD_ISSUER", "https://auth.world.org").replace(/\/$/, ""),
    authMethod: optional("WORLD_AUTH_METHOD", "basic") as "basic" | "post",
    /** Pairwise World ID `sub` of the owner; only they can approve. Set by `pnpm enroll:world`. */
    ownerSub: process.env.WORLD_OWNER_SUB?.trim() || null,
    requiredAcr: optional("WORLD_REQUIRED_ACR", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    approvalTimeoutMs: positiveNumber("WORLD_APPROVAL_TIMEOUT_MS", "120000"),
  },
  spendLimitUsdc: positiveNumber("SPEND_LIMIT_USDC", "5"),
  server: {
    port: positiveNumber("DEVICE_PORT", "7070"),
  },
  hardware: {
    enabled: optional("LEASH_HARDWARE", "pi") === "pi",
    micDevice: optional("MIC_DEVICE", "default"),
    whisperBin: optional("WHISPER_BIN", "whisper-cli"),
    whisperModel: optional("WHISPER_MODEL", path.join(DEVICE_ROOT, "models", "ggml-base.en.bin")),
    cameraBin: optional("CAMERA_BIN", "rpicam-still"),
    fingerprintPort: process.env.FINGERPRINT_PORT?.trim() || null,
    fingerprintBaud: positiveNumber("FINGERPRINT_BAUD", "57600"),
    fingerprintTimeoutMs: positiveNumber("FINGERPRINT_TIMEOUT_MS", "30000"),
    ttsBin: optional("TTS_BIN", "espeak-ng"),
    pythonBin: optional("PYTHON_BIN", "python3"),
  },
  contactsFile: optional("CONTACTS_FILE", path.join(DEVICE_ROOT, "contacts.json")),
  dataDir: optional("DATA_DIR", path.join(DEVICE_ROOT, "data")),
} as const;

export type Config = typeof config;
