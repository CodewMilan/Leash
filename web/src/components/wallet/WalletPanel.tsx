"use client";

import type { ReactNode } from "react";
import { hashscanAccount, type Network } from "@/lib/mirror";
import type { WalletState } from "./useHederaWallet";

export function ConfigAlert({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <div className="border border-red-00 bg-red-05/40 p-[16px]" role="alert">
      <p className="mb-[6px] text-[18px]">This page isn&apos;t configured</p>
      <p className="mb-[10px] text-[14px] text-grey-04">
        Set these in <code className="font-mono">web/.env.local</code> and restart the server.
      </p>
      <ul className="flex flex-col gap-[4px] font-mono text-[12px]">
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

export function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <section className="grid gap-[14px] border border-grey-02 p-[16px] lg:grid-cols-[200px_1fr] lg:p-[20px]">
      <div className="flex items-start gap-[10px] lg:flex-col">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-grey-04">[ 0{n} ]</span>
        <h2 className="text-[22px] leading-[1.1] tracking-[-0.02em]">
          {title}
          {done && <span className="ml-[8px] inline-block h-[8px] w-[8px] bg-green-00 align-middle" aria-label="done" />}
        </h2>
      </div>
      <div className="grid gap-[12px] text-[15px]">{children}</div>
    </section>
  );
}

export function Button({ children, onClick, disabled, dark = true }: { children: ReactNode; onClick: () => void; disabled?: boolean; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-[46px] w-fit px-[18px] text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        dark ? "bg-black-00 text-white-00 hover:bg-blue-00" : "border border-grey-03 hover:border-black-00"
      }`}
    >
      {children}
    </button>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="border-l-2 border-red-00 pl-[10px] text-[14px] text-red-00">
      {children}
    </p>
  );
}

/** Connect / connected state for a WalletConnect Hedera wallet. */
export function WalletStatus({
  state,
  network,
  onConnect,
  onDisconnect,
}: {
  state: WalletState;
  network: Network;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (state.phase === "unconfigured") return <ConfigAlert missing={["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"]} />;
  if (state.phase === "connected") {
    return (
      <div className="flex flex-wrap items-center gap-[14px]">
        <a
          href={hashscanAccount(network, state.accountId)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[14px] underline underline-offset-4"
        >
          {state.accountId}
        </a>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-grey-04">Hedera {network}</span>
        <Button dark={false} onClick={onDisconnect}>
          Disconnect
        </Button>
      </div>
    );
  }
  return (
    <>
      <p className="text-grey-04">HashPack, Kabila, Blade or any Hedera wallet that supports WalletConnect. Your keys never leave it.</p>
      <Button onClick={onConnect} disabled={state.phase !== "disconnected"}>
        {state.phase === "restoring" ? "Checking for a wallet…" : state.phase === "connecting" ? "Waiting for your wallet…" : "Connect wallet"}
      </Button>
      {state.phase === "disconnected" && <ErrorLine>{state.error}</ErrorLine>}
    </>
  );
}

export function CopyBlock({ text }: { text: string }) {
  return (
    <div className="flex items-stretch border border-grey-02">
      <pre className="flex-1 overflow-x-auto whitespace-pre bg-grey-01 px-[14px] py-[12px] font-mono text-[12px]">{text}</pre>
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(text)}
        className="border-l border-grey-02 px-[14px] font-mono text-[11px] uppercase tracking-[0.06em] hover:bg-grey-01"
      >
        Copy
      </button>
    </div>
  );
}
