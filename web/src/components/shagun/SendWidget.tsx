"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, Gift } from "lucide-react";
import QRCode from "qrcode";
import { tokenAmount } from "@/lib/amounts";
import { api } from "@/lib/client-api";
import type { AppStatus, GiftView } from "@/lib/types";
import { useSender } from "./SenderContext";
import { InjectedSenderProvider } from "./InjectedSenderProvider";
import { claimLinkFor, walletMessage } from "./giftFlow";
import { GiftComposer, useGiftDraft } from "./GiftComposer";
import { AppEnvelope } from "./AppEnvelope";
import { ReceiptTimeline, StatusBadge, TestBanner } from "./Shared";

const SenderProvider = dynamic(() => import("./SenderProvider"), {
  ssr: false,
  loading: () => <div className="loading-block" aria-label="Loading wallet sign-in" />,
});

export function SendWidget() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID)
    return (
      <InjectedSenderProvider>
        <WidgetFlow />
      </InjectedSenderProvider>
    );
  return (
    <SenderProvider>
      <WidgetFlow />
    </SenderProvider>
  );
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
  const [from, setFrom] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [gift, setGift] = useState<GiftView | null>(null);
  const [claimLink, setClaimLink] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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
    api<{ sender: string | null }>("session", {})
      .then((s) => setFrom(s.sender))
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
    if (!gift || !["pending", "claimed"].includes(gift.status)) return;
    const timer = window.setInterval(() => {
      api<GiftView>(`gifts/${gift.id}`)
        .then((next) => {
          if (next.status !== gift.status || next.createdTx !== gift.createdTx) setGift(next);
        })
        .catch(() => {});
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [gift]);
  useEffect(() => {
    if (!gift?.createdTx || gift.status !== "sent") return;
    const link = claimLinkFor(gift.id);
    if (!link) return;
    queueMicrotask(() => setClaimLink(link));
    QRCode.toDataURL(link, { width: 240, margin: 2, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => {});
  }, [gift?.id, gift?.createdTx, gift?.status]);

  async function connect(walletId: string) {
    setBusy("Connecting your wallet…");
    setError("");
    try {
      const account = await sender.connect(walletId);
      if (account) setFrom(account);
    } catch (e) {
      setError(walletMessage(e, "Wallet sign-in could not complete."));
    } finally {
      setBusy("");
    }
  }

  const signedIn = from !== null && from === sender.account;
  const ready = !!status?.services
    .filter((s) => ["Gift storage", "Whitechain"].includes(s.name))
    .every((s) => s.ready);
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
            <AppEnvelope amount={tokenAmount(gift.amount, 0)} design={gift.design} />
            <div className="mb-4 flex items-center justify-between">
              <p className="mono">${tokenAmount(gift.amount)}</p>
              <StatusBadge gift={gift} />
            </div>
            <ReceiptTimeline gift={gift} />
            {claimLink && gift.status === "sent" && (
              <>
                <div className="qr-wrap">
                  {qr && (
                    <Image
                      src={qr}
                      alt="QR code to claim this gift"
                      width={180}
                      height={180}
                      unoptimized
                    />
                  )}
                </div>
                <label className="field-label" htmlFor="widget-claim-link">
                  ENVELOPE LINK · KEEP PRIVATE
                </label>
                <div className="claim-link">
                  <input
                    id="widget-claim-link"
                    className="field-input"
                    value={claimLink}
                    readOnly
                  />
                  <button
                    className="button dark small"
                    type="button"
                    aria-label="Copy envelope link"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(claimLink);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        setError("Copy the envelope link from the field above.");
                      }
                    }}
                  >
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>
                <p className="field-hint">
                  Share it with the person you are gifting. Unclaimed envelopes return to you.
                </p>
              </>
            )}
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
                  setClaimLink("");
                  setQr("");
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
