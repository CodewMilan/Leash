# Shagun Card Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace standalone Leash Gifts with gift-sized, recipient-owned Shagun sandbox cards.
**Architecture:** PostgreSQL owns gift redemption and card budgets; the existing worker issues after confirmed claims and journals partial spend transactions. Recipient endpoints derive ownership from passkey-authenticated sessions. Independent UI removal and card service modules may be developed concurrently with fixed interfaces.
**Tech Stack:** Next.js, TypeScript, PostgreSQL, ethers, Lithic sandbox, Vitest.
**Spec:** docs/superpowers/specs/2026-11-06-shagun-card-integration-design.md

## Global Constraints

- Secrets only from environment variables; sandbox only; retain real receipts and verification.
- Preserve existing UPI payout records and receipt URLs; no deletion of provider records.
- Card spending limits equal gift amount / 10,000 in integer cents; reject fractions of cents.
- No automatic return of reserved or unreconciled funds; no whole-gift cash-out for card gifts.
- Preserve unrelated local wallet authorization changes.

## Review Focus

- Retry after ambiguous issuance must reconcile the same gift card, not create a duplicate.
- Sender sessions must never access recipient card details.
- Duplicate and concurrent ASA requests must not overspend.
- Legacy payout work must retain its original redemption mode.
- Expiry must not return money with unsettled card liabilities.

### Task 1: Card schema, issuance and recipient endpoints
Files: append migration 003; server/cards/issuance.ts, controller.ts; types.ts.
Interfaces: issueGiftCard(giftId: string): Promise<void>; cardRead(path: string, session: Session): Promise<Response|null>; cardPost(path: string, session: Session): Promise<Response|null>. GiftCardView describes status, lastFour, expiry, budgetCents, reservedCents, clearedCents, availableCents and sandbox network. Root will route these controllers and invoke issuance from worker.
- [x] Write tests for dynamic amount conversion, recipient-only access and ambiguous issuance retry.
- [x] Run failing tests; implement schema, persistent per-gift issuance/recovery and hosted embed.
- [x] Run focused tests and report exact schema/interfaces to integrator.

### Task 2: Recipient UI and Leash Gifts removal
Files: Claim.tsx, CardWallet.tsx, /gifts/page.tsx, Shared.tsx, shop UI; remove unused standalone sandbox endpoints and code after caller migration.
Interfaces: GET gifts/:id/card returns {card: GiftCardView|null}; POST gifts/:id/card/embed returns {session:string}. Claim no longer requires UPI; card mode is backend default. /gifts redirects to /dashboard; preserve /gifts/:id.
- [x] Replace UPI form and payout copy with sandbox card journey; render recipient CardWallet with permission recovery.
- [x] Redirect sample page, remove its entry points and operator card access; preserve provider storage.
- [x] Validate TypeScript and inspect responsive UI using existing styles.

### Task 3: Claim/worker/ASA/settlement integration
Files: gifts/claim.ts, gifts/create.ts, api.ts, chain/worker.ts, cards/webhooks.ts, cards/ledger.ts.
- [x] Test card-default claim with no payout creation, dynamic budgets, replay/over-budget authorization and settlement identity.
- [x] Claim new gifts as card mode; preserve old payout claims; issue only after chain confirmation.
- [x] Implement locked ASA decisions and durable event processing, partial spending jobs and conservative expiry closure. Mark unresolved provider evidence for reconciliation; never release unsafe funds.
- [x] Run focused tests then whole suite, lint, typecheck and build.

### Task 4: Documentation, migration and review
Files: README.md, docs/context.md, docs/operations.md, web/.env.example.
- [x] Update setup, new flow, legacy retirement and sandbox limits. Apply append-only local migration.
- [x] Review final diff for authorization, retry, balance and legacy compatibility defects; fix findings.
- [x] Verify local routes and clearly distinguish local checks from external provider validation.

## Progress

User confirmed removal and dynamic gift pricing. Execute in current local checkout so the running development server picks up changes. Branch isolated as codex/shagun-gift-cards; no commits, push or provider card deletion requested.

## Execution evidence

- Task 1: gift-sized issuance and recipient endpoint tests passed; recovery and expiry are covered.
- Task 2: mocked mobile card-flow and embed-retry browser checks passed; `/gifts` redirect confirmed in actual E2E.
- Task 3: claim, worker routing, atomic ledger and signed webhook tests passed. Reviewed and fixed vault capability gating and per-gift closure event isolation.
- Task 4: local migrations 3/4 applied; actual browser suite 4/4 passed on a disposable PostgreSQL database against the production build. Final unit/type/lint/build checks recorded in the session.
- Ruling: continue in the current checkout on `codex/shagun-gift-cards` so the user's local server picks up the work. Keep prior wallet fixes and do not commit or push.
- Ruling: remove obsolete shared-card service/authentication code and retire endpoints with 410; preserve previously issued provider records on disk.
- Ruling: new cards require vault capability checks before the worker processes claims or issues cards. The configured environment currently lacks VAULT_ADDRESS, a funded relayer and Lithic webhook setup, so no real-provider end-to-end result is claimed.
- The initial development-server E2E attempt timed out during compilation. A production-build retry exposed a stale pre-existing signed-out dashboard assertion; it now checks the actual MetaMask installation link. The final four browser checks pass.

Identity amendment: World ID removed by user instruction. New claim tests cover fresh passkey, link secret, no external proof call, per-passkey campaign concurrency and retired World endpoint. Deployment remains pending because every configured test wallet has zero WBT; no blockchain transaction was submitted.
