# Operations and release gate

The repository contains a working application foundation with automated local checks. It is **not approved for live-money production**. Current chain operations target Whitechain testnet, and the payout adapter deliberately refuses live Razorpay keys.

## Deployment topology

Deploy the Next.js application behind HTTPS and run `pnpm worker` as a separate supervised Node process. Both use the same durable PostgreSQL database and encryption key. Give the payout worker a stable outbound IP for Razorpay allowlisting. Keep operational wallets minimally funded. Put admin ownership in separately controlled custody, preferably a multisig.

Apply migrations once before starting a release. Web instances may scale horizontally. Multiple workers are safe only while all follow the same PostgreSQL session advisory-lock protocol; one acquires the chain submission lock at a time. Do not use a database connection pooler in transaction mode for the worker lock connection. Use direct PostgreSQL or session pooling. The current lock is process-session scoped; a worker connection loss requires process restart and reconciliation before running another submitter.

Use a secret manager to inject environment variables. `DATA_ENCRYPTION_KEY` also derives human commitments: changing it would change campaign identity mapping and make old jobs unreadable. Back it up securely with the database. A versioned key-rotation migration is required before routine production rotation; replacing the value in place is not supported.

## Health and observability

- `GET /api/health`: process liveness.
- `GET /api/status`: configuration-presence summary, never proof that a provider is operational.
- `GET /api/ready`: configuration plus a successful database query and a worker heartbeat newer than two minutes. It returns 503 until those conditions hold.
- Logs use event names, request IDs, counts and safe exception names. Do not add full request bodies, raw provider errors, RPC URLs, proofs, claim secrets or UPI IDs to logs.

Alert on stale worker heartbeats, failed jobs, repeated retry errors, old pending payouts, insufficient relayer WBT/treasury liquidity, and database capacity. Current heartbeat freshness alone does not prove absence of a failed individual job. Add provider-specific monitoring in the deployment environment.

## Recovery procedures

**Worker restart / uncertain broadcast:** restart with the same database, encryption key and operational roles. The journal contains the signed transaction and hash before broadcast; the worker queries the receipt and rebroadcasts the identical bytes if necessary. Do not manually create a new job or signed transaction for an unresolved gift.

**Pending transaction:** inspect its public hash and relayer nonce. The current worker does not automatically replace dropped or underpriced transactions. Pause new sends if required, resolve the transaction with the same nonce under operator review, then reconcile its receipt. Do not delete the journal to force a retry.

**Rejected claim:** a definitive claim failure releases the database reservation and campaign membership so the user can obtain a fresh proof. Expired unclaimed funds can then be returned. Connectivity failures retain the reservation until the transaction outcome is known.

**Expired gift:** run the worker and inspect its refund job. Anyone may call `refundExpired` on an unclaimed gift after expiry. An external confirmed return is reconciled from its `Returned` event. Keep the vault deployment block configured to bound log queries. Refunds remain callable when the vault is paused.

**Payout timeout:** preserve the intent, provider account references and idempotency key. Retry uses the same request. Once a payout ID is known, query provider status instead of creating another payout. Webhooks are signed and deduplicated, and status polling repairs missed webhooks.

**Failed/reversed payout:** keep the gift settled and the failure visible. Tokens already sent to treasury are not eligible for `refundExpired`. Resolve with the payout provider and an operator; automated creation of a replacement intent is deliberately unsupported.

**Compromised operational key:** separately controlled admin pauses new gifts/claims and rotates relayer/attester/operator roles. Update worker environment and restart only after checking the new addresses against the vault. Ownership transfer requires the pending admin to accept. Preserve the old database and receipts. Treasury is immutable and cannot be redirected by the relayer.

**Backup recovery:** restore the database and matching encryption key together. Reconcile all journal hashes and payout IDs before enabling writes. A chain replay alone cannot restore encrypted UPI details, passkey credentials, sessions, or provider idempotency history.

## Required before a public hackathon demo

- Configure Privy and complete custom-chain signing on the intended phone.
- Deploy and source-verify this vault on 1874. Commit the real public deployment record and explorer links.
- Submit an actual official-USDT gasless gift and prove the sender's WBT balance stays unchanged.
- Use real World verification for success and a second gift in the same campaign for rejection. Simulator tests do not prove production identity behavior.
- Rehearse a real expiry return, including worker recovery and receipt display.
- Confirm the existing Razorpay account has **RazorpayX test payout** access, outbound IP allowlisting, webhook delivery, and a genuine test payout ID. Payment-gateway keys alone are not evidence of payout access.
- Confirm all simulated payout labels, indicative rates, starting-point commits and partner submission evidence are accurate.

## Required before live-money production

- Integrate an authorized production conversion/payout partner and reconcile actual INR funding, fees, tax treatment, failures and customer support. The current Razorpay adapter cannot be enabled for live crypto payouts by changing a key.
- Obtain independent contract/security review, operational threat review, and load/failure testing using the intended hosting and RPC providers.
- Complete real World v4 nullifier-scope and device compatibility tests; avoid interpreting human uniqueness as intended-recipient identity for an unregistered envelope.
- Move operational signing to controlled custody, rehearse admin pause/key rotation, and define treasury reconciliation and incident ownership.
- Implement a complete chain event/reorg reconciliation strategy, configurable finality appropriate to the chain, and reviewed dropped-transaction replacement.
- Add authentication/session revocation operations, a data-retention/deletion policy for payout details, and versioned encryption/identity-key rotation.
- Rehearse database backup restore, provider outages, worker lock/connection loss and webhook replay. Configure external rate limiting at the trusted reverse proxy and a production CSP tested with Privy/World.
- Replace demo funding assumptions with an actual sender funding flow. Verify production business/compliance requirements with the chosen partners before making availability claims.

These are explicit release blockers, not capabilities implied by a successful local build.
