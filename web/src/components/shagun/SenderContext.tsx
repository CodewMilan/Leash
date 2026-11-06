"use client";
import { createContext, useContext } from "react";
import type { JsonRpcSigner } from "ethers";
import type { WalletOption } from "@/lib/wallets";
export type Sender = {
  ready: boolean;
  configured: boolean;
  account: string | null;
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