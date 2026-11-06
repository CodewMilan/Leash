"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { tokenAmount } from "@/lib/amounts";
import {
  DEFAULT_DESIGN,
  designById,
  EXPIRY_OPTIONS,
  GIFT_DESIGNS,
  GIFT_PRESETS,
  giftUnits,
  MESSAGE_MAX,
} from "@/lib/designs";
import { WHITECHAIN_FAUCET } from "@/lib/wallets";
import type { GiftView } from "@/lib/types";
import type { Sender } from "./SenderContext";
import { AppEnvelope } from "./AppEnvelope";
import { sendGift, walletMessage } from "./giftFlow";

export type GiftDraft = ReturnType<typeof useGiftDraft>;

export function useGiftDraft(
  initial: {
    amount?: string | null;
    design?: string | null;
    label?: string | null;
    campaign?: string | null;
  } = {},
) {
  const [amount, setAmount] = useState(() => {
    try {
      if (initial.amount) giftUnits(initial.amount);
      return initial.amount || "25";
    } catch {
      return "25";
    }
  });
  const [design, setDesign] = useState(() => designById(initial.design || DEFAULT_DESIGN).id);
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState(() => (initial.label || "A little Diwali love").slice(0, 80));
  const [expiry, setExpiry] = useState(EXPIRY_OPTIONS[0].seconds);
  const [campaign, setCampaign] = useState(() => (initial.campaign || "").slice(0, 60));
  let amountError = "";
  try {
    giftUnits(amount);
  } catch (e) {
    amountError = e instanceof Error ? e.message : "Enter a valid amount.";
  }
  const display = amountError ? "—" : tokenAmount(giftUnits(amount));
  const compact = amountError ? "—" : tokenAmount(giftUnits(amount), 0);
  return {
    amount,
    setAmount,
    design,
    setDesign,
    message,
    setMessage,
    label,
    setLabel,
    expiry,
    setExpiry,
    campaign,
    setCampaign,
    amountError,
    display,
    compact,
  };
}

