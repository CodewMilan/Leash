# Leash Gifts website

Next.js recipient demo at `/gifts`; `/` redirects there.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. Run `pnpm check` for type checking, ESLint, and Vitest, or `pnpm build` for a production build.

The gift, login, onboarding, virtual card and purchases are simulations. Progress is saved in browser localStorage; no personal identity data or card credentials are collected. No Bridge or Stripe access is required for the demo. See [the project README](../readme.md) for the recovery walkthrough and real-provider integration requirements.
