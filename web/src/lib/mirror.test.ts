import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashscanTxId, parseTopicMessage, toUsdcTransfers } from "./mirror";

const fixture = readFileSync(path.join(__dirname, "..", "..", "fixtures", "spend-log-entry.json"), "utf8");
const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

describe("parseTopicMessage", () => {
  it("reads the spend log entry the device writes", () => {
    const msg = parseTopicMessage({ sequence_number: 7, consensus_timestamp: "1762410000.000000001", message: b64(fixture) });
    expect(msg.sequence).toBe(7);
    expect(msg.entry).toEqual(JSON.parse(fixture));
    expect(msg.entry?.approvals).toEqual({ fingerprint: true, world: true, worldReference: expect.any(String) });
  });

  it("keeps non-JSON messages as raw text with no entry", () => {
    for (const text of ["hello", "[1,2]", "42", "null"]) {
      const msg = parseTopicMessage({ sequence_number: 1, consensus_timestamp: "1", message: b64(text) });
      expect(msg.entry).toBeNull();
      expect(msg.raw).toBe(text);
    }
  });

  it("decodes UTF-8 text correctly", () => {
    const msg = parseTopicMessage({ sequence_number: 1, consensus_timestamp: "1", message: b64('{"merchant":"Chai ☕ stall"}') });
    expect(msg.entry?.merchant).toBe("Chai ☕ stall");
  });
});

describe("toUsdcTransfers", () => {
  const usdc = "0.0.429274";
  const leash = "0.0.1001";

  it("signs amounts from the Leash account's side and names the counterparty", () => {
    const out = toUsdcTransfers(
      [
        {
          transaction_id: "0.0.7162784-1762410000-1",
          consensus_timestamp: "1762410000.1",
          result: "SUCCESS",
          token_transfers: [
            { token_id: usdc, account: leash, amount: -20_000_000 },
            { token_id: usdc, account: "0.0.2002", amount: 20_000_000 },
          ],
        },
        {
          transaction_id: "0.0.1001-1762400000-1",
          consensus_timestamp: "1762400000.1",
          result: "SUCCESS",
          token_transfers: [{ token_id: "0.0.999", account: leash, amount: 5 }],
        },
        { transaction_id: "hcs", consensus_timestamp: "1", result: "SUCCESS" },
      ],
      leash,
      usdc,
      6,
    );
    expect(out).toEqual([
      { id: "0.0.7162784-1762410000-1", timestamp: "1762410000.1", result: "SUCCESS", amount: -20, counterparty: "0.0.2002" },
    ]);
  });
});

describe("hashscanTxId", () => {
  it("turns a payer-style transaction ID into a HashScan URL", () => {
    expect(hashscanTxId("testnet", "0.0.7162784@1762410000.123456789")).toBe(
      "https://hashscan.io/testnet/transaction/0.0.7162784-1762410000-123456789",
    );
  });
});
