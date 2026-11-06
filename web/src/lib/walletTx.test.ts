import { AccountId, Client, TransactionId, type Transaction } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { usdcReadiness } from "./mirror";
import { buildAssociate, buildTopUp, parseAmount } from "./walletTx";

const USDC = "0.0.429274";

/** Freezes like the wallet would: the connected account pays the fee. */
function frozen<T extends Transaction>(tx: T, payer: string): T {
  const client = Client.forTestnet();
  try {
    return tx.setTransactionId(TransactionId.generate(AccountId.fromString(payer))).freezeWith(client) as T;
  } finally {
    client.close();
  }
}

describe("parseAmount", () => {
  it("converts to base units", () => {
    expect(parseAmount("10", 6)).toBe(10_000_000n);
    expect(parseAmount(" 2.5 ", 6)).toBe(2_500_000n);
    expect(parseAmount("1", 8)).toBe(100_000_000n);
  });

  it("rejects zero, negatives, junk and too many decimals", () => {
    for (const bad of ["0", "0.0", "-1", "", "abc", "1e3"]) expect(() => parseAmount(bad, 6)).toThrow();
    expect(() => parseAmount("1.1234567", 6)).toThrow(/decimal/);
  });
});

describe("buildAssociate", () => {
  it("associates exactly the given account with USDC", () => {
    const tx = frozen(buildAssociate("0.0.2002", USDC), "0.0.2002");
    expect(tx.accountId?.toString()).toBe("0.0.2002");
    expect(tx.tokenIds?.map(String)).toEqual([USDC]);
  });
});

describe("buildTopUp", () => {
  it("moves USDC from the wallet to the Leash and nothing else", () => {
    const tx = frozen(buildTopUp({ from: "0.0.3003", to: "0.0.1001", asset: "usdc", units: 10_000_000n, usdcTokenId: USDC }), "0.0.3003");
    const legs = tx.tokenTransfers.get(USDC);
    expect(legs?.get("0.0.3003")?.toString()).toBe("-10000000");
    expect(legs?.get("0.0.1001")?.toString()).toBe("10000000");
    expect(tx.hbarTransfers.size).toBe(0);
  });

  it("moves HBAR in tinybars", () => {
    const tx = frozen(buildTopUp({ from: "0.0.3003", to: "0.0.1001", asset: "hbar", units: 500_000_000n, usdcTokenId: USDC }), "0.0.3003");
    expect(tx.hbarTransfers.get("0.0.1001")?.toTinybars().toString()).toBe("500000000");
    expect(tx.hbarTransfers.get("0.0.3003")?.toTinybars().toString()).toBe("-500000000");
    expect(tx.tokenTransfers.size).toBe(0);
  });

  it("refuses sending to itself", () => {
    expect(() => buildTopUp({ from: "0.0.1001", to: "0.0.1001", asset: "usdc", units: 1n, usdcTokenId: USDC }), "0.0.3003").toThrow(/same account/);
  });
});

describe("usdcReadiness", () => {
  it("knows associated, auto-associating and blocked accounts", () => {
    expect(usdcReadiness([{ token_id: USDC, balance: 2_500_000 }], 0, USDC, 6)).toEqual({ ok: true, how: "associated", balance: 2.5 });
    expect(usdcReadiness([], -1, USDC, 6)).toEqual({ ok: true, how: "auto-association" });
    expect(usdcReadiness([], 0, USDC, 6)).toEqual({ ok: false, slots: 0 });
    expect(usdcReadiness([], 3, USDC, 6)).toEqual({ ok: false, slots: 3 });
  });
});
