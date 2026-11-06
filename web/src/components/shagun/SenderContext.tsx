"use client";
import { createContext, useContext } from "react";
import type { JsonRpcSigner } from "ethers";
import { WALLETS, type WalletOption } from "@/lib/wallets";
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
export const unconfiguredSender: Sender = {
  ready: true,
  configured: false,
  account: null,
  wallet: null,
  wallets: WALLETS,
  connect: async () => {
    throw new Error("Wallet sign-in is being configured. Please try again shortly.");
  },
  signer: async () => {
    throw new Error("Wallet sign-in is not configured.");
  },
  logout: async () => {},
};
