import type { GiftView, GiftStatus } from "../../types";
import { sql } from "../db";
import type { GiftTerms } from "../../chain";
import { AppError } from "../config";
import type { Session } from "../auth/session";

export type GiftRow = {
  id: string;
  sender: string;
  label: string;
  amount: string;
  expiry: string;
  secret_hash: string;
  campaign_id: string;
  terms: GiftTerms;
  status: GiftStatus;
  claim_session: string | null;
  human: string | null;
  rate: string;
  paise: string;
  created_tx: string | null;
  claim_tx: string | null;
  settlement_tx: string | null;
  refund_tx: string | null;
  error: string | null;
  design: string;
  sealed_message: string | null;
  created_at: Date;
  payout_id?: string | null;
  payout_status?: string | null;
};
export async function getGift(id: string) {
  const [gift] = await sql<GiftRow>(
    `SELECT g.*,p.payout_id,p.status AS payout_status,COALESCE(g.error,p.error) AS error FROM gifts g LEFT JOIN payouts p ON p.gift_id=g.id WHERE g.id=$1`,
    [id],
  );
  if (!gift) throw new AppError("This envelope could not be found. Check your gift link.", 404);
  return gift;
}
export function publicGift(g: GiftRow, canViewReceipt: boolean): GiftView {
  return {
    id: g.id,
    label: canViewReceipt ? g.label : "A little something for you",
    amount: String(g.amount),
    expiry: Number(g.expiry),
    status: g.status,
    campaign: !/^0x0+$/.test(g.campaign_id),
    createdAt: new Date(g.created_at).toISOString(),
    createdTx: g.created_tx,
    claimTx: canViewReceipt ? g.claim_tx : null,
    settlementTx: canViewReceipt ? g.settlement_tx : null,
    refundTx: g.refund_tx,
    payoutId: canViewReceipt ? g.payout_id || null : null,
    payoutStatus: canViewReceipt ? g.payout_status || null : null,
    paise: String(g.paise),
    canViewReceipt,
    claimPending: g.status === "sent" && !!g.claim_session,
    error: canViewReceipt ? g.error : null,
    design: g.design,
    sealedMessage: g.sealed_message,
  };
}
export async function canViewGift(gift: GiftRow, current: Session) {
  if (gift.sender === current.sender || gift.claim_session === current.id) return true;
  if (!gift.claim_session || !current.credential_id) return false;
  const matching = await sql("SELECT id FROM sessions WHERE id=$1 AND credential_id=$2", [
    gift.claim_session,
    current.credential_id,
  ]);
  return matching.length > 0;
}
