> Current identity decision (Nov 6): World ID is removed. Replace historical World-proof steps below with a fresh passkey session and the private gift-link secret. Campaign limits are per passkey, not per person. See `docs/context.md` and current implementation.

# Shagun architecture

Start here when joining the project. [context.md](./context.md) describes the product; this document describes the implemented boundaries. The [release checklist](./operations.md) records what still prevents a production launch.

Use the [HTTP API reference](./api.md) for route contracts and the [developer guide](./development.md) for setup and contribution procedures.

## System diagram

```mermaid
flowchart TB
  subgraph Clients[Browser: untrusted input]
    Sender[Sender dashboard]
    Recipient[Claim page / NFC or QR URL]
    Privy[Privy embedded EOA]
    Passkey[Device passkey]
    IDKit[World IDKit]
    Sender --> Privy
    Recipient --> Passkey
    Recipient --> IDKit
  end

  subgraph App[Next.js application: server trust boundary]
    HTTP[HTTP router: origin / size / session checks]
    Auth[Sender signature and WebAuthn verification]
    Gifts[Gift authorization and claim reservation]
    World[World proof verification adapter]
    Webhook[Signed Razorpay webhook handler]
    HTTP --> Auth
    HTTP --> Gifts
    Gifts --> World
  end

  subgraph Storage[Durable PostgreSQL]
    Sessions[Sessions / one-use challenges / credentials]
    Records[Gifts / campaign uniqueness]
    Jobs[Encrypted jobs / signed transaction journal]
    Payouts[Encrypted payout details / idempotency keys]
  end

  subgraph Worker[Dedicated Node worker: one active chain submitter]
    Lock[PostgreSQL advisory lock]
    Relay[Allowlisted relay / nonce and gas budgets]
    Refund[Expiry scanner]
    Pay[Payout dispatcher and status reconciliation]
    Lock --> Relay
    Lock --> Refund
    Lock --> Pay
  end

  subgraph Chain[Whitechain Sepolia: chain 1874]
    Vault[ShagunVault: gift terms / claims / returns]
    USDT[Official test USDT: EIP-3009]
    Treasury[Payout treasury: test USDT]
    Vault --> USDT
    Vault -->|Full claimed gift once| Treasury
  end

  Privy -->|Signed ReceiveWithAuthorization| HTTP
  Passkey -->|WebAuthn response| HTTP
  IDKit -->|Proof plus gift-bound challenge| HTTP
  Auth --> Sessions
  Gifts --> Records
  Gifts --> Jobs
  Gifts --> Payouts
  World -->|Server-side validation| WorldAPI[World verification API]
  Jobs --> Relay
  Records --> Refund
  Relay -->|Signed transaction persisted before broadcast| Vault
  Refund -->|refundExpired: permissionless| Vault
  Vault -->|Confirmed receipt| Records
  Records -->|Settlement confirmed| Pay
  Payouts <--> Pay
  Pay -->|Same intent / same idempotency key| Razorpay[RazorpayX TEST MODE: prefunded INR balance]
  Razorpay -->|HMAC-signed event| Webhook
  Webhook --> Payouts
  HTTP -->|Authorized status / receipts / CSV| Clients
```

USDT entering the treasury does **not** convert it to INR. RazorpayX test mode simulates the separate INR payment. A live conversion/payout provider is a production dependency, not an implemented feature. CRE is not currently in the execution path.

## Send and claim sequence

```mermaid
sequenceDiagram
  actor S as Sender
  participant UI as Web UI
  participant API as Next.js API
  participant DB as PostgreSQL
  participant W as Worker
  participant V as ShagunVault
  actor R as Recipient
  participant ID as World API
  participant RX as RazorpayX test
  S->>UI: Sign in through Privy
  UI->>API: One-use signed sender sign-in challenge
  API->>DB: Authenticate sender session
  S->>UI: Confirm one EIP-3009 gift authorization
  UI->>API: Signed token authorization and committed gift terms
  API->>DB: Atomically create pending gift and encrypted create job
  W->>DB: Persist signed transaction and hash
  W->>V: createGiftWithAuthorization
  V-->>W: Confirmed GiftCreated receipt
  W->>DB: Mark sent and store receipt
  UI-->>S: Reveal shareable link / QR after confirmation
  S-->>R: Private claim URL with secret in fragment
  R->>UI: Confirm passkey and enter UPI details
  UI->>API: Verify WebAuthn, request gift-bound World challenge
  R->>UI: Complete World IDKit proof
  UI->>API: Claim secret, proof, payout details
  API->>ID: Verify expected protocol/action/nonce/environment/signal
  ID-->>API: Verification result
  API->>DB: Atomically reserve gift, campaign identity, payout intent, claim job
  W->>V: claim with backend EIP-712 attestation
  V-->>W: Confirmed GiftClaimed receipt
  W->>V: cashOut to immutable treasury
  V-->>W: Confirmed CashOut receipt
  W->>RX: Test UPI payout using stable idempotency key
  RX-->>API: Signed status webhook
  API->>DB: Deduplicate event and update payout state
  UI-->>R: Chain receipts and explicitly labelled test payout status
```

