import type { ShopGateway, ShopTransaction } from "./shop";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RawTransaction = {
  token?: string; card_token?: string; merchant?: { descriptor?: string }; status?: string; result?: string;
  authorization_amount?: number; settled_amount?: number; currency?: string;
  amounts?: { hold?: { amount?: number; currency?: string }; settlement?: { amount?: number; currency?: string } };
  events?: { type?: string; amounts?: { cardholder?: { amount?: number } } }[];
};
function transaction(value: unknown): ShopTransaction {
  const raw = value as RawTransaction;
  const initial = raw.events?.find(event => event.type === "AUTHORIZATION");
  const authorized = initial?.amounts?.cardholder?.amount ?? raw.authorization_amount;
  const settled = raw.amounts?.settlement?.amount ?? raw.settled_amount;
  const currency = raw.amounts?.settlement?.currency || raw.amounts?.hold?.currency || raw.currency;
  if (!raw.token || !uuid.test(raw.token) || !raw.card_token || !uuid.test(raw.card_token) || !raw.merchant?.descriptor
    || typeof authorized !== "number" || !Number.isSafeInteger(authorized) || typeof settled !== "number" || !Number.isSafeInteger(settled)
    || !currency || !raw.status || !raw.result) throw new Error("Lithic returned incomplete transaction evidence. No payment success was assumed.");
  return { token: raw.token, cardToken: raw.card_token, descriptor: raw.merchant.descriptor, authorized: Math.abs(authorized), settled: Math.abs(settled), currency, status: raw.status, result: raw.result };
}
export class LithicShopGateway implements ShopGateway {
  constructor(private key: string, private request: typeof fetch = fetch) {}
  private async api(path: string, body?: unknown) {
    let response;
    try {
      response = await this.request(`https://sandbox.lithic.com/v1${path}`, { method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(15000), headers: { Authorization: this.key, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new Error("Lithic sandbox request timed out. Check the existing order before trying anything else."); }
    if (!response.ok) throw new Error(`Lithic sandbox returned HTTP ${response.status}. Inspect this order’s status before retrying.`);
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); }
    catch { throw new Error("Lithic returned an unreadable response. Check the existing order."); }
  }
  async authorize(cardToken: string, amount: number, descriptor: string) {
    if (!uuid.test(cardToken)) throw new Error("Invalid sandbox card reference.");
    // Sandbox simulator requires a PAN. It exists only in memory for this call;
    // it is never persisted, returned to the browser, or logged. No CVV is read.
    const card = await this.api(`/cards/${cardToken}`);
    if (!card || card.token !== cardToken || typeof card.pan !== "string" || !/^\d{16}$/.test(card.pan)) throw new Error("The selected sandbox card cannot authorize this purchase.");
    const result = await this.api("/simulate/authorize", { pan: card.pan, amount, descriptor, billing_currency: "USD", merchant_currency: "USD", merchant_amount: amount, merchant_acceptor_country: "USA", merchant_acceptor_id: "LEASHSUPPLY", status: "AUTHORIZATION" });
    if (!result?.token || !uuid.test(result.token)) throw new Error("Lithic did not provide a transaction reference.");
    return result.token as string;
  }
  async clear(token: string, amount: number) {
    if (!uuid.test(token)) throw new Error("Invalid transaction reference.");
    await this.api("/simulate/clearing", { token, amount });
  }
  async get(token: string) {
    if (!uuid.test(token)) throw new Error("Invalid transaction reference.");
    return transaction(await this.api(`/transactions/${token}`));
  }
  async find(cardToken: string, descriptor: string, createdAt: string) {
    let cursor = "";
    const begin = new Date(Date.parse(createdAt) - 60000).toISOString();
    for (let page = 0; page < 100; page++) {
      const data = await this.api(`/transactions?card_token=${encodeURIComponent(cardToken)}&begin=${encodeURIComponent(begin)}&page_size=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ""}`);
      if (!Array.isArray(data?.data)) throw new Error("Unable to reconcile Lithic transactions.");
      const matches = data.data.filter((value: RawTransaction) => value.card_token === cardToken && value.merchant?.descriptor === descriptor.slice(0, 22));
      if (matches.length > 1) throw new Error("Multiple matching authorizations need operator review. No new payment was sent.");
      if (matches.length === 1) return transaction(matches[0]);
      if (!data.has_more) return null;
      const last = data.data.at(-1)?.token;
      if (typeof last !== "string" || !uuid.test(last)) throw new Error("Incomplete Lithic transaction pagination.");
      cursor = last;
    }
    throw new Error("Transaction recovery needs operator review. No new authorization was sent.");
  }
}
