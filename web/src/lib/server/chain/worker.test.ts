import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { Wallet, ZeroHash } from "ethers";
import { migrations } from "../../../../../db/migrations";
import * as database from "../db";
import { workerTick } from "./worker";

const state = vi.hoisted(() => ({ relayer: "", attester: "", token: "", compatible: true }));
vi.mock("../db", async (original) => {
  const actual = await original<typeof import("../db")>();
  return {
    ...actual,
    withWorkerLock: async (fn: (assertLock: () => Promise<void>) => Promise<unknown>) =>
      fn(async () => {}),
  };
});
vi.mock("../cards/issuance", () => ({ issueGiftCard: vi.fn(async () => {}) }));
vi.mock("ethers", async (original) => {
  const actual = await original<typeof import("ethers")>();
  return {
    ...actual,
    JsonRpcProvider: class {
      async getNetwork() {
        return { chainId: 1874n };
      }
      async estimateGas() {
        throw new Error("No broadcast in this fixture");
      }
      destroy() {}
    },
    Contract: class {
      async usdt() {
        return state.token;
      }
      async relayer() {
        return state.relayer;
      }
      async operator() {
        return state.relayer;
      }
      async attester() {
        return state.attester;
      }
      async usedSpendRefs() {
        if (!state.compatible) throw new Error("LegacyVault");
        return false;
      }
      async gifts() {
        return { state: 2n, spent: 0n };
      }
    },
  };
});

describe("worker redemption routing", () => {
  let db: PGlite;
  beforeAll(async () => {
    const relayer = Wallet.createRandom(),
      attester = Wallet.createRandom();
    state.relayer = relayer.address;
    state.attester = attester.address;
    state.token = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
    vi.stubEnv("RELAYER_PRIVATE_KEY", relayer.privateKey);
    vi.stubEnv("ATTESTER_PRIVATE_KEY", attester.privateKey);
    vi.stubEnv("VAULT_ADDRESS", Wallet.createRandom().address);
    vi.stubEnv("DATA_ENCRYPTION_KEY", "ab".repeat(32));
    db = new PGlite();
    for (const migration of migrations) await db.exec(migration.sql);
    database.setTestDatabase(db);
  });
  beforeEach(async () => {
    state.compatible = true;
    await db.exec("TRUNCATE gifts CASCADE");
  });
  afterAll(async () => {
    database.setTestDatabase();
    await db.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  async function gift(id: string, redemption: string) {
    await database.sql(
      `INSERT INTO gifts(id,sender,label,amount,expiry,secret_hash,campaign_id,terms,status,rate,paise,redemption,claim_tx)
      VALUES($1,'sender','Gift',25000000,$2,$3,$3,'{}','claimed','84',210000,$4,'confirmed')`,
      [id, Math.floor(Date.now() / 1000) + 3600, ZeroHash, redemption],
    );
  }
  it("never schedules whole-gift cash-out for a confirmed card claim", async () => {
    await gift("card-gift", "card");
    await workerTick();
    expect(await database.sql("SELECT kind FROM jobs WHERE gift_id='card-gift'")).toEqual([]);
  });
  it("preserves legacy UPI settlement routing", async () => {
    await gift("upi-gift", "upi");
    await workerTick();
    expect(await database.sql("SELECT kind FROM jobs WHERE gift_id='upi-gift'")).toEqual([
      { kind: "settle" },
    ]);
  });
  it("rejects a legacy vault before issuing or processing new cards", async () => {
    await gift("card-gift", "card");
    state.compatible = false;
    await expect(workerTick()).rejects.toThrow("LegacyVault");
    expect(await database.sql("SELECT * FROM gift_cards")).toEqual([]);
  });
});
