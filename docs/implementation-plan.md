> Current identity decision (Nov 6): World ID is removed. Replace historical World-proof steps below with a fresh passkey session and the private gift-link secret. Campaign limits are per passkey, not per person. See `docs/context.md` and current implementation.

**Shagun implementation plan**

Prepared November 6, 2026 from [context.md](./context.md) and the current repository. This is a proposed build plan, not a claim that integrations have been implemented or deployments verified.

**Outcome and scope**

Ship one demonstrable journey: a sender authorizes a gift without paying gas; a recipient opens an NFC/QR link, authenticates with a passkey, proves humanity, and requests an explicitly labelled RazorpayX test payout. A second claimant is rejected, and an unclaimed gift is returned by an expiry worker. Every chain operation has a real receipt and explorer link.

Prioritize Whitechain and World. Treat CRE as a gated integration. Keep the context's November 7 deadlines: feature freeze at 05:00 IST, submission target 08:30, hacking ends 09:00. The schedule below assumes the context's four-person team and 16:00 start; shorten optional scope if starting later.

Include single gifts, campaign uniqueness, a sender history, claim receipts, refunds, CSV export, and a small embedding example if the core flow passes. Defer bulk sending, a general handle directory, production on-ramping/off-ramping, partial withdrawals, and sender cancellation. Handle registration and ENS are conditional extensions. Do not describe deferred capabilities as implemented.

**What is actually in this repo**

- `web/` is a Next.js/React/TypeScript site with Tailwind, GSAP, ethers, and Vitest.
- The homepage, metadata, dashboard, wallet components, dependencies, and `.env.example` still refer to Leash, devices, Hedera, or 0G despite the root README describing those integrations as removed.
- No Shagun vault source, deployment artifacts, World claim backend, passkey service, payout worker, database schema, or CRE workflow was found in the tracked source inventory.
- `docs/context.md` has existing uncommitted changes. Preserve them. Its description of a deployed/verified vault needs an address, source, ABI, and receipt before it can be treated as an available deployment.

Reuse the application shell and useful styling utilities. Replace the old product routes and integrations; do not rebuild the old payment flow. Implement a new Shagun-specific World integration.

**Resolve these design points first**

