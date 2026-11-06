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

Pages: `/` (landing), `/dashboard` (send/history/CSV), `/claim/[giftId]#secret` (recipient), and `/gifts/[giftId]` (authorized receipt). Unconfigured services produce setup/error states, not fabricated transactions.

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

Use `pnpm exec playwright install chromium` once if no browser is installed. Browser tests isolate their server on port 3100 and a separate build directory. CI runs type/lint/tests, compilation, migrations, production build and browser checks without real provider credentials.

## How value moves

Privy provides the sender's embedded EOA. The sender signs an EIP-3009 authorization whose nonce commits to all gift terms. The relayer pays gas to fund the vault. A passkey and backend-verified World proof authorize a claim; campaign uniqueness is also checked on-chain. The worker settles claimed USDT to the immutable treasury, then requests the RazorpayX **test** payout using a stable idempotency key.

The INR payout uses a separate prefunded test balance. **Razorpay does not convert USDT into INR, and test payouts send no money to a bank account.** The displayed INR rate is indicative and snapshotted per gift.

An expiry worker submits permissionless returns for unclaimed gifts. Expiry alone does not execute a transaction. Pausing new gifts/claims does not block refunds. A separate admin can rotate operational keys using the vault's owner controls.

## Why Whitechain USDT?

Whitechain provides official test USDT with EIP-3009 authorization so the service can sponsor gas. On-chain gift conditions, campaign limits and permissionless expiry returns give participants an independently verifiable settlement record that a plain payment transfer does not supply.

On testnet, relayer WBT comes from the faucet. The proposed production 0.5% USDT fee is an economic proposal; this implementation does not collect it. Relayer calls are allowlisted, gas prices/limits and daily spend are capped, and ten percent of the configured daily gas budget is reserved for refund headroom.

## Limitations

Demo sender accounts need prefunded test USDT. An unregistered envelope goes to its first verified human claimant, which does not prevent theft before that claim. Handles, production funding/off-ramping, a complete event/reorg indexer, automatic transaction replacement, CRE and ENS are not implemented. World integration trusts server-side verification and signed attestations. Production release requires independent review and the gates in the operations guide.

The old device, merchant, Hedera and 0G modules are removed. Keep future work within the Shagun website.
