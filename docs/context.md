---
cursor:
  subagentId: "bc-c80311ec-5056-53d1-9e6f-a4f97096dc61"
---

# Shagun: knowledge base (crypto gift → UPI cash-out)

"Shagun" is a working name. This file is the single source of truth for any teammate or AI agent on the gift project at ETHGlobal Mumbai.

Hacking ends **Sat Nov 7, 09:00 IST** (hard deadline). Judging runs 09:30–12:30 IST.

*Updated Fri 16:00 IST: the three open checks are resolved (section 5), and the cash-out is now Razorpay UPI instead of a virtual Visa card.*

## 1. One-liner and positioning

**"Send a Diwali shagun in dollars to anyone. They never see crypto, only the right person can claim it, it lands in their UPI, and an unclaimed gift comes back to you."**

- **Who we're showcasing:** Whitechain. The pitch is that we're the best showcase of Whitechain USDT payments nobody notices, not another off-ramp.
- **Hook:** Diwali is Sun Nov 8. Judges get a physical envelope with an NFC sticker inside. They tap it with their phone, claim it, and see rupees arrive in UPI.
- **Three differentiators** that the earlier card projects in section 9 lacked:
  1. **The sender and recipient both see zero crypto.** There's no wallet, no gas and no seed phrase. The sender signs a gasless authorization, our relayer pays all gas, and the recipient confirms with their phone's fingerprint (a passkey).
  2. **Bound to one human with World ID.** See section 4 for what that does and doesn't stop.
  3. **Unclaimed gifts return to the sender automatically** at expiry, on-chain. Nobody has to trust an issuer to do it.
- **India-native.** UPI is how India actually receives money, which makes it a stronger story for Mumbai judges than a Visa card.
  - Be honest about the regulatory side: in production, the rupee payout must go through a **FIU-IND-registered crypto exchange (VDA) partner**, with 1% tax deducted at source (TDS) on the conversion.
  - Razorpay's live terms don't allow crypto merchants, so Razorpay is used here in **test mode only**.

## 2. Ground rules

- **On-chain parts are real.** That means real Whitechain Sepolia, the official test USDT, verified contracts, and real World verification. Never fake a transaction.
- **The rupee payout is RazorpayX test mode, and we say so.** Label it "test mode" in the UI, README and demo. No partner pays for this part (see section 6).
- **Payout work is capped at about 2 hours.** Build it last, give it one owner, and set a hard stop. If it breaks, show a recorded clip.
- **Secrets live in environment variables** (section 12), never in code or chat.
- **Commit steadily.** Whitechain checks for steady progress, not one big upload at the end.

## 3. User flows

**A. Sender (a person, or a company doing batch Diwali gifts)**
1. Opens the dashboard and enters an amount in USDT, a recipient (a Shagun handle or an "envelope"), and an expiry.
2. Signs one gasless authorization with the embedded wallet. This is an EIP-3009 `ReceiveWithAuthorization` (see section 5). The relayer submits it, and the USDT moves into `ShagunVault`. The sender pays no gas.
3. Gets a claim link or QR code, which is written to an NFC sticker for the envelope.
4. The dashboard shows each gift's status (sent → claimed → cashed out / returned) and offers a CSV export.

**B. Recipient**
1. Taps the envelope or opens the link. A web page opens; there's no app to install.
2. Confirms with their fingerprint (passkey) and passes World ID (Proof of Human).
3. Enters their UPI ID. The backend verifies World, the relayer calls `claim()`, and then `cashOut()` moves the USDT to the payout treasury.
4. A RazorpayX payout (test mode) of the rupee amount is sent to their UPI ID. The screen shows the payout ID next to the Whitechain explorer link.

**C. Denied paths (must be shown)**
- **Forwarded link after the claim:** a different human fails the World check, so the claim is rejected and nothing moves.
- **Second claim of a "one per human" campaign gift by the same person:** rejected.
- **Expired gift:** the claim is rejected, and the funds have already gone back to the sender through `refundExpired()`.

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
- **Mechanics:** verify on the backend and never trust the client. Use the IDKit action `claim-<giftId>` for envelopes and `shagun-handle` for registration. Store only the nullifier.

## 5. Architecture and verified facts