export function GiftComposer({
  sender,
  from,
  balance,
  draft,
  ready,
  campaignLocked = false,
  showPreview = false,
  onSent,
}: {
  sender: Sender;
  from: string | null;
  balance: string | null;
  draft: GiftDraft;
  ready: boolean;
  campaignLocked?: boolean;
  showPreview?: boolean;
  onSent: (gift: GiftView) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const signedIn = !!from && from === sender.account;
  const design = designById(draft.design);
  const short = balance !== null && !draft.amountError && BigInt(balance) < giftUnits(draft.amount);
  const expiryLabel = EXPIRY_OPTIONS.find((o) => o.seconds === draft.expiry)?.label || "";

  function review(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (draft.amountError) return setError(draft.amountError);
    if (short) return setError("Your wallet needs more test USDT before you can send this gift.");
    setReviewing(true);
  }
  async function send() {
    setError("");
    try {
      if (!from) throw new Error("Connect and confirm your wallet first.");
      const gift = await sendGift(
        sender,
        {
          from,
          amount: draft.amount,
          design: draft.design,
          message: draft.message,
          label: draft.label,
          expirySeconds: draft.expiry,
          campaign: draft.campaign,
          balance,
        },
        setBusy,
      );
      setReviewing(false);
      onSent(gift);
    } catch (e) {
      setError(walletMessage(e, "Your gift could not be submitted."));
    } finally {
      setBusy("");
    }
  }

  if (reviewing)
    return (
      <div className="panel-body form-stack" aria-busy={!!busy}>
        {showPreview && (
          <AppEnvelope amount={draft.compact} design={draft.design} note={draft.message} />
        )}
        <div>
          <p className="field-label">REVIEW YOUR GIFT</p>
          <dl className="review-list">
            <div>
              <dt>Card</dt>
              <dd>{design.name}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd className="mono">${draft.display} USDT</dd>
            </div>
            <div>
              <dt>Recipient gets</dt>
              <dd className="mono">${draft.display} to spend</dd>
            </div>
            <div>
              <dt>Network fee for you</dt>
              <dd className="mono">$0.00</dd>
            </div>
            <div>
              <dt>Claim within</dt>
              <dd>{expiryLabel}</dd>
            </div>
            {draft.campaign.trim() && (
              <div>
                <dt>Campaign</dt>
                <dd>{draft.campaign.trim()}</dd>
              </div>
            )}
            <div>
              <dt>From</dt>
              <dd className="mono">{from ? `${from.slice(0, 6)}…${from.slice(-4)}` : "—"}</dd>
            </div>
          </dl>
          {draft.message.trim() && <p className="review-note">“{draft.message.trim()}”</p>}
        </div>
        <p className="microcopy">
          Your wallet asks you to approve a USDT authorization. Shagun&apos;s relayer pays the
          Whitechain gas. If nobody claims the gift in time, the full amount returns to this wallet.
        </p>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className="button secondary"
            onClick={() => setReviewing(false)}
            disabled={!!busy}
          >
            <ArrowLeft size={18} /> Edit
          </button>
          <button type="button" className="button primary flex-1" onClick={send} disabled={!!busy}>
            {busy || `Approve in ${sender.wallet?.label || "your wallet"}`}
            <ArrowUpRight size={20} />
          </button>
        </div>
        {busy && (
          <p role="status" className="microcopy">
            {busy} Keep this tab open.
          </p>
        )}
      </div>
    );

  return (
    <form className="panel-body form-stack" onSubmit={review}>
      {showPreview && (
        <AppEnvelope amount={draft.compact} design={draft.design} note={draft.message} />
      )}
      <fieldset>
        <legend className="field-label">CHOOSE A CARD</legend>
        <div className="design-picker" role="radiogroup" aria-label="Gift card design">
          {GIFT_DESIGNS.map((d) => (
            <button
              type="button"
              key={d.id}
              role="radio"
              aria-checked={d.id === draft.design}
              onClick={() => draft.setDesign(d.id)}
            >
              <span className={`design-swatch ${d.tone}`} aria-hidden="true" />
              {d.name}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="field-label" htmlFor="gift-amount">
          GIFT AMOUNT · USDT
        </label>
        <input
          className="field-input large"
          id="gift-amount"
          inputMode="decimal"
          value={draft.amount}
          onChange={(e) => draft.setAmount(e.target.value)}
          aria-invalid={!!draft.amountError}
          aria-describedby="gift-amount-hint"
          required
          maxLength={10}
        />
        <div className="amount-presets mt-3">
          {GIFT_PRESETS.map((v) => (
            <button
              type="button"
              key={v}
              aria-pressed={v === draft.amount}
              onClick={() => draft.setAmount(v)}
            >
              ${v}
            </button>
          ))}
        </div>
        <p className="field-hint" id="gift-amount-hint">
          {draft.amountError ||
            (signedIn
              ? `Wallet balance $${tokenAmount(balance)} · $1 to $1,000 per gift`
              : "$1 to $1,000 per gift")}
        </p>
        {signedIn && balance === "0" && (
          <p className="microcopy">
            This wallet holds no official test USDT yet ·{" "}
            <a href={WHITECHAIN_FAUCET} target="_blank" rel="noreferrer">
              Whitechain testnet faucet
            </a>{" "}
            (gas only)
          </p>
        )}
      </div>
      <div>
        <label className="field-label" htmlFor="gift-message">
          A NOTE FOR THEM · OPTIONAL
        </label>
        <textarea
          className="field-input"
          id="gift-message"
          rows={2}
          placeholder={design.greeting}
          value={draft.message}
          onChange={(e) => draft.setMessage(e.target.value.slice(0, MESSAGE_MAX))}
          maxLength={MESSAGE_MAX}
        />
        <p className="field-hint">
          {draft.message.length}/{MESSAGE_MAX} · Sealed with the envelope link; only its holder can
          read it.
        </p>
      </div>
      <div className="field-row">
        <div>
          <label className="field-label" htmlFor="gift-label">
            FOR YOUR RECORDS
          </label>
          <input
            className="field-input"
            id="gift-label"
            value={draft.label}
            onChange={(e) => draft.setLabel(e.target.value)}
            required
            maxLength={80}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="gift-expiry">
            CLAIM WITHIN
          </label>
          <select
            className="field-input"
            id="gift-expiry"
            value={draft.expiry}
            onChange={(e) => draft.setExpiry(Number(e.target.value))}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.seconds} value={o.seconds}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {campaignLocked ? (
        draft.campaign && (
          <p className="microcopy">Campaign · {draft.campaign} · one gift per verified human</p>
        )
      ) : (
        <div>
          <label className="field-label" htmlFor="gift-campaign">
            COMPANY CAMPAIGN · OPTIONAL
          </label>
          <input
            className="field-input"
            id="gift-campaign"
            placeholder="e.g. diwali-2026"
            value={draft.campaign}
            onChange={(e) => draft.setCampaign(e.target.value)}
            maxLength={60}
            autoComplete="off"
          />
          <p className="field-hint">
            Use the same name across envelopes to allow one gift per verified human.
          </p>
        </div>
      )}
      <div className="quote">
        <div>
          <p>Recipient gets</p>
          <strong className="mono">${draft.display}</strong>
        </div>
        <div>
          <p>Network fee for you</p>
          <strong className="mono">$0.00</strong>
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <button
        className="button primary full"
        type="submit"
        disabled={!signedIn || !ready || !!draft.amountError}
      >
        Review gift
        <ArrowUpRight size={20} />
      </button>
    </form>
  );
}
