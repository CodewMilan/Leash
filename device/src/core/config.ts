import { fileURLToPath } from "node:url";
import path from "node:path";

export const DEVICE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

/** Reads the device config from `env`. Throws one ConfigError naming every missing or invalid variable. */
export function parseConfig(env: Env) {
  const problems: string[] = [];

  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) problems.push(`${name} is missing`);
    return value ?? "";
  };
  const optional = (name: string, fallback: string): string => env[name]?.trim() || fallback;
  const positiveNumber = (name: string, fallback: string): number => {
    const raw = optional(name, fallback);
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) problems.push(`${name} must be a positive number, got "${raw}"`);
    return value;
  };
  const oneOf = <T extends string>(name: string, fallback: T, allowed: readonly T[]): T => {
    const value = optional(name, fallback);
    if (!allowed.includes(value as T)) problems.push(`${name} must be one of ${allowed.join(", ")}, got "${value}"`);
    return value as T;
  };

  const config = {
    zg: {
      apiKey: required("ZG_API_KEY"),
      privateKey: required("ZG_PRIVATE_KEY"),
      baseUrl: optional("ZG_BASE_URL", "https://router-api.0g.ai/v1").replace(/\/$/, ""),
      model: optional("ZG_MODEL", "0gm-1.0-35b-a3b"),
      rpcUrl: optional("ZG_RPC_URL", "https://evmrpc-testnet.0g.ai"),
      indexerUrl: optional("ZG_INDEXER_URL", "https://indexer-storage-testnet-turbo.0g.ai"),
      timeoutMs: positiveNumber("ZG_TIMEOUT_MS", "20000"),
    },
    hedera: {
      network: oneOf("HEDERA_NETWORK", "testnet", ["testnet", "mainnet"] as const),
      accountId: required("HEDERA_ACCOUNT_ID"),
      privateKey: required("HEDERA_PRIVATE_KEY"),
      usdcTokenId: optional("HEDERA_USDC_TOKEN_ID", "0.0.429274"),
      spendLogTopicId: env.HEDERA_SPEND_LOG_TOPIC_ID?.trim() || null,
    },
    world: {
      clientId: required("WORLD_CLIENT_ID"),
      clientSecret: required("WORLD_CLIENT_SECRET"),
      issuer: optional("WORLD_ISSUER", "https://auth.world.org").replace(/\/$/, ""),
      authMethod: oneOf("WORLD_AUTH_METHOD", "basic", ["basic", "post"] as const),
      /** Pairwise World ID `sub` of the owner; only they can approve. Set by `pnpm enroll:world`. */
      ownerSub: env.WORLD_OWNER_SUB?.trim() || null,
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
      enabled: oneOf("LEASH_HARDWARE", "pi", ["pi", "none"] as const) === "pi",
      micDevice: optional("MIC_DEVICE", "default"),
      whisperBin: optional("WHISPER_BIN", "whisper-cli"),
      whisperModel: optional("WHISPER_MODEL", path.join(DEVICE_ROOT, "models", "ggml-base.en.bin")),
      cameraBin: optional("CAMERA_BIN", "rpicam-still"),
      fingerprintPort: env.FINGERPRINT_PORT?.trim() || null,
      fingerprintBaud: positiveNumber("FINGERPRINT_BAUD", "57600"),
      fingerprintTimeoutMs: positiveNumber("FINGERPRINT_TIMEOUT_MS", "30000"),
      ttsBin: optional("TTS_BIN", "espeak-ng"),
      pythonBin: optional("PYTHON_BIN", "python3"),
    },
    contactsFile: optional("CONTACTS_FILE", path.join(DEVICE_ROOT, "contacts.json")),
    dataDir: optional("DATA_DIR", path.join(DEVICE_ROOT, "data")),
  };

  if (problems.length) {
    throw new ConfigError(`Device config is incomplete (see .env.example):\n  - ${problems.join("\n  - ")}`);
  }
  return config;
}

export type Config = ReturnType<typeof parseConfig>;
