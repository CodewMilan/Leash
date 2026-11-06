import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreditCard } from "./credit-card";

describe("local Untitled credit card", () => {
  it("masks supplied digits and has no sample identity or expiry defaults", () => {
    const markup = renderToStaticMarkup(
      createElement(CreditCard, { cardNumber: "1111222233334242", masked: true, network: "Visa" }),
    );
    expect(markup).toContain("•••• •••• •••• 4242");
    expect(markup).not.toContain("1111222233334242");
    expect(markup).not.toMatch(/OLIVIA|06\/28|Untitled\./);
  });
  it("shows a Mastercard logo only when that is the actual provider network", () => {
    const visa = renderToStaticMarkup(createElement(CreditCard, { network: "Visa" }));
    const mastercard = renderToStaticMarkup(createElement(CreditCard, { network: "Mastercard" }));
    expect(visa).toContain("Visa");
    expect(visa).not.toContain("<svg");
    expect(mastercard).toContain("<svg");
    expect(renderToStaticMarkup(createElement(CreditCard))).toContain("Virtual");
  });
});
