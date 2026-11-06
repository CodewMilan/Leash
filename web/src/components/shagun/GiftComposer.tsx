"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, Check, ChevronDown } from "lucide-react";
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
import styles from "./GiftComposer.module.css";

export type GiftDraft = ReturnType<typeof useGiftDraft>;

export function useGiftDraft(
  initial: {
    amount?: string | null;
    design?: string | null;
    message?: string | null;
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
  const [message, setMessage] = useState(() => (initial.message || "").slice(0, MESSAGE_MAX));
  const [label, setLabel] = useState(() => (initial.label || "").slice(0, 80));
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
  onRefreshBalance,
  onSent,
}: {
  sender: Sender;
  from: string | null;
  balance: string | null;
  draft: GiftDraft;
  ready: boolean;
  campaignLocked?: boolean;
  showPreview?: boolean;
  onRefreshBalance?: () => void;
  onSent: (gift: GiftView) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [amountEditing, setAmountEditing] = useState(false);
  const [labelTouched, setLabelTouched] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const inFlight = useRef(false);
  const submitted = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const errorPanel = useRef<HTMLDivElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const labelInput = useRef<HTMLInputElement>(null);
  const expiryInput = useRef<HTMLSelectElement>(null);
  const signedIn = !!from && from === sender.account;
  const design = designById(draft.design);
  const short =
    signedIn && balance !== null && !draft.amountError && BigInt(balance) < giftUnits(draft.amount);
  const expiryLabel = EXPIRY_OPTIONS.find((o) => o.seconds === draft.expiry)?.label || "";
  const amountIssue = !draft.amount.trim()
    ? "Enter a gift amount."
    : draft.amountError
      ? "Choose $0.50 to $1,000, using no more than two decimal places."
      : short
        ? "Your wallet needs more official test USDT for this amount."
        : "";
  const labelIssue =
    draft.label.length > 80
      ? "Keep your private label to 80 characters."
      : draft.label.length > 0 && !draft.label.trim()
        ? "Enter a private label, or leave it empty to use the gift design’s name."
        : "";
  const expiryIssue = expiryLabel ? "" : "Choose one of the available claim windows.";
  const campaignIssue =
    draft.campaign.length > 60 ? "Keep the campaign name to 60 characters." : "";
  const messageIssue =
    draft.message.length > MESSAGE_MAX ? `Keep your note to ${MESSAGE_MAX} characters.` : "";
  const showAmountIssue = amountTouched && !amountEditing && !!amountIssue;
  const recordLabel = draft.label.trim() || `${design.name} gift`;
  const progressStep = busy ? 2 : reviewing ? 1 : 0;

  useEffect(() => {
    if (reviewing) reviewHeading.current?.focus();
  }, [reviewing]);
  useEffect(() => {
    if (error) errorPanel.current?.focus();
  }, [error]);

  function validate() {
    setAmountTouched(true);
    setAmountEditing(false);
    setLabelTouched(true);
    if (amountIssue) {
      setError(amountIssue);
      return false;
    }
    if (labelIssue || campaignIssue) {
      setDetailsOpen(true);
      setError(labelIssue || campaignIssue);
      window.requestAnimationFrame(() => labelInput.current?.focus());
      return false;
    }
    if (expiryIssue) {
      setError(expiryIssue);
      expiryInput.current?.focus();
      return false;
    }
    if (messageIssue) {
      setError(messageIssue);
      return false;
    }
    return true;
  }
  async function connect() {
    if (inFlight.current || submitted.current) return;
    const walletId = sender.wallet?.id || sender.wallets[0]?.id;
    if (!walletId) {
      setError("No supported wallet is available. Reload this page to try again.");
      return;
    }
    inFlight.current = true;
    setError("");
    setBusy("Connect and sign in with your wallet…");
    try {
      await sender.connect(walletId);
    } catch (e) {
      setError(walletMessage(e, "Your wallet could not sign you in."));
    } finally {
      inFlight.current = false;
      setBusy("");
    }
  }
  function review(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || submitted.current) return;
    setError("");
    if (!validate()) return;
    setReviewing(true);
  }
  function edit() {
    if (inFlight.current || submitted.current) return;
    setError("");
    setReviewing(false);
    window.requestAnimationFrame(() => amountInput.current?.focus());
  }
  async function send() {
    if (inFlight.current || submitted.current) return;
    setError("");
    if (!validate()) return;
    inFlight.current = true;
    setBusy("Preparing your gift…");
    try {
      if (!signedIn || !from) throw new Error("Connect and confirm your wallet first.");
      if (balance === null)
        throw new Error("Check your wallet balance before approving this gift.");
      if (!ready)
        throw new Error(
          "Sending is temporarily unavailable. Your draft is kept here; try again once the service is ready.",
        );
      const gift = await sendGift(
        sender,
        {
          from,
          amount: draft.amount.trim(),
          design: draft.design,
          message: draft.message,
          label: recordLabel,
          expirySeconds: draft.expiry,
          campaign: draft.campaign,
          balance,
        },
        setBusy,
      );
      submitted.current = true;
      setBusy("Gift submitted. Opening sharing…");
      onSent(gift);
    } catch (e) {
      setError(walletMessage(e, "Your gift could not be submitted."));
    } finally {
      if (!submitted.current) {
        inFlight.current = false;
        setBusy("");
      }
    }
  }

  const progress = (
    <ol className={styles.progress} aria-label="Gift progress">
      {["Details", "Review", "Wallet", "Share"].map((step, index) => (
        <li
          key={step}
          aria-current={index === progressStep ? "step" : undefined}
          className={index <= progressStep ? styles.currentStep : ""}
        >
          <span aria-hidden="true">{index < progressStep ? <Check size={12} /> : index + 1}</span>
          {index === 0 && reviewing ? (
            <button type="button" disabled={!!busy} onClick={edit}>
              {step}
            </button>
          ) : (
            step
          )}
        </li>
      ))}
    </ol>
  );
  const errorMessage = error && (
    <div className="notice error" role="alert" tabIndex={-1} ref={errorPanel}>
      {error}
    </div>
  );

  if (reviewing)
    return (
      <section
        className={`panel-body form-stack ${styles.composer}`}
        aria-busy={!!busy}
        aria-label="Review your gift"
      >
        {progress}
        {showPreview && (
          <AppEnvelope amount={draft.compact} design={draft.design} note={draft.message} />
        )}
        <div>
          <h3 className={styles.reviewHeading} tabIndex={-1} ref={reviewHeading}>
            Review your gift.
          </h3>
          <p className={styles.intro}>
            Check the amount and greeting. You can edit anything before your wallet approval.
          </p>
          <dl className="review-list">
            <div>
              <dt>Envelope design</dt>
              <dd>{design.name}</dd>
            </div>
            <div>
              <dt>Gift amount</dt>
              <dd className="mono">${draft.display} test USDT</dd>
            </div>
            <div>
              <dt>Sandbox card budget</dt>
              <dd className="mono">${draft.display}</dd>
            </div>
            <div>
              <dt>Network fee for you</dt>
              <dd className="mono">$0.00</dd>
            </div>
            <div>
              <dt>Claim within</dt>
              <dd>{expiryLabel}</dd>
            </div>
            <div>
              <dt>Private label</dt>
              <dd>{recordLabel}</dd>
            </div>
            {draft.campaign.trim() && (
              <div>
                <dt>Campaign</dt>
                <dd>{draft.campaign.trim()}</dd>
              </div>
            )}
            <div>
              <dt>From</dt>
              <dd className="mono">
                {signedIn && from
                  ? `${from.slice(0, 6)}…${from.slice(-4)}`
                  : "Connect your wallet next"}
              </dd>
            </div>
          </dl>
          {draft.message.trim() && <p className="review-note">“{draft.message.trim()}”</p>}
        </div>
        <p className="microcopy">
          The envelope design is the recipient’s greeting. Their payment card is issued separately
          after they claim the gift.
        </p>
        <div className={styles.approvalNote}>
          <h4>
            {busy
              ? "Continue in your wallet."
              : signedIn
                ? "Next: approve this gift."
                : "Next: connect your wallet."}
          </h4>
          <p>
            {signedIn
              ? "Your wallet asks for a USDT authorization. Chinki pays the network fee. After the transaction confirms, you’ll get a private link to share."
              : "Sign in with MetaMask, then approve the gift. No network fee is charged to your wallet."}
          </p>
          <p>
            If nobody claims it before the deadline, the full gift returns after its return
            transaction confirms.
          </p>
        </div>
        {errorMessage}
        {signedIn && !ready && (
          <p className="notice" role="status">
            Sending is temporarily unavailable while the gift service is configured. Your draft is
            kept here.
          </p>
        )}
        {signedIn && (balance === null || short) && (
          <div className="notice" role="status">
            <p>
              {balance === null
                ? "Your wallet balance isn’t available yet. Check it before approving this gift."
                : "Your wallet needs more official test USDT for this gift. Add funds, then check the balance again."}
            </p>
            {onRefreshBalance && (
              <button
                type="button"
                className="text-link mt-2"
                disabled={!!busy}
                onClick={onRefreshBalance}
              >
                Check wallet balance
              </button>
            )}
          </div>
        )}
        <fieldset className={styles.actions} disabled={!!busy}>
          <legend className="sr-only">Gift review actions</legend>
          <button type="button" className="button secondary" onClick={edit}>
            <ArrowLeft size={18} /> Edit gift
          </button>
          {signedIn ? (
            <button
              type="button"
              className="button primary flex-1"
              onClick={() => void send()}
              disabled={!ready || balance === null || !!short || !!draft.amountError}
            >
              {busy ? "Waiting for wallet…" : `Approve in ${sender.wallet?.label || "your wallet"}`}
              <ArrowUpRight size={20} />
            </button>
          ) : sender.ready && !sender.installed ? (
            <a
              className="button primary flex-1"
              href={sender.wallets[0]?.installUrl}
              target="_blank"
              rel="noreferrer"
            >
              Install MetaMask to send
              <ArrowUpRight size={20} />
            </a>
          ) : (
            <button
              type="button"
              className="button primary flex-1"
              onClick={() => void connect()}
              disabled={!sender.ready || !sender.configured}
            >
              {busy
                ? "Waiting for wallet…"
                : from && sender.account
                  ? "Sign in with this account"
                  : `Connect ${sender.wallet?.label || sender.wallets[0]?.label || "your wallet"}`}
              <ArrowUpRight size={20} />
            </button>
          )}
        </fieldset>
        {busy && (
          <p role="status" className="notice">
            {busy} Keep this tab open. Your draft stays here if you cancel.
          </p>
        )}
      </section>
    );

  return (
    <form
      className={`panel-body form-stack ${styles.composer}`}
      onSubmit={review}
      noValidate
      aria-busy={!!busy}
    >
      {progress}
      {showPreview && (
        <AppEnvelope amount={draft.compact} design={draft.design} note={draft.message} />
      )}
      <fieldset className={styles.fields} disabled={!!busy}>
        <legend className="sr-only">Gift details</legend>
        <fieldset>
          <legend className="field-label">CHOOSE AN ENVELOPE DESIGN</legend>
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
          <p className="field-hint">
            This sets the gift’s greeting, not the payment card’s appearance.
          </p>
        </fieldset>
        <div>
          <label className="field-label" htmlFor="gift-amount">
            GIFT AMOUNT · USDT
          </label>
          <input
            ref={amountInput}
            className="field-input large"
            id="gift-amount"
            inputMode="decimal"
            autoComplete="off"
            value={draft.amount}
            onFocus={() => setAmountEditing(true)}
            onBlur={() => {
              setAmountEditing(false);
              setAmountTouched(true);
            }}
            onChange={(e) => {
              draft.setAmount(e.target.value);
              setError("");
            }}
            aria-invalid={showAmountIssue}
            aria-describedby={`gift-amount-hint${showAmountIssue ? " gift-amount-error" : ""}`}
            required
            maxLength={10}
          />
          <div className="amount-presets mt-3">
            {GIFT_PRESETS.map((v) => (
              <button
                type="button"
                key={v}
                aria-pressed={v === draft.amount}
                onClick={() => {
                  draft.setAmount(v);
                  setAmountTouched(false);
                  setError("");
                }}
              >
                ${v}
              </button>
            ))}
          </div>
          <p className="field-hint" id="gift-amount-hint">
            {signedIn && balance !== null ? `Wallet balance $${tokenAmount(balance)} · ` : ""}$0.50
            to $1,000 per gift · up to 2 decimal places
          </p>
          {showAmountIssue && (
            <p className={styles.fieldError} id="gift-amount-error">
              {amountIssue}
            </p>
          )}
          {signedIn && balance === "0" && (
            <p className="microcopy">
              This wallet holds no official test USDT yet. The{" "}
              <a href={WHITECHAIN_FAUCET} target="_blank" rel="noreferrer">
                Whitechain testnet faucet
              </a>{" "}
              provides gas tokens; use an official test USDT source to fund your gift.
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
            rows={3}
            placeholder={design.greeting}
            value={draft.message}
            onChange={(e) => draft.setMessage(e.target.value.slice(0, MESSAGE_MAX))}
            maxLength={MESSAGE_MAX}
            aria-describedby="gift-message-hint"
          />
          <p className="field-hint" id="gift-message-hint">
            {draft.message.length}/{MESSAGE_MAX} · Sealed with the envelope link; only its holder
            can read it.
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor="gift-expiry">
            CLAIM WITHIN
          </label>
          <select
            ref={expiryInput}
            className="field-input"
            id="gift-expiry"
            value={draft.expiry}
            onChange={(e) => {
              draft.setExpiry(Number(e.target.value));
              setError("");
            }}
            aria-invalid={!!expiryIssue}
            aria-describedby="gift-expiry-hint"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.seconds} value={o.seconds}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="field-hint" id="gift-expiry-hint">
            {expiryIssue ||
              "The clock starts when you approve the gift, not while you fill this in."}
          </p>
        </div>
        <details
          className={styles.optional}
          open={detailsOpen}
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        >
          <summary>
            For your records & campaigns <span>Optional</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className={styles.optionalFields}>
            <div>
              <label className="field-label" htmlFor="gift-label">
                PRIVATE LABEL · OPTIONAL
              </label>
              <input
                ref={labelInput}
                className="field-input"
                id="gift-label"
                value={draft.label}
                onChange={(e) => {
                  draft.setLabel(e.target.value);
                  setError("");
                }}
                onBlur={() => setLabelTouched(true)}
                maxLength={80}
                autoComplete="off"
                aria-invalid={labelTouched && !!labelIssue}
                aria-describedby="gift-label-hint"
              />
              <p
                className={labelTouched && labelIssue ? styles.fieldError : "field-hint"}
                id="gift-label-hint"
              >
                {labelTouched && labelIssue
                  ? labelIssue
                  : `${draft.label.length}/80 · Only for your history. Leave empty to use “${design.name} gift”.`}
              </p>
            </div>
            {campaignLocked ? (
              draft.campaign && (
                <p className="microcopy">Campaign · {draft.campaign} · one gift per passkey</p>
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
                  aria-describedby="gift-campaign-hint"
                />
                <p className="field-hint" id="gift-campaign-hint">
                  {draft.campaign.length}/60 · The same campaign name allows one gift per passkey.
                </p>
              </div>
            )}
          </div>
        </details>
        <div className="quote">
          <div>
            <p>Recipient’s sandbox card budget</p>
            <strong className="mono">${draft.display}</strong>
          </div>
          <div>
            <p>Network fee for you</p>
            <strong className="mono">$0.00</strong>
          </div>
        </div>
        {errorMessage}
        <button className="button primary full" type="submit">
          Review gift
          <ArrowUpRight size={20} />
        </button>
        <p className="microcopy">
          You’ll review everything before opening your wallet. Nothing is sent from this step.
        </p>
      </fieldset>
    </form>
  );
}