```
Sender dashboard (Next.js, embedded EOA) ─sign EIP-3009─► Backend (Node/TS) ─► Relayer (pays WBT gas)
                                                             │                    │
                                       World IDKit verify ───┤                    ▼
                                                             │      ShagunVault.sol (Whitechain Sepolia, 1874)
Recipient claim page (Next.js, passkey, NFC link) ───────────┤        └─ holds official test USDT
                                                             ├──► Chainlink CRE workflow (log trigger → RazorpayX → status)
                                                             └──► RazorpayX test mode (UPI payout)
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

### `ShagunVault.sol` (deployed and **verified** on the Whitechain explorer)
- `createGiftWithAuthorization(from, amount, validAfter, validBefore, nonce, sig, expiry, secretHash, boundNullifier)` calls `USDT.receiveWithAuthorization(...)` and records the gift.
- `claim(giftId, secret, nullifier, backendAttestation)` can only be called by the relayer. It checks the secret hash, the expiry and the backend-signed World attestation, then binds the nullifier.
- `cashOut(giftId, amount, payoutRef)` can only be called by the operator. It moves USDT to the payout treasury and emits `CashOut(giftId, amount, payoutRef)`.
- `refundExpired(giftId)` can be called by anyone after expiry. It returns the unclaimed remainder to the sender.
- Events `GiftCreated`, `GiftClaimed`, `CashOut` and `Returned` feed the dashboard and the CSV export.

### Relayer drain protection (Whitechain asks for this)
- The relayer may only call `ShagunVault` functions, and the backend enforces an allowlist.
- Each gift can be claimed once, with a daily cap per human (nullifier), rate limits per IP and per gift, and a gas cap per transaction.
- **Where the relayer's WBT comes from:** the faucet on testnet. In production, a 0.5% USDT fee per gift pays for gas. Write this in the README.

### Chainlink CRE (verified in the docs)
- CRE CLI v1.15.0 (May 14, 2026) added a global **`--allow-unknown-chains`** flag for `cre workflow simulate` and `deploy` ([CLI reference](https://docs.chain.link/cre/reference/cli), [release notes](https://docs.chain.link/cre/release-notes)).
- **Caveat:** "chain-selector and RPC availability are still enforced". If Whitechain has no chain selector registered, the flag may not be enough.
- **On-chain writes in simulation go through a mock forwarder listed per tenant** (`cre workflow supported-chains`, which needs `cre login`). An unlisted chain probably has none.
- **First hour:** run `cre workflow simulate --allow-unknown-chains` with the 1874 RPC set in `project.yaml`.
  - **Plan A:** an EVM log trigger on `GiftClaimed` → HTTP call to the RazorpayX payout → write `payoutRef` back on-chain.
  - **Plan B (still qualifies):** if writes fail, the workflow reads the gift from Whitechain and calls RazorpayX, and the backend writes `cashOut()`. The brief only requires "at least one blockchain integrated with an external API".
  - **Plan C:** if Whitechain can't be reached at all, drop Chainlink for ENS (see section 6).

### RazorpayX (verified in the docs)
- **Razorpay has no card-issuing API.** A virtual Visa card isn't possible with Razorpay; use **UPI payouts** instead.
- **RazorpayX test mode** has its own dummy balance (add any test amount), test API keys, contacts, fund accounts (UPI ID / `vpa`), payouts and webhooks ([test mode](https://razorpay.com/docs/x/dashboard/test-mode)).
- **Flow:** create a contact → create a fund account of type `vpa` → `POST /v1/payouts` with `mode: "UPI"` and an `X-Payout-Idempotency` header ([payout to VPA](https://razorpay.com/docs/api/x/payouts/create/vpa/)).
- **Gotchas:**
  - Payouts need **IP allowlisting**. A local CRE simulation calls from your laptop's IP, so allowlist the hotspot IP and recheck if it changes.
  - Test payouts stay in `processing` until you move them forward manually in the dashboard. Do that live as the demo beat, or use the `payout.processed` webhook.
  - Signing up for a new RazorpayX account may need a business profile. **Get test keys in the first hour.** If you're blocked, fall back to the Lithic sandbox virtual card.
- **Exchange rate:** a fixed demo rate in the config, shown on screen as "indicative". Don't present it as a live market rate.

## 6. Partner tracks (3 picks)

| Partner | Track | Amounts | Fit | What they check |
|---|---|---|---|---|
| **Whitechain** | **Scale · Payments Nobody Notices** | $2,000 / $1,000 | **Primary** | A payer flow with zero visible crypto steps, shown in the demo (our EIP-3009 sender flow is exactly this). You must explain how the business pays gas, how the relayer gets WBT, and what stops someone draining it. Won't place: a payer who still signs a transaction that costs them gas. |
| Whitechain (same pick) | Operate · Stablecoin Payments for Business | $2,500 / $1,500 / $1,000 | Moderate | A drop-in widget a separate demo app adds in about 20 lines (a "Send a Shagun" button), both views, and extra credit for going past the first payment (return, export). Won't place: a plain transfer button, tipping jars, custodial bridges into a local-currency token, or escrow on its own. Don't describe the UPI cash-out as a "bridge into local currency". |
| **World** | Best Use of IDKit | $1,250 × 2 | Good | IDKit verified server-side; why Proof of Human is the minimum credential; one alternative path (rejected or ineligible); an integration debrief. |
| **Chainlink** | Best workflow with CRE | $1,500 | Good if plan A or B works | A CRE workflow that connects a chain to an outside API, simulated in the CLI and actually used in the project. Ours connects Whitechain to RazorpayX. |

- **ENS fallback if CRE can't reach Whitechain:** Best Use of ENSv2 ($3,000 / $2,000 / $1,000). Shagun handles become non-transferable ENSv2 subnames (`priya.shagun.eth`) on Sepolia, bound to the World nullifier, with Enhanced Access Control (EAC) letting only the owner edit their payout record.
- **Not targeting:** Arc, Hedera, 0G, Uniswap, 1inch, Definitive, EF.
- **Money (judgment call):** max about $7.25k in partner prizes, plus finalist cash (4 × $1,500 = $6k). Expected about $2–3k.

## 7. Demo script (4 min finalist; 2–4 min Whitechain video)

1. **Hook (20s):** "Diwali shagun, sent in dollars from anywhere, received in UPI. Nobody touches crypto." Check any statistic before you say it.
2. **Send (40s):** the company dashboard sends 25 USDT to a judge's envelope. One fingerprint, no gas pop-up, and the explorer link appears.
3. **Claim (60s):** hand over the envelope. The judge taps it, confirms with their fingerprint, passes World and enters a UPI ID. The rupee amount shows as a RazorpayX payout (TEST MODE). Move it to "processed" live.
4. **Denied (30s):** a teammate opens the forwarded link, fails World and is rejected. Nothing moves on-chain.
5. **Return (30s):** an unclaimed gift reaches expiry, and the USDT goes back to the sender, shown with an explorer link.
6. **Business (30s):** the 20-line widget dropped into a demo app, plus the CSV export.
7. **Close (20s):** relayer economics, drain protection, and the one-liner.

## 8. Build plan (about 17 h, 4 people)

| When (IST) | Contracts + relayer | Claim page + passkey | World + backend | Payout + CRE + NFC |
|---|---|---|---|---|
| Fri 16:00–17:30 | Faucet; one real `receiveWithAuthorization`; `ShagunVault` skeleton | Next.js scaffold, claim UI | World portal app; IDKit verified on the backend | RazorpayX test keys + one test UPI payout; `cre workflow simulate --allow-unknown-chains` against 1874 |
| 17:30–21:00 | Deploy and verify on 1874; first gasless gift | Passkey confirm, NFC link handling | Claim attestation, nullifier binding | Payout endpoint, IP allowlist; buy NTAG215 stickers |
| 21:00–01:00 | Relayer allowlist and caps; `cashOut` and `refundExpired` | Sender dashboard, status timeline | Denied paths, handle registration | CRE plan A or B (or the ENS fallback) |
| 01:00–05:00 | Drop-in widget package (Operate) | CSV export, polish | World debrief, README | Hard stop on payout work at 03:00; record a clip if needed |
| 05:00–08:30 | **Freeze features.** Rehearse ×3, record the video, write WHITECHAIN_FEEDBACK.md, **submit by 08:30**. | | | |

## 9. Precedents (checked on Medalist / ETHGlobal)

| Project | Event | What | Result |
|---|---|---|---|
| [Monkey Bridge](https://medalist.build/projects/ethglobal/monkey-bridge-2ftw7) | ETHOnline 2025 | PYUSD escrow → Stripe virtual card | **PayPal USD Grand Prize, $4,500** (not a finalist) |
| [C.E.S.T.A Agent](https://medalist.build/projects/ethglobal/c-e-s-t-a-agent-wkud7) | Cannes 2026 | Voice road-trip agent with a card side feature | **Arc 2nd, $1,250** (for nanopayments) |
| [PayPer Card](https://ethglobal.com/showcase/payper-card-fehui) | — | Agents buy Lithic Visa cards over x402 | No prize |
| [gNoCard](https://ethglobal.com/showcase/gnocard-smhhy) | London | Crypto → vouchers via Bitrefill | No prize |

**Lesson:** these projects win from the **stablecoin or payment-rail sponsor**, which here means Whitechain. None reached the finals, so the envelope tap and the denied path have to carry the WOW.

## 10. Q&A prep

- **"Isn't this just an off-ramp?"** An off-ramp needs the recipient to have an exchange account, KYC and a wallet. Ours needs one tap and one fingerprint, it's bound to one human, and unclaimed money goes back to the sender automatically.
- **"Is the UPI payout real?"** It's RazorpayX test mode, and we say so. The USDT, vault, claim and return are real on Whitechain. In production, the payout goes through a FIU-IND-registered VDA partner with TDS.
- **"Why not just UPI the money directly?"** Senders abroad can't UPI, and UPI can't hold a gift until the right human claims it or return it automatically at expiry.
- **"Relayer drain?"** It's allowlisted to vault functions, capped per gift and per human per day, and funded by a 0.5% fee in production.
- **"Stolen envelope?"** A registered handle can't be claimed by a thief. An unregistered envelope goes to the first verified claimer, and the sender can cancel before it's claimed. Be honest about this.
- **"Why Whitechain?"** USDT settlement, EIP-3009 so the business sponsors gas, and an explorer-verifiable record. This one-line answer is required in the README.

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
- Lithic sandbox (fallback if RazorpayX is blocked): https://docs.lithic.com
