import { describe, expect, it } from "vitest";
import type { GiftView } from "@/lib/types";
import { giftStatusLabel, receiptSteps } from "./giftPresentation";
const now = 1_800_000_000_000;
const gift: GiftView = {
  id: "gift",
  label: "Birthday",
  amount: "11000000",
  expiry: now / 1000 + 3600,
  status: "sent",
  campaign: false,
  createdAt: new Date(now).toISOString(),
  createdTx: "funded",
  claimTx: null,
  settlementTx: null,
  refundTx: null,
  payoutId: null,
  payoutStatus: null,
  paise: "0",
  canViewReceipt: true,
  claimPending: false,
  error: null,
  design: "birthday",
  sealedMessage: null,
};
describe("truthful gift presentation", () => {
  it("does not describe an unclaimed gift as verified", () => {
    const steps = receiptSteps(gift);
    expect(steps.find((s) => s.key === "claim")).toMatchObject({
      title: "Waiting for recipient",
      done: false,
    });
    expect(steps.map((s) => s.description).join(" ")).not.toMatch(/accepted|verified/i);
    expect(giftStatusLabel(gift, now)).toBe("Ready to claim");
  });
  it("distinguishes funding, claim confirmation, card preparation and ready", () => {
    expect(giftStatusLabel({ ...gift, status: "pending", createdTx: null }, now)).toBe(
      "Confirming gift",
    );
    expect(giftStatusLabel({ ...gift, claimPending: true }, now)).toBe("Confirming claim");
    expect(giftStatusLabel({ ...gift, status: "claimed", claimTx: "claim" }, now)).toBe(
      "Preparing card",
    );
    expect(
      giftStatusLabel(
        {
          ...gift,
          status: "claimed",
          claimTx: "claim",
          cardAccounting: { status: "ready", budgetCents: 1100, reservedCents: 0, clearedCents: 0 },
        },
        now,
      ),
    ).toBe("Card ready");
  });
  it("shows an unclaimed return without inventing a completed claim", () => {
    const steps = receiptSteps({ ...gift, status: "returned", refundTx: "return" });
    expect(steps.some((s) => s.key === "claim" && s.done)).toBe(false);
    expect(steps.at(-1)).toMatchObject({
      title: "Unclaimed gift returned",
      done: true,
      tx: "return",
    });
  });
  it("does not treat closure as proof that a card was issued", () => {
    const steps = receiptSteps({
      ...gift,
      status: "claimed",
      claimTx: "claim",
      cardAccounting: {
        status: "closing",
        budgetCents: 1100,
        reservedCents: 0,
        clearedCents: 0,
      },
    });
    expect(steps.some((step) => step.title === "Virtual card issued" && step.done)).toBe(false);
    expect(steps.some((step) => step.title === "Card allocation")).toBe(true);
  });
  it("keeps reconciliation and expiry distinct from a successful return", () => {
    expect(giftStatusLabel({ ...gift, expiry: now / 1000 - 1 }, now)).toBe("Return pending");
    expect(
      giftStatusLabel(
        {
          ...gift,
          status: "claimed",
          cardAccounting: {
            status: "reconciliation",
            budgetCents: 1100,
            reservedCents: 300,
            clearedCents: 800,
          },
        },
        now,
      ),
    ).toBe("Needs review");
  });
});
