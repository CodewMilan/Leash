export type GiftDemo = {
  version: 1;
  stage: "received" | "onboarding" | "provisioning" | "ready";
  balance: number;
  spent: boolean;
};
export const initialGift: GiftDemo = { version: 1, stage: "received", balance: 10000, spent: false };
export const storageKey = "leash-gift-demo-v1";
export function parseGift(raw: string | null): GiftDemo {
  if (!raw) return { ...initialGift };
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null) throw new Error("Invalid demo data");
  const gift = value as GiftDemo;
  if (gift.version !== 1 || !["received", "onboarding", "provisioning", "ready"].includes(gift.stage)
    || typeof gift.spent !== "boolean" || gift.balance !== (gift.spent ? 7500 : 10000)
    || (gift.spent && gift.stage !== "ready")) throw new Error("Invalid demo data");
  return gift;
}
export function redeemGift(gift: GiftDemo): GiftDemo {
  if (gift.stage !== "onboarding") throw new Error("This gift cannot be redeemed again.");
  return { ...gift, stage: "provisioning" };
}
export function completeGift(gift: GiftDemo): GiftDemo {
  if (gift.stage !== "provisioning") throw new Error("No card is awaiting reconciliation.");
  return { ...gift, stage: "ready" };
}
export function purchaseGift(gift: GiftDemo): GiftDemo {
  if (gift.stage !== "ready" || gift.spent) throw new Error("This demo purchase is unavailable.");
  return { ...gift, balance: gift.balance - 2500, spent: true };
}
