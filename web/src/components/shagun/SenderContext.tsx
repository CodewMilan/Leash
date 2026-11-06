"use client";
import { createContext, useContext } from "react";
import type { JsonRpcSigner } from "ethers";
export type Sender = {
  ready: boolean;
  authenticated: boolean;
  account: string | null;
  connect: () => Promise<string | null>;
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
  authenticated: false,
  account: null,
  connect: async () => {
    throw new Error("Sender sign-in is being configured. Please try again shortly.");
  },
  signer: async () => {
    throw new Error("Sender sign-in is not configured.");
  },
  logout: async () => {},
};
