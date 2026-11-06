export const schema = `
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, sender TEXT, credential_id TEXT,
 authenticated_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS credentials (
 id TEXT PRIMARY KEY, public_key TEXT NOT NULL, counter BIGINT NOT NULL,
 transports JSONB NOT NULL DEFAULT '[]', user_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS challenges (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), kind TEXT NOT NULL,
 context JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS gifts (
 id TEXT PRIMARY KEY, sender TEXT NOT NULL, label TEXT NOT NULL, amount NUMERIC(78,0) NOT NULL CHECK(amount > 0),
 expiry BIGINT NOT NULL, secret_hash TEXT NOT NULL, campaign_id TEXT NOT NULL, terms JSONB NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','sent','claimed','settled','returned','failed')),
 claim_session TEXT REFERENCES sessions(id), human TEXT, rate TEXT NOT NULL, paise BIGINT NOT NULL,
 created_tx TEXT, claim_tx TEXT, settlement_tx TEXT, refund_tx TEXT, error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gifts_sender ON gifts(sender);
CREATE INDEX IF NOT EXISTS gifts_expiry ON gifts(status,expiry);
CREATE TABLE IF NOT EXISTS campaign_claims (
 sender TEXT NOT NULL, campaign_id TEXT NOT NULL, human TEXT NOT NULL, gift_id TEXT NOT NULL UNIQUE REFERENCES gifts(id),
 PRIMARY KEY(sender,campaign_id,human)
);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, gift_id TEXT NOT NULL REFERENCES gifts(id), kind TEXT NOT NULL,
 payload TEXT NOT NULL, raw_tx TEXT, tx_hash TEXT, status TEXT NOT NULL DEFAULT 'queued',
 attempts INTEGER NOT NULL DEFAULT 0, error TEXT, next_attempt TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(gift_id,kind)
);
CREATE TABLE IF NOT EXISTS payouts (
 gift_id TEXT PRIMARY KEY REFERENCES gifts(id), idempotency_key TEXT NOT NULL UNIQUE, details TEXT NOT NULL,
 contact_id TEXT, fund_account_id TEXT, payout_id TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending',
 error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, received_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rate_limits (
 bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS gas_spending (
 day TEXT PRIMARY KEY, reserved NUMERIC(78,0) NOT NULL DEFAULT 0
);
`;
