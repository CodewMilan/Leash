import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type SandboxCard = {
  token: string;
  lastFour: string;
  expMonth: string;
  expYear: string;
  state: string;
  spendLimit: number;
  spendLimitDuration: string;
};
type Reservation = { version: 1; operation: string; memo: string; cardToken?: string };
type Config = { apiKey: string; directory: string; accountToken?: string };
const reservedMessage = "Your gift is reserved. Check status to recover the same Lithic card. No second card will be created.";

function publicCard(value: unknown): SandboxCard {
  if (!value || typeof value !== "object") throw new Error("Invalid Lithic card response.");
  const card = value as Record<string, unknown>;
  if (typeof card.token !== "string" || !/^[0-9a-f-]{36}$/i.test(card.token)
    || typeof card.last_four !== "string" || !/^\d{4}$/.test(card.last_four)
    || typeof card.exp_month !== "string" || typeof card.exp_year !== "string"
    || typeof card.state !== "string" || typeof card.spend_limit !== "number"
    || typeof card.spend_limit_duration !== "string" || card.type !== "VIRTUAL") {
    throw new Error("Invalid Lithic card response.");
  }
  // Explicit allowlist: never return PAN, CVV or provider response bodies.
  return { token: card.token, lastFour: card.last_four, expMonth: card.exp_month,
    expYear: card.exp_year, state: card.state, spendLimit: card.spend_limit,
    spendLimitDuration: card.spend_limit_duration };
}

export class LithicGiftService {
  constructor(private config: Config, private request: typeof fetch = fetch) {}

  private async api(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(`https://sandbox.lithic.com/v1${path}`, {
        ...init, cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: { Authorization: this.config.apiKey, "Content-Type": "application/json", ...init?.headers },
      });
    } catch { throw new Error("Lithic sandbox did not respond. Check status before trying anything else."); }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("Lithic sandbox access was denied. Check the sandbox API key and issuing permissions.");
      throw new Error(`Lithic sandbox returned HTTP ${response.status}. Check status to reconcile your request.`);
    }
    return response.json();
  }

  private async read(): Promise<Reservation | null> {
    try {
      const value = JSON.parse(await readFile(join(this.config.directory, "gift.json"), "utf8")) as Reservation;
      if (value.version !== 1 || !/^[0-9a-f-]{36}$/i.test(value.operation) || value.memo !== `leash-gift-${value.operation}`
        || (value.cardToken !== undefined && !/^[0-9a-f-]{36}$/i.test(value.cardToken))) throw new Error("Invalid reservation.");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("The server gift record could not be read. Restore its persistent storage; do not create a replacement card.");
    }
  }

  private async save(value: Reservation) {
    const temporary = join(this.config.directory, `gift-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, join(this.config.directory, "gift.json"));
  }

  async get(): Promise<SandboxCard | null> {
    const reservation = await this.read();
    if (!reservation) return null;
    if (reservation.cardToken) return publicCard(await this.api(`/cards/${reservation.cardToken}`));
    // Reconcile by the reservation's unique memo. Never retry a create after an
    // ambiguous timeout: provider idempotency retention is not an eternal lock.
    let cursor = "";
    for (let page = 0; page < 100; page++) {
      const result = await this.api(`/cards?page_size=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ""}`) as { data?: unknown[]; has_more?: boolean };
      if (!Array.isArray(result.data)) throw new Error("Invalid Lithic card list.");
      const match = result.data.find(value => value && typeof value === "object" && (value as {memo?:string}).memo === reservation.memo);
      if (match) {
        const card = publicCard(match);
        await this.save({ ...reservation, cardToken: card.token });
        return card;
      }
      if (!result.has_more) throw new Error(reservedMessage);
      const last = result.data.at(-1) as { token?: string } | undefined;
      if (!last?.token) throw new Error(reservedMessage);
      cursor = last.token;
    }
    throw new Error("Card reconciliation requires operator review. The gift stays reserved; no new card was created.");
  }

  async issue(): Promise<SandboxCard> {
    await mkdir(this.config.directory, { recursive: true, mode: 0o700 });
    const lock = join(this.config.directory, "issuance.lock");
    try { await mkdir(lock); }
    catch { throw new Error("Another issuance is in progress. Check status shortly."); }
    try {
      if (await this.read()) {
        const existing = await this.get();
        if (!existing) throw new Error(reservedMessage);
        return existing;
      }
      const operation = randomUUID();
      const reservation: Reservation = { version: 1, operation, memo: `leash-gift-${operation}` };
      await this.save(reservation);
      try {
        const card = publicCard(await this.api("/cards", {
          method: "POST", headers: { "Idempotency-Key": operation },
          body: JSON.stringify({ type: "VIRTUAL", state: "OPEN", memo: reservation.memo,
            spend_limit: 10000, spend_limit_duration: "FOREVER",
            ...(this.config.accountToken ? { account_token: this.config.accountToken } : {}) }),
        }));
        await this.save({ ...reservation, cardToken: card.token });
        return card;
      } catch { throw new Error(reservedMessage); }
    } finally { await rm(lock, { recursive: true, force: true }); }
  }
}
