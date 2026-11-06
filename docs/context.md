---
cursor:
  subagentId: "bc-c80311ec-5056-53d1-9e6f-a4f97096dc61"
---

# Shagun: knowledge base (crypto gift → Lithic sandbox virtual card)

"Shagun" is a working name. This file is the single source of truth for any teammate or AI agent on the gift project at ETHGlobal Mumbai.

Hacking ends **Sat Nov 7, 09:00 IST** (hard deadline). Judging runs 09:30–12:30 IST.

*Updated Nov 6: Shagun now connects new verified claims to one gift-sized Lithic sandbox card through the durable worker. The separate Leash Gifts sample page redirects to the dashboard and its issuance/session APIs return 410. Gift limits derive from the amount in exact USD cents. Recipient-only hosted frames, locked authorization holds, durable event reconciliation, partial chain spending and conservative expiry closure are implemented. Existing UPI claims retain their original payout work. Real provider/chain validation still requires Lithic credentials, a compatible deployed vault and public HTTPS webhooks; local test evidence is not a live-demo claim.*

User decision Nov 6: World ID is removed. New claims use passkeys and the private gift-link secret; campaign limits are per passkey.

User decision Nov 6, 22:05 IST: position Shagun as **prepaid fiat gift cards**. Do not pitch it as anonymous payments: Lithic, its bank, our backend and the public chain all see purchase data, and anonymous prepaid access is only permitted for small, non-reloadable cards with an identified buyer.

## 1. One-liner and positioning

**“Prepaid fiat gift cards, paid in USDT. Pay for a Diwali shagun in USDT without gas; the recipient claims a prepaid dollar gift card with a passkey, spends from it like any card, and the reconciled unused balance comes back to the sender.”**

- **Category:** a prepaid gift card, the digital equivalent of a store-bought gift card, funded with stablecoins. Supporting line only: the recipient shares no name, phone, bank or wallet, just a passkey.
- **Primary partner:** Whitechain. Showcase gasless official-USDT settlement and verifiable gift rules.
- **Demo hook:** the judge taps an NFC envelope, confirms with a passkey, and sees a genuine Lithic sandbox prepaid card in the browser.
- **Three differentiators:** crypto in, prepaid dollar card out (no sender-paid gas, no recipient wallet or token); one exact-amount card per gift, never reloaded, with every purchase approved live against the gift balance and cleared spending settled on-chain; unused gift value returned after expiry and reconciliation.
- **Main redemption:** a Lithic sandbox prepaid virtual card, with a spend limit matching the gift. The sandbox is not connected to card networks, so the card cannot purchase real goods; purchases are simulated. The card budget is separate from Whitechain USDT.
- **Optional extra:** RazorpayX UPI test payout, as an alternative redemption mode, after the card demo passes.
- **Production scope:** neither issuing/availability in India nor automatic conversion of Whitechain USDT into card funds is established. Verify production provider eligibility before making geographic or real-money claims.

## 2. Ground rules

- Real testnet transactions and real passkey confirmation; never fabricate receipts.
- Label every card and purchase simulation **Lithic SANDBOX**. Show the network of the card program actually used (sandbox offers Mastercard and Visa test programs).
- Preserve the existing brand kit and coordinate with the landing-page developer.
- Start with the Lithic sandbox access gate. Budget roughly three hours for the provider-specific slice; balance/contract changes, testing and the existing external setup take additional effort. Keep the 03:00 integration hard stop and 05:00 feature freeze.
- Secrets come from environment variables only. Commit steadily and distinguish implemented behavior from planned integrations.
- A claimed-card return needs off-chain card/hold reconciliation. Only the unclaimed-envelope return can retain the existing permissionless expiry rule without additional provider trust.

## 3. User flows

**A. Sender**
1. Signs in, chooses a gift amount, campaign if any, and expiry.
2. Signs an EIP-3009 authorization with gift terms committed to its nonce. The relayer funds the vault and pays gas.
3. Shares the private claim link/QR/NFC URL after chain confirmation.
4. Tracks funded, reserved, captured, return-pending and returned amounts, with receipts and CSV export.

