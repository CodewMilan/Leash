"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Gift, RotateCcw } from "lucide-react";
import type { AppStatus, GiftView } from "@/lib/types";
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
  return (
    <details className="panel setup-summary">
      <summary>
        {status.ready ? "All services configured" : "Service availability"} ·{" "}
        {status.services.filter((s) => s.ready).length}/{status.services.length}
      </summary>
      <ul className="setup-items">
        {status.services.map((s) => (
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
  let label: string = gift.status;
  if (gift.claimPending) label = "Claim confirming";
  else if (gift.status === "sent" && gift.expiry * 1000 <= now) label = "Return pending";
  else if (gift.status === "settled" && (gift.payoutId || gift.payoutStatus))
    label =
      gift.payoutStatus === "processed"
        ? "Test payout complete"
        : ["failed", "rejected", "cancelled", "reversed"].includes(gift.payoutStatus || "")
          ? `Test payout ${gift.payoutStatus}`
          : "Test payout pending";
  else if (gift.status === "settled") label = "Gift spent";
  else if (gift.status === "claimed") label = "Gift claimed";
  else if (gift.status === "sent") label = "Ready to claim";
  else if (gift.status === "pending") label = "Confirming";
  return <span className={`status-badge ${gift.status}`}>{label}</span>;
}
export function ReceiptTimeline({ gift }: { gift: GiftView }) {
  const legacyPayout = !!(gift.payoutId || gift.payoutStatus);
  const steps = [
    {
      title: "Gift secured",
      description: "Official test USDT held in the gift vault.",
      tx: gift.createdTx,
      done: !!gift.createdTx,
    },
    {
      title:
        gift.status === "returned"
          ? gift.claimTx
            ? "Unused gift returned"
            : "Unclaimed gift returned"
          : "Claim verified",
      description:
        gift.status === "returned"
          ? "The vault sent the remaining gift value back to its sender."
          : "Passkey confirmation and the private gift link accepted.",
      tx: gift.refundTx || gift.claimTx,
      done: !!(gift.refundTx || gift.claimTx),
    },
    ...(gift.status === "returned"
      ? []
      : legacyPayout
        ? [
            {
              title: "Treasury settlement",
              description: "Tokens transferred before requesting a test payout.",
              tx: gift.settlementTx,
              done: !!gift.settlementTx,
            },
            {
              title: "UPI test payout",
              description: gift.payoutId
                ? `${gift.payoutId} · ${gift.payoutStatus || "pending"}`
                : "Waiting for token settlement. No real bank transfer.",
              tx: null,
              done: gift.payoutStatus === "processed",
            },
          ]
        : [
            {
              title: "Card spending",
              description: gift.settlementTx
                ? "Cleared sandbox purchases have an on-chain settlement receipt."
                : "Cleared card purchases settle from the gift as they arrive.",
              tx: gift.settlementTx,
              done: !!gift.settlementTx,
            },
          ]),
  ];
  return (
    <>
      {gift.cardAccounting && (
        <p className="notice mb-4">
          Card {gift.cardAccounting.status} · ${(gift.cardAccounting.budgetCents / 100).toFixed(2)}{" "}
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
          <li key={s.title}>
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
