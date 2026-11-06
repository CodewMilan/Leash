"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CreditCard, Fingerprint, RefreshCw } from "lucide-react";
import LithicEmbed, { Environment, type CardEmbed } from "lithic-embed";
import type { GiftCardView } from "@/lib/types";
import styles from "./CardWallet.module.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fieldStyle = {
  color: "#262626",
  "font-size": "17px",
  "font-family": "ui-monospace, monospace",
};

class CardAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function cardRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new CardAccessError(
      result.error || "Your card could not be opened. Try again.",
      response.status,
    );
  return result as T;
}

export function CardWallet({
  giftId,
  onAuthenticate,
}: {
  giftId: string;
  onAuthenticate: () => Promise<void>;
}) {
  const [card, setCard] = useState<GiftCardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsPasskey, setNeedsPasskey] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const embed = useRef<CardEmbed | null>(null);
  const id = `gift-card-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const [embedSession, setEmbedSession] = useState("");

  const fail = useCallback((failure: unknown) => {
    embed.current = null;
    setDetailsOpen(false);
    setEmbedSession("");
    setMounted(false);
    setRevealed(false);
    setNeedsPasskey(failure instanceof CardAccessError && [401, 403].includes(failure.status));
    setError(
      failure instanceof Error ? failure.message : "Your card could not be opened. Try again.",
    );
  }, []);
  const refresh = useCallback(async () => {
    try {
      const result = await cardRequest<{ card: GiftCardView | null }>(`gifts/${giftId}/card`);
      setCard(result.card);
      setNeedsPasskey(false);
      setError("");
    } catch (failure) {
      fail(failure);
    } finally {
      setLoading(false);
    }
  }, [giftId, fail]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 8_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!embedSession || !detailsOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const hosted = new LithicEmbed(Environment.SANDBOX).card(embedSession, {
          syncStyles: false,
        });
        await hosted.mount({
          pan: { selector: `#${id}-pan`, styles: fieldStyle },
          expMonth: { selector: `#${id}-month`, styles: fieldStyle },
          expYear: { selector: `#${id}-year`, styles: fieldStyle },
          cvv: { selector: `#${id}-cvv`, styles: fieldStyle },
        });
        if (cancelled) return;
        embed.current = hosted;
        setMounted(true);
      } catch (failure) {
        if (!cancelled) fail(failure);
      }
    })();
    return () => {
      cancelled = true;
      embed.current = null;
    };
  }, [embedSession, detailsOpen, id, fail]);

  async function openDetails() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await cardRequest<{ session: string }>(`gifts/${giftId}/card/embed`, {});
      setMounted(false);
      setRevealed(false);
      setDetailsOpen(true);
      setEmbedSession(result.session);
      setNeedsPasskey(false);
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }
  async function confirmRecipient() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNeedsPasskey(false);
    try {
      await onAuthenticate();
      await refresh();
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }
  async function toggleDetails() {
    if (!embed.current || busy) return;
    setBusy(true);
    try {
      await embed.current.toggleMasking();
      setRevealed((value) => !value);
    } catch {
      setError("Your card session expired. Open a new card session to continue.");
      setDetailsOpen(false);
      setEmbedSession("");
      setMounted(false);
    } finally {
      setBusy(false);
    }
  }

  const ready = card?.status === "ready";
  const closing =
    card &&
    ["closing", "reconciliation", "reconciliation_required", "closed", "returned"].includes(
      card.status,
    );
  const heading = ready
    ? "Your gift, ready to spend."
    : card?.status === "closed"
      ? "Your card is closed."
      : closing
        ? "Your card is closing."
        : "Your virtual card.";
  return (
    <section className={`panel ${styles.wallet}`} aria-label="Your Shagun virtual card">
      <div className="panel-heading">
        <h2>{heading}</h2>
        <span className={styles.sandbox}>LITHIC SANDBOX</span>
      </div>
      <div className={`panel-body ${styles.body}`}>
        {loading ? (
          <p role="status">Checking your gift card…</p>
        ) : needsPasskey ? (
          <>
            <p>Confirm with the passkey you used to claim this gift to open your card.</p>
            <button
              type="button"
              className="button dark small"
              disabled={busy}
              onClick={() => void confirmRecipient()}
            >
              <Fingerprint size={17} /> {busy ? "Confirming…" : "Open with your passkey"}
            </button>
          </>
        ) : card ? (
          <>
            <div className={styles.card}>
              <div className={styles.cardTop}>
                <strong>Shagun</strong>
                <CreditCard size={23} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <p className={styles.number}>
                •••• &nbsp; •••• &nbsp; •••• &nbsp; {card.lastFour || "••••"}
              </p>
              <div className={styles.cardBottom}>
                <span>{card.network || "Virtual card"}</span>
                <span>
                  {card.expMonth && card.expYear
                    ? `${card.expMonth} / ${card.expYear}`
                    : "Preparing"}
                </span>
              </div>
            </div>
            <dl className={styles.balances}>
              <div>
                <dt>Gift budget</dt>
                <dd>{money.format(card.budgetCents / 100)}</dd>
              </div>
              <div>
                <dt>Available to spend</dt>
                <dd>{money.format(card.availableCents / 100)}</dd>
              </div>
              <div>
                <dt>Pending purchases</dt>
                <dd>{money.format(card.reservedCents / 100)}</dd>
              </div>
              <div>
                <dt>Cleared spending</dt>
                <dd>{money.format(card.clearedCents / 100)}</dd>
              </div>
            </dl>
            {card.settlementPending && (
              <p className="notice" role="status">
                Cleared purchases are waiting for on-chain settlement. Unused funds stay protected
                until settlement completes.
              </p>
            )}
            {!ready && (
              <p className="notice" role="status">
                {closing
                  ? "New purchases are stopped. Pending purchases and settlements must be reconciled before unused funds can return to the sender."
                  : "Your gift is claimed. We’re preparing its card with the same spending budget. Check again shortly."}
              </p>
            )}
            {card.error && (
              <p className="notice" role="status">
                {card.error}
              </p>
            )}
            {ready && !detailsOpen && (
              <button
                type="button"
                className="button dark full"
                disabled={busy}
                onClick={() => void openDetails()}
              >
                {busy ? "Opening card…" : "Open card details"}
              </button>
            )}
            {detailsOpen && (
              <div className={styles.details}>
                <div>
                  <p className="field-label">CARD NUMBER</p>
                  <div id={`${id}-pan`} className={styles.frame} />
                </div>
                <div className={styles.detailRow}>
                  <div>
                    <p className="field-label">EXPIRY</p>
                    <div className={styles.expiry}>
                      <div id={`${id}-month`} className={styles.monthFrame} />
                      <span aria-hidden="true">/</span>
                      <div id={`${id}-year`} className={styles.yearFrame} />
                    </div>
                  </div>
                  <div>
                    <p className="field-label">SECURITY CODE</p>
                    <div id={`${id}-cvv`} className={styles.frame} />
                  </div>
                </div>
                {mounted ? (
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => void toggleDetails()}
                  >
                    {revealed ? "Hide details" : "Show details"}
                  </button>
                ) : (
                  <p className="microcopy" role="status">
                    Opening secure card frames…
                  </p>
                )}
              </div>
            )}
            {ready && (
              <Link href="/shop" className="text-link">
                Try your card in the sandbox shop
              </Link>
            )}
          </>
        ) : !error ? (
          <p role="status">
            Your card will appear here after the gift claim confirms. Its spending limit will match
            your gift.
          </p>
        ) : null}
        {error && !needsPasskey && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="text-link"
          disabled={busy || loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} /> Refresh card status
        </button>
        <p className="microcopy">
          Sandbox purchases only; this card cannot buy real goods. Card details appear in Lithic’s
          secure frames. The sandbox spending budget does not convert your gift’s USDT into dollars.
        </p>
      </div>
    </section>
  );
}
