import type { WalletListEntry } from "@privy-io/react-auth";

export type WalletOption = {
  id: string;
  label: string;
  privyId: WalletListEntry;
  installUrl: string;
};

/** Sender wallets offered at sign-in. Add an entry to offer another wallet. */
export const WALLETS: WalletOption[] = [
  {
    id: "metamask",
    label: "MetaMask",
    privyId: "metamask",
    installUrl: "https://metamask.io/download",
  },
];

export function walletOption(id: string) {
  return WALLETS.find((wallet) => wallet.id === id) || null;
}

export const WHITECHAIN_FAUCET = "https://faucet.testnet.whitechain.io";
