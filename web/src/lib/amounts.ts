const UNIT = 1_000_000n;
export function parseAmount(value: string): bigint {
  if (!/^\d{1,7}(\.\d{1,6})?$/.test(value))
    throw new Error("Enter an amount with up to 6 decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * UNIT + BigInt(fraction.padEnd(6, "0"));
  if (amount <= 0n || amount > 1_000n * UNIT)
    throw new Error("Choose an amount between 0.000001 and 1,000 dollars.");
  return amount;
}
export function tokenAmount(units: string | bigint | null, minimumDecimals = 2): string {
  if (units === null || !/^\d+$/.test(String(units))) return "—";
  const value = BigInt(units);
  const whole = (value / UNIT).toLocaleString("en-US");
  const fraction = (value % UNIT)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(minimumDecimals, "0");
  return fraction ? `${whole}.${fraction}` : whole;
}
export function toPaise(units: bigint, rate: string): bigint {
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(rate))
    throw new Error("Configure an indicative INR rate with up to 2 decimals.");
  const [whole, fraction = ""] = rate.split(".");
  const ratePaise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (ratePaise <= 0n) throw new Error("Indicative rate must be positive.");
  return (units * ratePaise + UNIT / 2n) / UNIT;
}
export function inr(paise: string | bigint | null): string {
  if (paise === null || !/^\d+$/.test(String(paise))) return "—";
  const value = BigInt(paise);
  return `₹${(value / 100n).toLocaleString("en-IN")}.${(value % 100n).toString().padStart(2, "0")}`;
}
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