**B. Recipient**
1. Opens the private link and confirms a passkey; the backend verifies the link secret.
2. The relayer confirms `claim()`. An idempotent issuance job creates one sandbox virtual USD card and binds it to that gift.
3. Recipient-only Lithic hosted card frames (`lithic-embed`) display the card details. PAN/CVV are never stored or served by our backend.
4. A simulated purchase sends a signed Auth Stream Access (ASA) request. The backend atomically reserves available budget and answers within three seconds; it does not wait for chain confirmation.
5. Clearing events record actual spending and enqueue idempotent partial on-chain settlement. The UI distinguishes approval holds, cleared purchases and settlement receipts.
6. At expiry, stop new approvals, pause and close the card, reconcile pending liabilities, close the card allocation and return safely unused USDT. Display return pending until confirmed.

**C. Denied paths**
- A consumed envelope cannot be claimed again.
- The same passkey claiming a second gift in the same company campaign is rejected.
- An unsupported, expired or over-budget authorization is declined in the supported sandbox flow. Lithic spend limits supplement the atomic ledger.
- An unclaimed expired gift returns in full. A claimed card with pending liabilities remains in closing/reconciliation instead of refunding money still needed for an approved purchase.

## 4. Recipient identity (World ID removed by user request)

Claims require a recently authenticated passkey and the private gift-link secret. There is no World SDK, proof request, backend World call or World credential requirement.

The backend derives a keyed commitment from the verified credential ID, scoped to `shagun-recipient-passkey:v1`. It uses that commitment in the vault's existing `human` ABI field; the field name is retained for compatibility and does not imply proof of a unique person. Campaign limits are one gift per passkey. A person can create more than one passkey, so do not claim one-per-human protection.

The first holder of an unclaimed private link who confirms a passkey can claim the gift. The passkey protects subsequent card access. Old World-backed claimed gifts and receipts remain intact; new claims use passkey commitments. Cross-version campaign person uniqueness is not asserted.

## 5. Architecture and verified facts

```text
Sender dashboard / Privy → signed EIP-3009 → backend → relayer → Whitechain ShagunVault
Recipient / passkey + private secret → verified claim → issuance job → Lithic sandbox card
Lithic ASA request → atomic PostgreSQL reservation → fast approve/decline
Lithic clearing events → durable settlement job → partial vault spend → treasury
Expiry worker → card close + hold reconciliation → closure → unused USDT return
Optional alternative: RazorpayX UPI test payout (one redemption mode per gift)
```

