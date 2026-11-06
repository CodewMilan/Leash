"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BrowserProvider, toQuantity, type Eip1193Provider } from "ethers";
import { WHITECHAIN } from "@/lib/chain";
import { api } from "@/lib/client-api";
import { WALLETS, walletOption } from "@/lib/wallets";
import { SenderContext } from "./SenderContext";

type Injected = Eip1193Provider & {
  isMetaMask?: boolean;
  on?: (event: string, listener: (...args: never[]) => void) => void;
  removeListener?: (event: string, listener: (...args: never[]) => void) => void;
};
type Announcement = CustomEvent<{ info: { rdns: string }; provider: Injected }>;

const CHAIN_HEX = toQuantity(WHITECHAIN.id);
const METAMASK = walletOption("metamask")!;

function rpcCode(error: unknown) {
  const e = error as { code?: unknown; data?: { originalError?: { code?: unknown } } };
  return e?.data?.originalError?.code ?? e?.code;
}

/** Finds MetaMask through EIP-6963, falling back to the legacy `window.ethereum` injection. */
function useMetaMask() {
  const [provider, setProvider] = useState<Injected | null>(null);
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    const announced = (event: Event) => {
      const { info, provider } = (event as Announcement).detail;
      if (info.rdns === "io.metamask") setProvider(provider);
    };
    window.addEventListener("eip6963:announceProvider", announced);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const timer = window.setTimeout(() => {
      const legacy = (window as { ethereum?: Injected }).ethereum;
      setProvider((found) => found || (legacy?.isMetaMask ? legacy : null));
      setSearched(true);
    }, 300);
    return () => {
      window.removeEventListener("eip6963:announceProvider", announced);
      window.clearTimeout(timer);
    };
  }, []);
  return { provider, searched };
}

async function switchToWhitechain(provider: Injected) {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (error) {
    if (rpcCode(error) !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_HEX,
          chainName: WHITECHAIN.name,
          nativeCurrency: WHITECHAIN.nativeCurrency,
          rpcUrls: WHITECHAIN.rpcUrls.default.http,
          blockExplorerUrls: [WHITECHAIN.blockExplorers.default.url],
        },
      ],
    });
  }
}

/**
 * Sender wallet connection straight through MetaMask, used when no Privy app ID is configured.
 * Shagun's own signed challenge still creates the session, exactly as with Privy.
 */
export function InjectedSenderProvider({ children }: { children: ReactNode }) {
  const { provider, searched } = useMetaMask();
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    if (!provider) return;
    const accountsChanged = (accounts: string[]) => setAccount(accounts[0]?.toLowerCase() || null);
    provider
      .request({ method: "eth_accounts" })
      .then((accounts: string[]) => accountsChanged(accounts))
      .catch(() => {});
    provider.on?.("accountsChanged", accountsChanged);
    return () => provider.removeListener?.("accountsChanged", accountsChanged);
  }, [provider]);

  const signer = useCallback(async () => {
    if (!provider) throw new Error("Connect your wallet first.");
    await switchToWhitechain(provider);
    const accounts: string[] = await provider.request({ method: "eth_accounts" });
    if (!accounts[0]) throw new Error("Connect your wallet first.");
    return new BrowserProvider(provider, WHITECHAIN.id).getSigner(accounts[0]);
  }, [provider]);

  async function connect(walletId: string) {
    if (walletId !== METAMASK.id) throw new Error("Choose a supported wallet.");
    if (!provider) {
      window.open(METAMASK.installUrl, "_blank", "noopener");
      throw new Error("MetaMask isn't installed in this browser. Install it, then reload this page.");
    }
    const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
    if (!accounts[0]) throw new Error("Your wallet did not share an account.");
    await api("session", {});
    const accountSigner = await signer();
    const address = (await accountSigner.getAddress()).toLowerCase();
    const challenge = await api<{ challengeId: string; message: string }>("auth/sender/options", {
      address,
    });
    await api("auth/sender/verify", {
      challengeId: challenge.challengeId,
      signature: await accountSigner.signMessage(challenge.message),
    });
    setAccount(address);
    return address;
  }

  async function logout() {
    await api("auth/logout", {});
    await provider
      ?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] })
      .catch(() => {});
    setAccount(null);
  }

  return (
    <SenderContext.Provider
      value={{
        ready: searched,
        configured: true,
        account,
        wallet: account ? METAMASK : null,
        wallets: WALLETS,
        connect,
        signer,
        logout,
      }}
    >
      {children}
    </SenderContext.Provider>
  );
}
