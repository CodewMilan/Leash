# Project context

The repo is the Next.js website in `web/`. The old Leash device, merchant services, 0G, Hedera and World ID integrations were removed. Legacy UI routes remain; do not rebuild/reconnect their services unless asked.

## Current branch: testnet wallet purchases

`codex/end-to-end-gifting` adds wallet-authenticated purchases at `/gifts`: connect an injected EVM wallet, sign an origin-bound single-use challenge, prepare a gift for self or another wallet, pay exactly 100 test USDC on Base Sepolia, verify three confirmations, then issue a real Lithic sandbox card as the recipient.

The server validates chain 84532, the official Circle test-USDC contract, transaction calldata/logs, sender, stored treasury, amount, success, canonical block and order age. A transaction is atomically claimed for one gift. Unpaid orders and other wallets cannot issue/view the card. Each order has a separate durable Lithic reservation and safe provider timeout recovery. Secrets come only from environment variables; PAN/CVV and private keys never go to the client.

`/sandbox` preserves the older standalone operator-only Lithic sample and existing card. It is separate from purchased gifts.

Testnet USDC goes to a local testnet treasury. The independently issued Lithic sandbox card has a $100 lifetime spending limit, NOT a deposited crypto-backed balance. Bridge/Stripe conversion/funding, live KYC, real-world purchases and production funding remain absent.

Use one persistent local Node instance. Preserve `.env.local` and `.data/`, including orders, payment claims and provider reservations. No serverless/distributed or production readiness is claimed. Read readme.md and docs/readiness.md for setup and verification. User-controlled wallet approval and test funds are required for an actual chain payment; do not claim the full paid purchase was demonstrated without that transaction.
