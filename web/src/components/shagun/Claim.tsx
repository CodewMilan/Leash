"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Fingerprint, RefreshCw, ShieldCheck } from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { api } from "@/lib/client-api";
import { tokenAmount } from "@/lib/amounts";
import { designById } from "@/lib/designs";
import { openMessage } from "@/lib/giftMessage";
import type { GiftView } from "@/lib/types";
import { CardWallet } from "./CardWallet";
import { AppEnvelope } from "./AppEnvelope";
import { ReceiptTimeline, StatusBadge, TestBanner } from "./Shared";
import styles from "./Claim.module.css";

export function Claim(props: { giftId: string; receipt?: boolean }) {
  return <RecipientClaim key={`${props.giftId}:${!!props.receipt}`} {...props} />;
}

function RecipientClaim({ giftId, receipt = false }: { giftId: string; receipt?: boolean }) {
  const [gift, setGift] = useState<GiftView | null>(null);
  const [secret, setSecret] = useState("");
  const [openedNote, setOpenedNote] = useState<{
    secret: string;
    sealed: string;
    text: string | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [device, setDevice] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const action = useRef(false);
  const fetching = useRef(false);
  const revision = useRef(0);
  const mounted = useRef(false);
  const claimHeading = useRef<HTMLHeadingElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    const currentRevision = revision.current;
    try {
      await api("session", {});
      const next = await api<GiftView>(`gifts/${giftId}`);
      if (mounted.current && currentRevision === revision.current) {
        setGift(next);
        setFetchError("");
      }
    } catch (e) {
      if (mounted.current)
        setFetchError(e instanceof Error ? e.message : "Could not open this envelope.");
    } finally {
      fetching.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [giftId]);
  useEffect(() => {
    mounted.current = true;
    const readLink = () => {
      const fragment = window.location.hash.slice(1);
      setSecret(!receipt && /^0x[a-f0-9]{64}$/i.test(fragment) ? fragment : "");
    };
    const kick = window.setTimeout(() => {
      readLink();
      void refresh();
    }, 0);
    window.addEventListener("hashchange", readLink);
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (!document.hidden && !action.current) void refresh();
    }, 8_000);
    return () => {
      mounted.current = false;
      window.removeEventListener("hashchange", readLink);
      window.clearTimeout(kick);
      window.clearInterval(timer);
    };
  }, [refresh, receipt]);
  useEffect(() => {
    let active = true;
    if (secret && gift?.sealedMessage && !receipt) {
      void openMessage(secret, gift.sealedMessage).then((value) => {
        if (active) setOpenedNote({ secret, sealed: gift.sealedMessage!, text: value });
      });
    } else
      queueMicrotask(() => {
        if (active) setOpenedNote(null);
      });
    return () => {
      active = false;
    };
  }, [secret, gift?.sealedMessage, receipt]);
  useEffect(() => {
    if (device) claimHeading.current?.focus();
  }, [device]);
  useEffect(() => {
    if (error) errorBox.current?.focus();
  }, [error]);

  async function confirmDevice(mode: "register" | "login") {
    if (action.current) return false;
    action.current = true;
    revision.current++;
    setBusy(
      mode === "register"
        ? "Create your passkey in the device prompt…"
        : "Confirm your passkey in the device prompt…",
    );
    setError("");
    try {
      const options = await api<{
        challengeId: string;
        options: PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON;
      }>("auth/passkey/options", { mode });
      const response =
        mode === "register"
          ? await startRegistration({
              optionsJSON: options.options as PublicKeyCredentialCreationOptionsJSON,
            })
          : await startAuthentication({
              optionsJSON: options.options as PublicKeyCredentialRequestOptionsJSON,
            });
      await api("auth/passkey/verify", { mode, challengeId: options.challengeId, response });
      if (mounted.current) setDevice(true);
      return true;
    } catch (e) {
      const cancelled = e instanceof Error && ["NotAllowedError", "AbortError"].includes(e.name);
      if (mounted.current)
        setError(
          cancelled
            ? "Passkey confirmation was cancelled or timed out. Try again, or use an existing passkey."
            : e instanceof Error
              ? e.message
              : "Your passkey could not be confirmed. Please try again.",
        );
      return false;
    } finally {
      action.current = false;
      if (mounted.current) setBusy("");
    }
  }
  async function claim(event: FormEvent) {
    event.preventDefault();
    if (
      action.current ||
      !device ||
      !secret ||
      !gift ||
      gift.status !== "sent" ||
      gift.claimPending ||
      gift.expiry * 1000 <= Date.now()
    )
      return;
    action.current = true;
    revision.current++;
    setBusy("Submitting your claim…");
    setError("");
    try {
      const next = await api<GiftView>(`gifts/${giftId}/claim`, { secret });
      if (mounted.current) setGift(next);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Your gift could not be claimed. Try again.");
    } finally {
      action.current = false;
      if (mounted.current) setBusy("");
    }
  }
  const expired = gift ? gift.expiry * 1000 <= now : false;
  const canClaim = gift?.status === "sent" && !gift.claimPending && !expired && !receipt;
  const claimed = !!gift && (!!gift.claimTx || ["claimed", "settled"].includes(gift.status));
  const hasCard = !receipt && claimed && !gift?.payoutId && !gift?.payoutStatus;
  const design = designById(gift?.design);
  const note =
    openedNote?.secret === secret && openedNote?.sealed === gift?.sealedMessage
      ? openedNote?.text
      : null;
  const errorNotice = error && (
    <div ref={errorBox} tabIndex={-1} className="notice error" role="alert">
      {error}
    </div>
  );
  return (
    <main id="main" className="claim-shell enter">
      {loading ? (
        <div className="mt-8" role="status" aria-label="Opening your envelope">
          <p>Opening your gift…</p>
          <div className="loading-block" />
          <div className="loading-block" />
        </div>
      ) : !gift ? (
        <div className={styles.empty}>
          <h1>We couldn’t open this gift.</h1>
          <p>Check that you opened the complete link from the sender, then try again.</p>
        </div>
      ) : (
        <>
          {hasCard && (
            <CardWallet
              giftId={giftId}
              onAuthenticate={async () => {
                if (!(await confirmDevice("login")))
                  throw new Error(
                    "Your passkey could not be confirmed. Try opening your card again.",
                  );
                await refresh();
              }}
            />
          )}
          <div className="claim-title">
            <h1>
              {receipt
                ? "Every step, accounted for."
                : gift.status === "returned"
                  ? "This gift went back home."
                  : expired && gift.status === "sent"
                    ? "This envelope has expired."
                    : gift.claimPending
                      ? "Your gift is being claimed."
                      : claimed && gift.canViewReceipt
                        ? "A little love, claimed."
                        : "A little something for you."}
            </h1>
            <p>
              {receipt
                ? "Your gift’s journey, from funding to spending."
                : gift.status === "returned"
                  ? "The remaining gift value has been returned to its sender."
                  : expired && gift.status === "sent"
                    ? "Its return transaction will appear once confirmed."
                    : gift.claimPending
                      ? "We’ll update this page when your claim confirms."
                      : claimed
                        ? "Your card and its latest balance are above."
                        : "Someone, somewhere, is thinking of you."}
            </p>
          </div>
          {!receipt && !claimed && !gift.claimPending && gift.status !== "returned" && (
            <div className="claim-art">
              <AppEnvelope
                amount={tokenAmount(gift.amount)}
                design={gift.design}
                note={note || undefined}
              />
            </div>
          )}
          <div className={styles.summary}>
            <div className="claim-amount">${tokenAmount(gift.amount)}</div>
            <p className="microcopy">
              {claimed
                ? "Original gift budget"
                : "A prepaid gift card in dollars, loaded with exactly this gift"}
            </p>
          </div>
          {note && !receipt && (
            <blockquote className={styles.note}>
              <p>{note}</p>
              <footer>A note just for you</footer>
            </blockquote>
          )}
          {!note && !receipt && !claimed && <p className={styles.greeting}>{design.greeting}</p>}
          <TestBanner />
          {receipt && gift.status === "sent" && !gift.claimPending && (
            <div className="notice mb-6">
              <strong>This is a receipt, not a claim link.</strong>
              <p>
                To claim this gift, open the private link shared by the sender. If you sent it, open
                your dashboard and choose “Share gift”. No password needs to be set.
              </p>
              <Link href="/dashboard" className="text-link mt-2">
                Find the private claim link <ArrowUpRight size={16} />
              </Link>
            </div>
          )}
          {(gift.status === "pending" || gift.claimPending) && (
            <section className={styles.waiting} aria-label="Gift confirmation" role="status">
              <RefreshCw size={22} />
              <h2>{gift.claimPending ? "Confirming your claim" : "Your gift is being secured"}</h2>
              <p>
                {gift.claimPending
                  ? "Your claim was submitted. Once it confirms, we’ll prepare your virtual card here. You don’t need to claim again."
                  : "The sender’s gift is waiting for confirmation. You can claim it once it’s ready."}
              </p>
              <button className="button secondary small" onClick={() => void refresh()}>
                Check status <RefreshCw size={16} />
              </button>
            </section>
          )}
          {gift.status === "failed" && (
            <div className="notice mb-6">
              <strong>This gift couldn’t be completed.</strong>
              <p>
                Ask the sender to check its status in their dashboard before sharing a new gift
                link.
              </p>
            </div>
          )}
          {canClaim &&
            (secret ? (
              <section className={styles.flow} aria-label="Claim your gift" aria-busy={!!busy}>
                <ol className={styles.progress} aria-label="Claim progress">
                  {["Passkey", "Claim gift", "Your card"].map((label, index) => (
                    <li key={label} aria-current={index === (device ? 1 : 0) ? "step" : undefined}>
                      <span className={`step-number ${index === 0 && device ? "done" : ""}`}>
                        {index === 0 && device ? <Check size={14} /> : index + 1}
                      </span>
                      {label}
                    </li>
                  ))}
                </ol>
                {device ? (
                  <>
                    <p className={styles.confirmed}>
                      <ShieldCheck size={18} /> Passkey confirmed
                    </p>
                    <h2 ref={claimHeading} tabIndex={-1}>
                      Ready to make it yours?
                    </h2>
                    <p>
                      Claim your ${tokenAmount(gift.amount)} gift. After confirmation, we’ll prepare
                      a virtual card with the same spending budget.
                    </p>
                    <form onSubmit={claim}>
                      <button className="button primary full" disabled={!!busy} type="submit">
                        {busy ? "Submitting your claim…" : "Claim gift"}
                        <ArrowUpRight size={18} />
                      </button>
                    </form>
                    <p className="microcopy">
                      Keep this link. Use the same passkey to open your card later.
                    </p>
                  </>
                ) : (
                  <>
                    <h2>First, protect your gift.</h2>
                    <p>
                      Create a passkey with your fingerprint, face, or device PIN. You’ll use it to
                      open your card again. No wallet or password needed.
                    </p>
                    <button
                      className="button primary full"
                      disabled={!!busy}
                      onClick={() => void confirmDevice("register")}
                    >
                      <Fingerprint size={18} />
                      {busy ? "Waiting for your device…" : "Create a passkey"}
                    </button>
                    <button
                      className="text-link"
                      disabled={!!busy}
                      onClick={() => void confirmDevice("login")}
                    >
                      Already have a passkey? Use it
                    </button>
                    <p className="microcopy">
                      Your passkey protects card access. Your device handles the confirmation.
                    </p>
                  </>
                )}
                <p className={styles.deadline}>
                  Claim by{" "}
                  {new Date(gift.expiry * 1000).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  .{" "}
                  {gift.campaign
                    ? "One gift per passkey for this campaign."
                    : "The first person with this private link and a confirmed passkey can claim it."}
                </p>
                {errorNotice}
                {error && device && (
                  <button
                    className="text-link"
                    disabled={!!busy}
                    onClick={() => void confirmDevice("login")}
                  >
                    Confirm passkey again
                  </button>
                )}
                {busy && (
                  <p className="notice" role="status">
                    {busy}
                  </p>
                )}
              </section>
            ) : (
              <section className={styles.waiting} aria-label="Incomplete gift link">
                <h2>Ask for the complete gift link.</h2>
                <p>
                  This link is missing its private key. Ask the sender to choose “Copy claim link”
                  in their dashboard and send you that full link.
                </p>
                <p>
                  No password needs to be set or entered. The complete link includes everything
                  needed to begin.
                </p>
              </section>
            ))}
          {!canClaim && !receipt && !gift.claimPending && gift.status !== "pending" && (
            <div className="mb-6">
              {!hasCard && <StatusBadge gift={gift} />}
              {!gift.canViewReceipt && claimed && (
                <p className="notice mt-4">
                  This envelope has already been claimed. A gift can only be claimed once. If you
                  claimed it, use your original passkey below to access the card.
                </p>
              )}
            </div>
          )}
          {hasCard && (
            <p className="microcopy mt-4">
              Keep this page or save it as a bookmark. Use the passkey you claimed with whenever you
              return to your card.
            </p>
          )}
          {!canClaim && errorNotice}
          {!canClaim && busy && (
            <p className="notice mt-4" role="status">
              {busy}
            </p>
          )}
          {gift.canViewReceipt &&
            (receipt ? (
              <div className="panel panel-body">
                <ReceiptTimeline gift={gift} />
                <p className="receipt-meta mt-6">Gift ID: {gift.id}</p>
              </div>
            ) : (
              <details className={styles.journey}>
                <summary>Follow your gift’s journey</summary>
                <ReceiptTimeline gift={gift} />
                <p className="receipt-meta mt-6">Gift ID: {gift.id}</p>
              </details>
            ))}
        </>
      )}
      {fetchError && (
        <div className="notice error mt-4" role="alert">
          <strong>{gift ? "Latest status unavailable" : "Gift unavailable"}</strong>
          <p>{fetchError}</p>
          <button className="text-link mt-2" onClick={() => void refresh()}>
            Try again <RefreshCw size={14} />
          </button>
        </div>
      )}
      <Link href="/dashboard" className="text-link mt-8">
        Send some good wishes yourself <ArrowUpRight size={16} />
      </Link>
    </main>
  );
}
