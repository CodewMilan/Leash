"use client";

import { createContext, useContext, type ReactNode } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { BrowserProvider, type JsonRpcSigner } from "ethers";
import { WHITECHAIN } from "@/lib/chain";
import { api } from "@/lib/client-api";

type Sender = { ready: boolean; authenticated: boolean; account: string | null; connect: () => Promise<string | null>; signer: () => Promise<JsonRpcSigner>; logout: () => Promise<void> };
const SenderContext = createContext<Sender | null>(null);
export function useSender() { const value = useContext(SenderContext); if (!value) throw new Error("Sender provider is missing."); return value; }
function Connection({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets.find((w) => w.walletClientType === "privy");
  async function signer() {
    if (!wallet) throw new Error("Your embedded account is getting ready. Please try again shortly.");
    await wallet.switchChain(1874);
    return new BrowserProvider(await wallet.getEthereumProvider()).getSigner();
  }
  async function connect() {
    if (!authenticated) { login(); return null; }
    await api("session", {});
    const accountSigner = await signer();
    const address = await accountSigner.getAddress();
    const options = await api<{ challengeId: string; message: string }>("auth/sender/options", { address });
    await api("auth/sender/verify", { challengeId: options.challengeId, signature: await accountSigner.signMessage(options.message) });
    return address.toLowerCase();
  }
  return <SenderContext.Provider value={{ ready, authenticated, account: wallet?.address.toLowerCase() || null, connect, signer,
    logout: async () => { await api("auth/logout", {}); await logout(); } }}>{children}</SenderContext.Provider>;
}
export default function SenderProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <SenderContext.Provider value={{ ready: true, authenticated: false, account: null,
    connect: async () => { throw new Error("Sender sign-in is being configured. Please try again shortly."); },
    signer: async () => { throw new Error("Sender sign-in is not configured."); }, logout: async () => {} }}>{children}</SenderContext.Provider>;
  return <PrivyProvider appId={appId} config={{ defaultChain: WHITECHAIN, supportedChains: [WHITECHAIN],
    loginMethods: ["email", "google"], appearance: { theme: "light", accentColor: "#193ef9", showWalletLoginFirst: false },
    embeddedWallets: { ethereum: { createOnLogin: "all-users" } } }}><Connection>{children}</Connection></PrivyProvider>;
}
