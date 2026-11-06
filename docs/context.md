# Project context

The repo is the Next.js website in `web/`. The previous Leash device, merchant services, 0G, Hedera payments and World ID integrations were removed. Legacy UI routes still exist; do not rebuild or reconnect those flows unless asked.

The current product direction is gift redemption into virtual cards.

## Lithic sandbox integration

`/` redirects to `/gifts`. The recipient flow now calls Lithic's actual sandbox API through authenticated server routes, replacing the local fake card and purchases. The API key is in environment variables, never client code or commits. The sandbox operator session is signed and HttpOnly. One sample gift is reserved on persistent server disk before issuance; an idempotency UUID and provider memo support safe recovery. Only masked card metadata is returned. No full card numbers or CVCs are displayed by the app.

The gift is still illustrative. Its $100 value becomes a lifetime spending limit, not a funded card balance. Wallet login, real gift ownership, crypto funding/conversion, Bridge/Stripe, live KYC, webhooks and production recipient authentication remain unimplemented. See the README and docs/readiness.md for setup, verification and deployment limits.

Use a single persistent Node server for this sandbox build; do not claim serverless/distributed or production readiness. Keep `.env.local` and `.data/` untracked. API credentials are read from environment variables.
