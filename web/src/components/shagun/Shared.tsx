"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Gift, RotateCcw } from "lucide-react";
import type { AppStatus, GiftView } from "@/lib/types";
import { giftStatusLabel, receiptSteps } from "./giftPresentation";
import { explorerTx } from "@/lib/chain";

export function TestBanner() {
  return (
    <div className="test-banner">
      <span className="badge">TEST MODE</span>
      <span>
        Whitechain testnet gifts in official test USDT. Recipient cards run in sandbox; no real
        money moves.
      </span>
    </div>
  );
}
export function SetupPanel({ status }: { status: AppStatus | null }) {
  if (!status) return null;
  const coreServices = status.services.filter((s) => s.name !== "UPI test payouts");
  return (
    <details className="panel setup-summary">
      <summary>
        {status.ready ? "App connections ready" : "App connections"} ·{" "}
        {coreServices.filter((s) => s.ready).length}/{coreServices.length}
      </summary>
      <ul className="setup-items">
        {coreServices.map((s) => (
          <li key={s.name}>
            <span>
              {s.name}
              <br />
              <small className="muted">{s.detail}</small>
            </span>
            <span>{s.ready ? "CONFIGURED" : "SETUP PENDING"}</span>
          </li>
        ))}
      </ul>
      <p className="microcopy px-4 pb-4">
        Configuration status. Live connection checks are performed when a gift is submitted.
      </p>
    </details>
  );
}
export function StatusBadge({ gift }: { gift: GiftView }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const label = giftStatusLabel(gift, now);
  return <span className={`status-badge ${gift.status}`}>{label}</span>;
}
export function ReceiptTimeline({ gift }: { gift: GiftView }) {
  const steps = receiptSteps(gift);
  const current = steps.findIndex((step) => !step.done);
  return (
    <>
      {gift.cardAccounting && (
        <p className="notice mb-4">
          {giftStatusLabel(gift)} · ${(gift.cardAccounting.budgetCents / 100).toFixed(2)}{" "}
          budget · ${(gift.cardAccounting.reservedCents / 100).toFixed(2)} in pending purchases · $
          {(gift.cardAccounting.clearedCents / 100).toFixed(2)} cleared spending
        </p>
      )}
      {gift.error && (
        <p className="notice error mb-4" role="status">
          {gift.error}
        </p>
      )}
      <ol className="timeline">
        {steps.map((s, i) => (
          <li
            key={s.key}
            aria-current={i === current ? "step" : undefined}
            className={!s.done ? "timeline-pending" : undefined}
          >
            <span className={`step-number ${s.done ? "done" : ""}`}>
              {s.done ? <Check size={14} /> : i + 1}
            </span>
            <div>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
              {s.tx && (
                <a href={explorerTx(s.tx)} target="_blank" rel="noreferrer">
                  View transaction <ExternalLink size={12} />
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
export function EmptyGifts() {
  return (
    <div className="empty-state">
      <Gift size={32} strokeWidth={1} />
      <h3>Good wishes start here.</h3>
      <p>
        Your envelopes will appear here, from the moment you send them to the moment they&apos;re
        claimed or returned.
      </p>
    </div>
  );
}
export function ReturnNotice() {
  return (
    <div className="notice">
      <RotateCcw size={18} className="mb-2" />
      Unclaimed gifts return after expiry when the return transaction confirms. Claimed cards return
      unused value after pending purchases are reconciled.
    </div>
  );
}
