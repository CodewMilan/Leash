# Shagun

A Diwali gift sent in dollars, claimed by a verified human, with an explicitly simulated UPI payout. Built in the existing Next.js website and brand kit.

**Current stage:** application, contract and durable worker implementation with local automated tests. Whitechain network/token configuration has been checked through RPC. This vault still needs an actual deployment, explorer source verification, real World verification and a genuine RazorpayX test payout before the full demo can be claimed as working. Live-money production is blocked by the requirements in [operations.md](docs/operations.md).

## Start here

- [Architecture diagram, sequences and code ownership](docs/architecture.md)
- [Developer setup and contribution procedure](docs/development.md)
- [Operations, recovery and production release gates](docs/operations.md)
- [Product context](docs/context.md) and [implementation plan](docs/implementation-plan.md)
- [Existing website brand kit](brand.md)

## Run locally

Use Node 22+ and pnpm 10.14.0. PostgreSQL 17 is provided for local development:

```bash
docker compose up -d db
cd web
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set DATABASE_URL and other ready services in your environment.
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000. Run `pnpm worker` from `web/` in a second terminal after configuring the vault and operational keys. Secrets are read from environment variables. CLI scripts optionally load `web/.env.local`; it is ignored by git.

Pages: `/` (landing), `/dashboard` (send/history/CSV), `/send` (the embeddable "Send a Shagun" popup), `/claim/[giftId]#secret` (recipient), and `/gifts/[giftId]` (authorized receipt). Unconfigured services produce setup/error states, not fabricated transactions.

### Sender wallets

Senders sign in with an external wallet through Privy's connect-wallet modal. MetaMask is the first wallet; add more in `web/src/lib/wallets.ts`. Set `NEXT_PUBLIC_PRIVY_APP_ID`, allow `http://localhost:3000` (and your deployed origin) in the Privy dashboard, and enable MetaMask under external wallets. Privy only connects the wallet; Shagun's own signed challenge (`auth/sender/options` → `auth/sender/verify`) creates the sender session. The wallet is switched to Whitechain testnet (chain 1874) and asked to add it if missing. The sender signs once to sign in and once per gift (an EIP-3009 typed-data authorization); the relayer pays all gas. Fund the sender address with official test USDT first.

### Choosing a gift

The sender picks a card design (Diwali, Birthday, Thank you, Wedding, Just because; see `web/src/lib/designs.ts`), an amount from $1 to $1,000 in official test USDT, an optional note for the recipient, a private label, a claim window and an optional company campaign, then reviews it before the wallet prompt. The design is stored with the gift. The note is encrypted in the browser with the envelope secret (AES-GCM), so the server and anyone without the claim link see only ciphertext; `openMessage(secret, gift.sealedMessage)` in `web/src/lib/giftMessage.ts` reads it on the claim side.

### Live Whitechain check (no mocks)

`pnpm test:live` drives the running app and worker against Whitechain Sepolia. It signs a real EIP-3009 authorization from `LIVE_SENDER_PRIVATE_KEY`, submits it through the same API as the UI, then asserts on chain that the vault holds the gift, the relayer paid the gas and the sender spent no WBT. `--refund` also waits for the real expiry return; `--preflight` only checks balances, roles and configuration. Unit tests (`pnpm check`) run the real contract on a local EVM for speed; the live check is the gate. Phase plan: [docs/sender-phase-plan.md](docs/sender-phase-plan.md).

### Embed the widget in another app

Any site can add a "Send a Shagun" button. It opens `/send` in a popup; the sender connects a wallet and sends without leaving the host app. The host receives the gift ID, status and receipt URL through `postMessage`, scoped to its own origin. The private claim link stays in the popup with the sender.

```html
<div id="shagun"></div>
<script src="http://localhost:3000/shagun.js"></script>
<script>
  Shagun.button("#shagun", {
    app: "Diwali Desk",
    amount: "25",
    note: "Diwali bonus · Diwali Desk",
    campaign: "diwali-desk-2026",
    onGift(gift) { console.log(gift.id, gift.status, gift.receiptUrl); },
  });
</script>
```

