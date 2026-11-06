import { randomUUID } from "node:crypto";
import { AppError, required } from "../config";
import { pool, sql } from "../db";
import { lithic } from "./lithic";

export const GIFT_CARD_PURPOSE = "shagun-gift";
const MASTERCARD_PROGRAM = "00000000-0000-0000-2000-000000000000";
const RECOVERY_MESSAGE =
  "Card preparation needs provider reconciliation. No replacement card was issued.";

export type GiftCardRow = {
  settlement_pending?: boolean;
  gift_id: string;
  card_token: string | null;
  operation_id: string;
  status: "preparing" | "ready" | "closing" | "closed" | "reconciliation";
  budget_cents: string;
  reserved_cents: string;
  cleared_cents: string;
  last_four: string | null;
  exp_month: string | null;
  exp_year: string | null;
  network: string | null;
  error: string | null;
  request_started: boolean;
};
type ProviderCard = {
  token: string;
  type: string;
  state: string;
  last_four: string;
  exp_month: string;
  exp_year: string;
  spend_limit: number;
  spend_limit_duration: string;
  card_program_token?: string;
  memo?: string;
};

export function giftBudgetCents(amount: string): number {
  if (!/^\d+$/.test(amount)) throw new AppError("Gift amounts must be positive whole cents.");
  const units = BigInt(amount);
  if (units <= 0n || units % 10_000n !== 0n || units / 10_000n > BigInt(Number.MAX_SAFE_INTEGER))
    throw new AppError("Gift amounts must map exactly to positive whole cents.");
  return Number(units / 10_000n);
}

function checkedCard(card: ProviderCard, budget: number, memo: string) {
  if (
    !card ||
    !/^[0-9a-f-]{36}$/i.test(card.token) ||
    card.type !== "VIRTUAL" ||
    !["PAUSED", "OPEN"].includes(card.state) ||
    !/^\d{4}$/.test(card.last_four) ||
    !/^\d{2}$/.test(card.exp_month) ||
    !/^\d{4}$/.test(card.exp_year) ||
    card.spend_limit !== budget ||
    card.spend_limit_duration !== "FOREVER" ||
    (card.memo !== undefined && card.memo !== memo) ||
    (card.card_program_token !== undefined && card.card_program_token !== MASTERCARD_PROGRAM)
  )
    throw new AppError(RECOVERY_MESSAGE, 503);
  return card;
}

