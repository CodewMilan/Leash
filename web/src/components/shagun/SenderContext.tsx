"use client";
import { createContext, useContext } from "react";
import type { JsonRpcSigner } from "ethers";
import type { WalletOption } from "@/lib/wallets";
export type Sender = {
  ready: boolean;
  configured: boolean;
  /** False when no supported wallet is present in this browser. */
  installed: boolean;
  /** Account the wallet currently exposes, or null when nothing is connected. */
  account: string | null;
  /** Sender address of the signed-in Chinki session, or null when signed out. */
  session: string | null;
  wallet: WalletOption | null;
  wallets: WalletOption[];
  connect: (walletId: string) => Promise<string | null>;
  signer: () => Promise<JsonRpcSigner>;
  logout: () => Promise<void>;
};
export const SenderContext = createContext<Sender | null>(null);
export function useSender() {
  const value = useContext(SenderContext);
  if (!value) throw new Error("Sender provider is missing.");
  return value;
}
