# App readiness — 6 November 2026

## Ready for a local recipient demo

- `/` redirects to `/gifts` (HTTP 307).
- Enter the fictional recipient account and view Milan's $100 gift.
- Redeem to demo onboarding; the acknowledgment is required before issuance.
- Generate one illustrative virtual card for the gift.
- Simulate a $25 purchase; the available balance becomes $75 and repeat demo purchases are disabled.
- Reload and re-enter the demo to recover the card and remaining balance.
- Simulate a provider timeout during onboarding, reload, and recover the reserved card without redeeming again.
- Reset the demo to start over.
- Responsive desktop and narrow mobile layouts render with scoped CSS; no horizontal overflow was observed at the inspected sizes.

Browser state is not a security boundary. Duplicate redemption checks apply to the ordinary local demo lifecycle; concurrent operations across tabs/devices and manipulated browser storage are not protected as a real financial system would require.

## Verification

Verified against the production build, not only the development server:

- `cd web && pnpm check`: TypeScript, ESLint and all 14 tests across three files pass.
- `cd web && pnpm build`: production compilation, type checks and static generation pass.
- HTTP smoke checks: `/gifts`, `/dashboard`, `/fund`, `/merchant` return 200; `/` redirects to `/gifts`; an unknown route returns 404.
- Browser walkthrough: acknowledgment validation, successful issuance, simulated purchase, balance persistence, timeout reservation, reload recovery and reset.
- Desktop and mobile screenshots inspected; no browser console errors observed during the walkthrough.

The verification found and fixed a React storage-initialization lint issue and a pre-existing Tailwind loader rule that removed CSS-module exports. Browser storage now uses React's external-store subscription API, including same-tab changes and cross-tab storage notifications. The Tailwind loader skips CSS modules so Next.js can generate their scoped class exports.

## Not ready for real payments

No real gift funding, authentication, identity verification, Bridge/Stripe card issuance, provider funding connection, secure card-detail display, webhooks, database ledger or background reconciliation exists. Every gift, card and purchase in `/gifts` is simulated. This is not yet the provider-backed sandbox integration described in the original handoff, nor a production payment service.

Before connecting real funds, obtain the supported Bridge + Stripe programme, authenticate the intended recipient, replace browser state with a private transactional ledger and server-side provider idempotency, prove the funding connection, and implement verified webhooks and recovery.

## Legacy routes

`/fund`, `/merchant` and `/dashboard` still contain the previous Leash UI. They render unconfigured states without provider/device environment configuration. Their header now links to the gift demo instead of removed landing-page sections. They were inspected but their removed services were not rebuilt or reconnected. Treat these routes as legacy, not as gift-product features ready to demonstrate.
