export const USDC_DECIMALS = 6;

export function toBaseUnits(amount: string | number): bigint {
  const text = typeof amount === "number" ? amount.toFixed(USDC_DECIMALS) : amount.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Not a valid USDC amount: "${amount}"`);
  const [, whole, frac = ""] = match;
  if (frac.replace(/0+$/, "").length > USDC_DECIMALS) throw new Error(`USDC has ${USDC_DECIMALS} decimals, got "${amount}"`);
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(frac.padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS));
}

export function fromBaseUnits(units: bigint): string {
  const scale = 10n ** BigInt(USDC_DECIMALS);
  const whole = units / scale;
  const frac = (units % scale).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** The payment exactly as decoded from the transaction the device is about to sign. */
export interface PaymentToSign {
  amount: bigint;
  tokenId: string;
  payTo: string;
  payFrom: string;
}

/** The device's own rules, set by the owner in `.env`. */
export interface SpendRules {
  deviceAccountId: string;
  usdcTokenId: string;
  spendLimitUsdc: number;
}

export type PolicyResult =
  | { ok: true; overLimit: boolean }
  | { ok: false; reason: string };

/**
 * Compares the payment the device would sign against what 0G decided and the user's own contacts.
 * Runs on the device; 0G's answer alone can never move money.
 */
export function checkPayment(args: {
  payment: PaymentToSign;
  contact: { name: string; payTo: string };
  decidedAmountUsdc: string | null;
  rules: SpendRules;
}): PolicyResult {
  const { payment, contact, decidedAmountUsdc, rules } = args;

  if (payment.payFrom !== rules.deviceAccountId) {
    return { ok: false, reason: `Payment would come from ${payment.payFrom}, not this device's account` };
  }
  if (payment.tokenId !== rules.usdcTokenId) {
    return { ok: false, reason: `Merchant asked for token ${payment.tokenId}, only USDC ${rules.usdcTokenId} is allowed` };
  }
  if (payment.payTo !== contact.payTo) {
    return { ok: false, reason: `Merchant wants payment to ${payment.payTo}, but ${contact.name} is ${contact.payTo}` };
  }
  if (payment.amount <= 0n) {
    return { ok: false, reason: "Payment amount must be positive" };
  }
  if (decidedAmountUsdc !== null && payment.amount !== toBaseUnits(decidedAmountUsdc)) {
    return {
      ok: false,
      reason: `Merchant asks ${fromBaseUnits(payment.amount)} USDC but you agreed to ${decidedAmountUsdc} USDC`,
    };
  }
  return { ok: true, overLimit: payment.amount > toBaseUnits(rules.spendLimitUsdc) };
}
