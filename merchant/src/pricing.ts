export const DECIMALS = 6;

export function toUnits(usdc: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(usdc.trim());
  if (!m) throw new Error(`invalid USDC amount "${usdc}"`);
  return BigInt(m[1]) * 10n ** BigInt(DECIMALS) + BigInt((m[2] ?? "").padEnd(DECIMALS, "0"));
}

export function fromUnits(units: bigint): string {
  const frac = (units % 10n ** BigInt(DECIMALS)).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return `${units / 10n ** BigInt(DECIMALS)}${frac ? `.${frac}` : ""}`;
}

export const MAX_CHAI_QTY = 10;

export function chaiQty(raw: string | null): number {
  const qty = Number(raw ?? "1");
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_CHAI_QTY) throw new Error(`qty must be 1-${MAX_CHAI_QTY}`);
  return qty;
}

export function chaiPrice(raw: string | null, unitPriceUsdc: string): bigint {
  return toUnits(unitPriceUsdc) * BigInt(chaiQty(raw));
}

export function photoAmount(raw: string | null, maxUsdc: string): bigint {
  const units = toUnits(raw ?? "");
  if (units <= 0n || units > toUnits(maxUsdc)) throw new Error(`amount must be between 0 and ${maxUsdc}`);
  return units;
}
