import { describe, expect, it, vi } from "vitest";
import { withWalletAuthorization } from "./wallet-sign-in";

describe("wallet sign-in authorization", () => {
  it("refreshes permissions after an ethers-wrapped 4100 and recreates sign-in", async () => {
    const request = vi.fn().mockResolvedValue([]);
    const signIn = vi
      .fn()
      .mockRejectedValueOnce({ code: "UNKNOWN_ERROR", error: { code: 4100 } })
      .mockResolvedValueOnce("new-account");
    await expect(withWalletAuthorization({ request }, signIn)).resolves.toBe("new-account");
    expect(request.mock.calls).toEqual([
      [{ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] }],
      [{ method: "eth_requestAccounts" }],
    ]);
    expect(signIn).toHaveBeenCalledTimes(2);
  });
  it("recovers ethers info.error authorization failures", async () => {
    const request = vi.fn().mockResolvedValue([]);
    const signIn = vi
      .fn()
      .mockRejectedValueOnce({ code: "UNKNOWN_ERROR", info: { error: { code: 4100 } } })
      .mockResolvedValueOnce("account");
    await expect(withWalletAuthorization({ request }, signIn)).resolves.toBe("account");
  });
  it("does not retry a rejected signature", async () => {
    const request = vi.fn();
    const error = { code: 4001 };
    await expect(
      withWalletAuthorization({ request }, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(request).not.toHaveBeenCalled();
  });
  it("stops after one recovery attempt with actionable instructions", async () => {
    const request = vi.fn().mockResolvedValue([]);
    const signIn = vi.fn().mockRejectedValue({ code: 4100 });
    await expect(withWalletAuthorization({ request }, signIn)).rejects.toThrow(
      "connect your selected account",
    );
    expect(signIn).toHaveBeenCalledTimes(2);
  });
});
