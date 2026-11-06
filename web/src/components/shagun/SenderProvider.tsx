"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  PrivyProvider,
  useConnectWallet,
  useModalStatus,
  usePrivy,
  useWallets,
  type BaseConnectedEthereumWallet,
} from "@privy-io/react-auth";
import { BrowserProvider } from "ethers";
import { WHITECHAIN } from "@/lib/chain";
import { api } from "@/lib/client-api";
import { WALLETS, walletOption } from "@/lib/wallets";
import { SenderContext } from "./SenderContext";
import { InjectedSenderProvider } from "./InjectedSenderProvider";

type Pending = {
  resolve: (wallet: BaseConnectedEthereumWallet) => void;
  reject: (error: Error) => void;
};

function Connection({ children }: { children: ReactNode }) {
  const { ready } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { isOpen } = useModalStatus();
  const pending = useRef<Pending | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  useEffect(() => {
    api<{ sender: string | null }>("session", {})
      .then((s) => setSession(s.sender))
      .catch(() => {});
  }, []);
  const external = wallets.filter((w) => w.walletClientType !== "privy");
  const active = external.find((w) => w.address.toLowerCase() === chosen) || external[0] || null;

  function settle(error: Error | null, wallet?: BaseConnectedEthereumWallet) {
    const current = pending.current;
    pending.current = null;
    if (!current) return;
    if (error || !wallet) current.reject(error || new Error("Your wallet did not connect."));
    else current.resolve(wallet);
  }
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) =>
      "switchChain" in wallet
        ? settle(null, wallet)
        : settle(new Error("Choose an Ethereum wallet to send a gift.")),
    onError: () => settle(new Error("Your wallet did not connect. Please try again.")),
  });
  useEffect(() => {
    if (isOpen || !pending.current) return;
    const timer = window.setTimeout(
      () => settle(new Error("Wallet connection was closed before it finished.")),
      800,
    );
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  async function signerFor(wallet: BaseConnectedEthereumWallet) {
    await wallet.switchChain(WHITECHAIN.id);
    return new BrowserProvider(await wallet.getEthereumProvider()).getSigner(wallet.address);
  }
  async function connect(walletId: string) {
    const option = walletOption(walletId);
    if (!option) throw new Error("Choose a supported wallet.");
    let wallet: BaseConnectedEthereumWallet | undefined = external.find(
      (w) => w.walletClientType === option.privyId,
    );
    if (!wallet) {
      settle(new Error("A new wallet connection started."));
      wallet = await new Promise<BaseConnectedEthereumWallet>((resolve, reject) => {
        pending.current = { resolve, reject };
        connectWallet({ walletList: [option.privyId], walletChainType: "ethereum-only" });
      });
    }
    await api("session", {});
    const accountSigner = await signerFor(wallet);
    const address = (await accountSigner.getAddress()).toLowerCase();
    const challenge = await api<{ challengeId: string; message: string }>("auth/sender/options", {
      address,
    });
    await api("auth/sender/verify", {
      challengeId: challenge.challengeId,
      signature: await accountSigner.signMessage(challenge.message),
    });
    setChosen(address);
    setSession(address);
    return address;
  }
  return (
    <SenderContext.Provider
      value={{
        ready: ready && walletsReady,
        configured: true,
        installed: true,
        account: active?.address.toLowerCase() || null,
        session,
        wallet: active ? walletOption(active.walletClientType) : null,
        wallets: WALLETS,
        connect,
        signer: async () => {
          if (!active) throw new Error("Connect your wallet first.");
          return signerFor(active);
        },
        logout: async () => {
          await api("auth/logout", {});
          setSession(null);
          active?.disconnect();
          setChosen(null);
        },
      }}
    >
      {children}
    </SenderContext.Provider>
  );
}
export default function SenderProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <InjectedSenderProvider>{children}</InjectedSenderProvider>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        defaultChain: WHITECHAIN,
        supportedChains: [WHITECHAIN],
        loginMethods: ["wallet"],
        appearance: {
          theme: "light",
          accentColor: "#193ef9",
          showWalletLoginFirst: true,
          walletList: WALLETS.map((w) => w.privyId),
          walletChainType: "ethereum-only",
        },
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
      }}
    >
      <Connection>{children}</Connection>
    </PrivyProvider>
  );
}
