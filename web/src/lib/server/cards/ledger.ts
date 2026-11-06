import { randomUUID } from "node:crypto";
import { id as hashReference } from "ethers";
import { sql, withTransaction, type Database } from "../db";
import { encrypt } from "../security/crypto";
import { lithic } from "./lithic";

type Decision = { result: string; reason: string };
export type CardAuthorizationRequest = {
  token: string;
  cardToken: string;
  amount: number;
  currency: string;
  status: string;
};
type CardBalance = {
  gift_id: string;
  card_token: string;
  status: string;
  budget_cents: string;
  reserved_cents: string;
  cleared_cents: string;
  expiry: string;
  gift_status: string;
};
type Authorization = {
  token: string;
  gift_id: string;
  card_token: string;
  amount_cents: string;
  currency: string;
  request_status: string;
  result: string;
  reason: string;
  hold_cents: string;
  settled_cents: string;
  snapshot_at: Date | null;
};

/** The row lock serializes all decisions and clearing updates for a gift budget. */
export async function authorizeGiftCard(request: CardAuthorizationRequest): Promise<Decision> {
  return withTransaction(async (db) => {
    // ASA has a short provider deadline; contention must produce a fast decline.
    await db.query("SET LOCAL statement_timeout='1500ms'");
    await db.query("SET LOCAL lock_timeout='500ms'");
    const {
      rows: [card],
    } = await db.query<CardBalance>(
      `SELECT c.*,g.expiry,g.status AS gift_status FROM gift_cards c
       JOIN gifts g ON g.id=c.gift_id WHERE c.card_token=$1 FOR UPDATE OF c`,
      [request.cardToken],
    );
    if (!card) return { result: "UNAUTHORIZED_MERCHANT", reason: "unknown_card" };
    const {
      rows: [previous],
    } = await db.query<Authorization>("SELECT * FROM card_authorizations WHERE token=$1", [
      request.token,
    ]);
    if (previous) {
      if (
        previous.card_token !== request.cardToken ||
        Number(previous.amount_cents) !== request.amount ||
        previous.currency !== request.currency ||
        previous.request_status !== request.status
      )
        return { result: "UNAUTHORIZED_MERCHANT", reason: "changed_replay" };
      return { result: previous.result, reason: previous.reason };
    }
    let decision: Decision = { result: "APPROVED", reason: "within_budget" };
    if (!["AUTHORIZATION", "FINANCIAL_AUTHORIZATION"].includes(request.status))
      decision = { result: "UNAUTHORIZED_MERCHANT", reason: "unsupported_status" };
    else if (request.currency !== "USD")
      decision = { result: "UNAUTHORIZED_MERCHANT", reason: "unsupported_currency" };
    else if (!Number.isSafeInteger(request.amount) || request.amount <= 0)
      decision = { result: "UNAUTHORIZED_MERCHANT", reason: "invalid_amount" };
    else if (Number(card.expiry) <= Date.now() / 1000 || !["claimed"].includes(card.gift_status))
      decision = { result: "CARD_CLOSED", reason: "expired_or_unavailable" };
    else if (card.status !== "ready")
      decision = { result: "CARD_PAUSED", reason: "card_not_ready" };
    else if (
      BigInt(request.amount) >
      BigInt(card.budget_cents) - BigInt(card.reserved_cents) - BigInt(card.cleared_cents)
    )
      decision = { result: "INSUFFICIENT_FUNDS", reason: "over_budget" };
    // A malformed numeric amount cannot be persisted in a BIGINT column.
    if (!Number.isSafeInteger(request.amount)) return decision;
    const hold = decision.result === "APPROVED" ? request.amount : 0;
    await db.query(
      `INSERT INTO card_authorizations(token,gift_id,card_token,amount_cents,currency,request_status,result,reason,hold_cents)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        request.token,
        card.gift_id,
        request.cardToken,
        request.amount,
        request.currency,
        request.status,
        decision.result,
        decision.reason,
        hold,
      ],
    );
    if (hold)
      await db.query(
        "UPDATE gift_cards SET reserved_cents=reserved_cents+$2,reconciled_at=NULL,updated_at=now() WHERE gift_id=$1",
        [card.gift_id, hold],
      );
    return decision;
  });
}

type Amount = { amount?: unknown; currency?: unknown };
type Snapshot = {
  token?: string;
  card_token?: string;
  status?: string;
  result?: string;
  updated?: string;
  amounts?: { hold?: Amount; cardholder?: Amount; settlement?: Amount };
  events?: { type?: string; token?: string }[];
};
const supportedEvents = new Set([
  "AUTHORIZATION",
  "FINANCIAL_AUTHORIZATION",
  "AUTHORIZATION_ADVICE",
  "AUTHORIZATION_REVERSAL",
  "AUTHORIZATION_EXPIRY",
  "CLEARING",
]);

function debit(value: Amount | undefined): number | null {
  // Lithic transaction amounts are signed: negative debits, positive credits.
  if (
    !value ||
    value.currency !== "USD" ||
    typeof value.amount !== "number" ||
    !Number.isSafeInteger(value.amount) ||
    value.amount > 0
  )
    return null;
  return Math.abs(value.amount);
}
async function freeze(db: Database, giftId: string, reason: string) {
  await db.query(
    "UPDATE gift_cards SET status='reconciliation',error=$2,reconciled_at=NULL,updated_at=now() WHERE gift_id=$1",
    [giftId, reason],
  );
}

async function applySnapshot(snapshot: Snapshot) {
  if (!snapshot.token || !snapshot.card_token) throw new Error("IncompleteLithicTransaction");
  return withTransaction(async (db) => {
    const {
      rows: [card],
    } = await db.query<CardBalance>("SELECT * FROM gift_cards WHERE card_token=$1 FOR UPDATE", [
      snapshot.card_token,
    ]);
    if (!card) return; // Other cards, including the retired shared sample, are not gifts.
    const {
      rows: [authorization],
    } = await db.query<Authorization>("SELECT * FROM card_authorizations WHERE token=$1", [
      snapshot.token,
    ]);
    const settled = debit(snapshot.amounts?.cardholder);
    const settlement = debit(snapshot.amounts?.settlement);
    const hold = debit(snapshot.amounts?.hold);
    const updated = snapshot.updated ? Date.parse(snapshot.updated) : NaN;
    if (
      authorization?.snapshot_at &&
      Number.isFinite(updated) &&
      updated < new Date(authorization.snapshot_at).getTime()
    )
      return;
    const unsupported = snapshot.events?.some(
      (event) => !event.type || !supportedEvents.has(event.type),
    );
    if (
      unsupported ||
      settled === null ||
      settlement === null ||
      hold === null ||
      settled !== settlement ||
      !Number.isFinite(updated) ||
      !["PENDING", "SETTLED", "VOIDED", "EXPIRED", "DECLINED"].includes(snapshot.status || "")
    ) {
      await freeze(db, card.gift_id, "Unexpected provider transaction requires reconciliation.");
      return;
    }
    if (!authorization) {
      if (
        settled === 0 &&
        hold === 0 &&
        ["DECLINED", "VOIDED", "EXPIRED"].includes(snapshot.status || "")
      )
        return;
      await freeze(db, card.gift_id, "A provider purchase has no matching gift authorization.");
      return;
    }
    if (
      authorization.card_token !== snapshot.card_token ||
      authorization.gift_id !== card.gift_id ||
      (authorization.result !== "APPROVED" && (settled > 0 || hold > 0)) ||
      settled < Number(authorization.settled_cents) ||
      settled + hold > Number(authorization.amount_cents) ||
      (snapshot.status !== "PENDING" && hold !== 0)
    ) {
      await freeze(db, card.gift_id, "Provider spending differs from the approved gift purchase.");
      return;
    }
    const delta = settled - Number(authorization.settled_cents);
    const nextReserved =
      BigInt(card.reserved_cents) - BigInt(authorization.hold_cents) + BigInt(hold);
    const nextCleared = BigInt(card.cleared_cents) + BigInt(delta);
    if (nextReserved < 0n || nextReserved + nextCleared > BigInt(card.budget_cents)) {
      await freeze(db, card.gift_id, "The provider balance exceeds this gift's budget.");
      return;
    }
    await db.query(
      "UPDATE card_authorizations SET hold_cents=$2,settled_cents=$3,snapshot_at=$4 WHERE token=$1",
      [snapshot.token, hold, settled, new Date(updated)],
    );
    await db.query(
      "UPDATE gift_cards SET reserved_cents=$2,cleared_cents=$3,reconciled_at=NULL,updated_at=now() WHERE gift_id=$1",
      [card.gift_id, String(nextReserved), String(nextCleared)],
    );
    if (delta > 0) {
      // A monotone cumulative clearing checkpoint is stable across duplicate/out-of-order webhooks.
      const spendRef = hashReference(`lithic:${snapshot.token}:cleared:${settled}`);
      await db.query(
        `INSERT INTO jobs(id,gift_id,kind,payload) VALUES($1,$2,$3,$4) ON CONFLICT(gift_id,kind) DO NOTHING`,
        [
          randomUUID(),
          card.gift_id,
          `spend:${spendRef}`,
          encrypt({ amount: String(BigInt(delta) * 10_000n), spendRef }),
        ],
      );
    }
  });
}

/** Fetch the provider's current state, not the possibly stale webhook payload. */
export async function reconcileTransaction(token: string): Promise<void> {
  const snapshot = await lithic<Snapshot>(`transactions/${encodeURIComponent(token)}`);
  if (snapshot.token !== token) throw new Error("LithicTransactionReferenceMismatch");
  await applySnapshot(snapshot);
}

export async function processCardEvents(): Promise<void> {
  const events = await sql<{ id: string; transaction_token: string }>(
    "SELECT id,transaction_token FROM card_events WHERE status='queued' AND next_attempt<=now() ORDER BY created_at LIMIT 50",
  );
  for (const event of events) {
    try {
      await reconcileTransaction(event.transaction_token);
      await sql("UPDATE card_events SET status='done',error=NULL WHERE id=$1", [event.id]);
    } catch {
      await sql(
        "UPDATE card_events SET attempts=attempts+1,error='Provider transaction reconciliation is pending.',next_attempt=now()+interval '30 seconds' WHERE id=$1",
        [event.id],
      );
    }
  }
}

/** Closure gate: closed provider card, full pagination, zero holds/work and a recorded checkpoint. */
export async function reconcileCardTransactions(giftId: string): Promise<boolean> {
  const [card] = await sql<{ card_token: string | null; status: string }>(
    "SELECT card_token,status FROM gift_cards WHERE gift_id=$1",
    [giftId],
  );
  if (!card?.card_token || card.status !== "closing") return false;
  const providerCard = await lithic<{ token: string; state: string }>(
    `cards/${encodeURIComponent(card.card_token)}`,
  );
  if (providerCard.token !== card.card_token || providerCard.state !== "CLOSED") return false;
  const seen = new Set<string>();
  let cursor = "";
  let complete = false;
  for (let page = 0; page < 100; page++) {
    const result: { data: Snapshot[]; has_more: boolean } = await lithic<{
      data: Snapshot[];
      has_more: boolean;
    }>(
      `transactions?card_token=${encodeURIComponent(card.card_token)}&page_size=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!Array.isArray(result.data) || typeof result.has_more !== "boolean")
      throw new Error("IncompleteLithicTransactionList");
    for (const snapshot of result.data) {
      if (!snapshot.token || snapshot.card_token !== card.card_token)
        throw new Error("LithicTransactionCardMismatch");
      seen.add(snapshot.token);
      await applySnapshot(snapshot);
    }
    if (!result.has_more) {
      complete = true;
      break;
    }
    const next = result.data.at(-1)?.token;
    if (!next || next === cursor) throw new Error("IncompleteLithicPagination");
    cursor = next;
  }
  if (!complete) return false;
  return withTransaction(async (db) => {
    const {
      rows: [current],
    } = await db.query<{ status: string; reserved_cents: string }>(
      "SELECT status,reserved_cents FROM gift_cards WHERE gift_id=$1 FOR UPDATE",
      [giftId],
    );
    if (current.status !== "closing" || BigInt(current.reserved_cents) !== 0n) return false;
    const { rows: authorizations } = await db.query<{ token: string }>(
      "SELECT token FROM card_authorizations WHERE gift_id=$1 AND result='APPROVED'",
      [giftId],
    );
    if (authorizations.some((a) => !seen.has(a.token))) return false;
    const { rows: pending } = await db.query(
      "SELECT id FROM jobs WHERE gift_id=$1 AND kind LIKE 'spend:%' AND status<>'done' LIMIT 1",
      [giftId],
    );
    if (pending.length) return false;
    const { rows: events } = await db.query(
      `SELECT e.id FROM card_events e JOIN card_authorizations a ON a.token=e.transaction_token
       WHERE a.gift_id=$1 AND e.status<>'done' LIMIT 1`,
      [giftId],
    );
    if (events.length) return false;
    await db.query("UPDATE gift_cards SET reconciled_at=now(),updated_at=now() WHERE gift_id=$1", [
      giftId,
    ]);
    return true;
  });
}