### Verified on-chain on Fri Nov 6 (by direct RPC calls)
- **RPC:** `https://rpc.testnet.whitechain.io` returns chain ID `0x752` = **1874**. (`rpc-testnet.whitechain.io` is a different chain, 2625. Don't use it.)
- **Official test USDT:** `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`.
  - It's a proxy; the implementation is `0x26425662d126412128967ecf0a02ec48573026f7`. Name "Tether USD", 6 decimals.
  - **It does support gasless approvals.** The implementation exposes `permit` (EIP-2612), `transferWithAuthorization`, `receiveWithAuthorization` and `cancelAuthorization` (EIP-3009).
  - `DOMAIN_SEPARATOR`, `nonces` and `authorizationState` all respond.
  - An earlier answer saying "no permit / no EIP-3009" was wrong.
- **EIP-712 domain** (worked out by recomputing `DOMAIN_SEPARATOR`): `{ name: "Tether USD", version: "1", chainId: 1874, verifyingContract: 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 }`. There's no `version()` function, so hard-code `"1"`.
- **First thing to do:** submit one real `receiveWithAuthorization` on testnet to confirm it end to end.

### Gasless design
- **Use `receiveWithAuthorization`, not `transferWithAuthorization`.** The receive variant can only be executed by the payee (our vault), which blocks front-running.
- **Sender wallet:** an embedded EOA (generated in the browser and protected by a passkey-encrypted backup, or a provider such as Privy or Dynamic if it supports a custom chain 1874). It holds test USDT from the faucet and never needs WBT.
- **Recipient:** never holds tokens or keys. The vault pays out on their behalf after the passkey and link-secret checks.

### `ShagunVault.sol`: current code

The vault has gasless creation, attested claim, campaign uniqueness, admin pause/key rotation, and permissionless expiry refunds for unclaimed gifts. Card redemption is in the contract and wired to the worker; verify the configured deployment supports it before live use:

- `spend(giftId, amount, spendRef)` (operator only) sends one cleared card amount to the treasury. Each `spendRef` is accepted once; spending never exceeds the gift, and a fully spent gift becomes `Settled`. Spending is allowed after expiry, because clearings for purchases approved before it can arrive late; only closure stops it.
- `closeClaimed(giftId)` returns `amount - spent` to the sender after expiry and marks the gift `Returned`. The operator calls it once card holds are reconciled; anyone may call it after `CLOSE_GRACE` (7 days), so a claimed gift's balance cannot be stranded if the backend disappears.
- Whole-gift `cashOut` (the non-card mode) is refused once any card spending exists: one redemption mode per gift.

Settle clearings, not every approval as if it were final spending. Use Lithic transaction event references as `spendRef`, because one authorization can yield several events (partial clearings, voids, returns). The trust boundary: until the grace period ends, a claimed card's return depends on the backend reconciling outstanding card liabilities before closing.

### Lithic sandbox: card integration

- Phase 0 code exists: sandbox-only API client, signed ASA responder (`/api/webhooks/lithic/asa`), signed events endpoint (`/api/webhooks/lithic/events`), `pnpm lithic:phase0` setup/simulation script, and `/dev/card`. The per-gift integration is locally tested; actual end-to-end provider validation remains a deployment check.
- Use a `FOREVER` card spend limit plus a transactional balance ledger. Pre-ASA checks can decline first; the ledger is the source of truth.
- Show card details only through Lithic hosted frames with a short-lived embed session created by our backend for the authenticated claimant. Never return PAN/CVV from our API.
- ASA times out at six seconds (answer within three) and retries on 5xx, so decisions must be idempotent on the ASA `token`. Keep chain writes asynchronous; any failure declines.
- ASA and events need a public HTTPS URL (tunnel or deployment); the embed `target_origin` must equal the page origin.
- Track holds, clearings, voids, returns and closure separately. Closing a card does not by itself prove approved purchases cannot clear.
- Demonstrate purchases with Lithic's sandbox simulation endpoints. Keep production issuing scope outside the MVP claims.
- See [card phase plan](./card-phase-plan.md) for the implementation sequence.

### Relayer drain protection (Whitechain asks for this)
- The relayer may only call `ShagunVault` functions, and the backend enforces an allowlist.
- Each gift can be claimed once, with a daily cap per passkey recipient commitment, rate limits per IP and per gift, and a gas cap per transaction.
- **Where the relayer's WBT comes from:** the faucet on testnet. In production, a 0.5% USDT fee per gift pays for gas. Write this in the README.

### Chainlink CRE (verified in the docs)
- CRE CLI v1.15.0 (May 14, 2026) added a global **`--allow-unknown-chains`** flag for `cre workflow simulate` and `deploy` ([CLI reference](https://docs.chain.link/cre/reference/cli), [release notes](https://docs.chain.link/cre/release-notes)).
- **Caveat:** "chain-selector and RPC availability are still enforced". If Whitechain has no chain selector registered, the flag may not be enough.
- **On-chain writes in simulation go through a mock forwarder listed per tenant** (`cre workflow supported-chains`, which needs `cre login`). An unlisted chain probably has none.
- **After the card-first core works:** run `cre workflow simulate --allow-unknown-chains` with the 1874 RPC set in `project.yaml`.
  - **Plan A:** use a confirmed claim event to orchestrate the idempotent Lithic card issuance service. Keep CRE outside synchronous card authorization.
  - **Plan B:** if chain writes fail but reads work, read the gift from Whitechain and invoke the same authenticated issuance service while the backend records chain effects. Prove that it is meaningfully used; do not create a second redemption path.
  - **Plan C:** if Whitechain can't be reached at all, drop Chainlink for ENS (see section 6).

### RazorpayX (optional alternative; earlier integration foundation)
- **Razorpay has no card-issuing API.** A virtual Visa card isn't possible with Razorpay; use **UPI payouts** instead.
- **RazorpayX test mode** has its own dummy balance (add any test amount), test API keys, contacts, fund accounts (UPI ID / `vpa`), payouts and webhooks ([test mode](https://razorpay.com/docs/x/dashboard/test-mode)).
- **Flow:** create a contact → create a fund account of type `vpa` → `POST /v1/payouts` with `mode: "UPI"` and an `X-Payout-Idempotency` header ([payout to VPA](https://razorpay.com/docs/api/x/payouts/create/vpa/)).
- **Gotchas:**
  - Payouts need **IP allowlisting**. A local CRE simulation calls from your laptop's IP, so allowlist the hotspot IP and recheck if it changes.
  - Test payouts stay in `processing` until you move them forward manually in the dashboard. Do that live as the demo beat, or use the `payout.processed` webhook.
  - Signing up for a new RazorpayX account may need a business profile. Verify payout access only when adding optional UPI; do not let it block the Lithic card flow.
- **Exchange rate:** a fixed demo rate in the config, shown on screen as "indicative". Don't present it as a live market rate.

## 6. Partner tracks (3 picks)

| Partner | Track | Amounts | Fit | What they check |
|---|---|---|---|---|
| **Whitechain** | **Scale · Payments Nobody Notices** | $2,000 / $1,000 | **Primary** | A payer flow with zero visible crypto steps, shown in the demo (our EIP-3009 sender flow is exactly this). You must explain how the business pays gas, how the relayer gets WBT, and what stops someone draining it. Won't place: a payer who still signs a transaction that costs them gas. |
| Whitechain (same pick) | Operate · Stablecoin Payments for Business | $2,500 / $1,500 / $1,000 | Moderate | A drop-in widget a separate demo app adds in about 20 lines (a "Send a Shagun" button), both views, and extra credit for going past the first payment (return, export). Won't place: a plain transfer button, tipping jars, custodial bridges into a local-currency token, or escrow on its own. Don't describe the UPI cash-out as a "bridge into local currency". |
| **Chainlink** | Best workflow with CRE | $1,500 | Good if plan A or B works | A CRE workflow that connects a chain to an outside API, simulated in the CLI and actually used in the project. Keep it out of the synchronous Lithic ASA path. |

- **ENS fallback if CRE can't reach Whitechain:** Best Use of ENSv2 ($3,000 / $2,000 / $1,000). Shagun handles become non-transferable ENSv2 subnames (`priya.shagun.eth`) on Sepolia, bound to a passkey recipient commitment (deferred), with Enhanced Access Control (EAC) letting only the owner edit their payout record.
- **Not targeting:** Arc, Hedera, 0G, Uniswap, 1inch, Definitive, EF.
- **Money (judgment call):** max about $7.25k in partner prizes, plus finalist cash (4 × $1,500 = $6k). Expected about $2–3k.

## 7. Card-first demo

1. Send a $25 gift with a gasless authorization and show its real Whitechain receipt.
2. Tap the envelope, confirm the passkey, and display the real sandbox card through Issuing Elements.
3. Simulate an $8 USD purchase, capture it, and show the captured transaction plus on-chain settlement.
4. Decline an over-budget purchase and a repeat campaign claim without moving more funds.
5. Expire/cancel the card, reconcile holds, and show $17 USDT returned. Separately show a fully unclaimed gift returning in full.
6. Show sender receipts/CSV and explain relayer funding, caps and sandbox limitations.

## 8. Phase order and deadline

Follow [card-phase-plan.md](./card-phase-plan.md): access spike → balance/contract migration → claim-to-card → purchases/settlement → closure/returns → integration checks/demo. Estimated core effort is roughly 5–7 hours after the existing foundation, dependent on account access and remaining live integrations. Optional UPI/CRE follow only after the card demo passes.

Freeze features by **05:00 IST**, rehearse, record and prepare evidence, and target submission by **08:30 IST** before the **09:00** deadline.

## 9. Precedents (checked on Medalist / ETHGlobal)

| Project | Event | What | Result |
|---|---|---|---|
| [Monkey Bridge](https://medalist.build/projects/ethglobal/monkey-bridge-2ftw7) | ETHOnline 2025 | PYUSD escrow → Stripe virtual card | **PayPal USD Grand Prize, $4,500** (not a finalist) |
| [C.E.S.T.A Agent](https://medalist.build/projects/ethglobal/c-e-s-t-a-agent-wkud7) | Cannes 2026 | Voice road-trip agent with a card side feature | **Arc 2nd, $1,250** (for nanopayments) |
| [PayPer Card](https://ethglobal.com/showcase/payper-card-fehui) | — | Agents buy Lithic Visa cards over x402 | No prize |
| [gNoCard](https://ethglobal.com/showcase/gnocard-smhhy) | London | Crypto → vouchers via Bitrefill | No prize |

**Lesson:** these projects win from the **stablecoin or payment-rail sponsor**, which here means Whitechain. None reached the finals, so the envelope tap and the denied path have to carry the WOW.

## 10. Q&A prep

- **Is the card real money?** It is a genuine Lithic sandbox card; purchases are simulated through Lithic's sandbox. Whitechain transactions use official test USDT. Neither has monetary value in this demo.
- **Does Lithic convert the USDT?** No. The sandbox card budget backs simulated card purchases. USDT settlement is the corresponding on-chain gift ledger operation.
- **Are returns trustless?** Unclaimed expiry returns are permissionless. Claimed-card unused returns require provider/ledger reconciliation and an authorized closure before the chain releases funds.
- **What protects claims?** A fresh passkey session and the private gift-link secret. Campaign uniqueness is per passkey, not per person.
- **How is gas paid?** Faucet WBT on testnet, allowlisted relayer operations and spending caps. A proposed 0.5% production fee is not currently collected.
- **Why Whitechain?** Official USDT with EIP-3009 permits sponsored gas, while gift conditions and returns have verifiable on-chain receipts.

## 11. Submission checklist

- **Whitechain:**
  - Contracts verified on chain 1874.
  - At least one **official USDT** payment in the main flow, with the explorer link in the README.
  - A "why on-chain USDT on Whitechain" line in the README.
  - Steady commits.
  - README covering setup, architecture and limitations.
  - A 2–4 minute video showing each party.
  - `WHITECHAIN_FEEDBACK.md`.
- **Chainlink:** the CRE workflow in the repo, the simulation output, and where the project uses it. **Or ENS:** ENSv2 on Sepolia, central to the product, a live demo link and an open-source repo.
- **ETHGlobal:** public repo, demo video and team contacts. Pick the 3 partners and opt into finalist judging.

## 12. Environment variables (names only)

Card phase: `LITHIC_API_KEY` (sandbox), `LITHIC_ENVIRONMENT=sandbox`, `LITHIC_ASA_SECRET`, `LITHIC_EVENTS_SECRET`, and `LITHIC_PHASE0_CARD_TOKEN` for the development card page. `pnpm lithic:phase0` saves the secrets and token into `web/.env.local`.

`WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io`, `USDT_ADDRESS=0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, `VAULT_ADDRESS`, `RELAYER_PRIVATE_KEY`, `ATTESTER_PRIVATE_KEY`, `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, `RAZORPAYX_ACCOUNT_NUMBER` (the test-mode customer identifier), `PAYOUT_INR_PER_USDT` (demo rate), `CRE_*` (per the CLI setup) or `ENS_*` (fallback), and `NEXT_PUBLIC_*` only for non-secret IDs.

## 13. Links

- Prizes: https://ethglobal.com/events/mumbai/prizes
- Whitechain:
  - Docs: https://docs.whitechain.io
  - Faucet: https://faucet.testnet.whitechain.io
  - Explorer: https://explorer.testnet.whitechain.io
  - RPC: https://rpc.testnet.whitechain.io
  - Free Ankr RPC: https://www.ankr.com/rpc/?utm_referral=Whitechain2026
- EIP-3009: https://eips.ethereum.org/EIPS/eip-3009
- Chainlink CRE:
  - CLI: https://docs.chain.link/cre/reference/cli
  - Project config: https://docs.chain.link/cre/reference/project-configuration-ts
  - Templates: https://github.com/smartcontractkit/cre-templates/
- RazorpayX:
  - Test mode: https://razorpay.com/docs/x/dashboard/test-mode
  - Payout to a UPI ID: https://razorpay.com/docs/api/x/payouts/create/vpa/
- ENSv2 (fallback): https://docs.ens.domains/ensv2/overview/

### Lithic references for this phase

- Simulating transactions: https://docs.lithic.com/docs/simulating-transactions
- Create card: https://docs.lithic.com/reference/postcards
- Auth Stream Access (ASA): https://docs.lithic.com/docs/auth-stream-access-asa
- Enroll a responder endpoint: https://docs.lithic.com/reference/postresponderendpoints
- Webhook signature verification: https://docs.lithic.com/docs/events-api
- Spend limits: https://docs.lithic.com/docs/spend-limits
- Embedded card UI: https://docs.lithic.com/docs/embedded-card-ui
- Create card embed session: https://docs.lithic.com/reference/createcardembedsession
