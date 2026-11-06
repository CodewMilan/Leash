# App readiness — 6 November 2026

## Ready: actual Lithic sandbox issuance

- `/` redirects to `/gifts`.
- Operator signs in with the server-configured sandbox access code; the server sets a signed HttpOnly session cookie.
- Review the sample gift and explicitly confirm sandbox card creation.
- Server calls `POST https://sandbox.lithic.com/v1/cards` to create a `VIRTUAL` card with a $100 `FOREVER` spending limit.
- Display actual provider last-four digits, expiry, state, spend-limit period and card token; link to the Lithic dashboard when the programme token is configured.
- Refresh or revisit to retrieve the same card from Lithic. Repeated issuance returns that card rather than creating another.
- Persist the reservation before contacting Lithic; recover uncertain results using the unique provider memo. No automatic replacement on timeout.
- Keep credentials, full PAN and CVV out of API responses and browser storage. Server records contain only identifiers and reservation metadata.

## Verification

- `cd web && pnpm check`: TypeScript, ESLint and 19 tests pass.
- `cd web && pnpm build`: production compilation and static/dynamic route generation pass.
- Actual authenticated HTTP integration created sandbox card ending **6637**, provider status **OPEN**, with a $100 lifetime limit. A repeated POST returned the same token.
- API rejects unauthenticated reads (401) and cross-origin writes (403).
- Tests cover persisted duplicate prevention, simultaneous requests, uncertain timeout recovery, rejected provider calls, expired/altered sessions and exact-origin protection. Provider tests use controlled HTTP responses; the successful sandbox round trip was tested separately.
- Browser inspection confirms the actual provider card is displayed after local operator login and is independently listed in the Lithic dashboard under its unique reservation memo.

## Not ready: crypto-backed redemption or production spending

The received gift remains a sample, not a verified funded onchain record. The spending limit does not deposit money. No real gift recipient authentication, wallet integration, funding bridge, conversion, Bridge/Stripe connection, live KYC, webhook reconciliation or in-app purchase handling exists. Use Lithic's dashboard for sandbox transaction tests. The previous local fake purchase/balance controls were removed.

## Operating boundary

This is a local single-Node-process sandbox integration using persistent writable disk, not a distributed database or a serverless service. Preserve `.data/lithic` (or `LITHIC_DATA_DIR`) and `.env.local`. Losing reservation data can allow another card to be created. After ambiguous or rejected provider calls, the reservation stays locked against new issuance until the provider result is reviewed. A crash may leave `issuance.lock`; GET status recovery remains available. Do not clear records blindly.

The operator access code and per-process sign-in throttling are not production recipient authorization. Production requires proper identity/ownership checks, transactional storage, provider webhooks, secure funding, and the appropriate card programme approval.

Legacy `/fund`, `/merchant` and `/dashboard` remain unconfigured old Leash pages, not gift-product features. Their header links to the gift demo rather than removed landing sections.
