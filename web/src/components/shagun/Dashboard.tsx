"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, Download, Gift, LogOut, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { tokenAmount } from "@/lib/amounts";
import { api } from "@/lib/client-api";
import type { AppStatus, GiftView } from "@/lib/types";
import { useSender } from "./SenderContext";
import { claimLinkFor, forgetEnvelopes, walletMessage } from "./giftFlow";
import { GiftComposer, useGiftDraft } from "./GiftComposer";
import { AppEnvelope } from "./AppEnvelope";
import {
  EmptyGifts,
  ReceiptTimeline,
  ReturnNotice,
  SetupPanel,
  StatusBadge,
  TestBanner,
} from "./Shared";

const ONBOARDING = [
  [
    "Connect MetaMask",
    "Shagun adds Whitechain testnet to your wallet and asks you to sign in. No gas, no transaction.",
  ],
  [
    "Choose a card",
    "Pick a design and an amount in official test USDT. You never need WBT for gas.",
  ],
  [
    "Approve and share",
    "Approve once in your wallet. Shagun pays the network fee, then gives you a private link to share.",
  ],
];
export function Dashboard() {
  const sender = useSender();
  const params = useSearchParams();
  const draft = useGiftDraft({ amount: params.get("amount"), design: params.get("design") });
  const [status, setStatus] = useState<AppStatus | null>(null);
  const from = sender.session;
  const [balance, setBalance] = useState<string | null>(null);
  const [gifts, setGifts] = useState<GiftView[]>([]);
  const [selected, setSelected] = useState<GiftView | null>(null);
  const [claimLink, setClaimLink] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [copied, setCopied] = useState(false);
  const refresh = useCallback(async () => {
    if (!from) return;
    try {
      const result = await api<{ gifts: GiftView[] }>("gifts");
      setGifts(result.gifts);
      setHistoryError("");
      setSelected((current) =>
        current ? result.gifts.find((g) => g.id === current.id) || current : null,
      );
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Could not refresh your gifts.");
    }
  }, [from]);
  useEffect(() => {
    api<AppStatus>("status")
      .then(setStatus)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 8_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [refresh]);
  const loadBalance = useCallback(() => {
    api<{ balance: string }>("balance")
      .then((r) => setBalance(r.balance))
      .catch(() => setBalance(null));
  }, []);
  useEffect(() => {
    if (from) loadBalance();
  }, [from, loadBalance]);
  useEffect(() => {
    if (!selected?.createdTx || selected.status !== "sent") return;
    const link = claimLinkFor(selected.id);
    if (!link) return;
    queueMicrotask(() => setClaimLink(link));
    QRCode.toDataURL(link, { width: 240, margin: 2, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => {});
  }, [selected?.id, selected?.createdTx, selected?.status]);
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
  async function logout() {
    try {
      await sender.logout();
      setGifts([]);
      setSelected(null);
      setClaimLink("");
      setQr("");
      forgetEnvelopes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
    }
  }
  const signedIn = from !== null && from === sender.account;
  const history = from ? gifts : [];
  const mismatch = from !== null && sender.account !== null && from !== sender.account;
  const ready = !!status?.services
    .filter((s) => ["Gift storage", "Whitechain"].includes(s.name))
    .every((s) => s.ready);
  const walletId = sender.wallet?.id || sender.wallets[0]?.id;
  return (
    <main id="main" className="app-shell enter">
      <div className="eyebrow">YOUR GOOD WISHES, ALL IN ONE PLACE.</div>
      <div className="app-heading">
        <div>
          <h1>A little goes a long way.</h1>
          <p>Send an envelope. Follow its journey. Make someone&apos;s day.</p>
        </div>
        <div className="session-info">
          {signedIn ? (
            <>
              <span className="mono">
                {sender.wallet ? `${sender.wallet.label} · ` : ""}
                {from.slice(0, 6)}…{from.slice(-4)} · ${tokenAmount(balance)}
              </span>
              <button className="button secondary small" aria-label="Sign out" onClick={logout}>
                <LogOut size={16} />
              </button>
            </>
          ) : (
            sender.wallets.map((wallet) => (
              <button
                key={wallet.id}
                className="button dark small"
                onClick={() => connect(wallet.id)}
                disabled={!!busy || !sender.ready || !sender.configured}
              >
                {busy ||
                  (sender.account && sender.wallet?.id === wallet.id
                    ? `Sign in with ${wallet.label}`
                    : `Connect ${wallet.label}`)}
                <ArrowUpRight size={16} />
              </button>
            ))
          )}
        </div>
      </div>
      <TestBanner />
      {error && (
        <div className="notice error mb-4" role="alert">
          {error}
        </div>
      )}
      {mismatch && walletId && (
        <div className="notice mb-4" role="status">
          You signed in as {from.slice(0, 6)}…{from.slice(-4)}, but{" "}
          {sender.wallet?.label || "your wallet"} is now on {sender.account!.slice(0, 6)}…
          {sender.account!.slice(-4)}. Switch back in your wallet, or{" "}
          <button className="underline" onClick={() => connect(walletId)}>
            sign in with this account
          </button>
          .
        </div>
      )}
      {!signedIn && !mismatch && (
        <ol className="onboarding mb-6">
          {ONBOARDING.map(([title, text], i) => (
            <li key={title}>
              <span className="mono">0{i + 1}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Put a little love in it.</h2>
            <Gift size={20} strokeWidth={1.5} />
          </div>
          <GiftComposer
            sender={sender}
            from={from}
            balance={balance}
            draft={draft}
            ready={ready}
            onSent={(gift) => {
              setClaimLink("");
              setQr("");
              setSelected(gift);
              void refresh();
              loadBalance();
            }}
          />
          {!signedIn && (
            <p className="microcopy px-6 pb-6">
              {sender.configured
                ? "Connect your wallet above to send. You sign once to sign in and once per gift."
                : "Wallet sign-in is being set up. You can preview a card while services are connected."}
            </p>
          )}
        </section>
        <div>
          <section className="panel">
            <div className="panel-heading">
              <h2>{selected ? "Your gift's journey" : "Sealed with good wishes."}</h2>
              {selected && <StatusBadge gift={selected} />}
            </div>
            {selected ? (
              <div className="panel-body">
                <AppEnvelope amount={tokenAmount(selected.amount, 0)} design={selected.design} />
                <ReceiptTimeline gift={selected} />
                {claimLink && selected.status === "sent" && (
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
                    <label className="field-label" htmlFor="claim-link">
                      YOUR ENVELOPE LINK · KEEP PRIVATE
                    </label>
                    <div className="claim-link">
                      <input id="claim-link" className="field-input" value={claimLink} readOnly />
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
                      Share privately, or write this URL to your NFC sticker. Save it before closing
                      this tab.
                    </p>
                  </>
                )}
                {selected.error && (
                  <p role="alert" className="notice error mt-4">
                    {selected.error}
                  </p>
                )}
                <button
                  className="button secondary small mt-4"
                  onClick={() => {
                    setSelected(null);
                    setClaimLink("");
                    setQr("");
                  }}
                >
                  Send another gift
                </button>
              </div>
            ) : (
              <>
                <AppEnvelope
                  amount={draft.compact}
                  design={draft.design}
                  note={draft.message.trim()}
                />
                <div className="panel-body">
                  <ReturnNotice />
                </div>
              </>
            )}
          </section>
          <SetupPanel status={status} />
        </div>
      </div>
      <section className="panel history">
        <div className="panel-heading">
          <h2>Your envelopes</h2>
          <div className="flex gap-2">
            <button
              className="button secondary small"
              aria-label="Refresh gifts"
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} />
            </button>
            <a
              className="button secondary small"
              href={signedIn ? "/api/gifts/export" : undefined}
              aria-disabled={!signedIn}
            >
              <Download size={16} /> CSV
            </a>
          </div>
        </div>
        {historyError && signedIn && (
          <div className="notice error" role="alert">
            {historyError}
          </div>
        )}
        {history.length === 0 ? (
          <EmptyGifts />
        ) : (
          <div className="table-scroll">
            <table className="gift-table">
              <thead>
                <tr>
                  <th>ENVELOPE</th>
                  <th>AMOUNT</th>
                  <th>STATUS</th>
                  <th>RECEIPT</th>
                </tr>
              </thead>
              <tbody>
                {history.map((gift) => (
                  <tr key={gift.id}>
                    <td>
                      <button
                        className="text-left"
                        onClick={() => {
                          setSelected(gift);
                          setClaimLink("");
                          setQr("");
                        }}
                      >
                        {gift.label}
                        <br />
                        <small className="muted">
                          {new Date(gift.createdAt).toLocaleDateString()}
                        </small>
                      </button>
                    </td>
                    <td className="mono">${tokenAmount(gift.amount)}</td>
                    <td>
                      <StatusBadge gift={gift} />
                    </td>
                    <td>
                      <Link
                        href={`/gifts/${gift.id}`}
                        aria-label={`View receipt for ${gift.label}`}
                      >
                        <ArrowUpRight size={20} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
