"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchUsdcReadiness, hashscanTxId, readConfig, type UsdcReadiness } from "@/lib/mirror";
import { buildAssociate, executeInWallet } from "@/lib/walletTx";
import { SectionLabel } from "../SectionLabel";
import { useHederaWallet } from "./useHederaWallet";
import { Button, ConfigAlert, CopyBlock, ErrorLine, Step, WalletStatus } from "./WalletPanel";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Merchant onboarding: connect a wallet, let it receive USDC, copy the account into the shop and the device. */
export function MerchantSetup() {
  const { config } = readConfig();
  const network = config.network;
  const usdc = config.usdcTokenId;
  const missing = [!process.env.NEXT_PUBLIC_HEDERA_NETWORK && "NEXT_PUBLIC_HEDERA_NETWORK", !usdc && "NEXT_PUBLIC_USDC_TOKEN_ID"].filter(Boolean) as string[];
  const wallet = useHederaWallet(network);
  const accountId = wallet.state.phase === "connected" ? wallet.state.accountId : null;

  const [ready, setReady] = useState<UsdcReadiness | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!accountId || !usdc) return;
    try {
      setReady(await fetchUsdcReadiness(network, accountId, usdc));
      setCheckError(null);
    } catch (err) {
      setCheckError(`Could not read ${accountId} from the mirror node: ${message(err)}`);
    }
  }, [accountId, network, usdc]);

  useEffect(() => {
    const t = setTimeout(() => {
      setReady(null);
      void check();
    }, 0);
    return () => clearTimeout(t);
  }, [check]);

  async function enableUsdc() {
    if (!accountId || !usdc) return;
    setBusy(true);
    setTxError(null);
    try {
      setTxId(await executeInWallet(buildAssociate(accountId, usdc), wallet.requireSigner()));
      // The mirror node trails consensus by a few seconds.
      await new Promise((r) => setTimeout(r, 4000));
      await check();
    } catch (err) {
      setTxError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[30px] pb-[90px] pt-[50px]">
      <div>
        <SectionLabel>For merchants</SectionLabel>
        <div className="grid gap-[14px] px-[15px] pt-[16px]">
          <h1 className="display-2 font-normal">Get paid by Leash</h1>
          <p className="max-w-[640px] text-[17px] text-grey-04">
            Leash devices pay over x402 in USDC on Hedera. You only need an account that can receive USDC. Your wallet
            signs everything here; nobody, including Leash, ever sees your key.
          </p>
        </div>
      </div>

      <div className="mx-[15px] grid gap-[10px]">
        <ConfigAlert missing={missing} />

        <Step n={1} title="Connect your wallet" done={!!accountId}>
          <WalletStatus state={wallet.state} network={network} onConnect={wallet.connect} onDisconnect={wallet.disconnect} />
        </Step>

        <Step n={2} title="Receive USDC" done={!!ready?.ok}>
          {!accountId ? (
            <p className="text-grey-04">Connect a wallet to check it.</p>
          ) : checkError ? (
            <ErrorLine>{checkError}</ErrorLine>
          ) : !ready ? (
            <p className="text-grey-04">Checking {accountId} on Hedera {network}…</p>
          ) : ready.ok ? (
            <p>
              {ready.how === "associated"
                ? `Ready. ${accountId} holds ${ready.balance} USDC.`
                : `Ready. ${accountId} accepts new tokens automatically, so USDC will arrive without any setup.`}
            </p>
          ) : (
            <>
              <p>
                {accountId} can&apos;t receive USDC ({usdc}) yet. Enabling it is a one-time Hedera token association, signed
                in your wallet. It costs about $0.05 in HBAR.
              </p>
              <Button onClick={enableUsdc} disabled={busy}>
                {busy ? "Approve it in your wallet…" : "Enable USDC"}
              </Button>
            </>
          )}
          <ErrorLine>{txError}</ErrorLine>
          {txId && (
            <a href={hashscanTxId(network, txId)} target="_blank" rel="noreferrer" className="w-fit text-[14px] underline underline-offset-4">
              Association on HashScan
            </a>
          )}
        </Step>

        <Step n={3} title="Start taking payments" done={!!accountId && !!ready?.ok}>
          {accountId && ready?.ok ? (
            <>
              <p>Put this in the shop&apos;s environment, then start it with <code className="font-mono">pnpm start</code> in <code className="font-mono">merchant/</code>:</p>
              <CopyBlock text={`MERCHANT_ACCOUNT_ID=${accountId}`} />
              <p>Customers add you to their Leash contacts with this account as the recipient:</p>
              <CopyBlock text={JSON.stringify({ payTo: accountId }, null, 2)} />
            </>
          ) : (
            <p className="text-grey-04">Finish the steps above to get your settings.</p>
          )}
        </Step>
      </div>
    </div>
  );
}
