"use client";

import { hexlify, id, keccak256, randomBytes } from "ethers";
import { authorizationTypes, giftNonce, TOKEN_DOMAIN, ZeroHash, type GiftTerms } from "@/lib/chain";
import { api } from "@/lib/client-api";
import { giftUnits } from "@/lib/designs";
import { sealMessage } from "@/lib/giftMessage";
import type { GiftView } from "@/lib/types";
import type { Sender } from "./SenderContext";

export type GiftInput = {
  from: string;
  amount: string;
  design: string;
  message: string;
  label: string;
  expirySeconds: number;
  campaign: string;
  balance: string | null;
};

/** Signs an EIP-3009 authorization in the sender's wallet; the relayer pays the gas. */
export async function sendGift(sender: Sender, input: GiftInput, step: (s: string) => void) {
  if (!sender.account || input.from !== sender.account)
    throw new Error("Connect and confirm your wallet first.");
  const units = giftUnits(input.amount);
  if (input.balance !== null && BigInt(input.balance) < units)
    throw new Error("Your wallet needs more test USDT before you can send this gift.");
  step("Preparing your gift…");
  const config = await api<{ vault: string }>("gift-config");
  const secret = hexlify(randomBytes(32));
  const sealedMessage = await sealMessage(secret, input.message);
  const campaign = input.campaign.trim().toLowerCase();
  const terms: GiftTerms = {
    from: input.from,
    amount: String(units),
    expiry: Math.floor(Date.now() / 1000) + input.expirySeconds,
    secretHash: keccak256(secret),
    boundHuman: ZeroHash,
    campaignId: campaign ? id(campaign) : ZeroHash,
    salt: hexlify(randomBytes(32)),
  };
  const nonce = giftNonce(config.vault, terms);
  const validAfter = 0,
    validBefore = Math.floor(Date.now() / 1000) + 300;
  // Keep the envelope key in this tab only; it is never included in API URL paths or analytics.
  sessionStorage.setItem(`shagun-envelope:${nonce}`, secret);
  step("Approve the gift in your wallet. There is no network fee.");
  const signer = await sender.signer();
  const signature = await signer.signTypedData(TOKEN_DOMAIN, authorizationTypes, {
    from: input.from,
    to: config.vault,
    value: terms.amount,
    validAfter,
    validBefore,
    nonce,
  });
  step("Submitting your sponsored gift…");
  return api<GiftView>("gifts", {
    terms,
    validAfter,
    validBefore,
    signature,
    label: input.label,
    design: input.design,
    sealedMessage,
  });
}

export function claimLinkFor(giftId: string) {
  const secret = sessionStorage.getItem(`shagun-envelope:${giftId}`);
  return secret ? `${window.location.origin}/claim/${giftId}#${secret}` : "";
}

export function forgetEnvelopes() {
  Object.keys(sessionStorage)
    .filter((k) => k.startsWith("shagun-envelope:"))
    .forEach((k) => sessionStorage.removeItem(k));
}

export function walletMessage(error: unknown, fallback: string) {
  type WalletError = { code?: unknown; message?: unknown };
  const e = error as WalletError & { error?: WalletError; info?: { error?: WalletError } };
  // ethers wraps wallet errors; the wallet's own error is in `error` (or `info.error`).
  const wallet = e?.error ?? e?.info?.error;
  const codes = [e?.code, wallet?.code];
  if (codes.includes(4001) || codes.includes("ACTION_REJECTED"))
    return "You cancelled the request in your wallet.";
  if (codes.includes(-32002)) return "Your wallet already has a request open. Check MetaMask.";
  if (codes.includes(4100))
    return "MetaMask hasn't connected this account to Chinki. Open MetaMask, connect this account to the site, then try again.";
  if (typeof wallet?.message === "string" && wallet.message) return wallet.message;
  return error instanceof Error && error.message ? error.message : fallback;
}
