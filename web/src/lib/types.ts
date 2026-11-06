export type GiftStatus = "pending" | "sent" | "claimed" | "settled" | "returned" | "failed";
export type GiftView = {
  id: string; label: string; amount: string; expiry: number; status: GiftStatus; campaign: boolean;
  createdAt: string; createdTx: string | null; claimTx: string | null; settlementTx: string | null;
  refundTx: string | null; payoutId: string | null; payoutStatus: string | null; paise: string;
  canViewReceipt: boolean; error: string | null;
};
export type AppStatus = { chainId: number; rate: string; testMode: true; ready: boolean; services: { name: string; ready: boolean; detail: string }[] };
