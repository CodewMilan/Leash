// Append-only card decisions, provider reconciliation and settlement work.
export const schema = `
ALTER TABLE gift_cards ADD COLUMN reconciled_at TIMESTAMPTZ;
CREATE TABLE card_authorizations (
 token TEXT PRIMARY KEY,
 gift_id TEXT NOT NULL REFERENCES gifts(id),
 card_token TEXT NOT NULL,
 amount_cents BIGINT NOT NULL,
 currency TEXT NOT NULL,
 request_status TEXT NOT NULL,
 result TEXT NOT NULL,
 reason TEXT NOT NULL,
 hold_cents BIGINT NOT NULL DEFAULT 0 CHECK(hold_cents>=0),
 settled_cents BIGINT NOT NULL DEFAULT 0 CHECK(settled_cents>=0),
 snapshot_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX card_authorizations_gift ON card_authorizations(gift_id);
CREATE TABLE card_events (
 id TEXT PRIMARY KEY,
 transaction_token TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','done')),
 error TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX card_events_pending ON card_events(status,next_attempt);
`;
