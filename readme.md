# Leash

A leash for your AI agent's spending: a handheld AI assistant that pays for things for you, but can never spend over your limit without your thumb.

Built at ETHGlobal Mumbai with **0G** (AI decisions and memory), **Hedera** (x402 payments in USDC) and **World ID Agent Pass** (fresh human approval).

- Product, problem, prize requirements, hardware list and open decisions: [docs/context.md](docs/context.md)
- Architecture and who signs what: [docs/architecture.md](docs/architecture.md)
- Workflow diagram: [docs/workflow.md](docs/workflow.md)
- Build plan to the deadline: [docs/plan.md](docs/plan.md)

## Repo layout

| Folder | Runs on | What it does |
|---|---|---|
| `device/` | Raspberry Pi 4 | The agent. Push-to-talk + local Whisper, QR camera, asks 0G to decide, saves memory to 0G Storage, enforces the limit, fingerprint + World ID for big payments, signs the x402 payment and the HCS spend log. Serves the device screen and a read-only live feed. |
| `merchant/` | Laptop | Demo shop with two x402-protected endpoints (chai stall, photographer), settling USDC on Hedera testnet through a public facilitator. |
| `web/` | Laptop | Landing page and the read-only dashboard (`/dashboard`): Hedera mirror node + the device's live feed. |

## Payment flow

1. Hold the talk button and speak ("pay the photographer 20 dollars"); the camera also looks for a QR code.
2. Whisper (whisper.cpp) transcribes on the Pi.
3. The Pi asks **0G** (Compute Router, TEE-only `private` trust mode) for a JSON decision: pay / answer / refuse, which saved contact, how much. The `x_0g_trace.request_id` is the receipt for that decision. If 0G can't be reached or answers badly, the device goes to **safe mode** and pays nothing.
4. The Pi signs and uploads the episode (what it heard, saw, decided, 0G receipt) to **0G Storage** with its 0G wallet.
5. The Pi requests the merchant's resource and gets `402` with x402 v2 `PAYMENT-REQUIRED` terms.
6. The Pi builds the Hedera `TransferTransaction` (USDC from the device to `payTo`, fee paid by the facilitator), decodes the bytes back and checks them: right token, right sender, recipient equals the saved contact's account, amount equals what you said.
7. Over `SPEND_LIMIT_USDC`: buzz, the screen shows amount + recipient decoded from that transaction, thumb on the R503 sensor, then a fresh World ID check (OIDC device flow, QR on the device screen) that must come from the owner's pinned World ID. Any failure, timeout or cancel: nothing is signed.
8. The Pi signs and retries with `PAYMENT-SIGNATURE`; the facilitator co-signs as fee payer and submits; the merchant returns `PAYMENT-RESPONSE` with the Hedera transaction ID.
9. The Pi writes a device-signed entry to the HCS spend log topic (submit key = device key): tx ID, amount, recipient, approvals, 0G request ID, memory root hash.

## Setup

### Accounts and keys

Copy `.env.example` to `.env` (repo root, or `device/.env` on the Pi and `merchant/.env` on the laptop) and fill in real values. Nothing is mocked; missing values stop the apps at startup.

1. **Hedera testnet**: create two accounts at [portal.hedera.com](https://portal.hedera.com) (device and merchant). The device needs a little HBAR for association and HCS messages; payment fees are paid by the facilitator.
2. **0G**: an API key from [pc.0g.ai](https://pc.0g.ai) (`ZG_API_KEY`), and an EVM wallet with Galileo testnet tokens from [faucet.0g.ai](https://faucet.0g.ai) (`ZG_PRIVATE_KEY`) for Storage uploads.
3. **World**: register a client at [auth.world.org/portal](https://auth.world.org/portal) (a redirect URI is required even though the device flow doesn't use it). Put the client ID and secret in `WORLD_CLIENT_ID` / `WORLD_CLIENT_SECRET`.

### Merchant (laptop)

```bash
cd merchant && pnpm install
pnpm setup          # associates MERCHANT_ACCOUNT_ID with USDC 0.0.429274 (uses MERCHANT_PRIVATE_KEY once)
pnpm preflight      # checks the account and the facilitator against the real network
pnpm start          # http://<laptop-ip>:4021, QR codes at /qr/chai and /qr/photo, receipts at /receipts
```

### Device (Raspberry Pi 4, Raspberry Pi OS Bookworm)

```bash
sudo apt install -y nodejs npm zbar-tools espeak-ng rpicam-apps python3-gpiozero alsa-utils chromium-browser
# whisper.cpp: build it and download a model into device/models/
git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp && cmake -B build && cmake --build build -j4 --config Release
sudo cp build/bin/whisper-cli /usr/local/bin/ && sh ./models/download-ggml-model.sh base.en && cp models/ggml-base.en.bin ~/leash/device/models/

cd ~/leash/device && npm i -g pnpm && pnpm install
cp contacts.example.json contacts.json   # set the laptop IP and the merchant's Hedera account
pnpm setup:hedera     # associates the device with USDC and creates the spend log topic; put the topic ID in .env
# fund the device with testnet USDC: https://faucet.circle.com (Hedera Testnet)
pnpm enroll:finger    # enroll your thumb on the R503
pnpm enroll:world     # scan the QR with your phone; put the printed WORLD_OWNER_SUB in .env
pnpm preflight        # checks every key against the real 0G, Hedera and World services, and the merchants
pnpm start            # device screen: chromium --kiosk http://localhost:7070/screen
```

Bench testing without the mic: `LEASH_HARDWARE=none pnpm start`, then `pnpm ask "buy two chais"`. Typed input is accepted from the device itself only (loopback). Without a fingerprint sensor, over-limit payments are refused.

Default wiring (BCM, override with env): talk button 17, approve 27, cancel 22, RGB LED 5/6/13, vibration motor 26 (through a 2N2222), R503 on USB-serial at `/dev/ttyUSB0`.

### Dashboard

```bash
cd web && cp .env.example .env.local   # device account, spend log topic, device URL
pnpm install && pnpm dev               # http://localhost:3000/dashboard
```

## Tests

```bash
pnpm check        # repo root: type checks, lint and unit tests in device/, merchant/ and web/ (also runs on every commit)
pnpm test:live    # real x402 quotes from the merchant through the live facilitator, built into a transfer by the device code
```

Unit tests cover the logic that keeps money safe: the spend limit and recipient checks, Hedera transfer bytes built and decoded with the real SDK (including tampered transfers), parsing 0G's answer (anything malformed means safe mode), World ID approval rules, contacts, the spend log format shared with the dashboard (`fixtures/spend-log-entry.json`) and merchant pricing. Nothing in them stands in for 0G, Hedera or World; anything that needs those services runs against the real thing in `pnpm preflight` or `pnpm test:live`.

## Hedera transactions

Real testnet transaction IDs from demo runs go here (HashScan links), together with the spend log topic ID.

| What | Transaction |
|---|---|
| Spend log topic | _pending first run_ |
| Under-limit payment (chai) | _pending first run_ |
| Over-limit payment (photographer, thumb + World ID) | _pending first run_ |