async function recoverCard(memo: string): Promise<ProviderCard> {
  let cursor = "";
  let found: ProviderCard | null = null;
  for (let page = 0; page < 100; page++) {
    const result = await lithic<{ data: ProviderCard[]; has_more: boolean }>(
      `cards?page_size=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!Array.isArray(result.data)) throw new AppError(RECOVERY_MESSAGE, 503);
    for (const card of result.data) {
      if (card.memo !== memo) continue;
      if (found) throw new AppError(RECOVERY_MESSAGE, 503);
      found = card;
    }
    if (!result.has_more) {
      if (!found) throw new AppError(RECOVERY_MESSAGE, 503);
      return found;
    }
    const next = result.data.at(-1)?.token;
    if (!next || next === cursor) throw new AppError(RECOVERY_MESSAGE, 503);
    cursor = next;
  }
  throw new AppError(RECOVERY_MESSAGE, 503);
}

/** Creates only after a confirmed chain claim. An ambiguous POST is recovered by memo, never resent. */
export async function issueGiftCard(giftId: string): Promise<void> {
  const client = await pool().connect();
  let locked = false;
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 1874)) AS locked",
      [`shagun-card:${giftId}`],
    );
    locked = !!lock.rows[0]?.locked;
    if (!locked) return;
    const [gift] = await sql<{
      amount: string;
      expiry: string;
      status: string;
      redemption: string | null;
      claim_tx: string | null;
    }>("SELECT amount,expiry,status,redemption,claim_tx FROM gifts WHERE id=$1", [giftId]);
    if (!gift || gift.redemption !== "card" || gift.status !== "claimed" || !gift.claim_tx) return;
    const budget = giftBudgetCents(String(gift.amount));
    await sql(
      `INSERT INTO gift_cards(gift_id,operation_id,budget_cents,network)
       VALUES($1,$2,$3,'Mastercard') ON CONFLICT(gift_id) DO NOTHING`,
      [giftId, randomUUID(), budget],
    );
    let [row] = await sql<GiftCardRow>("SELECT * FROM gift_cards WHERE gift_id=$1", [giftId]);
    if (!row || row.status !== "preparing") return;
    if (Number(row.budget_cents) !== budget) throw new AppError(RECOVERY_MESSAGE, 503);
    if (Number(gift.expiry) <= Date.now() / 1000 && !row.request_started && !row.card_token) {
      await sql(
        "UPDATE gift_cards SET status='closing',updated_at=now() WHERE gift_id=$1 AND status='preparing'",
        [giftId],
      );
      return;
    }
    // Validate configuration before recording a possibly delivered provider request.
    required("LITHIC_API_KEY");
    required("LITHIC_ASA_SECRET");
    required("LITHIC_EVENTS_SECRET");
    if ((process.env.LITHIC_ENVIRONMENT || "sandbox") !== "sandbox")
      throw new AppError("Only the Lithic sandbox is supported.", 503);
    const memo = `shagun-gift-${giftId}`;
    let card: ProviderCard;
    if (row.card_token) {
      card = checkedCard(
        await lithic<ProviderCard>(`cards/${encodeURIComponent(row.card_token)}`),
        budget,
        memo,
      );
    } else if (row.request_started) {
      card = checkedCard(await recoverCard(memo), budget, memo);
    } else {
      const intent = await sql(
        `UPDATE gift_cards SET request_started=true,updated_at=now()
         WHERE gift_id=$1 AND request_started=false AND status='preparing' RETURNING gift_id`,
        [giftId],
      );
      if (!intent.length) return;
      card = checkedCard(
        await lithic<ProviderCard>("cards", {
          idempotencyKey: row.operation_id,
          body: {
            type: "VIRTUAL",
            state: "PAUSED",
            memo,
            spend_limit: budget,
            spend_limit_duration: "FOREVER",
            card_program_token: MASTERCARD_PROGRAM,
            tags: { purpose: GIFT_CARD_PURPOSE, gift_id: giftId },
            ...(process.env.LITHIC_ACCOUNT_TOKEN
              ? { account_token: process.env.LITHIC_ACCOUNT_TOKEN }
              : {}),
          },
        }),
        budget,
        memo,
      );
    }
    if (row.card_token && card.token !== row.card_token) throw new AppError(RECOVERY_MESSAGE, 503);
    await sql(
      `UPDATE gift_cards SET card_token=$2,last_four=$3,exp_month=$4,exp_year=$5,error=NULL,updated_at=now()
       WHERE gift_id=$1 AND status='preparing'`,
      [giftId, card.token, card.last_four, card.exp_month, card.exp_year],
    );
    [row] = await sql<GiftCardRow>("SELECT * FROM gift_cards WHERE gift_id=$1", [giftId]);
    if (row.status !== "preparing") return;
    if (Number(gift.expiry) <= Date.now() / 1000) {
      await sql(
        "UPDATE gift_cards SET status='closing',updated_at=now() WHERE gift_id=$1 AND status='preparing'",
        [giftId],
      );
      if (card.state === "OPEN")
        await lithic(`cards/${encodeURIComponent(card.token)}`, {
          method: "PATCH",
          body: { state: "PAUSED" },
        });
      return;
    }
    if (card.state !== "OPEN")
      card = checkedCard(
        await lithic<ProviderCard>(`cards/${encodeURIComponent(card.token)}`, {
          method: "PATCH",
          body: { state: "OPEN" },
        }),
        budget,
        memo,
      );
    if (card.state !== "OPEN") throw new AppError(RECOVERY_MESSAGE, 503);
    if (Number(gift.expiry) <= Date.now() / 1000) {
      await sql(
        "UPDATE gift_cards SET status='closing',updated_at=now() WHERE gift_id=$1 AND status='preparing'",
        [giftId],
      );
      await lithic(`cards/${encodeURIComponent(card.token)}`, {
        method: "PATCH",
        body: { state: "PAUSED" },
      });
      return;
    }
    await sql(
      "UPDATE gift_cards SET status='ready',error=NULL,updated_at=now() WHERE gift_id=$1 AND status='preparing'",
      [giftId],
    );
  } catch {
    await sql(
      "UPDATE gift_cards SET error=$2,next_attempt=now()+interval '30 seconds',updated_at=now() WHERE gift_id=$1 AND status='preparing'",
      [giftId, RECOVERY_MESSAGE],
    );
    throw new AppError(RECOVERY_MESSAGE, 503);
  } finally {
    try {
      if (locked)
        await client.query("SELECT pg_advisory_unlock(hashtextextended($1,1874))", [
          `shagun-card:${giftId}`,
        ]);
    } finally {
      client.release();
    }
  }
}
