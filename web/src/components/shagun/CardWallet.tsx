"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CreditCard as CardIcon, Fingerprint, LockKeyhole, RefreshCw, WifiOff } from "lucide-react";
import LithicEmbed, { Environment, type CardEmbed } from "lithic-embed";
import type { GiftCardView } from "@/lib/types";
import { CreditCard } from "@/components/shared-assets/credit-card/credit-card";
import { cardWalletState, hasCardMetadata } from "./cardWalletState";
import styles from "./CardWallet.module.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fieldStyle = {
  color: "#262626",
  "font-size": "17px",
  "font-family": "ui-monospace, monospace",
};
const copy = {
  loading: ["Opening your gift card", "Checking the latest card status…"],
  access: [
    "Your card stays with you.",
    "Use the same passkey you used to claim this gift. The sender cannot open your card details.",
  ],
  error: [
    "Your card could not be checked.",
    "Try refreshing its status. Your gift and card are not changed by this error.",
  ],
  waiting: [
    "Your card is on its way.",
    "Your card appears here after the gift claim confirms. Its spending limit will match your gift.",
  ],
  preparing: [
    "Preparing your virtual card.",
    "Your gift is claimed. We’re setting up its card with the same spending budget. You can leave this page and return with your passkey.",
  ],
  ready: ["Your prepaid gift card.", "A virtual card for the good things you choose."],
  allocated: [
    "Your gift is in use.",
    "There is no available balance for a new purchase. Pending purchases may still clear or release their holds.",
  ],
  spent: [
    "A gift well spent.",
    "Your gift’s full budget has cleared. You can still view the card and follow its receipts.",
  ],
  closing: [
    "Your card is closing.",
    "New purchases have stopped. Pending purchases and settlements must be reconciled before unused funds can return to the sender.",
  ],
  reconciliation: [
    "Your gift is being reconciled.",
    "New purchases are paused while card activity is checked. Unused funds stay protected until the checks and settlements finish.",
  ],
  closed: [
    "Your card is closed.",
    "This card cannot make new purchases. Any unused return is shown separately once its on-chain transaction confirms.",
  ],
} as const;

class CardAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
function accessError(error: unknown) {
  return error instanceof CardAccessError && [401, 403].includes(error.status);
}
async function cardRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new CardAccessError(
      result.error || "Your card could not be opened. Try again.",
      response.status,
    );
  return result as T;
}

type Props = { giftId: string; onAuthenticate: () => Promise<void> };
/** A gift change remounts the wallet so a previous gift's details never carry over. */
export function CardWallet(props: Props) {
  return <RecipientWallet key={props.giftId} {...props} />;
}

