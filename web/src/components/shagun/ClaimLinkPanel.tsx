"use client";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Link2,
  LoaderCircle,
  LockKeyhole,
  QrCode,
} from "lucide-react";
import type { GiftView } from "@/lib/types";
import { tokenAmount } from "@/lib/amounts";
import styles from "./ClaimLinkPanel.module.css";

export function ClaimLinkPanel({ gift, link, qr }: { gift: GiftView; link: string; qr: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const expired = gift.expiry * 1000 <= now;
  const available = gift.status === "sent" && !gift.claimPending && !expired;
  const pending = gift.status === "pending";
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setFeedback("Claim link copied. Share it privately with your recipient.");
    } catch {
      setCopied(false);
      input.current?.focus();
      input.current?.select();
      setFeedback(
        "Automatic copy wasn't available. The link is selected—press ⌘C or Ctrl+C to copy it.",
      );
    }
  }
  function save() {
    const file = new Blob(
      [
        `Your private Shagun claim link\n\n${link}\n\nAnyone with this link can start claiming the gift. Share it only with your recipient.\n`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shagun-claim-${gift.id.slice(2, 12)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback("Private claim link saved as a text file. Keep that file private.");
  }
  return (
    <section className={styles.share} aria-label="Share your gift">
      <div className={styles.heading}>
        <span className={styles.mark}>
          {pending ? (
            <LoaderCircle className={styles.spin} size={23} />
          ) : available && link ? (
            <Link2 size={23} />
          ) : (
            <LockKeyhole size={23} />
          )}
        </span>
        <div>
          <h2>
            {pending
              ? "Confirming your gift"
              : gift.status === "failed"
                ? "Your gift needs attention"
                : gift.claimPending
                  ? "Your recipient is claiming"
                  : available
                    ? "Share your gift"
                    : gift.status === "returned"
                      ? "Gift returned"
                      : expired && gift.status === "sent"
                        ? "This gift has expired"
                        : "This gift has been claimed"}
          </h2>
          <p>
            ${tokenAmount(gift.amount)} gift ·{" "}
            {pending
              ? "Waiting for confirmation"
              : available
                ? "Ready for your recipient"
                : "View its journey for the latest status"}
          </p>
        </div>
      </div>
      {pending ? (
        <p role="status">
          Your gift was submitted. Keep this tab open; the private claim link will appear after the
          funding transaction confirms.
        </p>
      ) : gift.status === "failed" ? (
        <p className="notice error" role="alert">
          {gift.error ||
            "Funding did not complete. Check the transaction before sending another gift."}
        </p>
      ) : available && link ? (
        <>
          <p>This is the link your recipient uses to claim. No password needs to be created.</p>
          <label className="field-label" htmlFor={id}>
            PRIVATE CLAIM LINK
          </label>
          <input
            ref={input}
            id={id}
            className={`field-input ${styles.input}`}
            readOnly
            value={link}
            onClick={(e) => e.currentTarget.select()}
            spellCheck={false}
          />
          <button className="button primary full" type="button" onClick={() => void copy()}>
            {copied ? <Check size={18} /> : <Copy size={18} />}{" "}
            {copied ? "Claim link copied" : "Copy claim link"}
          </button>
          <div className={styles.actions}>
            <a className="button secondary small" href={link} target="_blank" rel="noreferrer">
              Open recipient page <ArrowUpRight size={16} />
            </a>
            <button className="button secondary small" type="button" onClick={save}>
              <Download size={16} /> Save link
            </button>
          </div>
          <p className={styles.note}>
            <LockKeyhole size={15} /> Keep this link private. Save a copy before closing this tab or
            signing out; it cannot be rebuilt from the receipt.
          </p>
          {qr && (
            <details className={styles.qr}>
              <summary>
                <QrCode size={16} /> Show recipient QR code
              </summary>
              <Image
                src={qr}
                alt="Scan to open the private gift claim link"
                width={180}
                height={180}
                unoptimized
              />
            </details>
          )}
        </>
      ) : available ? (
        <div className="notice" role="status">
          <strong>Claim link unavailable in this tab</strong>
          <p>
            Return to the original tab where you sent the gift, or use the private link you saved.
            This receipt does not include the claim secret. If it was lost, the unclaimed gift can
            return after expiry.
          </p>
        </div>
      ) : (
        <p>
          {gift.claimPending
            ? "The claim link is no longer offered while the recipient's claim is being confirmed."
            : "No claim link is needed now. You can follow the card, spending, and returns in the gift's journey."}
        </p>
      )}
      <p className={styles.feedback} role="status" aria-live="polite">
        {feedback}
      </p>
    </section>
  );
}
