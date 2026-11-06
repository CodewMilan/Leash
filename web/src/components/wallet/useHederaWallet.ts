"use client";

import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Network } from "@/lib/mirror";
import { getConnector, walletProjectId } from "@/lib/wallet";

export type WalletState =
  | { phase: "unconfigured" }
  | { phase: "restoring" }
  | { phase: "disconnected"; error?: string }
  | { phase: "connecting" }
  | { phase: "connected"; accountId: string };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** A Hedera wallet (HashPack, Kabila, Blade…) connected over WalletConnect. Keys stay in the wallet. */
export function useHederaWallet(network: Network) {
  const [state, setState] = useState<WalletState>(() => (walletProjectId() ? { phase: "restoring" } : { phase: "unconfigured" }));
  const signer = useRef<DAppSigner | null>(null);

  const adopt = useCallback((s: DAppSigner | undefined) => {
    signer.current = s ?? null;
    setState(s ? { phase: "connected", accountId: s.getAccountId().toString() } : { phase: "disconnected" });
  }, []);

  useEffect(() => {
    if (!walletProjectId()) return;
    let live = true;
    getConnector(network)
      .then((c) => live && adopt(c.signers[0]))
      .catch((err) => live && setState({ phase: "disconnected", error: `Wallet connection failed to start: ${message(err)}` }));
    return () => {
      live = false;
    };
  }, [network, adopt]);

  const connect = useCallback(async () => {
    setState({ phase: "connecting" });
    try {
      const c = await getConnector(network);
      await c.openModal(undefined, true);
      adopt(c.signers[0]);
    } catch (err) {
      setState({ phase: "disconnected", error: message(err) });
    }
  }, [network, adopt]);

  const disconnect = useCallback(async () => {
    try {
      await (await getConnector(network)).disconnectAll();
    } finally {
      adopt(undefined);
    }
  }, [network, adopt]);

  const requireSigner = useCallback(() => {
    if (!signer.current) throw new Error("Connect your wallet first");
    return signer.current;
  }, []);

  return { state, connect, disconnect, requireSigner };
}
