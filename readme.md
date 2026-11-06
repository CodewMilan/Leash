# Leash Gifts

Receive a sample gift and generate an actual **Lithic sandbox virtual card** through server-side API calls. The gift itself is illustrative; crypto funding is not connected.

## Run locally

Requires Node.js 20.9+ and pnpm 10.14.0. Run the app from `web/` so its default persistent-data path stays consistent.

```bash
cd web
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set LITHIC_API_KEY and LITHIC_SANDBOX_ACCESS_CODE in .env.local
pnpm dev
```

If `.env.local` already exists, edit it rather than replacing it. Open http://localhost:3000 (redirects to `/gifts`). Enter your configured sandbox access code, select **Redeem to sandbox card**, acknowledge sandbox-only use, and generate the card. A provider-backed card is shown with its masked number, expiry, current status and spending limit. Refresh or revisit to recover the same card.

## Environment

- `LITHIC_API_KEY`: a **sandbox** API key. Requests are hardcoded to `https://sandbox.lithic.com/v1`; there is no production URL switch.
- `LITHIC_SANDBOX_ACCESS_CODE`: at least 16 characters; use a randomly generated value. Protects the sandbox operator session, not a recipient identity or real funds. The signed HttpOnly session lasts eight hours. Changing the code invalidates sessions.
- `LITHIC_ACCOUNT_TOKEN`: optional account-holder `account_token` if your Lithic programme requires one. Create/approve the appropriate sandbox account holder in Lithic first. This is not the dashboard's programme ID.
- `LITHIC_PROGRAM_TOKEN`: optional programme UUID for the card-dashboard link.
- `LITHIC_DATA_DIR`: optional persistent writable directory; defaults to `.data/lithic` relative to the app's working directory.

Keep secrets server-side, without `NEXT_PUBLIC_`, and never commit `.env.local` or `.data/`.

## What this does

One sample gift per server data directory is reserved before the first provider call. A UUID idempotency key and unique memo identify that issuance. Subsequent requests return the same provider card. Signing out, clearing browser storage or restarting the server does not reset issuance.

After a timeout, **Check status & recover card** searches the provider's cards for the reservation memo. The app does not issue another card when the original result is uncertain. Provider validation or access errors also leave the reservation in place: an operator must verify the result in Lithic rather than blindly resetting the record. A process crash can leave `issuance.lock`; GET status/recovery still works. Do not remove the reservation to retry issuance without verifying the provider outcome.

The server stores only reservation metadata and the provider card token. API responses explicitly allow only masked details, expiry, card status and spend-limit fields. PAN/CVV and API credentials are not exposed. Inspect sensitive card details and run sandbox transactions directly in Lithic's dashboard.

## Limits

This is a **local, single-Node-process sandbox integration with persistent disk**, not a production card programme or a serverless/distributed ledger. Keep the data directory across restarts and deployments; losing it loses the server's link to the gift and may allow another issuance. Do not publicly deploy without replacing local operator access/rate limiting with proper user authentication and authorization and moving reservations to a transactional database.

The $100 is a provider-enforced lifetime spending limit, **not a deposited balance or proof of crypto funding**. No wallet connection, real gift ownership verification, crypto conversion, Bridge/Stripe connection, live KYC, provider webhook reconciliation or in-app purchase flow is implemented. The old fake card and local fake purchase buttons have been removed. Test purchases in Lithic use test data and never spend real money.

The legacy `/fund`, `/merchant` and `/dashboard` pages are not part of this gift flow and have not been reconnected.

## Verify

```bash
cd web
pnpm check
pnpm build
pnpm start
```

See [app readiness](docs/readiness.md) for verified behavior and remaining work, and [Lithic's card creation guide](https://docs.lithic.com/docs/create-card) for provider setup.
