"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Gift } from "lucide-react";
import { tokenAmount } from "@/lib/amounts";
import { api } from "@/lib/client-api";
import type { AppStatus, GiftView } from "@/lib/types";
import { useSender } from "./SenderContext";
import { walletMessage } from "./giftFlow";
import { GiftComposer, useGiftDraft } from "./GiftComposer";
import { ClaimLinkPanel } from "./ClaimLinkPanel";
import { useClaimLink } from "./useClaimLink";
import { AppEnvelope } from "./AppEnvelope";
import { ReceiptTimeline, TestBanner } from "./Shared";

export function SendWidget() {
  return <WidgetFlow />;
}

function parentOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.origin === value ? value : null;
  } catch {
    return null;
  }
}

function WidgetFlow() {
  const sender = useSender();
  const params = useSearchParams();
  const parent = parentOrigin(params.get("parent"));
  const host = (params.get("app") || "").slice(0, 40);
  const draft = useGiftDraft({
    amount: params.get("amount"),
    design: params.get("design"),
    label: params.get("note"),
    campaign: params.get("campaign"),
  });
  const campaignLocked = !!params.get("campaign");
  const [status, setStatus] = useState<AppStatus | null>(null);
  const from = sender.session;
  const [balance, setBalance] = useState<string | null>(null);
  const [gift, setGift] = useState<GiftView | null>(null);
  const { link: claimLink, qr } = useClaimLink(gift);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const post = useCallback(
    (message: Record<string, unknown>) => {
      const opener = window.opener as Window | null;
      if (parent && opener) opener.postMessage({ source: "shagun", ...message }, parent);
    },
    [parent],
  );
  useEffect(() => {
    api<AppStatus>("status")
      .then(setStatus)
      .catch(() => {});
    post({ type: "ready" });
  }, [post]);
  useEffect(() => {
    if (from)
      api<{ balance: string }>("balance")
        .then((r) => setBalance(r.balance))
        .catch(() => setBalance(null));
  }, [from]);
  useEffect(() => {
    if (!gift) return;
    post({
      type: "gift",
      gift: {
        id: gift.id,
        amount: tokenAmount(gift.amount),
        status: gift.status,
        label: gift.label,
        design: gift.design,
        createdTx: gift.createdTx,
        receiptUrl: `${window.location.origin}/gifts/${gift.id}`,
      },
    });
  }, [gift, post]);
  useEffect(() => {
    if (!gift || !["pending", "sent", "claimed", "settled"].includes(gift.status)) return;
    let active = true;
    let fetching = false;
    const timer = window.setInterval(() => {
      if (fetching) return;
      fetching = true;
      api<GiftView>(`gifts/${gift.id}`)
        .then((next) => {
          if (active) setGift((current) => (current?.id === gift.id ? next : current));
        })
        .catch(() => {})
        .finally(() => {
          fetching = false;
        });
    }, 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [gift]);
  async function connect(walletId: string) {
    setBusy("Connecting your wallet…");
    setError("");
    try {
      await sender.connect(walletId);
    } catch (e) {
      setError(walletMessage(e, "Wallet sign-in could not complete."));
    } finally {
      setBusy("");
    }
  }

  const signedIn = from !== null && from === sender.account;
  const ready = ["Gift storage", "Whitechain"].every((name) =>
    status?.services.some((service) => service.name === name && service.ready),
  );
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h1 className="text-xl">Send a Shagun</h1>
            {host && <p className="microcopy">from {host}</p>}
          </div>
          <Gift size={20} strokeWidth={1.5} />
        </div>
        <TestBanner />
        {gift ? (
          <div className="panel-body">
            <ClaimLinkPanel key={gift.id} gift={gift} link={claimLink} qr={qr} />
            <details>
              <summary className="text-link">View gift journey</summary>
              <ReceiptTimeline gift={gift} />
            </details>
            {(gift.error || error) && (
              <p role="alert" className="notice error mt-4">
                {gift.error || error}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <a
                className="button secondary small"
                href={`/gifts/${gift.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Receipt <ArrowUpRight size={16} />
              </a>
              <button
                className="button secondary small"
                type="button"
                onClick={() => {
                  setGift(null);
                }}
              >
                Send another
              </button>
              {parent && (
                <button className="button dark small" type="button" onClick={() => window.close()}>
                  Done
                </button>
              )}
            </div>
          </div>
        ) : !signedIn ? (
          <div className="panel-body form-stack">
            <AppEnvelope amount={draft.compact} design={draft.design} />
            <p>
              Connect your wallet to send. You approve the gift in your wallet and pay no network
              fee.
            </p>
            {sender.wallets.map((wallet) => (
              <button
                key={wallet.id}
                className="button primary full"
                type="button"
                onClick={() => connect(wallet.id)}
                disabled={!!busy || !sender.ready || !sender.configured}
              >
                {busy || `Connect ${wallet.label}`}
                <ArrowUpRight size={20} />
              </button>
            ))}
            {!sender.configured && (
              <p className="microcopy">Wallet sign-in is being set up. Please try again shortly.</p>
            )}
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="mono microcopy px-6 pt-4">
              {sender.wallet ? `${sender.wallet.label} · ` : ""}
              {from.slice(0, 6)}…{from.slice(-4)} · ${tokenAmount(balance)}
            </p>
            <GiftComposer
              sender={sender}
              from={from}
              balance={balance}
              draft={draft}
              ready={ready}
              onRefreshBalance={() => {
                api<{ balance: string }>("balance")
                  .then((r) => setBalance(r.balance))
                  .catch(() => setBalance(null));
              }}
              campaignLocked={campaignLocked}
              showPreview
              onSent={setGift}
            />
          </>
        )}
      </div>
    </main>
  );
}
