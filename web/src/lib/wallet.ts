"use client";

import type { DAppConnector } from "@hashgraph/hedera-wallet-connect";
import type { Network } from "./mirror";

let connector: Promise<DAppConnector> | null = null;

export const walletProjectId = () => process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || null;

/** One WalletConnect client per page load; it restores an earlier session from local storage. Browser only. */
export function getConnector(network: Network): Promise<DAppConnector> {
  const projectId = walletProjectId();
  if (!projectId) return Promise.reject(new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set"));
  connector ??= (async () => {
    const [{ DAppConnector, HederaChainId, HederaJsonRpcMethod, HederaSessionEvent }, { LedgerId }] = await Promise.all([
      import("@hashgraph/hedera-wallet-connect"),
      import("@hiero-ledger/sdk"),
    ]);
    const c = new DAppConnector(
      {
        name: "Leash",
        description: "A handheld AI assistant that pays for things for you, and never over your limit without your thumb.",
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`],
      },
      network === "mainnet" ? LedgerId.MAINNET : LedgerId.TESTNET,
      projectId,
      Object.values(HederaJsonRpcMethod),
      [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
      [network === "mainnet" ? HederaChainId.Mainnet : HederaChainId.Testnet],
    );
    await c.init({ logger: "error" });
    return c;
  })().catch((err) => {
    connector = null;
    throw err;
  });
  return connector;
}
