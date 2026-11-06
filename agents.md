# Instructions for AI agents working in this repo

Read `docs/context.md` before doing anything. It holds the product, problem, prize requirements, hardware list and open decisions for Leash (ETHGlobal Mumbai, deadline Sat Nov 7, 09:00 IST).

Rules:
- No mocks, stubs or fake responses for 0G, Hedera or World. Missing credentials must fail loudly.
- Never decide a payment without a successful 0G call. If 0G is unreachable, refuse to pay (safe mode).
- Read secrets only from environment variables listed in `.env.example`. Never commit secrets.
- Keep the README updated with setup, architecture, payment flow and real Hedera transaction IDs (Hedera requires it).