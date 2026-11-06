# Shagun gift-card integration

## Intent

Complete the existing Shagun sender → verified recipient → Lithic sandbox virtual card journey. Remove the separate Leash Gifts sample that issues a shared $100 card. Preserve the landing page, sender authorization, gift links, passkeys and private gift-link secret verification.

## Current behavior

- `gifts/claim.ts` requires recipient name and UPI details, inserts a payout intent and queues the chain claim.
- `chain/worker.ts` follows every confirmed claim with whole-gift `cashOut` and Razorpay payout processing.
- `/gifts` is an independent sample pass protected by a shared sandbox access code. Its filesystem reservation represents one server-wide card, rather than one recipient's gift.
- Lithic Phase 0 webhooks do not maintain balances or settle purchases. They cannot safely authorize gift-backed cards today.
- The contract source supports partial spending and claimed-gift closure; the ABI already exposes these methods, but worker integration and deployed-contract compatibility must be checked before enabling this flow.

## Approach

Recommended: use PostgreSQL and the existing durable worker to integrate cards into Shagun. Follow `docs/card-phase-plan.md` phases 1–5. This preserves the real verification and settlement boundaries and supports safe retries.

Alternatives considered:

- Embed the existing Leash Gifts sample inside the claim page: smaller UI change, but still a shared $100 card with no gift binding. Does not satisfy the request.
- Create a gift-sized card without purchase accounting: supports issuance, but cannot safely reconcile spending or return unused gift value. Insufficient for the complete journey.

User confirmed removing Leash Gifts and using dynamic gift pricing with Shagun in the backend on Nov 6. Implementation follows this integration approach.

## Recipient journey

1. Open the existing private claim link and confirm a passkey.
2. Confirm a recent passkey session and the private gift-link secret. World ID was removed by subsequent user instruction. Remove mandatory name and UPI fields for card redemption.
3. Reserve the claim atomically and submit it through the existing transaction journal.
4. After actual claim confirmation, queue one card issuance operation for the gift. Never enqueue whole-gift cash-out for card gifts.
5. Show preparing, recovery-needed, ready, closing and closed states truthfully. Render card details through recipient-authorized Lithic hosted frames, with gift budget, available amount, holds and cleared spending.
6. Allow the same passkey to recover recipient access across sessions. Senders may see gift accounting and receipts, but cannot request recipient card details.

## Issuance and recovery

Add append-only migrations for redemption selection, per-gift card state, issuance operation identity, authorization decisions, transaction events and settlement work. Enforce one card relationship per gift in the database.

Create a paused virtual USD card with a gift-sized FOREVER limit. Use a stable operation identity, provider idempotency and a unique gift memo/tag for recovery. Persist intent before provider calls. After ambiguous results, reconcile the existing operation rather than blindly creating another card. Activate only after the local gift/card ledger exists. Never reuse the standalone sample card for a real gift.

Amounts are integer cents for card operations and integer six-decimal USDT units for chain accounting. Require exact conversion at 10,000 micro-USDT per USD cent under the explicit sandbox convention.

## Purchase authorization and settlement

Verify Lithic webhook signatures. Serialize ASA decisions against the card balance row, keyed by transaction token. Decline unsupported request types, currencies, expired gifts, inactive cards and insufficient funds. Answer from the local ledger without waiting for chain confirmation.

Persist signed event ingestion and processing atomically. Process clearing deltas once by provider event reference; distinguish holds, clearing, voids and returns. Reconcile unexpected or out-of-order amounts rather than inventing balances. Constrain the initial demo to ordinary USD purchases with clearing no greater than the approved amount. Refund/return events freeze the affected allocation for reconciliation; do not imply the vault supports reversing a completed spend. Queue partial `spend` operations with unique references. Preserve transaction journaling, gas limits and chain operation allowlists. Repeated or concurrent purchases must not overdraw a gift.

Sandbox purchase controls must be server-authorized and act only on the authenticated gift card. The shop must stop using the shared access-code card. Reuse its provider simulation primitives where appropriate, while deriving the card from the recipient's Shagun session.

## Expiry and returns

Keep immediate permissionless unclaimed expiry refunds. For claimed cards, stop new authorizations, pause/close the provider card, reconcile pending purchases and chain settlements, then call `closeClaimed` for safely unused funds. Card closure and zero local holds alone are insufficient: require authoritative provider transaction reconciliation, a recorded reconciliation checkpoint and zero pending settlement or exception work before on-chain closure. Expiry alone must not release money reserved for outstanding purchases. Show pending reconciliation until confirmed. Do not silently convert a claimed card into a UPI payout.

## Remove Leash Gifts

- Replace the standalone `/gifts` sample with a redirect to Shagun's dashboard.
- Preserve `/gifts/[giftId]` because these are Shagun receipt URLs already shared by the sender flow.
- Remove the standalone sandbox issuance endpoints, access-code authentication and single shared-card code once remaining callers are migrated.
- Remove the hardcoded sender, sample $100 pass and Leash Gifts branding.
- Retain existing persistent provider records; do not delete or cancel previously created cards as part of code cleanup.
- Update shop entry points to lead back to the recipient's Shagun gift flow; preserve unrelated landing-page work and avoid an unsolicited store redesign.

## Configuration and rollout

Use secrets only through environment variables; never print or commit credentials. Keep all Lithic operations sandbox-only and label cards and purchases Lithic SANDBOX. Require configured HTTPS origin for hosted frames and public signed webhooks. Update README, environment examples and operations/context documentation.

Check the deployed vault supports `spend` and `closeClaimed` before live activation. If a new deployment is needed, do not point old funded gifts at a replacement vault. Preserve existing UPI records for reconciliation; card mode applies to new claims under explicit redemption selection. Surface missing external configuration instead of generating fake cards or receipts.

## Verification

Test issuance retries and ambiguous recovery, duplicate claims, authorization concurrency and replay, over-budget and expired authorizations, unsupported currencies, duplicate/out-of-order events, partial clearings, settlement retries, recipient-only details, same-passkey recovery and no unsafe expiry refund. Exercise a real sandbox send → claim → show card → purchase → declined purchase → unused return when provider and chain configuration is available. Report separately what is locally tested and what has real provider evidence.

## Builder decisions

Keep Next.js, PostgreSQL, ethers and the current Lithic hosted-frame library. Keep card lifecycle code under `server/cards`, chain writes in the durable worker, and recipient UI under `components/shagun`. Use the existing brand styles. No new identity provider, payment provider or old device/merchant integrations.

## Builder review

Reviewed against current claim, worker, ABI and card foundations. No additional product decision is required. The review tightened late-clearing closure checkpoints and limited unsupported refund handling to explicit reconciliation.

## Identity amendment

User explicitly removed World ID. Claims now use a fresh passkey plus the private link secret. A keyed credential commitment supplies the legacy vault `human` field, and campaign uniqueness is per passkey. The World UI, verification client, environment requirements and SDK dependencies are removed; the old verification endpoint returns 410.
