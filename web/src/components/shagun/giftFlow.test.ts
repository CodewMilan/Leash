import { describe, expect, it } from "vitest";
import { BrowserProvider, makeError } from "ethers";
import { walletMessage } from "./giftFlow";

describe("walletMessage", () => {
  it("explains MetaMask's 4100 from a real ethers signMessage call", async () => {
    const account = "0x459947e70cfb8604d1ebdee6b0e8f39b4529c38c";
    const metamask = {
      async request({ method }: { method: string }) {
        if (method === "eth_chainId") return "0x752";
        if (method === "eth_accounts") return [account];
        throw Object.assign(
          new Error("The requested account and/or method has not been authorized by the user."),
          { code: 4100 },
        );
      },
    };
    const signer = await new BrowserProvider(metamask, 1874).getSigner(account);
    const error = await signer.signMessage("Sign in to Shagun").catch((e: unknown) => e);
    expect(walletMessage(error, "fallback")).toMatch(/hasn't connected this account/);
  });
  it("reads the wallet's code from inside an ethers-wrapped error", () => {
    const unauthorized = makeError("could not coalesce error", "UNKNOWN_ERROR", {
      error: {
        code: 4100,
        message: "The requested account and/or method has not been authorized by the user.",
      },
      payload: { id: 5, jsonrpc: "2.0", method: "personal_sign", params: [] },
    });
    expect(walletMessage(unauthorized, "fallback")).toMatch(/hasn't connected this account/);
  });
  it("shows the wallet's own message instead of the ethers dump", () => {
    const internal = makeError("could not coalesce error", "UNKNOWN_ERROR", {
      error: { code: -32603, message: "Internal JSON-RPC error." },
    });
    expect(walletMessage(internal, "fallback")).toBe("Internal JSON-RPC error.");
  });
  it("keeps cancellations and the app's own errors readable", () => {
    const rejected = makeError("user rejected action", "ACTION_REJECTED", {
      action: "signMessage",
      reason: "rejected",
    });
    expect(walletMessage(rejected, "f")).toBe("You cancelled the request in your wallet.");
    expect(walletMessage(new Error("Connect your wallet first."), "f")).toBe(
      "Connect your wallet first.",
    );
  });
});
