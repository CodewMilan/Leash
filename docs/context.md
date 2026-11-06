---
cursor:
  subagentId: "bc-c80311ec-5056-53d1-9e6f-a4f97096dc61"
---

# Shagun: knowledge base (crypto gift → Stripe sandbox virtual card)

"Shagun" is a working name. This file is the single source of truth for any teammate or AI agent on the gift project at ETHGlobal Mumbai.

Hacking ends **Sat Nov 7, 09:00 IST** (hard deadline). Judging runs 09:30–12:30 IST.

*Updated Fri 17:10 IST: Stripe Issuing sandbox cards are the main redemption path. RazorpayX UPI is optional. Follow [stripe-phase-plan.md](./stripe-phase-plan.md) for the phased build and corrected authorization/expiry accounting. The current code is the earlier UPI foundation; Stripe card functionality is not yet implemented.*

## 1. One-liner and positioning

**“Send a Diwali shagun in dollars. A verified human claims a virtual card, spends from the gift, and the reconciled unused balance comes back to the sender.”**

- **Primary partner:** Whitechain. Showcase gasless official-USDT settlement and verifiable gift rules.
- **Demo hook:** the judge taps an NFC envelope, confirms their device and World verification, and sees a genuine Stripe Issuing sandbox card in the browser.
- **Three differentiators:** no sender-paid gas or recipient wallet; one-per-human company campaigns; unused gift value returned after expiry and reconciliation.
- **Main redemption:** Stripe Issuing test mode, with a spending budget matching the gift. The card cannot purchase real goods. Stripe's prefunded test USD balance is separate from Whitechain USDT.
- **Optional extra:** RazorpayX UPI test payout, as an alternative redemption mode, after the card demo passes.
- **Production scope:** neither issuing/availability in India nor automatic conversion of Whitechain USDT into Stripe funds is established. Verify production provider eligibility before making geographic or real-money claims.

## 2. Ground rules

- Real testnet transactions and real World verification; never fabricate receipts.
- Label every card and purchase simulation **Stripe Issuing TEST MODE**. Use the actual card brand returned by Stripe; do not assume Visa before account verification.
- Preserve the existing brand kit and coordinate with the landing-page developer.
- Start with the Stripe account/access gate. Budget roughly three hours for the provider-specific slice; balance/contract changes, testing and the existing external setup take additional effort. Keep the 03:00 integration hard stop and 05:00 feature freeze.
- Secrets come from environment variables only. Commit steadily and distinguish implemented behavior from planned integrations.
- A claimed-card return needs off-chain card/hold reconciliation. Only the unclaimed-envelope return can retain the existing permissionless expiry rule without additional provider trust.

## 3. User flows

**A. Sender**
1. Signs in, chooses a gift amount, campaign if any, and expiry.
2. Signs an EIP-3009 authorization with gift terms committed to its nonce. The relayer funds the vault and pays gas.
3. Shares the private claim link/QR/NFC URL after chain confirmation.
4. Tracks funded, reserved, captured, return-pending and returned amounts, with receipts and CSV export.

**B. Recipient**
1. Opens the link, confirms with a passkey, and passes backend-verified World Proof of Human.
2. The relayer confirms `claim()`. An idempotent issuance job creates one sandbox virtual USD card and binds it to that gift.
3. Recipient-only Stripe Issuing Elements displays the card details. PAN/CVC are never stored or served by our backend.
4. A test purchase sends a signed synchronous authorization webhook. The backend atomically reserves available budget and promptly approves or declines; it does not wait for chain confirmation.
5. Capture events record actual spending and enqueue idempotent partial on-chain settlement. The UI distinguishes approval holds, captured purchases and settlement receipts.
6. At expiry, stop new approvals, cancel the card, reconcile pending liabilities, close the card allocation and return safely unused USDT. Display return pending until confirmed.

**C. Denied paths**
- A consumed envelope cannot be claimed again.
- A human claiming a second gift in the same company campaign is rejected.
- An unsupported, expired or over-budget authorization is declined in the supported sandbox flow. Stripe controls supplement the atomic ledger.
- An unclaimed expired gift returns in full. A claimed card with pending liabilities remains in closing/reconciliation instead of refunding money still needed for an approved purchase.

## 4. What World ID does and doesn't protect (be precise in Q&A)

