# Lithic sandbox integration

Implement the chosen Lithic alternative in the existing recipient UI, using real sandbox API requests. The sample gift is not a verified funded asset. Its $100 value becomes a server-controlled lifetime spending limit, not a claim about available funds.

1. Test and implement a sandbox-only HTTP adapter and durable single-gift reservation. Store only reservation identifiers and card token. Sanitize responses to masked details, expiry, card state and spending limit. Never expose API keys, PAN or CVC. Use one UUID idempotency key per reservation. On ambiguous failure, reconcile using the unique provider memo; do not create another card.
2. Add password-gated operator session routes with signed HttpOnly cookies, same-origin write checks, and setup errors when environment credentials are absent. This local sandbox operator login is not recipient identity verification. Protect all card operations.
3. Replace localStorage fake issuance and purchases with loading, setup, login, confirmation, issuing, recoverable error, and actual provider card states. Keep the existing visual system. Remove the fake purchase/balance UI. Provider purchases can be tested in Lithic's dashboard.
4. Document environment variables and persistent storage requirements. Run tests, lint, types and production build, then verify the app in the browser and attempt a real API round trip when configured.

Use persistent local disk in a single Node deployment. No serverless/distributed deployment support is claimed. No dependency on Bridge, Stripe, wallet login, crypto funding, or real KYC is introduced.
