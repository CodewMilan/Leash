"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Wallet } from "lucide-react";
import { useSender } from "@/components/shagun/SenderContext";
import { walletMessage } from "@/components/shagun/giftFlow";

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** On phones the extension can't exist, so open this page inside the MetaMask app instead. */
function installHref(fallback: string | undefined) {
  if (typeof navigator === "undefined" || !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return fallback;
  return `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
}

/** Connect / signed-in control for the site header. */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const sender = useSender();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const signedIn = !!sender.session && sender.session === sender.account;
  const walletId = sender.wallet?.id || sender.wallets[0]?.id;

  useEffect(() => {
    if (!open && !error) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) {
        setOpen(false);
        setError("");
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, error]);

  async function connect() {
    if (!walletId) return;
    setBusy(true);
    setError("");
    try {
      await sender.connect(walletId);
    } catch (e) {
      setError(walletMessage(e, "MetaMask could not sign you in. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setOpen(false);
    try {
      await sender.logout();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
    }
  }

  const label = busy
    ? "Check MetaMask…"
    : sender.session && sender.account && !signedIn
      ? "Sign in with this account"
      : compact
        ? "Connect"
        : "Connect MetaMask";

  return (
    <div ref={root} className="relative flex h-full items-center">
      {sender.ready && !sender.installed ? (
        <a
          href={installHref(sender.wallets[0]?.installUrl)}
          target="_blank"
          rel="noreferrer"
          title="MetaMask isn't installed in this browser"
          className="flex h-full min-h-11 items-center gap-2 border-l border-grey-02 px-4 text-[15px] transition-colors hover:bg-grey-01"
        >
          <Wallet size={16} strokeWidth={1.75} aria-hidden="true" />
          {compact ? "Get MetaMask" : "Install MetaMask"}
        </a>
      ) : signedIn ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex h-full min-h-11 items-center gap-2 px-4 font-mono text-[13px]"
        >
          <span className="h-2 w-2 rounded-full bg-green-00" aria-hidden="true" />
          <span className="sr-only">Signed in as </span>
          {short(sender.session!)}
        </button>
      ) : (
        <button
          type="button"
          onClick={connect}
          disabled={busy || !sender.ready}
          aria-busy={busy}
          className="flex h-full min-h-11 items-center gap-2 border-l border-grey-02 px-4 text-[15px] transition-colors hover:bg-grey-01 disabled:opacity-60"
        >
          <Wallet size={16} strokeWidth={1.75} aria-hidden="true" />
          {label}
        </button>
      )}
      {open && signedIn ? (
        <div role="menu" className="absolute top-full right-0 z-50 w-64 border border-grey-02 bg-white-00 p-2 text-[14px] shadow-[0_8px_24px_rgba(38,38,38,0.08)]">
          <p className="px-3 pt-2 pb-3 text-[13px] text-grey-04">
            Signed in with {sender.wallet?.label || "your wallet"} on Whitechain testnet.
          </p>
          <Link role="menuitem" href="/dashboard" onClick={() => setOpen(false)} className="flex min-h-11 items-center px-3 hover:bg-grey-01">
            Your envelopes
          </Link>
          <button role="menuitem" type="button" onClick={disconnect} className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-grey-01">
            <LogOut size={15} aria-hidden="true" /> Sign out
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="absolute top-full right-0 z-50 mt-2 w-72 border border-red-00 bg-white-00 p-3 text-[13px] leading-snug text-red-00">
          {error}
        </p>
      ) : null}
    </div>
  );
}