- **Does:**
  - Binds each gift to the **first verified human who claims it**, using that person's anonymous nullifier. After that, anyone else with the link or envelope is rejected, even a real human.
  - **Campaign gifts are one per human**, so bot farms can't drain a company's Diwali promo.
  - **Registered handles:** gifts sent to a handle can only be claimed by the same nullifier.
- **Doesn't:**
  - Stop the *intended* recipient being socially engineered.
  - Stop a thief who steals an **unregistered** envelope and claims it first.
  - So don't claim it's "scam-proof". The honest line is: **"bound to one verified human; forwarded links and bot farms fail."**
- **Credential:** Proof of Human, which is the minimum sufficient level because we only need to know they're a unique person. World's IDKit brief rewards choosing the minimum credential.
- **Mechanics:** verify on the backend and never trust the client. The current implementation uses the stable `shagun-human` action with a fresh gift/session-bound signal, so campaign uniqueness does not compare unrelated action nullifiers. Retain only necessary anonymous identifiers and verification metadata; handles remain deferred.

## 5. Architecture and verified facts

```text
Sender dashboard / Privy → signed EIP-3009 → backend → relayer → Whitechain ShagunVault
Recipient / passkey + World → verified claim → issuance job → Stripe Issuing sandbox
Stripe authorization webhook → atomic PostgreSQL reservation → fast approve/decline
Stripe capture events → durable settlement job → partial vault spend → treasury
Expiry worker → card cancellation + hold reconciliation → closure → unused USDT return
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
- **Recipient:** never holds tokens or keys. The vault pays out on their behalf after the World and passkey checks.

### `ShagunVault.sol`: current code and required card changes

The current vault has gasless creation, attested claim, whole-gift `cashOut`, campaign uniqueness, admin pause/key rotation, and unclaimed-only expiry refunds. No deployment/verification of this implementation has been evidenced yet.

The card phase needs a new deployment with partial `spend(giftId, amount, transactionRef)`, remaining-balance accounting, reference deduplication, and a claimed-card closure checkpoint before returning its unused balance. Settle captures, not every approval as if it were final spending. Use actual Stripe transaction references because one authorization can yield multiple lifecycle/transaction events.

Preserve permissionless refunds for unclaimed gifts. Claimed-card closure depends on the backend reconciling outstanding card liabilities; document that trust boundary.

### Stripe Issuing sandbox: next integration

- Prove actual Issuing access, a funded test balance, cardholder requirements, virtual card creation, returned brand and activation before building the full UI.
- Use all-time spending controls plus a transactional balance ledger. Stripe documents delayed control aggregation; controls alone are not a universal exact-balance guarantee.
- Use authenticated Issuing Elements and scoped ephemeral keys. Never expose another claimant's card or return PAN/CVC from our API.
- The real-time authorization response deadline is two seconds. Keep chain writes asynchronous and configure decline fallback.
- Track authorization holds, captures, reversals and closure separately. Cancellation does not prevent capture of already approved purchases, so it cannot alone authorize an immediate refund.
- Demonstrate controlled sandbox purchases through Stripe's actual test helpers. Keep unsupported network cases and production issuing scope outside the MVP claims.
- See [Stripe phase plan](./stripe-phase-plan.md) for the implementation sequence, tests, prerequisites and official references.

### Relayer drain protection (Whitechain asks for this)
- The relayer may only call `ShagunVault` functions, and the backend enforces an allowlist.
- Each gift can be claimed once, with a daily cap per human (nullifier), rate limits per IP and per gift, and a gas cap per transaction.
- **Where the relayer's WBT comes from:** the faucet on testnet. In production, a 0.5% USDT fee per gift pays for gas. Write this in the README.

### Chainlink CRE (verified in the docs)
- CRE CLI v1.15.0 (May 14, 2026) added a global **`--allow-unknown-chains`** flag for `cre workflow simulate` and `deploy` ([CLI reference](https://docs.chain.link/cre/reference/cli), [release notes](https://docs.chain.link/cre/release-notes)).
- **Caveat:** "chain-selector and RPC availability are still enforced". If Whitechain has no chain selector registered, the flag may not be enough.
- **On-chain writes in simulation go through a mock forwarder listed per tenant** (`cre workflow supported-chains`, which needs `cre login`). An unlisted chain probably has none.
- **After the card-first core works:** run `cre workflow simulate --allow-unknown-chains` with the 1874 RPC set in `project.yaml`.
  - **Plan A:** use a confirmed claim event to orchestrate the existing idempotent Stripe issuance service. Keep CRE outside synchronous card authorization.
  - **Plan B:** if chain writes fail but reads work, read the gift from Whitechain and invoke the same authenticated issuance service while the backend records chain effects. Prove that it is meaningfully used; do not create a second redemption path.
  - **Plan C:** if Whitechain can't be reached at all, drop Chainlink for ENS (see section 6).

### RazorpayX (optional alternative; earlier integration foundation)
- **Razorpay has no card-issuing API.** A virtual Visa card isn't possible with Razorpay; use **UPI payouts** instead.
- **RazorpayX test mode** has its own dummy balance (add any test amount), test API keys, contacts, fund accounts (UPI ID / `vpa`), payouts and webhooks ([test mode](https://razorpay.com/docs/x/dashboard/test-mode)).
- **Flow:** create a contact → create a fund account of type `vpa` → `POST /v1/payouts` with `mode: "UPI"` and an `X-Payout-Idempotency` header ([payout to VPA](https://razorpay.com/docs/api/x/payouts/create/vpa/)).
- **Gotchas:**
  - Payouts need **IP allowlisting**. A local CRE simulation calls from your laptop's IP, so allowlist the hotspot IP and recheck if it changes.
  - Test payouts stay in `processing` until you move them forward manually in the dashboard. Do that live as the demo beat, or use the `payout.processed` webhook.
  - Signing up for a new RazorpayX account may need a business profile. Verify payout access only when adding optional UPI; do not let it block the Stripe card flow.
- **Exchange rate:** a fixed demo rate in the config, shown on screen as "indicative". Don't present it as a live market rate.

## 6. Partner tracks (3 picks)

| Partner | Track | Amounts | Fit | What they check |
|---|---|---|---|---|
| **Whitechain** | **Scale · Payments Nobody Notices** | $2,000 / $1,000 | **Primary** | A payer flow with zero visible crypto steps, shown in the demo (our EIP-3009 sender flow is exactly this). You must explain how the business pays gas, how the relayer gets WBT, and what stops someone draining it. Won't place: a payer who still signs a transaction that costs them gas. |
| Whitechain (same pick) | Operate · Stablecoin Payments for Business | $2,500 / $1,500 / $1,000 | Moderate | A drop-in widget a separate demo app adds in about 20 lines (a "Send a Shagun" button), both views, and extra credit for going past the first payment (return, export). Won't place: a plain transfer button, tipping jars, custodial bridges into a local-currency token, or escrow on its own. Don't describe the UPI cash-out as a "bridge into local currency". |
| **World** | Best Use of IDKit | $1,250 × 2 | Good | IDKit verified server-side; why Proof of Human is the minimum credential; one alternative path (rejected or ineligible); an integration debrief. |
| **Chainlink** | Best workflow with CRE | $1,500 | Good if plan A or B works | A CRE workflow that connects a chain to an outside API, simulated in the CLI and actually used in the project. Keep it out of the synchronous Stripe authorization path. |

- **ENS fallback if CRE can't reach Whitechain:** Best Use of ENSv2 ($3,000 / $2,000 / $1,000). Shagun handles become non-transferable ENSv2 subnames (`priya.shagun.eth`) on Sepolia, bound to the World nullifier, with Enhanced Access Control (EAC) letting only the owner edit their payout record.
- **Not targeting:** Arc, Hedera, 0G, Uniswap, 1inch, Definitive, EF.
- **Money (judgment call):** max about $7.25k in partner prizes, plus finalist cash (4 × $1,500 = $6k). Expected about $2–3k.

## 7. Card-first demo

1. Send a $25 gift with a gasless authorization and show its real Whitechain receipt.
2. Tap the envelope, confirm the device and World proof, and display the real sandbox card through Issuing Elements.
3. Simulate an $8 USD purchase, capture it, and show the captured transaction plus on-chain settlement.
4. Decline an over-budget purchase and a repeat campaign claim without moving more funds.
5. Expire/cancel the card, reconcile holds, and show $17 USDT returned. Separately show a fully unclaimed gift returning in full.
6. Show sender receipts/CSV and explain relayer funding, caps and sandbox limitations.

## 8. Phase order and deadline

Follow [stripe-phase-plan.md](./stripe-phase-plan.md): access spike → balance/contract migration → claim-to-card → purchases/settlement → closure/returns → integration checks/demo. Estimated core effort is roughly 5–7 hours after the existing foundation, dependent on account access and remaining live integrations. Optional UPI/CRE follow only after the card demo passes.

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

- **Is the card real money?** It is a genuine Stripe Issuing sandbox card; purchases are simulated. Whitechain transactions use official test USDT. Neither has monetary value in this demo.
- **Does Stripe convert the USDT?** No. A prefunded sandbox Issuing balance backs simulated card purchases. USDT settlement is the corresponding on-chain gift ledger operation.
- **Are returns trustless?** Unclaimed expiry returns are permissionless. Claimed-card unused returns require provider/ledger reconciliation and an authorized closure before the chain releases funds.
- **What does World prove?** A unique verified human, enabling one-per-human campaigns. An unregistered envelope can be claimed by the first eligible holder; it does not prove that holder is the intended recipient.
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
- **World:** IDKit verified on the backend; success and denied paths; the minimum-credential explanation; the integration debrief.
- **Chainlink:** the CRE workflow in the repo, the simulation output, and where the project uses it. **Or ENS:** ENSv2 on Sepolia, central to the product, a live demo link and an open-source repo.
- **ETHGlobal:** public repo, demo video and team contacts. Pick the 3 partners and opt into finalist judging.

## 12. Environment variables (names only)

Stripe phase: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_AUTHORIZATION_WEBHOOK_SECRET`, `STRIPE_EVENTS_WEBHOOK_SECRET`, and a pinned `STRIPE_API_VERSION`. These are planned configuration names; Stripe runtime support is not yet implemented.

`WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io`, `USDT_ADDRESS=0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, `VAULT_ADDRESS`, `RELAYER_PRIVATE_KEY`, `ATTESTER_PRIVATE_KEY`, `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_SIGNING_KEY`, `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, `RAZORPAYX_ACCOUNT_NUMBER` (the test-mode customer identifier), `PAYOUT_INR_PER_USDT` (demo rate), `CRE_*` (per the CLI setup) or `ENS_*` (fallback), and `NEXT_PUBLIC_*` only for non-secret IDs.

## 13. Links

- Prizes: https://ethglobal.com/events/mumbai/prizes
- Whitechain:
  - Docs: https://docs.whitechain.io
  - Faucet: https://faucet.testnet.whitechain.io
  - Explorer: https://explorer.testnet.whitechain.io
  - RPC: https://rpc.testnet.whitechain.io
  - Free Ankr RPC: https://www.ankr.com/rpc/?utm_referral=Whitechain2026
- EIP-3009: https://eips.ethereum.org/EIPS/eip-3009
- World IDKit:
  - https://docs.world.org/world-id/idkit/integrate
  - Credentials: https://docs.world.org/world-id/idkit/credentials
- Chainlink CRE:
  - CLI: https://docs.chain.link/cre/reference/cli
  - Project config: https://docs.chain.link/cre/reference/project-configuration-ts
  - Templates: https://github.com/smartcontractkit/cre-templates/
- RazorpayX:
  - Test mode: https://razorpay.com/docs/x/dashboard/test-mode
  - Payout to a UPI ID: https://razorpay.com/docs/api/x/payouts/create/vpa/
- ENSv2 (fallback): https://docs.ens.domains/ensv2/overview/
- Lithic sandbox (possible alternative issuer; do not switch automatically): https://docs.lithic.com

### Stripe references for this phase

- Testing: https://docs.stripe.com/issuing/testing
- Virtual card creation: https://docs.stripe.com/api/issuing/cards/create
- Issuing Elements: https://docs.stripe.com/issuing/elements
- Real-time authorization: https://docs.stripe.com/issuing/controls/real-time-authorizations
- Spending controls: https://docs.stripe.com/issuing/controls/spending-controls
- Authorization lifecycle: https://docs.stripe.com/issuing/purchases/authorizations
- Captures and transactions: https://docs.stripe.com/issuing/purchases/transactions
