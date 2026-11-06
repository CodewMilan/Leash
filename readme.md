# Shagun

Prepaid fiat gift cards, paid in USDT. The sender pays for a Diwali gift in official test USDT on Whitechain without paying gas; the recipient claims it with a passkey and gets a prepaid dollar gift card (a Lithic sandbox virtual card) loaded with exactly the gift, with no wallet or crypto on their side. Unspent value returns to the sender. Built in the existing Next.js website and brand kit.

**Current stage:** sender, verified claim, per-gift card issuance, hosted card details, authorization reservations, clearing reconciliation and partial chain settlement are connected in code. Local tests cover the integration; real end-to-end provider/chain validation requires a compatible deployed vault, Lithic signed webhooks and an HTTPS app origin. Sandbox cards cannot buy real goods. USDT is not converted into card funds.

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

Open http://localhost:3000. Run `pnpm worker` from `web/` in a second terminal after configuring the vault and operational keys. The worker is required for claim confirmation, card issuance, spending settlement and expiry reconciliation. Secrets are read from environment variables. CLI scripts optionally load `web/.env.local`; it is ignored by git.

Pages: `/` (landing), `/dashboard` (send/history/CSV), `/send` (the embeddable "Send a Shagun" popup), `/claim/[giftId]#secret` (recipient), and `/gifts/[giftId]` (authorized receipt), and `/shop` (recipient-authenticated sandbox purchases). `/gifts` redirects to the Shagun dashboard; the standalone Leash Gifts pass is retired. Unconfigured services produce setup/error states, not fabricated transactions.

### Sender wallets

Senders sign in with MetaMask. Without `NEXT_PUBLIC_PRIVY_APP_ID` the site talks to MetaMask directly (EIP-6963 discovery, falling back to `window.ethereum`), so no third-party setup is needed. Setting `NEXT_PUBLIC_PRIVY_APP_ID` switches to Privy's connect-wallet modal instead; then allow `http://localhost:3000` (and your deployed origin) in the Privy dashboard and enable MetaMask under external wallets. Add more wallets in `web/src/lib/wallets.ts`. Either way the wallet is only connected; Shagun's own signed challenge (`auth/sender/options` → `auth/sender/verify`) creates the sender session. The wallet is switched to Whitechain testnet (chain 1874) and asked to add it if missing. The sender signs once to sign in and once per gift (an EIP-3009 typed-data authorization); the relayer pays all gas. Fund the sender address with official test USDT first.

### Choosing a gift

The sender picks a card design (Diwali, Birthday, Thank you, Wedding, Just because; see `web/src/lib/designs.ts`), an amount from $0.50 to $1,000 in official test USDT, an optional note for the recipient, a private label, a claim window and an optional company campaign, then reviews it before the wallet prompt. The design is stored with the gift. The note is encrypted in the browser with the envelope secret (AES-GCM), so the server and anyone without the claim link see only ciphertext; `openMessage(secret, gift.sealedMessage)` in `web/src/lib/giftMessage.ts` reads it on the claim side.

The guided sender flow is Details → Review → Wallet → Share. After funding confirms, use **Copy claim link**, **Open recipient page**, or **Save link**. The private link includes an automatically generated secret; no password is required. It stays in the current browser tab’s session storage, so save it before closing the tab or signing out. A receipt URL cannot recover a missing claim secret.

Recipients see the chosen envelope and decrypt their personal note in the browser from the complete private link. The guided claim presents passkey confirmation first, then an explicit claim action. The page follows confirmation into card preparation and access; transaction history stays under “Follow your gift’s journey”. Incomplete links offer recovery guidance before asking for a passkey.

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

## Shagun prepaid gift cards

New claims use card redemption. The recipient opens the private gift link, confirms a passkey and presents the private gift-link secret. After the on-chain claim confirms, the worker reserves one virtual card per gift and creates it paused with an exact lifetime budget: a $25 gift receives a 2,500-cent card limit; $51.50 receives 5,150 cents. Amounts must be whole cents. There is no fixed $100 sample pass or shared operator card in this journey.

Card issuance is durable: the operation is recorded before calling Lithic. An interrupted create is recovered by the gift's unique memo instead of issuing a replacement. Full PAN/CVV never enter our card-read API or database; recipient-only hosted frames display them after a fresh passkey confirmation. Senders retain accounting receipts without access to recipient card details.

