// Immutable after application. Card budgets are USD cents; gifts retain six-decimal USDT units.
export const schema = `
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS redemption TEXT CHECK(redemption IN ('card','upi'));
UPDATE gifts SET redemption='upi' WHERE redemption IS NULL AND
 (status IN ('claimed','settled') OR claim_session IS NOT NULL OR EXISTS(SELECT 1 FROM payouts p WHERE p.gift_id=gifts.id));
CREATE TABLE IF NOT EXISTS gift_cards (
 gift_id TEXT PRIMARY KEY REFERENCES gifts(id),
 card_token TEXT UNIQUE,
 operation_id TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','ready','closing','closed','reconciliation')),
 budget_cents BIGINT NOT NULL CHECK(budget_cents>0),
 reserved_cents BIGINT NOT NULL DEFAULT 0 CHECK(reserved_cents>=0),
 cleared_cents BIGINT NOT NULL DEFAULT 0 CHECK(cleared_cents>=0),
 last_four TEXT, exp_month TEXT, exp_year TEXT, network TEXT,
 error TEXT, request_started BOOLEAN NOT NULL DEFAULT false,
 next_attempt TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(reserved_cents+cleared_cents<=budget_cents)
);
CREATE INDEX IF NOT EXISTS gift_cards_pending ON gift_cards(status,next_attempt);
`;
