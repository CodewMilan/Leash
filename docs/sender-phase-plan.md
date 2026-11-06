# Sender side: phase plan

Scope: everything the gift sender touches. The sender arrives, connects a wallet, chooses a gift card, enters an amount, and sends official test USDT on Whitechain. The cofounder owns the receiving side: claim, then card issuance (Lithic or Stripe sandbox).

Written Fri Nov 6, 17:55 IST. Feature freeze is 05:00 IST; the hard deadline is Sat 09:00 IST.

## Rules for this plan

- **Zero blockchain mocks.** Every phase gate runs on Whitechain Sepolia (chain 1874) with the official USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, a deployed `ShagunVault`, a real relayer paying real WBT gas, and real explorer links. No self-minted tokens, no fake receipts.
- Fast unit tests (`pnpm check`) run after every change. The contract tests execute the real Solidity on a local EVM for speed; they supplement the live gates and never replace them.
- A live testnet suite (`pnpm test:live`) is the gate for each phase that moves value.
- Card/payment-provider sandboxes belong to the receiving side and may use sandbox or test helpers.

## Handoff boundary with the receiving side

- The sender side ends when a gift is `sent`: the vault holds the USDT, the `GiftCreated` event is on chain, and the sender has the private claim link.
- The receiving side starts at the claim link: passkey, World proof, `claim()`, then card issuance.
- Shared contract: `ShagunVault`. The card path needs partial `spend()` and a claimed-card closure (see [context.md](./context.md)). Agree the final vault interface with the cofounder before the final deployment. The sender UI reads `VAULT_ADDRESS`, so a redeploy needs no sender code change; only the deployment record and README links change.
- Unclaimed-gift returns stay permissionless and are part of the sender side.

## Status (Fri 18:40 IST)

| Phase | State |
|---|---|
| 0 | Local database migrated; relayer, attester, admin, treasury and live-sender keys generated into `web/.env.local`; contract compiled; `pnpm test:live` written. **Waiting for funds**: faucet WBT for relayer `0xE22E6f1faBc6CD11219F2437df55e1eC76417bfa`, official test USDT for live sender `0x414B531FE1a3eEa716D32ECc4073818258816F73` and your MetaMask, and the Privy app ID. Then deploy, verify, run the live gate. |
| 1 | Built: MetaMask connect, chain add/switch, signed sign-in, onboarding steps, wallet/session mismatch notice. Live gate pending the Privy app ID. |
| 2 | Built: card designs, $1–$1,000 amounts, sealed recipient note, claim window, campaign, review step, server validation and storage. |
| 3–5 | Send path, widget and history exist; their live gates run once Phase 0 is funded. |

Tests: `pnpm check` 31 passing (unit, API with PGlite, contract on a local EVM); Playwright 3 passing; production build passing.

## Phases

| Phase | What | Estimate | Gate (all live on chain 1874) |
|---|---|---|---|
| 0 | Real-chain foundation | 1–1.5 h after funds arrive | Vault deployed and verified; one real gasless gift on the explorer |
| 1 | Wallet onboarding | 1 h | MetaMask connects, adds/switches to 1874, signs in, survives reload |
| 2 | Choose the gift | 1.5–2 h | Card design, amount, note and expiry flow through to on-chain terms |
| 3 | Send and confirm | 1.5 h | Gasless send reaches `sent` with explorer link, claim link and QR |
| 4 | After the send | 1 h | History, receipts, CSV and a real expiry return of an unclaimed gift |
| 5 | Widget, hardening, handoff | 1 h | Diwali Desk host app sends a real gift; README/feedback evidence |

Total: about 7–8 hours of build time, which ends around 02:00 IST if Phase 0 is unblocked early. That leaves the 03:00 integration stop and 05:00 freeze intact.

### Phase 0: real-chain foundation

Blocking inputs (only the team can provide these):

1. **Official test USDT** for at least one sender wallet. The faucet only gives WBT, and only the token owner (`0x8790…799c`) can mint USDT, so request it from the Whitechain team at the booth or in their support channel. Self-minted tokens do not qualify.
2. **Test WBT** for the relayer and deployer from [faucet.testnet.whitechain.io](https://faucet.testnet.whitechain.io) (GitHub account older than 30 days, 0.5 WBT per 24 h).
3. **Privy app ID** with MetaMask enabled under external wallets and `http://localhost:3000` allowed.

Work:

- Local PostgreSQL database and migrations (Homebrew PostgreSQL is already running).
- Generate separate relayer, attester and admin keys into `web/.env.local` (git-ignored); set the treasury address.
- `pnpm contracts:deploy -- --confirm-testnet`, then verify the source on the explorer.
- Run `pnpm worker`; add `pnpm test:live`, which signs a real EIP-3009 authorization from a funded sender key, submits it through the API and relayer, and asserts the on-chain gift, vault balance and zero sender WBT spend.
- Record the deployment and first explorer link in the README.

### Phase 1: wallet onboarding

Built already: Privy connect-wallet (MetaMask first), Whitechain add/switch, Shagun's own signed challenge, gasless signing.

Remaining:

- Restore the session on reload and match it to the connected MetaMask account.
- React to MetaMask account and network changes (sign out on account switch; re-prompt the network switch).
- First-visit onboarding copy: what you need (MetaMask, test USDT), what you sign, and that you pay no gas.
- Unit tests: challenge expiry, replay, wrong address, and the session-to-wallet match.

### Phase 2: choose the gift

- Gift card picker: card designs or occasions (to confirm), shown on the sender preview and to the recipient.
- Amount entry: presets, custom amount, minimum and maximum, live balance check, and the indicative recipient value.
- Note to the recipient, private sender label, claim window, and optional company campaign.
- Review step before signing: amount, design, expiry, $0.00 network fee, and the return rule.
- Server-side validation of the design and amount limits; the design is stored with the gift and exposed to the claim page.
- Unit tests: amount parsing and limits, design validation, and term construction.

### Phase 3: send and confirm

- Sign the EIP-3009 `ReceiveWithAuthorization`; the relayer submits `createGiftWithAuthorization`.
- Live status from `pending` to `sent` with the Whitechain explorer link.
- Claim link, QR, copy/share and NFC instructions.
- Clear failure states: rejected signature, insufficient USDT, authorization window expired, relayer budget or outage, wrong network.
- Gate: `pnpm test:live` sends through the same API path the UI uses and checks the explorer-visible transaction.

### Phase 4: after the send

- History with statuses, receipts and CSV export.
- Unclaimed expiry return: a real permissionless refund transaction from the worker, shown with its explorer link (use the 5-minute demo expiry).
- Gate: a live gift expires and its full USDT amount returns to the sender on chain.

### Phase 5: widget, hardening, handoff

- The Diwali Desk host app (`examples/diwali-desk`) sends a real gift through the `shagun.js` widget.
- Relayer drain-protection evidence: allowlist, caps and budget shown in the README.
- `WHITECHAIN_FEEDBACK.md`, explorer links, and a short handoff note for the receiving side (gift states, events and API fields it can rely on).

## Open decisions

- What "choosing the gift card" means in Phase 2 (design/occasion, fixed denominations, or both).
- The final vault interface (partial `spend` and closure) agreed with the receiving side before the final deployment.
