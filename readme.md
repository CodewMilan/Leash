# Leash Gifts

Recipient demo: **received gift → redeem → onboarding → virtual card**.

```bash
cd web
pnpm install
pnpm dev
```

Open http://localhost:3000 (redirects to `/gifts`). Run `pnpm check` in `web/` for TypeScript, lint, and tests.

## Demo scope

The demo starts with a fictional $100 gift from Milan to Alex. Enter the recipient demo, redeem the gift, acknowledge the demo onboarding, and generate an illustrative virtual card. Simulate a $25 purchase to see the remaining $75 balance. Enable the timeout checkbox during onboarding to reserve the gift, then recover the same card using **Check status & recover card**. Reloading preserves progress; **Reset demo** starts over.

All funding, authentication, identity verification, card issuance, and purchases are simulated. No Bridge or Stripe API is called. There are no real PANs, CVCs, account credentials, or spendable funds. No secrets are needed. Browser localStorage stores only fictional demo state; it is editable and is not a production ledger or security boundary. Duplicate redemption is blocked in the ordinary demo flow, not guaranteed across concurrent browser tabs or devices.

## Connecting real providers

Obtain an approved connected Bridge + Stripe Issuing sandbox programme first. A production implementation needs authenticated recipient ownership, provider-hosted onboarding and card-detail presentation, a private transactional database with unique gift redemption and provider idempotency keys, verified webhooks, and background reconciliation. Prove the gift's funds reach the supported card funding source before describing redemption as crypto-backed. Browser state must never authorize real issuance or spending. Keep provider credentials server-side in environment variables; never use `NEXT_PUBLIC_` for secrets.

The existing legacy Leash pages are not part of this flow and have not been reconnected.

For verified behavior, checks, and remaining integration work, see [app readiness](docs/readiness.md).
