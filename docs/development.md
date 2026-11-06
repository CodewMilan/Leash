# Developer workflow

Read [architecture.md](./architecture.md), [context.md](./context.md), and [brand.md](../brand.md) before changing the product. The landing page may be owned by a separate developer; coordinate file ownership before editing shared UI. Do not restore the removed device, merchant, Hedera or 0G modules.

## Local setup

Use Node 22 or newer and pnpm 10.14.0. Install from `web/` with the checked-in lockfile. The app, worker, and migration commands read configuration from environment variables; the CLI commands optionally load `web/.env.local` into their environment. Never print or commit that file.

```bash
cd web
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Start PostgreSQL 17 using the root `compose.yaml` (or use an existing PostgreSQL instance), set `DATABASE_URL`, then migrate and start the app:

```bash
docker compose up -d db
cd web
pnpm db:migrate
pnpm dev
```

Run `pnpm worker` in a second terminal after configuring and deploying the vault. The worker is a long-running process; serverless request handlers do not replace it. The dashboard and forms can render while services are unconfigured, but they do not fabricate gifts or successful payouts.

## External setup

1. **Privy:** create an app, allow the local and deployed origins, enable the configured email/Google login methods and embedded Ethereum wallets. Set `NEXT_PUBLIC_PRIVY_APP_ID`. Prove EIP-712 signing on custom chain 1874 using the target phone.
2. **Whitechain:** generate separate relayer and attester keys in your secret manager. Give the relayer faucet WBT; give sender accounts official test USDT. Set treasury and admin addresses. Run `pnpm chain:check` and `pnpm contracts:build`, then explicitly run `pnpm contracts:deploy -- --confirm-testnet`. Verify source using the generated standard JSON input, and set `VAULT_ADDRESS` and `VAULT_DEPLOY_BLOCK` from the real receipt. Keep admin signing authority separate from the app.
3. **Recipient claims:** use passkeys and private gift-link secrets. World ID is removed; campaigns are limited per passkey, not per unique person.
4. **RazorpayX:** use test keys, test account identifier, a funded test balance, and the worker's allowlisted outbound IP. Register `/api/webhooks/razorpay` with its own webhook signing secret and payout lifecycle events. Live keys are rejected by this code.

An indicative rate is snapshotted per gift. Updating `PAYOUT_INR_PER_USDT` affects new gifts only. USDT math uses integer micro-units; INR uses integer paise. Do not introduce floating-point conversion in APIs or workers.

## Checks and change procedure

```bash
pnpm check                 # TypeScript, ESLint, contract and API tests
pnpm format:check          # Formatting in shared application/backend modules
pnpm contracts:build       # Compile the deployable vault and verification input
pnpm build                 # Next.js production build
```

Browser checks require a **disposable localhost PostgreSQL database** with migrations applied:

```bash
E2E_DATABASE_URL=postgres://shagun:shagun@localhost:54329/shagun pnpm test:e2e
```

Install the Playwright browser with `pnpm exec playwright install chromium` if needed. Tests use a separate port (3100), `.next-e2e` directory, generated encryption key, and disabled external-service credentials. They seed explicitly test-only gift records and do not submit Whitechain transactions or payouts. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing browser executable.

Set `E2E_USE_BUILD=.next` to test an existing production build instead of starting a development watcher. Build with an empty `NEXT_PUBLIC_PRIVY_APP_ID` for this isolated setup-state suite; production sign-in needs a separately configured build and real provider checks. CI uses the production build for browser checks.

To run a build beside another developer's preview, set `SHAGUN_BUILD_DIR=.next-build`. Default development and production commands still use `.next`.

Before a PR: make a narrow branch, explain the user-visible result, run the relevant checks, and include real provider evidence separately from local test evidence. Never mark a testnet transaction as source-verified until explorer verification succeeds. Do not commit generated contract artifacts, traces, environment files, or private keys. Commit public deployment records and sanitized receipts when available.

For database changes, add a new numbered file under `db/migrations/` and append it to `index.ts`. Never modify an applied migration. The runner holds a PostgreSQL migration lock, applies migrations transactionally, and records versions. Deploy schema changes before code that depends on them; destructive schema changes need an explicit backup and rollout plan.

For API changes, keep the route thin, validate untrusted inputs, authorize ownership in server code, and update the relevant domain module. Add tests for value movement, replay, concurrency, and failure recovery when those behaviors change. Put shared response types in `lib/types.ts`; keep server configuration out of client bundles.

For contract changes, preserve the authorization-term commitment and claim/refund exclusion, add regression tests, and redeploy/verify a new vault. This contract is not a proxy. Update its ABI and deployment evidence together. Changing the treasury requires a new deployment.