function RecipientWallet({ giftId, onAuthenticate }: Props) {
  const [card, setCard] = useState<GiftCardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const [metadataAccess, setMetadataAccess] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailAccess, setDetailAccess] = useState(false);
  const [session, setSession] = useState<{ token: string; expiresAt: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [action, setAction] = useState<"open" | "toggle" | "authenticate" | null>(null);
  const [offline, setOffline] = useState(false);
  const [width, setWidth] = useState(316);
  const preview = useRef<HTMLDivElement>(null);
  const embed = useRef<CardEmbed | null>(null);
  const activeAction = useRef(false);
  const detailGeneration = useRef(0);
  const refreshRequest = useRef<AbortController | null>(null);
  const id = `gift-card-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

  const closeDetails = useCallback(() => {
    detailGeneration.current += 1;
    setSession(null);
    setMounted(false);
    setRevealed(false);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshRequest.current) return false;
    const request = new AbortController();
    refreshRequest.current = request;
    setRefreshing(true);
    try {
      const result = await cardRequest<{ card: GiftCardView | null }>(
        `gifts/${giftId}/card`,
        undefined,
        request.signal,
      );
      if (request.signal.aborted) return false;
      setCard(result.card);
      setMetadataAccess(false);
      setMetadataError("");
      if (result.card?.status !== "ready" || !hasCardMetadata(result.card)) closeDetails();
      return true;
    } catch (failure) {
      if (request.signal.aborted) return false;
      if (accessError(failure)) {
        setMetadataAccess(true);
        setCard(null);
        closeDetails();
      }
      // A temporary polling failure must not tear down a working hosted frame.
      setMetadataError(message(failure, "Your card status could not be refreshed. Try again."));
      return false;
    } finally {
      if (!request.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
      if (refreshRequest.current === request) refreshRequest.current = null;
    }
  }, [giftId, closeDetails]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) void refresh();
    }, 8_000);
    const online = () => {
      setOffline(false);
      void refresh();
    };
    const disconnected = () => setOffline(true);
    const checkConnection = window.setTimeout(() => setOffline(!navigator.onLine), 0);
    window.addEventListener("online", online);
    window.addEventListener("offline", disconnected);
    return () => {
      window.clearTimeout(initial);
      window.clearTimeout(checkConnection);
      window.clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", disconnected);
      refreshRequest.current?.abort();
      refreshRequest.current = null;
    };
  }, [refresh]);

  const metadata = hasCardMetadata(card) && card.status !== "preparing";
  useEffect(() => {
    if (!metadata || !preview.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, Math.min(360, Math.floor(entry.contentRect.width)))),
    );
    observer.observe(preview.current);
    return () => observer.disconnect();
  }, [metadata]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const generation = detailGeneration.current;
    let hosted: CardEmbed | null = null;
    void (async () => {
      try {
        hosted = new LithicEmbed(Environment.SANDBOX).card(session.token, {
          syncStyles: false,
          timeoutMs: 15_000,
        });
        await hosted.mount({
          pan: { selector: `#${id}-pan`, styles: fieldStyle },
          expMonth: { selector: `#${id}-month`, styles: fieldStyle },
          expYear: { selector: `#${id}-year`, styles: fieldStyle },
          cvv: { selector: `#${id}-cvv`, styles: fieldStyle },
        });
        if (cancelled || generation !== detailGeneration.current) return;
        embed.current = hosted;
        setMounted(true);
      } catch (failure) {
        if (cancelled || generation !== detailGeneration.current) return;
        closeDetails();
        setDetailError(
          message(failure, "Secure card details did not load. Open a new session to try again."),
        );
      }
    })();
    const expiry = window.setTimeout(
      () => {
        closeDetails();
        setDetailError("Your secure card session expired. Open card details again to continue.");
      },
      Math.max(0, session.expiresAt - Date.now()),
    );
    return () => {
      cancelled = true;
      window.clearTimeout(expiry);
      if (embed.current === hosted) embed.current = null;
      void hosted?.unmount().catch(() => {});
    };
  }, [session, id, closeDetails]);

  async function openDetails() {
    if (activeAction.current || offline || card?.status !== "ready" || !hasCardMetadata(card))
      return;
    activeAction.current = true;
    setAction("open");
    setDetailError("");
    const generation = ++detailGeneration.current;
    try {
      const result = await cardRequest<{ session: string }>(`gifts/${giftId}/card/embed`, {});
      if (generation !== detailGeneration.current) return;
      if (!result.session || typeof result.session !== "string")
        throw new Error("A secure card session could not be opened. Please try again.");
      setMounted(false);
      setRevealed(false);
      setDetailAccess(false);
      // Hide before the server's five-minute token expires; the timer is disposed on close.
      setSession({ token: result.session, expiresAt: Date.now() + 4 * 60_000 });
    } catch (failure) {
      if (generation !== detailGeneration.current) return;
      closeDetails();
      setDetailAccess(accessError(failure));
      setDetailError(message(failure, "Card details could not be opened. Please try again."));
    } finally {
      activeAction.current = false;
      setAction(null);
    }
  }

  async function confirmRecipient() {
    if (activeAction.current || offline) return;
    activeAction.current = true;
    setAction("authenticate");
    try {
      await onAuthenticate();
      if (await refresh()) {
        setDetailAccess(false);
        setDetailError("");
      }
    } catch (failure) {
      setDetailError(message(failure, "Your passkey was not confirmed. Please try again."));
    } finally {
      activeAction.current = false;
      setAction(null);
    }
  }

  async function toggleDetails() {
    if (!embed.current || activeAction.current || offline) return;
    activeAction.current = true;
    setAction("toggle");
    setDetailError("");
    const generation = detailGeneration.current;
    try {
      const toggled = await embed.current.toggleMasking();
      if (generation === detailGeneration.current) {
        if (toggled) setRevealed((value) => !value);
        else
          setDetailError(
            "The secure frames are not ready to reveal details yet. Try revealing them again.",
          );
      }
    } catch {
      if (generation !== detailGeneration.current) return;
      closeDetails();
      setDetailError("Your secure card session ended. Open card details again to continue.");
    } finally {
      activeAction.current = false;
      setAction(null);
    }
  }

  const state = cardWalletState(card, loading, metadataAccess, metadataError);
  const [heading, description] = copy[state];
  const canOpenDetails = card?.status === "ready" && metadata && !metadataAccess;
  const needsPasskey = metadataAccess || detailAccess;
  const showCard = card && card.status !== "preparing" && metadata && !metadataAccess;
  const pending = state === "loading" || state === "waiting" || state === "preparing";
  return (
    <section
      className={`panel ${styles.wallet}`}
      aria-label="Your Shagun prepaid gift card"
      data-card-state={state}
    >
      <div className={`panel-heading ${styles.heading}`}>
        <h2>{heading}</h2>
        <span className={styles.sandbox}>LITHIC SANDBOX</span>
      </div>
      <div className={`panel-body ${styles.body}`}>
        {state !== "ready" && (
          <p className={styles.description} role={pending ? "status" : undefined}>
            {description}
          </p>
        )}
        {card && !metadataAccess && (
          <dl className={styles.available}>
            <div>
              <dt>Available for purchases</dt>
              <dd>{money.format(card.availableCents / 100)}</dd>
            </div>
          </dl>
        )}
        {offline && (
          <p className={`notice ${styles.inlineNotice}`} role="status">
            <WifiOff size={17} aria-hidden="true" />
            You’re offline. Reconnect to refresh your card or open secure details.
          </p>
        )}
        {showCard && (
          <>
            <div ref={preview} className={styles.preview}>
              <CreditCard
                company="Shagun"
                type="gray-dark"
                masked
                cardNumber={card.lastFour!}
                cardHolder="LITHIC SANDBOX"
                cardExpiration={`${card.expMonth}/${card.expYear!.slice(-2)}`}
                network={card.network}
                width={width}
              />
            </div>
            <div className={styles.cardLabel}>
              <span>
                {card.network || "Virtual card"} ending in {card.lastFour}
              </span>
              <span>
                {state === "ready"
                  ? "Active"
                  : state === "spent"
                    ? "Fully spent"
                    : state === "allocated"
                      ? "No available balance"
                      : state === "reconciliation"
                        ? "Purchases paused"
                        : state === "closed"
                          ? "Closed"
                          : "Closing"}
              </span>
            </div>
          </>
        )}
        {pending && (
          <div className={styles.preparing}>
            <CardIcon size={28} strokeWidth={1.5} aria-hidden="true" />
            <span>
              {state === "loading" ? "Checking card status" : "Your card will appear here"}
            </span>
            {card && <strong>{money.format(card.budgetCents / 100)} gift budget</strong>}
          </div>
        )}
        {card?.settlementPending && (
          <p className="notice" role="status">
            Cleared purchases are waiting for on-chain settlement. Unused funds stay protected until
            settlement completes.
          </p>
        )}
        {card?.error && (
          <p className="notice" role="status">
            {card.error}
          </p>
        )}
        {metadataError && !metadataAccess && (
          <p className="notice error" role="alert">
            {card
              ? "The latest card status could not be refreshed. The last known status is shown. "
              : ""}
            {metadataError}
          </p>
        )}
        {detailError && (
          <p className="notice error" role="alert">
            {detailError}
          </p>
        )}
        {needsPasskey && (
          <div className={styles.access}>
            {!metadataAccess && (
              <p>Confirm your recipient passkey again to open secure card details.</p>
            )}
            <button
              type="button"
              className="button dark full"
              disabled={!!action || offline}
              onClick={() => void confirmRecipient()}
            >
              <Fingerprint size={17} />
              {action === "authenticate" ? "Confirming your passkey…" : "Confirm recipient passkey"}
            </button>
          </div>
        )}
        {canOpenDetails && !session && !needsPasskey && (
          <button
            type="button"
            className="button dark full"
            disabled={!!action || offline}
            onClick={() => void openDetails()}
          >
            <LockKeyhole size={17} />
            {action === "open"
              ? "Opening secure session…"
              : detailError
                ? "Try card details again"
                : "Open secure card details"}
          </button>
        )}
        {session && canOpenDetails && (
          <div className={styles.details} aria-busy={!mounted || action === "toggle"}>
            <div className={styles.detailsHeading}>
              <h3>Secure card details</h3>
              <button type="button" className="text-link" onClick={closeDetails}>
                Close details
              </button>
            </div>
            <p className="microcopy">
              Only Lithic’s secure frames show your full number and security code. Details hide
              automatically after a few minutes.
            </p>
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
                className="button secondary full"
                disabled={!!action || offline}
                onClick={() => void toggleDetails()}
              >
                {action === "toggle"
                  ? revealed
                    ? "Hiding card details…"
                    : "Revealing card details…"
                  : revealed
                    ? "Hide card details"
                    : "Reveal card details"}
              </button>
            ) : (
              <p className="microcopy" role="status">
                Opening secure card frames…
              </p>
            )}
          </div>
        )}
        {state === "ready" && !offline && (
          <Link href="/shop" className={`button secondary full ${styles.shop}`}>
            Try the sandbox shop
          </Link>
        )}
        {card && !metadataAccess && (
          <details className={styles.activity}>
            <summary>
              Budget and activity
              {card.reservedCents > 0 && (
                <span>{money.format(card.reservedCents / 100)} pending</span>
              )}
            </summary>
            <dl className={styles.balances}>
              <div>
                <dt>Gift budget</dt>
                <dd>{money.format(card.budgetCents / 100)}</dd>
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
            <p className="microcopy">
              Pending purchases reduce your available balance until they clear or their holds are
              released.
            </p>
          </details>
        )}
        <button
          type="button"
          className={`text-link ${styles.refresh}`}
          disabled={refreshing || !!action || offline}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {refreshing ? "Refreshing card status…" : "Refresh card status"}
        </button>
        <p className="microcopy">
          Test card for simulated purchases only. No real money moves and USDT is not converted into
          card funds.
        </p>
      </div>
    </section>
  );
}
