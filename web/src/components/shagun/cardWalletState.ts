import type { GiftCardView } from "@/lib/types";

export type CardWalletState =
  | "loading"
  | "access"
  | "error"
  | "waiting"
  | "preparing"
  | "ready"
  | "allocated"
  | "spent"
  | "closing"
  | "reconciliation"
  | "closed";

export function hasCardMetadata(card: GiftCardView | null): card is GiftCardView {
  return (
    !!card &&
    /^\d{4}$/.test(card.lastFour || "") &&
    /^\d{2}$/.test(card.expMonth || "") &&
    /^\d{4}$/.test(card.expYear || "")
  );
}

export function cardWalletState(
  card: GiftCardView | null,
  loading: boolean,
  access: boolean,
  error: string,
): CardWalletState {
  if (loading && !card) return "loading";
  if (access) return "access";
  if (!card) return error ? "error" : "waiting";
  if (card.status === "reconciliation" || card.status === "closing" || card.status === "closed")
    return card.status;
  if (card.status === "preparing" || !hasCardMetadata(card)) return "preparing";
  if (card.availableCents <= 0)
    return card.reservedCents === 0 && card.clearedCents >= card.budgetCents
      ? "spent"
      : "allocated";
  return "ready";
}
