export type GiftStatus = "pending" | "sent" | "claimed" | "settled" | "returned" | "failed";
export type GiftView = {
  id: string;
  label: string;
  amount: string;
  expiry: number;
  status: GiftStatus;
  campaign: boolean;
  createdAt: string;
  createdTx: string | null;
  claimTx: string | null;
  settlementTx: string | null;
  refundTx: string | null;
  payoutId: string | null;
  payoutStatus: string | null;
  paise: string;
  canViewReceipt: boolean;
  claimPending: boolean;
  error: string | null;
  design: string;
  cardAccounting?: {
    status: string;
    budgetCents: number;
    reservedCents: number;
    clearedCents: number;
  } | null;
  /** Recipient note sealed with the envelope secret; readable only with the claim link. */
  sealedMessage: string | null;
};
export type AppStatus = {
  chainId: number;
  rate: string;
  testMode: true;
  ready: boolean;
  services: { name: string; ready: boolean; detail: string }[];
};

export type GiftCardView = {
  settlementPending?: boolean;
  giftId: string;
  status: "preparing" | "ready" | "closing" | "closed" | "reconciliation";
  lastFour: string | null;
  expMonth: string | null;
  expYear: string | null;
  network: string | null;
  budgetCents: number;
  reservedCents: number;
  clearedCents: number;
  availableCents: number;
  error: string | null;
};