Configure `LITHIC_API_KEY`, `LITHIC_ENVIRONMENT=sandbox`, `LITHIC_ASA_SECRET`, and `LITHIC_EVENTS_SECRET`, along with the database, Whitechain vault/roles in `.env.example`. UPI provider settings are optional for new card gifts. Use a compatible deployment of `ShagunVault` exposing `spend` and `closeClaimed`; do not point old funded gifts at a replacement vault.

Lithic webhooks and hosted frames require a public HTTPS app origin. Run a tunnel to the development server (for example `cloudflared tunnel --url http://localhost:3000`), set `APP_URL` to that exact HTTPS origin and restart the app and worker. The scripts, worker and migrations read settings only from `web/.env.local`. The dev server serves its scripts only to the `APP_URL` host, so open the whole site through the tunnel, not `localhost`. A quick tunnel gets a new URL each time it restarts; enroll both endpoints again and disable the old event subscription. Enroll the signed ASA and event endpoints:

```bash
cd web
pnpm lithic:phase0 check
pnpm lithic:phase0 enroll https://<your-tunnel>
pnpm lithic:phase0 subscribe https://<your-tunnel>
pnpm db:migrate
pnpm worker
```

The Phase 0 script saves webhook secrets into ignored `web/.env.local` without printing them. Restart running processes after it writes them. `/dev/card` remains a separate development diagnostic; its explicitly configured Phase 0 card is never reused for gifts.

The recipient's claim page displays preparing/ready/closing/reconciliation states, gift budget, purchase holds, cleared spending and available funds. `/shop` derives payment cards from that recipient's passkey-authenticated Shagun session. Catalog prices are calculated on the server; purchases call Lithic's sandbox simulator and reconcile real provider transaction evidence. There are no real merchant purchases or bank transfers. Keep `LITHIC_DATA_DIR` (default `web/.data/lithic`) persistent for shop order recovery.

Signed ASA requests reserve available budget atomically, declining over-budget, unsupported or expired requests. Signed events are durably queued; the worker fetches current provider transactions and enqueues unique partial `spend` operations. Pending chain settlements remain visible as pending work. Unexpected credits/refunds or amounts outside the supported USD demo are frozen for reconciliation; the vault cannot reverse completed card spending.

At expiry, the worker stops approvals and closes the card, then requires complete provider transaction reconciliation, zero holds and no unresolved settlement/event work before returning unused USDT. A gift whose card creation was never attempted can close without a provider card. Ambiguous issuance must recover first. Unclaimed gifts keep their permissionless expiry refund. Existing UPI claims retain their original payout work; new card claims never queue whole-gift cash-out.

`/api/sandbox/card` and `/api/sandbox/session` return 410. Previously issued sample-card records remain on disk for operator recovery, but are not selectable by Shagun recipients.

Use `pnpm exec playwright install chromium` once if no browser is installed. Browser tests isolate their server on port 3100 and a separate build directory. CI runs type/lint/tests, compilation, migrations, production build and browser checks without real provider credentials.

## How value moves

A sender signs an EIP-3009 authorization for official test USDT; the relayer sponsors the gas to fund the vault. A fresh passkey session and the private link secret authorize the recipient's claim. Card approvals reserve the gift budget locally, while cleared purchases enqueue partial on-chain transfers to the treasury. Reconciled unused value returns to the sender after expiry.

The Lithic sandbox budget and Whitechain USDT are separate ledgers. Neither test USDT nor sandbox purchases have monetary value, and this integration does not provide a production conversion or off-ramp.

## Why Whitechain USDT?

Whitechain provides official test USDT with EIP-3009 authorization so the service can sponsor gas. On-chain gift conditions, campaign limits and permissionless expiry returns give participants an independently verifiable settlement record that a plain payment transfer does not supply.

On testnet, relayer WBT comes from the faucet. The proposed production 0.5% USDT fee is an economic proposal; this implementation does not collect it. Relayer calls are allowlisted, gas prices/limits and daily spend are capped, and ten percent of the configured daily gas budget is reserved for refund headroom.

## Limitations

Demo sender accounts need prefunded test USDT. An unregistered envelope goes to its first passkey-authenticated claimant, which does not prevent theft before that claim. Handles, production funding/off-ramping, a complete chain event/reorg indexer, automatic transaction replacement, CRE and ENS are not implemented. Card reconciliation supports ordinary USD sandbox purchases; exceptional refunds/credits require operator reconciliation. World ID has been removed. Campaign limits are one gift per passkey, not one per unique person. The backend derives a keyed recipient commitment for the existing vault ABI and signs claim attestations. Production release requires independent review and the gates in the operations guide.

The old device, merchant, Hedera and 0G modules are removed. Keep future work within the Shagun website.
