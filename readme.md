# Leash Gifts

**Connect wallet → pay Base Sepolia test USDC → verify payment → recipient issues a Lithic sandbox card.**

This branch adds an actual testnet purchase gate to the existing provider-backed sandbox issuance. Testnet tokens do not become live card funds.

## Start locally

Requires Node.js 20.9+ and pnpm 10.14.0. Use a browser with an injected EVM wallet extension, or the wallet's own browser. Smart-contract-wallet signature verification and WalletConnect are not implemented.

```bash
cd web
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set LITHIC_API_KEY and LITHIC_SANDBOX_ACCESS_CODE (16+ random characters).
# Set BASE_SEPOLIA_TREASURY_ADDRESS to your testnet receiving wallet, OR:
node --env-file=.env.local scripts/setup-testnet.mjs
pnpm dev
```

If `.env.local` already exists, edit it rather than replacing it. The setup script keeps any existing treasury address; otherwise it saves a new TESTNET receiving wallet and recovery key in ignored `.env.local`, without printing the private key. Preserve that file. Never use this generated wallet for real funds. The checkout never uses a treasury private key to sign or spend.

Open http://localhost:3000. The root redirects to `/gifts`. The in-app browser may have no wallet provider; open the URL in your normal wallet-enabled desktop browser for testing.

## Test the purchase flow

1. Obtain **100 test USDC on Base Sepolia**, plus Base Sepolia ETH for fees. The UI links to Circle's test-USDC faucet and Base's faucet guidance. These tokens have no financial value.
2. Connect your buyer wallet and approve the sign-in message. It proves ownership without authorizing a token transfer.
3. Leave the recipient blank to buy for yourself, or enter another EVM wallet. Select **Prepare gift**.
4. Check the order's receiving treasury and select **Pay 100 test USDC**. The app switches to Base Sepolia and requests a direct ERC-20 transfer, without unlimited token approvals. Approve the transfer yourself in your wallet.
5. After broadcast, use **Check submitted payment** until the server sees the transfer and **three confirmations**. The explorer receipt link is shown. Do not pay again while confirmation is pending.
6. The recipient connects and signs in, then opens the gift in **Your gifts**. If you bought for yourself, use the same session.
7. Acknowledge sandbox-only use and select **Generate sandbox card**. The server re-verifies payment and calls Lithic's sandbox API. Inspect the actual masked card, expiry, state and spending limit, or open it in Lithic.

If a page reload or request failure interrupts payment confirmation, the submitted transaction hash is stored locally and on the order when possible. **Already paid or replaced a transaction?** accepts the exact hash from your wallet, verifies it server-side, and does not send another payment. A transaction cannot pay for two gifts. A payment must have occurred after the order was created.

## Environments and routes

- `/gifts`: wallet-authenticated checkout and sent/received gifts.
- `/sandbox`: preserved operator-only standalone Lithic sandbox demo, including the previously issued card. Its sample fixture is separate from purchased gifts.
- `/api/wallet`: origin-bound, five-minute ownership challenges and signed eight-hour HttpOnly wallet sessions. Challenges are consumed once. No private wallet keys are collected.
- `/api/orders`: wallet-authorized orders, payment confirmation and recipient-only card operations.

### Required server variables

- `LITHIC_API_KEY`: **sandbox** key. All issuer requests are hardcoded to `https://sandbox.lithic.com/v1`; no production URL switch exists.
- `LITHIC_SANDBOX_ACCESS_CODE`: at least 16 random characters. Protects the standalone operator demo and signs sessions; changing it invalidates sessions.
- `BASE_SEPOLIA_TREASURY_ADDRESS`: the test-USDC receiving wallet. Buyer and recipient must not be this treasury.

### Optional server variables

