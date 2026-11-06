"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Fingerprint, RefreshCw, ShieldCheck } from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { api } from "@/lib/client-api";
import { tokenAmount } from "@/lib/amounts";
import type { GiftView } from "@/lib/types";
import { CardWallet } from "./CardWallet";
import { AppEnvelope } from "./AppEnvelope";
import { ReceiptTimeline, StatusBadge, TestBanner } from "./Shared";

export function Claim({ giftId, receipt = false }: { giftId: string; receipt?: boolean }) {
  const [gift, setGift] = useState<GiftView | null>(null);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [device, setDevice] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(async () => {
    try {
      await api("session", {});
      setGift(await api<GiftView>(`gifts/${giftId}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this envelope.");
    } finally {
      setLoading(false);
    }
  }, [giftId]);
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (/^0x[a-f0-9]{64}$/i.test(fragment)) queueMicrotask(() => setSecret(fragment));
    const kick = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 8_000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(timer);
    };
  }, [refresh]);
  async function confirmDevice(mode: "register" | "login") {
    setBusy("Confirm with your device…");
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
      setDevice(true);
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your device could not be confirmed. Please try again.",
      );
      return false;
    } finally {
      setBusy("");
    }
  }
  async function claim(event: FormEvent) {
    event.preventDefault();
    setBusy("Claiming your gift…");
    setError("");
    try {
      if (!secret) throw new Error("Open the original gift link. Its envelope key is missing.");
      setGift(await api<GiftView>(`gifts/${giftId}/claim`, { secret }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your gift could not be claimed. Try again.");
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const expired = gift ? gift.expiry * 1000 <= now : false;
  const canClaim = gift?.status === "sent" && !gift.claimPending && !expired && !receipt;
  const unavailable = gift && !canClaim && (!gift.canViewReceipt || receipt);
  return (
    <main id="main" className="claim-shell enter">
      <div className="eyebrow">SOMETHING GOOD FOUND ITS WAY TO YOU.</div>
      {loading ? (
        <div className="mt-8" role="status" aria-label="Opening your envelope">
          <div className="loading-block" />
          <div className="loading-block" />
        </div>
      ) : (
        <>
          <div className="claim-title">
            <h1>
              {receipt
                ? "Every step, accounted for."
                : gift?.status === "returned"
                  ? "This gift went back home."
                  : expired && gift?.status === "sent"
                    ? "This envelope has expired."
                    : gift?.canViewReceipt && ["claimed", "settled"].includes(gift.status)
                      ? "A little love, claimed."
                      : "A little something for you."}
            </h1>
            <p>
              {receipt
                ? "Your gift&apos;s verifiable journey."
                : gift?.status === "returned"
                  ? "The remaining gift value has been returned to its sender."
                  : expired && gift?.status === "sent"
                    ? "Its return transaction will appear once confirmed."
                    : "Someone, somewhere, is thinking of you."}
            </p>
          </div>
          {gift && (
            <>
              <div className="claim-art">
                <AppEnvelope amount={tokenAmount(gift.amount, 0)} />
              </div>
              <div className="claim-amount">${tokenAmount(gift.amount)}</div>
              <p className="text-center microcopy mb-6">
                A prepaid gift card in dollars, loaded with exactly this gift
              </p>
              <TestBanner />
              {(gift.status === "pending" || gift.claimPending) && (
                <div className="notice" role="status">
                  {gift.claimPending
                    ? "Your claim is waiting for on-chain confirmation."
                    : "This gift is waiting for on-chain confirmation."}{" "}
                  Please check again shortly.
                </div>
              )}
              {unavailable && (
                <div className="mb-6">
                  <StatusBadge gift={gift} />
                  {!gift.canViewReceipt && ["claimed", "settled"].includes(gift.status) && (
                    <p className="notice mt-4">
                      This envelope has already been claimed. A gift can only be claimed once.
                    </p>
                  )}
                </div>
              )}
              {canClaim && (
                <>
                  <ol className="claim-steps">
                    <li>
                      <span className={`step-number ${device ? "done" : ""}`}>
                        {device ? <Check size={14} /> : "01"}
                      </span>
                      <div className="step-content">
                        <h2>Make it yours.</h2>
                        <p>Confirm with your device. A passkey keeps your claim protected.</p>
                        {device ? (
                          <span className="text-sm flex items-center gap-2">
                            <ShieldCheck size={16} /> Device confirmed
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="button dark small"
                              disabled={!!busy}
                              onClick={() => void confirmDevice("register")}
                            >
                              <Fingerprint size={18} /> Create a passkey
                            </button>
                            <button
                              className="button secondary small"
                              disabled={!!busy}
                              onClick={() => void confirmDevice("login")}
                            >
                              Use existing passkey
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                    <li>
                      <span className="step-number">02</span>
                      <div className="step-content">
                        <h2>Open your gift.</h2>
                        <p>
                          Your gift link and confirmed passkey protect your claim.{" "}
                          {gift.campaign
                            ? "This campaign allows one gift per passkey."
                            : "This envelope goes to the first person who claims it with its original link."}
                        </p>
                        <form className="form-stack" onSubmit={claim}>
                          <button
                            type="submit"
                            className="button primary full"
                            disabled={!device || !!busy || !secret}
                          >
                            Claim gift <ArrowUpRight size={18} />
                          </button>
                          <p className="microcopy">
                            Lithic sandbox. After your claim confirms, your gift becomes a virtual
                            card for simulated purchases.
                          </p>
                        </form>
                      </div>
                    </li>
                  </ol>
                  {!secret && (
                    <p className="notice error">
                      This link is missing its envelope key. Ask the sender for the complete
                      original link.
                    </p>
                  )}
                </>
              )}
              {!receipt &&
                !gift.payoutId &&
                !gift.payoutStatus &&
                (gift.claimPending || ["claimed", "settled", "returned"].includes(gift.status)) && (
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
              {gift.canViewReceipt && (receipt || gift.status !== "sent" || gift.claimPending) && (
                <div className="panel panel-body">
                  <ReceiptTimeline gift={gift} />
                  <p className="receipt-meta mt-6">Gift ID: {gift.id}</p>
                </div>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <div className="notice error mt-4" role="alert">
          {error}
          <button className="text-link mt-2" onClick={() => void refresh()}>
            Try again <RefreshCw size={14} />
          </button>
        </div>
      )}
      {busy && (
        <p className="notice mt-4" role="status">
          {busy}
        </p>
      )}
      <Link href="/dashboard" className="text-link mt-8">
        Send some good wishes yourself <ArrowUpRight size={16} />
      </Link>
    </main>
  );
}
