"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchBalances, fetchUsdcReadiness, hashscanAccount, hashscanTxId, readConfig, type Balances, type UsdcReadiness } from "@/lib/mirror";
import { buildTopUp, executeInWallet, parseAmount, USDC_DECIMALS } from "@/lib/walletTx";
import { SectionLabel } from "../SectionLabel";
import { useHederaWallet } from "./useHederaWallet";
import { Button, ConfigAlert, ErrorLine, Step, WalletStatus } from "./WalletPanel";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const HBAR_DECIMALS = 8;

/** The owner tops up their Leash from their own wallet. The device's key never leaves the device. */
export function FundLeash() {
  const { config } = readConfig();
  const network = config.network;
  const device = config.accountId;
  const usdc = config.usdcTokenId;
  const missing = [
    !process.env.NEXT_PUBLIC_HEDERA_NETWORK && "NEXT_PUBLIC_HEDERA_NETWORK",
    !device && "NEXT_PUBLIC_LEASH_ACCOUNT_ID",
    !usdc && "NEXT_PUBLIC_USDC_TOKEN_ID",
  ].filter(Boolean) as string[];
  const wallet = useHederaWallet(network);
  const from = wallet.state.phase === "connected" ? wallet.state.accountId : null;

  const [balances, setBalances] = useState<Balances | null>(null);
  const [ready, setReady] = useState<UsdcReadiness | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [asset, setAsset] = useState<"usdc" | "hbar">("usdc");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!device || !usdc) return;
    try {
      const [b, r] = await Promise.all([fetchBalances(network, device, usdc), fetchUsdcReadiness(network, device, usdc)]);
      setBalances(b);
      setReady(r);
      setReadError(null);
    } catch (err) {
      setReadError(`Could not read the Leash account ${device}: ${message(err)}`);
    }
  }, [device, network, usdc]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  let amountError: string | null = null;
  let units: bigint | null = null;
  try {
    units = parseAmount(amount, asset === "usdc" ? USDC_DECIMALS : HBAR_DECIMALS);
  } catch (err) {
    amountError = message(err);
  }
  const usdcBlocked = asset === "usdc" && ready !== null && !ready.ok;

  async function send() {
    if (!from || !device || !usdc || units === null) return;
    setBusy(true);
    setTxError(null);
    setTxId(null);
    try {
      setTxId(await executeInWallet(buildTopUp({ from, to: device, asset, units, usdcTokenId: usdc }), wallet.requireSigner()));
      await new Promise((r) => setTimeout(r, 4000));
      await refresh();
    } catch (err) {
      setTxError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[30px] pb-[90px] pt-[50px]">
      <div>
        <SectionLabel>Top up</SectionLabel>
        <div className="grid gap-[14px] px-[15px] pt-[16px]">
          <h1 className="display-2 font-normal">Fund your Leash</h1>
          <p className="max-w-[640px] text-[17px] text-grey-04">
            Your Leash holds its own key and signs its own payments. Send it USDC to spend and a little HBAR for its
            spend log, straight from your wallet.
          </p>
        </div>
      </div>

      <div className="mx-[15px] grid gap-[10px]">
        <ConfigAlert missing={missing} />

        {device && (
          <div className="grid gap-[10px] sm:grid-cols-3">
            <Figure label="Leash account">
              <a href={hashscanAccount(network, device)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                {device}
              </a>
            </Figure>
            <Figure label="USDC">{balances ? (balances.usdc === null ? "Not enabled" : balances.usdc.toFixed(2)) : "—"}</Figure>
            <Figure label="HBAR">{balances ? balances.hbar.toFixed(2) : "—"}</Figure>
          </div>
        )}
        <ErrorLine>{readError}</ErrorLine>

        <Step n={1} title="Connect your wallet" done={!!from}>
          <WalletStatus state={wallet.state} network={network} onConnect={wallet.connect} onDisconnect={wallet.disconnect} />
        </Step>

        <Step n={2} title="Send to your Leash" done={!!txId}>
          <div className="flex w-fit border border-grey-02" role="group" aria-label="Asset">
            {(["usdc", "hbar"] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={asset === a}
                onClick={() => setAsset(a)}
                className={`px-[16px] py-[8px] font-mono text-[12px] uppercase tracking-[0.06em] ${asset === a ? "bg-black-00 text-white-00" : "hover:bg-grey-01"}`}
              >
                {a}
              </button>
            ))}
          </div>
          <label className="grid w-full max-w-[320px] gap-[6px]">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-grey-04">Amount ({asset.toUpperCase()})</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="h-[46px] border border-grey-03 bg-white-00 px-[14px] text-[18px] outline-none focus:border-black-00"
            />
          </label>
          {usdcBlocked && (
            <ErrorLine>
              The Leash account can&apos;t receive USDC yet. Run <code className="font-mono">pnpm setup:hedera</code> on the device; it signs that
              step with its own key.
            </ErrorLine>
          )}
          <ErrorLine>{amount && amountError}</ErrorLine>
          <Button onClick={send} disabled={!from || !device || busy || units === null || usdcBlocked}>
            {busy ? "Approve it in your wallet…" : `Send ${amount || "0"} ${asset.toUpperCase()}`}
          </Button>
          <ErrorLine>{txError}</ErrorLine>
          {txId && (
            <a href={hashscanTxId(network, txId)} target="_blank" rel="noreferrer" className="w-fit text-[14px] underline underline-offset-4">
              Top-up on HashScan
            </a>
          )}
        </Step>
      </div>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-[6px] border border-grey-02 p-[14px]">
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-grey-04">{label}</span>
      <span className="text-[24px] tracking-[-0.02em]">{children}</span>
    </div>
  );
}