- `BASE_SEPOLIA_RPC_URL`: defaults to `https://sepolia.base.org`. The server verifies chain ID **84532** and rejects other networks.
- `LITHIC_ACCOUNT_TOKEN`: sandbox account-holder `account_token` if your programme requires one. This is not your dashboard programme ID.
- `LITHIC_PROGRAM_TOKEN`: programme UUID for dashboard links.
- `LITHIC_DATA_DIR`: persistent writable root; defaults to `.data/lithic` relative to the working directory. Run from `web/` consistently.
- `BASE_SEPOLIA_TREASURY_PRIVATE_KEY`: optional locally generated recovery key; unused by the app. Keep it private and backed up if you need access to the testnet treasury later.

Never prefix secrets with `NEXT_PUBLIC_`. `.env.local` and `.data/` must remain untracked.

## Verification and recovery

The server verifies the official [Circle Base Sepolia USDC contract](https://developers.circle.com/stablecoins/usdc-contract-addresses), direct transfer calldata, buyer, order treasury, exact 100-USDC amount, successful receipt, matching Transfer log, canonical block and three confirmations. It atomically claims the transaction for one order and rechecks payment before card issuance. Treasury-to-itself transfers are rejected server-side.

Each gift gets its own persistent Lithic reservation, UUID idempotency key and unique provider memo. Repeating issuance returns the same card. Uncertain provider outcomes are recovered by searching Lithic; the app never blindly creates a replacement. The API returns only masked card metadata, never PAN/CVV. Use Lithic's dashboard for sandbox transaction tests and card-detail inspection.

```bash
cd web
pnpm check
pnpm build
pnpm start
```

The latest [readiness report](docs/readiness.md) separates automated checks, live API/RPC checks and user-dependent wallet testing.

## Scope and limitations

This is a **local persistent single-Node-instance testnet/sandbox application**, not a production card programme or serverless/distributed ledger. Wallet ownership is verified with EIP-191 signatures; this is not live KYC or legal identity verification. Sign-in throttling is process-local.

The 100 test USDC is sent to the configured testnet treasury. Lithic independently issues a sandbox card with a $100 lifetime spending limit. **There is no crypto-to-Lithic conversion, deposited card balance, live card spending or Bridge/Stripe funding connection.** No real-world purchase is claimed.

Preserve `.data/lithic` across restarts/deployments. It contains orders, used payment claims, challenges, and per-gift card reservations. Losing these records can allow duplicate issuance or transaction reuse. Never clear them to retry an uncertain operation. A crash can leave a filesystem lock; inspect the provider/payment result before operator recovery. Public/distributed deployment requires transactional storage, persistent rate limiting, provider webhooks, operational recovery, funding integration and the appropriate programme approvals.

The legacy `/fund`, `/merchant` and `/dashboard` UI still exists but its old device/Hedera services are not reconnected.

## Sandbox store

Open [the local store](http://localhost:3000/shop). Add products, choose your issued sandbox card, and check out. Recipient cards become available after issuance at `/gifts`; signing into `/sandbox` also makes the existing operator fixture available for testing. Prices are calculated on the server. Orders and receipts persist under `.data/lithic/shop`.

Checkout calls Lithic's sandbox [authorization](https://docs.lithic.com/docs/simulate-auth) and [clearing](https://docs.lithic.com/docs/simulate-clearing) endpoints, then verifies the provider transaction before marking an order paid. The sandbox simulator requires a PAN: the server fetches it transiently in memory and never logs, persists, or returns it to the browser. A pending or uncertain operation must be recovered using the existing order. Authorization and clearing intent are saved before requests; uncertain clearing is never resent automatically.

This is issuer-side simulated commerce, not a Stripe/Razorpay acquiring connection. Sandbox cards do not transfer money to a merchant bank account. No products are shipped, and testnet USDC is not converted into card funds. Check the receipt and linked Lithic transaction list for provider evidence.

Product photography is illustrative, from Unsplash: [notebook](https://images.unsplash.com/photo-1531346878377-a5be20888e57), [bag](https://images.unsplash.com/photo-1544816155-12df9643f363), [bottle](https://images.unsplash.com/photo-1602143407151-7111542de6e8).
