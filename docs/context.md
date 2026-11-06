# Project context

The repo is the Next.js website in `web/`. Old device, merchant services, 0G, Hedera and World ID integrations were removed. Do not reconnect legacy screens unless asked. Secrets come only from environment variables and must never be committed.

## Current flow: received pass to sandbox commerce

On `codex/end-to-end-gifting`, `/gifts` starts with a received $100 sample pass. A local sandbox access code opens the shared demo (signed HttpOnly session), then the user reviews and issues or recovers the same Lithic virtual card. The code is not real recipient identity verification. No email delivery is implemented. `/sandbox` redirects to `/gifts`. Card-ready CTA leads to `/shop`.

Wallet connection and gift purchase payment were removed at the user's request. `/api/wallet` and old `/api/orders` routes return HTTP 410. Wallet/payment library code and records are preserved for historical reference, not connected to the current UI or shop authorization. Base Sepolia variables are not needed.

`/shop` provides catalog, quantity cart, server prices, authorized received-pass card selection and persistent receipts. Actual Lithic sandbox authorization + clearing is verified against card, descriptor, currency and amounts before PAID. PAN is fetched only transiently in server memory for the simulator; never log, persist or expose it. Provider descriptors truncate to 22 characters; new orders use 20. Save intent before external calls; recover the same order and never blindly repeat clearing.

Use one persistent local Node instance. Preserve `.env.local` and `.data/lithic`, including the existing `gift.json` card reservation, historical orders/payment claims, and `shop/` receipts. The received pass is illustrative and the card spending limit is not deposited funds. No crypto conversion, real funding, merchant bank payout, live KYC, email delivery or Apple Pay is implemented. No real products ship. See readme.md for setup and docs/readiness.md for evidence.

## Merged main application

Latest `main` is merged on the testing branch. Its Shagun landing page remains at `/`, with its additional routes, contracts, database and worker code preserved. The received-pass sandbox demo remains at `/gifts` and `/shop` and does not require the main app’s database or wallet. Main application setup/status is documented in `docs/main-context.md`; those integrations require their own environment and verification.
