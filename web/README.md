# Leash Gifts website

Next.js recipient flow at `/gifts`; `/` redirects there. Uses real Lithic sandbox issuance, not a local fake card.

```bash
pnpm install --frozen-lockfile
# Configure .env.local as described in the root README
pnpm dev
```

Open http://localhost:3000 and enter the configured `LITHIC_SANDBOX_ACCESS_CODE`. Run `pnpm check` for type checking, ESLint and Vitest, or `pnpm build` for a production build.

`LITHIC_API_KEY` stays server-side. The one-gift reservation is persisted in `.data/lithic` by default; do not delete it to retry an ambiguous issuance. The local operator session is not real recipient authentication. The displayed gift remains illustrative and its value is only used as a sandbox spending limit.

See [the project README](../readme.md) for environment setup, security and deployment limits, and recovery details.