1. **Bind the gift terms to the sender's authorization.** EIP-3009 authorizes a token transfer; its fields do not include gift expiry, claim secret, recipient binding, or campaign. The receive variant protects the designated payee, but does not itself authenticate these extra terms. Preserve the one-signature flow by deriving its random authorization nonce from a typed commitment to the gift terms plus a random salt, then recomputing that commitment in the vault. Include the sender, amount, expiry, secret hash, bound identity commitment, campaign ID, and a domain/version. Test mutations of every field. [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009)
2. **Prove World identity scope before building campaigns or handles.** Do not assume a nullifier from `claim-<giftId>` can be compared with one from another action. The current integration guide describes action-scoped uniqueness while its v4 examples also label values RP-scoped; pin the SDK/proof mode and test the actual semantics. Proposed MVP: use one stable `shagun-human` uniqueness action, bind each request to gift ID, passkey session, and a fresh challenge through the supported signal/context, and track `(campaignId, verifiedHuman)` separately. Repeat humans may receive ordinary gifts; only campaign membership is one-use. Never apply a blanket “nullifier already used” rejection across all gifts. [World integration guide](https://docs.world.org/world-id/idkit/integrate)
3. **Refunds need a caller.** Contract expiry does not execute a transaction. Run a durable worker that finds expired, unclaimed gifts and submits `refundExpired()`, retries failures, and records receipts. Show “expired, return pending” until confirmed. Permissionless contract access also provides a manual recovery path.
4. **Passkeys authenticate; they do not automatically sign EVM messages.** Choose an embedded EOA provider only after proving custom chain 1874 and typed-data signing work on the demo phone. Use server-verified WebAuthn for recipient sessions. If the provider is blocked, a browser EOA protected with WebAuthn PRF is a device-specific fallback requiring an actual browser capability test; do not promise portable recovery. Avoid plaintext persistent keys. Say “confirm with your device,” since a passkey can use a PIN rather than a fingerprint.
5. **Separate token settlement from payout completion.** A confirmed `cashOut()` means tokens reached the treasury, not that rupees arrived. Create exactly one durable payout intent per gift, use one stable Razorpay idempotency key, and reconcile uncertain responses before retrying. Failed or reversed payouts stay visible for retry/reconciliation; do not refund tokens already moved to treasury as though they were still escrowed.
6. **Make the funding assumption explicit.** For this hackathon, pre-fund the sender's embedded account with official test USDT and the relayer with faucet WBT. An international fiat funding flow is outside the MVP. “Zero crypto steps” describes the demonstrated interaction, not an implemented production funding system.

**Architecture and ownership of state**

Keep one Next.js application for pages and server APIs. Add a small Node/TypeScript worker for serialized relayer submissions, chain event reconciliation, expiry returns, and payout retries. Use Postgres for durable sessions, jobs, and idempotency; do not rely on server memory or background promises in request handlers. Prefer a worker with a stable outbound IP for Razorpay allowlisting.

Flow: sender UI → signed EIP-3009 request → validated server API → relayer → vault. Recipient UI → WebAuthn + backend World verification → signed claim attestation → relayer → confirmed claim → confirmed treasury settlement → payout intent → RazorpayX test API → verified webhook/status reconciliation → receipt UI.

The vault is authoritative for token balances and gift ownership. Postgres is authoritative for sessions, request deduplication, job progress, and external payout references. A chain event index keyed by chain ID, transaction hash, and log index projects confirmed contract state into the dashboard. A periodic reconciliation loop repairs missed events and interrupted jobs.

Keep recipient UPI details and passkey credentials off-chain. Store only necessary World identifiers, scope/protocol metadata, and verification outcomes, not biometric data or permanent raw proofs. Encrypt retained payout details with a server environment key and redact them from logs. Show full proof/transaction details only in an explicit receipt view.

Proposed layout:

```text
contracts/                 Vault, token interface, tests, deployment scripts
deployments/               Public addresses, ABI, chain IDs, verification evidence
web/src/app/               Home, dashboard, claim, gift receipt, API handlers
web/src/lib/server/        Database, World, WebAuthn, attestation, payout adapters
web/src/lib/chain/         Chain config, ABI, typed data, receipt helpers
web/src/components/shagun/ Product UI and embeddable send button
db/                        Schema and migrations
worker/                    Relayer, event polling, refunds, payouts, reconciliation
cre/                       Workflow, configuration, sanitized simulation evidence
examples/widget/           Separate small app importing the send widget
docs/                      Context, plan, demo instructions, integration debriefs
```

**Phase 0 — integration gates, first 60–90 minutes**

These checks run before extensive UI work. Outputs are receipts or reproducible errors, not assumptions from the brief.

| Workstream | Check | Pass condition / decision |
| --- | --- | --- |
| Contracts/relayer | Read chain ID, token code, decimals and EIP-712 domain; fund test accounts; deploy a minimal receiver and submit `receiveWithAuthorization` | Confirm chain 1874, official token, real receipt, and unchanged sender native-token balance. Stop and resolve this before claiming the Whitechain gasless flow works. |
| Claim/passkey | Exercise embedded typed-data signing and WebAuthn on the intended phone over HTTPS | Working sender signature and server-verified recipient authentication. Record device/provider constraints. |
| World/backend | Obtain app/RP setup; verify Proof of Human on the backend; repeat with same/different humans and actions | Demonstrated identity-scope behavior and replay rejection. Confirm availability of a real verified demo participant. Simulator proofs are development-only. |
| Payout/CRE | Obtain RazorpayX test access, allowlist worker IP, create a contact/VPA/test payout; inspect CRE CLI and supported chains | A real test payout ID. CRE either reaches Whitechain or is explicitly ruled out within the gate. |

The context supplies RPC `https://rpc.testnet.whitechain.io` and official USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`; recheck them through RPC before deployment. Do not silently switch to chain 2625 or a mock token.

CRE's documented `--allow-unknown-chains` flag still requires chain-selector and RPC availability. A successful flag parse is not evidence of integration. Attempt the context's Plan A, then Plan B only when reads actually work. If neither works, preserve the direct backend payout flow; evaluate ENS only if a teammate can complete it without risking the core demo. A third partner is optional until a real integration passes. [CRE CLI reference](https://docs.chain.link/cre/reference/cli)

Treat payout access as an early gate, but cap the actual payout implementation at two hours, including the initial spike. If access fails, use a recorded genuine test payout only if one exists and label it recorded. Any sandbox card fallback must be described as a different payout experience. Never substitute fabricated success or an unlabeled fixture.

**Phase 1 — contract and durable backend, approximately 17:30–21:00 IST**

Contract owner:

- Implement a non-upgradeable MVP vault with immutable official USDT and explicit relayer, attester, operator, and treasury roles. Reject zero amounts, invalid expiry, invalid signatures, and reused authorizations. Use safe token transfers and reentrancy protection.
- Define states `Created → Claimed → Settled` and `Created → Returned`. Expiry and claiming must be mutually exclusive at the boundary. Restrict creation to the validated relayer and validate the signed gift-term commitment.
- Verify claim attestations on-chain, binding chain ID, vault, gift ID, verified identity commitment, recipient session commitment, deadline, and one-use nonce. Validate the claim secret against its hash. The backend is trusted to verify World; do not describe that as trustless on-chain World verification.
- Add campaign ID and on-chain campaign/identity consumption explicitly; the context's initial function sketch does not contain this enforcement. Revert on duplicate claim, duplicate settlement, wrong bound identity, and repeat campaign identity.
- MVP settlement transfers the entire remaining claimed amount once. Partial cash-out is deferred even if the function accepts an amount. Refund only unclaimed funds after expiry. Do not advertise sender cancellation without a separately implemented and tested path.
- Deploy, verify, and save public address/ABI/transaction evidence. If an existing deployment is supplied, compare its source and behavior against these requirements before reusing it.

Backend owner:

- Add tables for sender accounts, passkey credentials, one-use challenges, authenticated sessions, gift requests, chain events, claim attempts, campaign membership, payout intents, and worker jobs. Enforce unique authorization nonces, one winning claim per gift, one campaign membership per human, and one payout intent per gift.
- Add authenticated APIs for preparing/submitting gifts, reading owner history, obtaining claim challenges, verifying World, claiming, retrieving receipts, and exporting CSV. Rate-limit challenge issuance as well as claim submission.
- Generate cryptographic claim secrets in the client; persist their hashes on-chain. Carry the secret in the URL fragment and send it explicitly when claiming so it does not enter normal URL/server access logs. Keep analytics and third-party resources off the claim flow.
- Verify WebAuthn origin, RP ID, challenge, signature, and user verification; issue secure HTTP-only sessions. Derive expected World app/RP, action, signal and environment on the server, never from trusted client assertions. Consume challenges atomically.
- Serialize relayer nonces, estimate gas, enforce per-transaction and daily spending budgets, allow only approved vault operations, and cap IP/gift/verified-human usage. Configure caps in environment variables and reserve budget for refunds.

**Phase 2 — working sender and recipient flow, approximately 21:00–01:00 IST**

Frontend owner:

- `/`: explain Diwali gifting with two actions: send a gift and open an envelope. Keep the hackathon/test disclosure visible.
- `/dashboard`: show available demo funds, amount, envelope recipient, expiry, authorization confirmation, claim link/QR, and actual gift statuses. Campaign creation can be a minimal form or seeded campaign, clearly distinguished from bulk sending.
- `/claim/[giftId]`: mobile-first envelope opening, device confirmation, World proof, UPI entry, indicative INR quote, submission, and progress. Do not request a wallet connection from recipients.
- `/gifts/[giftId]`: authenticated receipt/status view showing the real chain transaction, payout ID, and explicit test payout state. Keep UPI and sender-private details out of unauthenticated responses.
- Include expired/return-pending/returned, already claimed, wrong recipient, duplicate campaign human, insufficient funds, verification failure, and payout processing/failure states. Do not animate success before confirmation.
- Generate QR/NFC links for the deployed HTTPS origin, then test the actual envelope with a phone. NFC is a URL transport; it is not an additional identity check.

Use the existing styling primitives where useful. Choose one focused Shagun visual direction before changing page components; avoid a separate branding exploration blocking the payment flow. Format USDT with six-decimal accounting, rupees with consistent display rounding, and use integer token units/paise for all calculations. Snapshot the configured indicative rate per payout intent so retries cannot change the amount.

Integration owner:

- Run the full send → claim → treasury settlement sequence against the real vault before connecting payout initiation.
- Create a stable payout intent when a claim is confirmed; only execute the external payout after the corresponding `cashOut` receipt is confirmed. This avoids paying against a claim whose settlement later fails.
- Use Razorpay's contact → VPA fund account → UPI payout flow with its idempotency header. Accept completion only from an authenticated provider response/webhook; deduplicate events and handle out-of-order delivery. Confirm uncertain requests by reconciliation, not a new idempotency key. [Razorpay VPA payout API](https://razorpay.com/docs/api/x/payouts/create/vpa/)
- Prefer CRE reacting to the confirmed `CashOut` event to invoke the authenticated payout service, rather than initiating money movement immediately on `GiftClaimed`. This deliberately adjusts the context's trigger to respect settlement ordering. If using the claim event, the workflow must wait for confirmed settlement before payout.
- Route CRE and direct worker execution through the same payout intent and uniqueness constraints. Do not allow two independent payout owners. Store no API secrets or UPI details in event payloads or public simulation output.

**Phase 3 — demo completeness, approximately 01:00–05:00 IST**

- Add an authenticated CSV export of gift amount, timestamps, chain status, payout test status, and receipt references. Neutralize spreadsheet formula injection in user-controlled fields.
- Build a tiny exported send button/dialog using the same creation API, and demonstrate it inside a separate example app. Verify the context's “about 20 lines” integration claim against that example. Do not build an SDK platform.
- Run the refund worker on a short-expiry demo gift; show the sender balance and explorer receipt after return.
- Demonstrate rejection separately for a consumed envelope, a second human attempting a handle-bound gift if handles were built, and the same human claiming two different gifts in one campaign. A consumed envelope alone proves one-time spending, not intended-recipient protection before the first claim.
- If stable identity scoping passed and time remains, add handle registration bound to the verified identity and passkey session. Otherwise remove handle-specific demo claims. An unregistered envelope remains first-verified-claimer access.
- Finish the test payout flow within its two-hour budget and stop changes to it by 03:00. Rehearse network/IP changes and pending provider status. Keep a clearly labelled recording of an actual working integration as backup.

**Verification and release gate**

Use contract tests for value-moving rules: authorization replay, altered gift terms, wrong signer, unauthorized callers, secret mismatch, expired claim, claim/refund race, duplicate claim/cash-out, campaign uniqueness, and exact sender refunds. Include a real testnet smoke run using official USDT; local mocks alone do not satisfy the demo.

Use backend integration tests for WebAuthn/World replay and scope, concurrent claim requests, job restart after chain settlement, duplicate/reordered webhooks, and provider timeout reconciliation. Prove the same request cannot create two payouts or a second token transfer. Test wrong World environment/action/signal and stale attestations.

Run one browser journey on desktop and the intended NFC phone: sender authorization → envelope → device auth → World → UPI test payout → receipt. Run a second journey for expiry and one for rejection. Check that recipients never need native tokens or a wallet UI. Execute the repository's lint/type/test/build checks after replacing obsolete tests and dependencies. Do not require these checks for this planning-only document.

At 05:00 freeze features. Rehearse three times and assemble a public demo, contract verification links, actual transfer/claim/refund receipts, a 2–4 minute video, `WHITECHAIN_FEEDBACK.md`, a World integration debrief, and sanitized CRE simulation evidence if used. Inspect the submission requirements rather than assuming prize eligibility from the context alone.

Update the root README, `web/README.md`, and `.env.example` when implementation changes setup. Document database migration, worker start command, HTTPS/passkey configuration, faucet funding, deployment addresses, test payout limitations, relayer budgets, and the proposed 0.5% production fee as an economic proposal rather than a collected fee. All secret values come from environment variables. Add names for database/session/WebAuthn/payout encryption configuration as needed; never copy old Hedera configuration into Shagun.

Success means the happy path, a denied path, and a real expiry return are reproducible with receipts; retrying requests and restarting workers do not duplicate value movement; the UI labels the payout simulation honestly; and the README lets another teammate run the exact demo.
