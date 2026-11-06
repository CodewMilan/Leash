"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Fingerprint, RefreshCw, ShieldCheck } from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { IDKitRequestWidget, proofOfHuman, type IDKitRequestConfig } from "@worldcoin/idkit";
import { api } from "@/lib/client-api";
import { inr, tokenAmount } from "@/lib/amounts";
import type { GiftView } from "@/lib/types";
import { AppEnvelope } from "./AppEnvelope";
import { ReceiptTimeline, StatusBadge, TestBanner } from "./Shared";

export function Claim({ giftId, receipt = false }: { giftId: string; receipt?: boolean }) {
  const [gift, setGift] = useState<GiftView | null>(null);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [device, setDevice] = useState(false);
  const [name, setName] = useState("");
  const [upi, setUpi] = useState("");
  const [world, setWorld] = useState<{
    challengeId: string;
    config: IDKitRequestConfig & { signal: string };
  } | null>(null);
  const [worldOpen, setWorldOpen] = useState(false);
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
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your device could not be confirmed. Please try again.",
      );
    } finally {
      setBusy("");
    }
  }
  async function startWorld(event: FormEvent) {
    event.preventDefault();
    setBusy("Preparing your verification…");
    setError("");
    try {
      if (!secret) throw new Error("Open the original gift link. Its envelope key is missing.");
      const config = await api<{
        challengeId: string;
        config: IDKitRequestConfig & { signal: string };
      }>(`gifts/${giftId}/world`, {});
      setWorld(config);
      setWorldOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "World verification is unavailable.");
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
                  ? "The unclaimed gift has been returned to its sender."
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
                {inr(gift.paise)} indicative UPI test payout
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
                        <h2>A human moment.</h2>
                        <p>
                          Enter your UPI details, then prove you&apos;re human with World.{" "}
                          {gift.campaign
                            ? "This campaign allows one gift per human."
                            : "This envelope goes to its first verified claimant."}
                        </p>
                        <form className="form-stack" onSubmit={startWorld}>
                          <div>
                            <label className="field-label" htmlFor="recipient-name">
                              YOUR NAME
                            </label>
                            <input
                              className="field-input"
                              id="recipient-name"
                              autoComplete="name"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              required
                              minLength={2}
                              maxLength={80}
                              disabled={!device}
                            />
                          </div>
                          <div>
                            <label className="field-label" htmlFor="upi">
                              YOUR UPI ID
                            </label>
                            <input
                              className="field-input"
                              id="upi"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              autoComplete="off"
                              placeholder="yourname@bank"
                              value={upi}
                              onChange={(e) => setUpi(e.target.value)}
                              required
                              pattern="[a-zA-Z0-9._\-]{2,128}@[a-zA-Z0-9.\-]{2,64}"
                              disabled={!device}
                            />
                          </div>
                          <button
                            type="submit"
                            className="button primary full"
                            disabled={!device || !!busy || !secret}
                          >
                            Verify & claim gift <ArrowUpRight size={18} />
                          </button>
                          <p className="microcopy">
                            RazorpayX test mode. No actual rupees will be sent to this UPI ID.
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
      {world && (
        <IDKitRequestWidget
          key={world.challengeId}
          {...world.config}
          preset={proofOfHuman({ signal: world.config.signal })}
          allow_legacy_proofs={false}
          open={worldOpen}
          onOpenChange={setWorldOpen}
          handleVerify={async (proof) => {
            setBusy("Confirming your claim on Whitechain…");
            try {
              const updated = await api<GiftView>(`gifts/${giftId}/claim`, {
                challengeId: world.challengeId,
                proof,
                secret,
                name,
                upi,
              });
              setGift(updated);
            } finally {
              setBusy("");
            }
          }}
          onSuccess={() => {
            setWorldOpen(false);
            void refresh();
          }}
          onError={() => {
            setError("World verification could not complete. Please try again.");
            setWorldOpen(false);
          }}
        />
      )}
    </main>
  );
}
