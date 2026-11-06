# HTTP API reference

All routes live under `/api`. The Next.js catch-all route delegates to domain controllers; the router is not the payment implementation. Responses and application types are in `web/src/lib/types.ts`.

Mutations require JSON and an `Origin` matching `APP_URL`, except the externally signed Razorpay webhook. Authenticate using the HTTP-only `shagun_session` cookie. The API never accepts a client-supplied sender address or World RP ID as proof of authorization.

| Method / route | Purpose and authorization |
| --- | --- |
| `GET /health` | Process liveness; no credentials required |
| `GET /status` | Public configuration-presence summary; no secret values |
| `GET /ready` | Configuration, database and worker-heartbeat check; 503 until ready |
| `POST /session` | Create or recover a browser session; sets HTTP-only cookie |
| `GET /session` | Current sender identity and whether this session has a passkey |
| `POST /auth/logout` | Expire this server session and cookie |
| `POST /auth/sender/options` | Accept `{address}` and issue a one-use, origin-bound sign-in message |
| `POST /auth/sender/verify` | Verify `{challengeId, signature}` from the EOA and authenticate the sender |
| `POST /auth/passkey/options` | Accept `{mode: "register" | "login"}` and issue WebAuthn options |
| `POST /auth/passkey/verify` | Verify `{mode, challengeId, response}`; require device user verification |
| `GET /gift-config` | Public vault address and chain ID for an established browser session |
| `GET /balance` | Current authenticated sender's real official-token balance |
| `POST /gifts` | Sender-authorized gift, encrypted durable create job; 202 pending chain confirmation |
| `GET /gifts` | Up to 500 gifts owned by the authenticated sender, newest first |
| `GET /gifts/export` | The sender's CSV with formula neutralization and test payout labels |
| `GET /gifts/:id` | Public gift availability for a session; private receipt fields only for owner/claimant |
| `POST /gifts/:id/world` | Issue gift/session-bound World challenge after fresh passkey confirmation |
| `POST /gifts/:id/claim` | Verify proof and reserve one claim/payout intent; 202 pending chain confirmation |
| `POST /webhooks/razorpay` | Verify raw-body HMAC and event ID, deduplicate, update known test payout |

`POST /gifts` accepts `{terms, validAfter, validBefore, signature, label}`. `terms` is defined in `lib/chain.ts`; `authorizationNonce`/`giftNonce` must agree exactly. Authorizations are short-lived, gifts expire within 30 days, and amounts are raw USDT micro-units. The MVP API accepts envelopes with `boundHuman` zero; handle registration is not implemented. The worker, not the request handler, submits transactions.

`POST /gifts/:id/claim` accepts `{challengeId, secret, proof, name, upi}`. A fresh WebAuthn-authenticated session and matching v4 Proof of Human are required. `secret` is read from the URL fragment by the browser and sent only in the bounded JSON body. Never put it into a query string. World actions, RP, environment, signal and nonce are derived/enforced on the server. A duplicate campaign identity yields 409 without a second claim job.

A successful submission is not a successful payment. Poll gift state and display real receipt hashes. `claimPending` is a database reservation; `status: "claimed"` requires a confirmed claim receipt. `status: "settled"` describes treasury token settlement, while `payoutStatus` describes the separate simulated UPI payout.

Errors use `{error, requestId}` with 400 for invalid input, 401 for session/device authentication, 403 for rejected authorization/proof/origin, 404 for missing resources, 409 for consumed challenges/gifts/campaigns, 413/415 for request limits, 429 for throttling, and 503 for setup/provider failures. Do not display raw upstream errors or add secret fields to this envelope.

Webhook integration requires `X-Razorpay-Signature` over the exact raw body and `X-Razorpay-Event-Id`. Register payout lifecycle events only. Browser origin checks do not replace webhook signature verification.
