# Leash Gifts

**Receive a gift pass → redeem a Lithic sandbox card → shop → provider-verified sandbox receipt.** No wallet connection or gift purchase payment is required.

## Start locally

Requires Node.js 20.9+ and pnpm 10.14.0.

```bash
cd web
pnpm install --frozen-lockfile
# For a fresh setup only: copy .env.example to .env.local.
# Set LITHIC_API_KEY and LITHIC_SANDBOX_ACCESS_CODE (16+ random characters).
pnpm dev
```

Preserve an existing `.env.local`. Open [the local app](http://localhost:3000/gifts). Enter the local sandbox access code to open the received sample pass. This code protects shared local demo tools; it is not recipient identity or email verification. If its card already exists, the app recovers that same card. Otherwise review sandbox use and generate it through Lithic. Select **Shop with this card**, add products and check out.

`/sandbox` redirects to `/gifts`. `/shop` shares the same signed HttpOnly session and shows the received pass card. Wallet sign-in, gift purchase and payment endpoints are retired with HTTP 410. Old wallet/payment records remain on disk; no testnet transfer is requested. No email delivery is implemented.

## Server configuration

Required: `LITHIC_API_KEY` (sandbox only) and `LITHIC_SANDBOX_ACCESS_CODE` (at least 16 characters).

Optional: `LITHIC_ACCOUNT_TOKEN` (account holder if required), `LITHIC_PROGRAM_TOKEN` (dashboard links), `LITHIC_DATA_DIR` (defaults to `.data/lithic` from `web/`). Base Sepolia variables are no longer needed for this flow. Never prefix secrets with `NEXT_PUBLIC_`; `.env.local` and `.data/` remain untracked.

## Sandbox checkout and recovery

The pass is a sample $100 reference value. Its Lithic card has a $100 lifetime spending limit, not a deposited cash balance. One card is reserved on this local server; signing out does not reset it. Preserve `.data/lithic`, including `gift.json` and `shop/`, across restarts.

Store prices are calculated on the server. Checkout calls Lithic sandbox [authorization](https://docs.lithic.com/docs/simulate-auth) and [clearing](https://docs.lithic.com/docs/simulate-clearing), then verifies transaction status, card, descriptor, currency and amounts before marking PAID. The simulator requires a PAN, fetched only transiently in server memory; it is never logged, persisted or returned to the browser. No CVV is collected.

Recover uncertain results on the existing order. Authorization and clearing intent are saved before external calls. Uncertain clearing is never blindly resent; operator review may be required. Do not delete records to retry.

This is issuer-side simulated commerce, not a Stripe/Razorpay acquiring connection. No merchant bank receives money, no products ship, and no crypto conversion, real funding, live KYC or Apple Pay provisioning is connected. Use one persistent local Node instance; distributed/serverless or production deployment requires additional storage, identity, recovery and programme work.

## Verification

```bash
cd web
pnpm check
pnpm build
pnpm start
```

See [readiness](docs/readiness.md) for actual sandbox transaction evidence. Legacy `/fund`, `/merchant` and `/dashboard` screens are not connected to their old services.

Illustrative Unsplash photography: [notebook](https://images.unsplash.com/photo-1531346878377-a5be20888e57), [bag](https://images.unsplash.com/photo-1544816155-12df9643f363), [bottle](https://images.unsplash.com/photo-1602143407151-7111542de6e8).
