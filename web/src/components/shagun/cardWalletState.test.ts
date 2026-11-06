import { describe, expect, it } from "vitest";
import type { GiftCardView } from "@/lib/types";
import { cardWalletState, hasCardMetadata } from "./cardWalletState";

const ready: GiftCardView = {
  giftId: "gift",
  status: "ready",
  lastFour: "4242",
  expMonth: "11",
  expYear: "2030",
  network: "Mastercard",
  budgetCents: 2500,
  reservedCents: 0,
  clearedCents: 0,
  availableCents: 2500,
  error: null,
};
describe("recipient card presentation", () => {
  it("never presents preparing or incomplete metadata as a usable card", () => {
    expect(
      cardWalletState({ ...ready, status: "preparing", lastFour: null }, false, false, ""),
    ).toBe("preparing");
    expect(cardWalletState({ ...ready, lastFour: null }, false, false, "")).toBe("preparing");
    expect(hasCardMetadata({ ...ready, lastFour: "123" })).toBe(false);
  });
  it("distinguishes funds held for purchases from fully cleared spending", () => {
    expect(
      cardWalletState({ ...ready, reservedCents: 2500, availableCents: 0 }, false, false, ""),
    ).toBe("allocated");
    expect(
      cardWalletState({ ...ready, clearedCents: 2500, availableCents: 0 }, false, false, ""),
    ).toBe("spent");
    expect(cardWalletState(ready, false, false, "")).toBe("ready");
  });
  it("preserves known card data on transient metadata errors and prioritizes revoked access", () => {
    expect(cardWalletState(ready, false, false, "Network request failed")).toBe("ready");
    expect(cardWalletState(ready, false, true, "")).toBe("access");
  });
  it("keeps closure and reconciliation distinct from spending and preparing", () => {
    for (const status of ["closing", "closed", "reconciliation"] as const)
      expect(cardWalletState({ ...ready, status }, false, false, "")).toBe(status);
    expect(cardWalletState(null, false, false, "network failed")).toBe("error");
    expect(cardWalletState(null, false, false, "")).toBe("waiting");
  });
});