The sender's initial session sign-in is separate from the single gift authorization. Neither requires a sender-paid transaction. Demo sender accounts must be prefunded with official test USDT.

## State and ownership

```mermaid
stateDiagram-v2
  [*] --> Pending: API records signed authorization
  Pending --> Created: Confirmed funding receipt
  Pending --> Failed: Invalid or expired authorization
  Created --> ClaimReserved: Backend verifies device and World
  ClaimReserved --> Created: Claim definitively reverts and reservation is released
  ClaimReserved --> Claimed: Confirmed claim receipt
  Created --> Returned: Expiry worker or any caller submits refund
  Claimed --> Settled: Operator transfers full gift to treasury
  Settled --> TestPayoutPending: Durable payout intent
  TestPayoutPending --> TestPayoutProcessed: Verified provider status
  TestPayoutPending --> TestPayoutFailed: Verified provider failure
  TestPayoutProcessed --> TestPayoutReversed: Verified reversal
```

`ClaimReserved` is a database reservation, not an on-chain claim. The UI displays it as confirmation pending. Contract state is authoritative for tokens. PostgreSQL owns sessions, encrypted work, campaign reservations, and external payout state. The worker projects confirmed receipts into gift records; a full independent event indexer is not implemented.

## Source map

| Path | Responsibility |
| --- | --- |
| `contracts/ShagunVault.sol` | Escrow, sender-term commitment, attested claims, campaign uniqueness, treasury settlement, expiry refunds, admin key rotation and pause |
| `contracts/test/` | Local mock token, excluded from deployment scripts |
| `db/migrations/` | Numbered schema migrations and ordered migration registry |
| `web/src/app/` | Page entry points and thin API route adapter |
| `web/src/components/shagun/` | Landing, dashboard, claim, receipt, and sender-provider UI |
| `web/src/lib/chain.ts` | Public chain configuration, ABI, EIP-712 types, gift nonce commitment |
| `web/src/lib/amounts.ts` | Integer USDT/paise arithmetic and display/export formatting |
| `web/src/lib/server/api.ts` | HTTP routing and safe error envelope; no payment implementation |
| `web/src/lib/server/http/` | Input schemas, bounded body reader, response helpers, authorized reads |
| `web/src/lib/server/auth/` | Sessions, one-use challenges, sender signatures, WebAuthn verification |
| `web/src/lib/server/gifts/` | Gift creation, claim orchestration, and database projection |
| `web/src/lib/server/world/` | RP request signing and strict backend proof verification |
| `web/src/lib/server/payouts/` | RazorpayX test adapter, provider reconciliation, signed webhooks |
| `web/src/lib/server/chain/` | Durable relayer jobs, receipt recovery, settlement, expiry scanner |
| `web/src/lib/server/security/` | AES-GCM encryption, random IDs, keyed human commitments |
| `web/scripts/` | Migration, worker process, chain check, compilation and testnet deployment commands |
| `web/tests/` | Contract and API integration tests |
| `web/e2e/` | Browser journeys, mobile layout, actual WebAuthn verification using a virtual authenticator |
| `deployments/` | Public deployment evidence, created only by a real deployment |

Dependencies point from UI to the HTTP API, and from controllers to domain/repository/adapters. Browser modules must not import server code. No provider credentials, raw proofs, or UPI IDs belong in `NEXT_PUBLIC_*`, URL queries, chain events, or logs.

## Important invariants

- The EIP-3009 nonce commits to chain, vault, sender, amount, expiry, secret hash, bound human, campaign and random salt. Changing any term invalidates the authorization.
- Gift secrets live in private fragment URLs. The sender retains a copy only in the current browser tab's session storage; closing the tab without saving the link loses that copy.
- World uses a stable `shagun-human` action and a fresh signal bound to the gift and passkey session. Pin v4 Proof of Human; confirm repeated-human behavior with real World participants before submission. Never compare unrelated action nullifiers.
- Campaign uniqueness is scoped to `(sender, campaignId, human)`, in both the database and vault. Ordinary gifts remain repeatable.
- Claim reservation, campaign consumption, payout intent, and claim job creation share one atomic SQL statement.
- Only the worker broadcasts transactions. It persists encrypted signed bytes and the hash before sending, then rebroadcasts the same bytes after an uncertain response.
- Payouts require a confirmed treasury-settlement receipt and one stable intent/idempotency key. Uncertain responses are reconciled; they do not authorize another payout intent.
- A processed provider state cannot be overwritten by a delayed processing event. A later authenticated reversal is allowed.
- A separate vault admin can pause new gifts/claims and rotate operational roles. Pause never blocks expiry refunds. Ownership changes use two-step acceptance.
