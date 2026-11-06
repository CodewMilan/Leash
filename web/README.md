# Leash Gifts website

Next.js wallet checkout at `/gifts`; `/` redirects there. Connect and sign in with an EVM browser wallet, prepare a gift, transfer 100 Base Sepolia test USDC, verify three confirmations, then issue a real Lithic sandbox card as the recipient.

```bash
pnpm install --frozen-lockfile
# Configure .env.local as described in the root README.
# If needed, create a testnet receiving wallet:
node --env-file=.env.local scripts/setup-testnet.mjs
pnpm dev
```

Use a wallet-enabled browser at http://localhost:3000. The in-app browser may not have an injected wallet. Run `pnpm check` for TypeScript, ESLint and tests, or `pnpm build` for production compilation.

`/sandbox` preserves the separate password-protected standalone operator demo. Purchased gifts use wallet sessions and per-order payment verification; they do not reuse the sample card.

Credentials remain server-side. Keep `.env.local` and `.data/lithic` private and persistent. No real funds, conversion to a card balance, live KYC or production/distributed support is provided. See [the project README](../readme.md) for setup, recovery, limits and the testing walkthrough.
