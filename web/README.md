# Shagun web application

The runnable Next.js application and Node worker live here. Start with the repository [README](../readme.md), [architecture](../docs/architecture.md), and [developer guide](../docs/development.md).

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

Run `pnpm worker` separately once chain roles and provider configuration are ready. Both processes use the same PostgreSQL database and encryption key.

| Command | Purpose |
| --- | --- |
| `pnpm check` | Type check, lint, and meaningful contract/API tests |
| `pnpm contracts:build` | Vault ABI/bytecode and source-verification input |
| `pnpm chain:check` | Real chain 1874, token code, decimals and signing domain |
| `pnpm contracts:deploy -- --confirm-testnet` | Explicit real testnet deployment |
| `pnpm db:migrate` | Locked, transactional, versioned schema migration |
| `pnpm worker` | Durable chain/payout/refund processor |
| `pnpm build` / `pnpm start` | Build / serve the production web bundle |
| `pnpm test:e2e` | Disposable local database and isolated browser checks |

Browser tests require `E2E_DATABASE_URL` pointing to a disposable localhost PostgreSQL database and a Playwright Chromium installation. They do not connect to real payment services. Set `SHAGUN_BUILD_DIR=.next-build` for a build that must coexist with another developer's `pnpm dev`.

Server code stays under `src/lib/server/`, organized by domain. Pages and UI never import secrets-bearing server modules. SQL migrations live in `../db/migrations/`; contracts live in `../contracts/`. Secret values only enter through the environment.

The UPI integration is **RazorpayX test mode**. Configuration presence does not mean a service has been verified end to end. See the [production release gate](../docs/operations.md) before deploying anything that moves real money.
