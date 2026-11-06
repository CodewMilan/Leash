import type { GiftView } from "@/lib/types";

export function giftStatusLabel(gift: GiftView, now = Date.now()) {
  if (gift.status === "failed") return "Needs attention";
  if (gift.status === "returned") return "Returned";
  if (gift.status === "pending") return "Confirming gift";
  if (gift.claimPending) return "Confirming claim";
  if (gift.status === "sent")
    return gift.expiry * 1000 <= now ? "Return pending" : "Ready to claim";
  if (gift.payoutId || gift.payoutStatus) {
    if (gift.payoutStatus === "processed") return "Test payout complete";
    return gift.payoutStatus &&
      ["failed", "rejected", "cancelled", "reversed"].includes(gift.payoutStatus)
      ? "Payout needs attention"
      : "Test payout pending";
  }
  if (gift.status === "settled") return "Fully spent";
  const card = gift.cardAccounting;
  if (card?.status === "reconciliation") return "Needs review";
  if (card?.status === "closing") return "Reconciling unused value";
  if (card?.status === "closed") return "Card closed";
  if (card?.status === "ready") {
    if (card.clearedCents >= card.budgetCents) return "Spending settling";
    if (card.reservedCents + card.clearedCents >= card.budgetCents) return "Purchases pending";
    return "Card ready";
  }
  return "Preparing card";
}
export type ReceiptStep = {
  key: string;
  title: string;
  description: string;
  tx: string | null;
  done: boolean;
};
export function receiptSteps(gift: GiftView): ReceiptStep[] {
  const steps: ReceiptStep[] = [
    {
      key: "fund",
      title: gift.createdTx
        ? "Gift funded"
        : gift.status === "failed"
          ? "Funding unsuccessful"
          : "Confirming gift",
      description: gift.createdTx
        ? "Official test USDT secured in the gift vault."
        : gift.status === "failed"
          ? "The gift was not funded. Check the error before trying again."
          : "Waiting for the funding transaction to confirm.",
      tx: gift.createdTx,
      done: !!gift.createdTx,
    },
  ];
  if (!(gift.status === "returned" && !gift.claimTx))
    steps.push({
      key: "claim",
      title: gift.claimTx
        ? "Gift claimed"
        : gift.claimPending
          ? "Confirming claim"
          : "Waiting for recipient",
      description: gift.claimTx
        ? "The recipient confirmed their passkey and private claim link."
        : gift.claimPending
          ? "The recipient's claim is waiting for on-chain confirmation."
          : "Share the private claim link so the recipient can open their gift.",
      tx: gift.claimTx,
      done: !!gift.claimTx,
    });
  if (gift.payoutId || gift.payoutStatus) {
    steps.push({
      key: "settlement",
      title: gift.settlementTx ? "Treasury settlement confirmed" : "Waiting for settlement",
      description: gift.settlementTx
        ? "Tokens transferred for the legacy test payout."
        : "Settlement starts after the claim confirms.",
      tx: gift.settlementTx,
      done: !!gift.settlementTx,
    });
    steps.push({
      key: "payout",
      title: gift.payoutStatus === "processed" ? "Test payout complete" : "Test payout",
      description: gift.payoutId
        ? `${gift.payoutId} · ${gift.payoutStatus || "pending"}`
        : "Not requested yet. No real bank transfer.",
      tx: null,
      done: gift.payoutStatus === "processed",
    });
  } else if (gift.status !== "returned") {
    const card = gift.cardAccounting;
    const created =
      !!card && (card.status === "ready" || card.clearedCents > 0 || card.reservedCents > 0);
    const ending = !!card && ["closing", "closed", "reconciliation"].includes(card.status);
    steps.push({
      key: "card",
      title: created
        ? "Virtual card issued"
        : ending
          ? "Card allocation"
          : gift.claimTx
            ? "Preparing virtual card"
            : "Virtual card",
      description: created
        ? "A Lithic sandbox card was issued for this gift."
        : ending
          ? "Card access is stopped while the remaining gift value is reconciled."
          : gift.claimTx
            ? "The card is being prepared with a budget matching the gift."
            : "Card preparation starts after the recipient's claim confirms.",
      tx: null,
      done: created,
    });
    if (created || gift.settlementTx)
      steps.push({
        key: "spend",
        title: gift.settlementTx ? "Purchase settlement confirmed" : "Card purchases",
        description: gift.settlementTx
          ? "Cleared sandbox spending has an on-chain settlement receipt."
          : card?.clearedCents
            ? "Cleared spending is waiting for on-chain settlement."
            : card?.reservedCents
              ? "Purchases are authorized and waiting to clear."
              : "No cleared purchases yet.",
        tx: gift.settlementTx,
        done: !!gift.settlementTx,
      });
  }
  if (
    gift.status === "returned" ||
    ["closing", "closed", "reconciliation"].includes(gift.cardAccounting?.status || "")
  )
    steps.push({
      key: "return",
      title: gift.refundTx
        ? gift.claimTx
          ? "Unused gift returned"
          : "Unclaimed gift returned"
        : gift.cardAccounting?.status === "reconciliation"
          ? "Return needs review"
          : "Reconciling unused value",
      description: gift.refundTx
        ? "The remaining gift value was returned to its sender."
        : "Outstanding purchases and settlements must be reconciled before unused funds can return.",
      tx: gift.refundTx,
      done: !!gift.refundTx,
    });
  return steps;
}