A runnable host app lives in `examples/diwali-desk/`: run `python3 -m http.server 4000` there and open http://localhost:4000 while `pnpm dev` is running. `Shagun.open(options)` opens the popup from your own button; `onReady`, `onGift`, `onClose` and `onError` callbacks are available.

## Verify and deploy to testnet

```bash
cd web
pnpm check
pnpm contracts:build
pnpm chain:check
# After setting relayer/attester keys, treasury and admin addresses:
pnpm contracts:deploy -- --confirm-testnet
```

The deploy command only permits Whitechain chain 1874 and official test USDT. It records real addresses/receipts under `deployments/` and marks source verification false until you verify it on the explorer. Standard JSON verification input is generated under `contracts/artifacts/`.

```bash
pnpm build
# Disposable localhost database with migrations applied:
E2E_DATABASE_URL=postgres://shagun:shagun@localhost:54329/shagun pnpm test:e2e
```

## Stripe Issuing sandbox (Phase 0)

The card path follows [stripe-phase-plan.md](docs/stripe-phase-plan.md). Phase 0 proves account access only; claims do not issue cards yet. Only `sk_test_`/`rk_test_` and `pk_test_` keys are accepted, and any `livemode: true` object or event is rejected.

```bash
cd web
# Set STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env.local first.
pnpm stripe:phase0 check            # sandbox Issuing balance
pnpm stripe:phase0 fund 10000       # US accounts: add $100 of test funds
pnpm stripe:phase0 card             # create + activate a $25 virtual card, prints STRIPE_PHASE0_CARD_ID
pnpm stripe:phase0 authorize 800 --capture
pnpm stripe:phase0 authorize 3000   # over budget, expect a decline
```

Webhooks: `/api/webhooks/stripe/authorization` answers `issuing_authorization.request` within the two-second window (signed with `STRIPE_AUTHORIZATION_WEBHOOK_SECRET`); `/api/webhooks/stripe/events` records lifecycle events once (`STRIPE_EVENTS_WEBHOOK_SECRET`). Locally, forward them with the Stripe CLI (`stripe listen --forward-to localhost:3000/api/webhooks/stripe/authorization`) and set the Issuing real-time authorization endpoint in the sandbox Dashboard. In development, `/dev/card` shows the Phase 0 card through Stripe Issuing Elements; it needs a session, so the database must be running.

Use `pnpm exec playwright install chromium` once if no browser is installed. Browser tests isolate their server on port 3100 and a separate build directory. CI runs type/lint/tests, compilation, migrations, production build and browser checks without real provider credentials.

## How value moves

The sender connects an external wallet (MetaMask first) through Privy and signs an EIP-3009 authorization whose nonce commits to all gift terms. The relayer pays gas to fund the vault. A passkey and backend-verified World proof authorize a claim; campaign uniqueness is also checked on-chain. The worker settles claimed USDT to the immutable treasury, then requests the RazorpayX **test** payout using a stable idempotency key.

The INR payout uses a separate prefunded test balance. **Razorpay does not convert USDT into INR, and test payouts send no money to a bank account.** The displayed INR rate is indicative and snapshotted per gift.

An expiry worker submits permissionless returns for unclaimed gifts. Expiry alone does not execute a transaction. Pausing new gifts/claims does not block refunds. A separate admin can rotate operational keys using the vault's owner controls.

## Why Whitechain USDT?

Whitechain provides official test USDT with EIP-3009 authorization so the service can sponsor gas. On-chain gift conditions, campaign limits and permissionless expiry returns give participants an independently verifiable settlement record that a plain payment transfer does not supply.

On testnet, relayer WBT comes from the faucet. The proposed production 0.5% USDT fee is an economic proposal; this implementation does not collect it. Relayer calls are allowlisted, gas prices/limits and daily spend are capped, and ten percent of the configured daily gas budget is reserved for refund headroom.

## Limitations

Demo sender accounts need prefunded test USDT. An unregistered envelope goes to its first verified human claimant, which does not prevent theft before that claim. Handles, production funding/off-ramping, a complete event/reorg indexer, automatic transaction replacement, CRE and ENS are not implemented. World integration trusts server-side verification and signed attestations. Production release requires independent review and the gates in the operations guide.

The old device, merchant, Hedera and 0G modules are removed. Keep future work within the Shagun website.
