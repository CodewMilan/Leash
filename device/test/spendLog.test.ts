import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEVICE_ROOT } from "../src/core/config.js";
import { encodeSpendLogEntry, HCS_SINGLE_CHUNK_BYTES, type SpendLogEntry } from "../src/core/spendLog.js";

const fixture: SpendLogEntry = JSON.parse(readFileSync(path.join(DEVICE_ROOT, "..", "fixtures", "spend-log-entry.json"), "utf8"));

describe("encodeSpendLogEntry", () => {
  it("encodes the shared fixture the dashboard reads", () => {
    expect(JSON.parse(encodeSpendLogEntry(fixture))).toEqual(fixture);
  });

  it("fits a single HCS message", () => {
    expect(Buffer.byteLength(encodeSpendLogEntry(fixture))).toBeLessThanOrEqual(HCS_SINGLE_CHUNK_BYTES);
  });

  it("refuses an over-limit entry without both approvals", () => {
    expect(() => encodeSpendLogEntry({ ...fixture, approvals: { fingerprint: true, world: false } })).toThrow(/World ID/);
    expect(() => encodeSpendLogEntry({ ...fixture, approvals: { fingerprint: false, world: true } })).toThrow(/fingerprint/);
  });

  it("accepts an under-limit entry with no approvals", () => {
    expect(() => encodeSpendLogEntry({ ...fixture, overLimit: false, amountUsdc: "1", approvals: { fingerprint: false, world: false } })).not.toThrow();
  });

  it("rejects entries that would split into several HCS chunks", () => {
    expect(() => encodeSpendLogEntry({ ...fixture, merchant: "x".repeat(900) })).toThrow(/bytes/);
  });

  it("rejects malformed fields", () => {
    expect(() => encodeSpendLogEntry({ ...fixture, payTo: "0xabc" })).toThrow();
    expect(() => encodeSpendLogEntry({ ...fixture, amountUsdc: "20 USDC" })).toThrow();
    expect(() => encodeSpendLogEntry({ ...fixture, zgRequestId: "" })).toThrow();
  });
});
