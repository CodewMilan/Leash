"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Download, Gift, LogOut, RefreshCw } from "lucide-react";
import { tokenAmount } from "@/lib/amounts";
import { api } from "@/lib/client-api";
import type { AppStatus, GiftView } from "@/lib/types";
import { useSender } from "./SenderContext";
import { claimLinkFor, forgetEnvelopes, walletMessage } from "./giftFlow";
import { GiftComposer, useGiftDraft } from "./GiftComposer";
import { ClaimLinkPanel } from "./ClaimLinkPanel";
import { useClaimLink } from "./useClaimLink";
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
    "Chinki adds Whitechain testnet to your wallet and asks you to sign in. No gas, no transaction.",
  ],
  [
    "Choose a card",
    "Pick a design and an amount in official test USDT. You never need WBT for gas.",
  ],
  [
    "Approve and share",
    "Approve once in your wallet. Chinki pays the network fee, then gives you a private link to share.",
  ],
];
export function Dashboard() {
  const sender = useSender();
  const params = useSearchParams();
  const draft = useGiftDraft({
    amount: params.get("amount"),
    design: params.get("design"),
    message: params.get("brief"),
  });
  const [status, setStatus] = useState<AppStatus | null>(null);
  const from = sender.session;
  const [balance, setBalance] = useState<string | null>(null);
  const [gifts, setGifts] = useState<GiftView[]>([]);
  const [selectedGift, setSelected] = useState<GiftView | null>(null);
  const [stateOwner, setStateOwner] = useState(from);
  const activeOwner = useRef(from);
  const selected = stateOwner === from ? selectedGift : null;
  const { link: claimLink, qr } = useClaimLink(selected);
  const selectedInitial = useRef(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const refresh = useCallback(async () => {
    if (!from) return;
    try {
      const result = await api<{ gifts: GiftView[] }>("gifts");
      if (activeOwner.current !== from) return;
      setGifts(result.gifts);
      setHistoryError("");
      const chooseInitial = !selectedInitial.current;
      setSelected((current) =>
        current
          ? result.gifts.find((g) => g.id === current.id) || null
          : chooseInitial
            ? result.gifts.find((g) => g.status === "sent" && !!claimLinkFor(g.id)) || null
            : null,
      );
      selectedInitial.current = true;
    } catch (e) {
      if (activeOwner.current !== from) return;
      setHistoryError(e instanceof Error ? e.message : "Could not refresh your gifts.");
    }
  }, [from]);
  useEffect(() => {
    activeOwner.current = from;
    selectedInitial.current = false;
    queueMicrotask(() => {
      if (activeOwner.current === from) {
        setSelected(null);
        setGifts([]);
        setStateOwner(from);
        setBalance(null);
        setHistoryError("");
        setConfirmLogout(false);
      }
    });
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
      .then((r) => {
        if (activeOwner.current === from) setBalance(r.balance);
      })
      .catch(() => {
        if (activeOwner.current === from) setBalance(null);
      });
  }, [from]);
  useEffect(() => {
    if (from) loadBalance();
  }, [from, loadBalance]);
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
      forgetEnvelopes();
      setConfirmLogout(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
    }
  }
  const signedIn = from !== null && from === sender.account;
  const history = from && stateOwner === from ? gifts : [];
  const mismatch = from !== null && sender.account !== null && from !== sender.account;
  const ready = ["Gift storage", "Whitechain"].every((name) =>
    status?.services.some((service) => service.name === name && service.ready),
  );
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
              <button
                className="button secondary small"
                aria-label="Sign out"
                onClick={() => {
                  if (gifts.some((g) => g.status === "sent" && !!claimLinkFor(g.id)))
                    setConfirmLogout(true);
                  else void logout();
                }}
              >
                <LogOut size={16} />
              </button>
            </>
          ) : sender.ready && !sender.installed ? (
            <a
              className="button dark small"
              href={sender.wallets[0]?.installUrl}
              target="_blank"
              rel="noreferrer"
            >
              Install MetaMask
              <ArrowUpRight size={16} />
            </a>
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
      {confirmLogout && (
        <div className="notice mb-4" role="alert">
          <strong>Save your claim links before signing out.</strong>
          <p>
            Signing out clears the private links stored in this tab. Download or copy any unclaimed
            gift link first.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="button dark small" onClick={() => setConfirmLogout(false)}>
              Keep my links
            </button>
            <button className="button secondary small" onClick={() => void logout()}>
              Sign out and clear links
            </button>
          </div>
        </div>
      )}

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
          {selected ? (
            <>
              <ClaimLinkPanel key={selected.id} gift={selected} link={claimLink} qr={qr} />
              <div className="panel-body pt-0">
                <button
                  className="button secondary full"
                  onClick={() => {
                    selectedInitial.current = true;
                    setSelected(null);
                  }}
                >
                  Create another gift
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="panel-heading">
                <h2>Create a gift</h2>
                <Gift size={20} strokeWidth={1.5} />
              </div>
              <GiftComposer
                sender={sender}
                from={from}
                balance={balance}
                draft={draft}
                ready={ready}
                onRefreshBalance={loadBalance}
                onSent={(gift) => {
                  setSelected(gift);
                  selectedInitial.current = true;
                  void refresh();
                  loadBalance();
                }}
              />
            </>
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
                {selected.error && (
                  <p role="alert" className="notice error mt-4">
                    {selected.error}
                  </p>
                )}
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
                  <th>ACTIONS</th>
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
                          selectedInitial.current = true;
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
                      <div className="flex flex-wrap items-center gap-3">
                        {gift.status === "sent" && !gift.claimPending && (
                          <button
                            className="text-link"
                            onClick={() => {
                              setSelected(gift);
                              selectedInitial.current = true;
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Share gift
                          </button>
                        )}
                        <Link
                          href={`/gifts/${gift.id}`}
                          aria-label={`View receipt for ${gift.label}`}
                        >
                          Receipt <ArrowUpRight size={16} />
                        </Link>
                      </div>
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
