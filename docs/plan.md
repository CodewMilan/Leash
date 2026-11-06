# Build plan to the deadline

Hacking ends **Sat Nov 7, 09:00 IST**. Every phase ends with `pnpm check` green (type check + unit tests in `device/`, `merchant/` and `web/`). Live tests run only against real 0G, Hedera and World; with missing keys they fail and name the missing variable.

Already done: landing page and dashboard (`web/`), first draft of the device agent (`device/`) and the x402 merchant (`merchant/`).

## Phase 0: make it testable, no keys needed (Fri 12:00–15:00) — done

- Split pure logic out of modules that read secrets on load, so it can be unit tested: spend policy, x402 transfer build and decode, 0G answer parsing, World ID claim checks, contacts, spend log entry, merchant pricing.
- Unit tests with Vitest for each of those. Payment tests build and decode real Hedera transaction bytes with the Hedera SDK; nothing is faked.
- Config reports every missing variable at once, so a half-filled `.env` fails in one go.
- `pnpm preflight` on the device and merchant: calls each real service with your keys (0G, Hedera balances and USDC association, 0G Storage wallet, World client, facilitator) and prints what is wrong.
- Root `pnpm check` runs everything; run it before every commit.

## Phase 1: first real payment from the laptop (as soon as keys land, ~1.5 h)

1. Fill `.env`, copy `device/contacts.example.json` to `device/contacts.json` (laptop IP, merchant account), run `pnpm preflight` in both folders until it's green.
2. `merchant/`: `pnpm setup`, then `pnpm start`.
3. `device/`: `pnpm setup:hedera` (USDC association, spend log topic), get USDC from faucet.circle.com.
4. `LEASH_HARDWARE=none pnpm start`, then `pnpm ask "buy two chais"`: 0G decides, memory goes to 0G Storage, x402 payment settles, spend log entry is written.
5. Safe mode check: point `ZG_BASE_URL` at a dead host and confirm nothing is paid.
6. Put the real transaction IDs in the README and the topic and account IDs in `web/.env.local`; check `/dashboard`.

## Phase 2: Pi bring-up (~3–4 h, can run in parallel with Phase 1)

Flash Bookworm, install Node, whisper.cpp, zbar, espeak. Wire buttons, LED, buzzer, screen and the R503 sensor (default pins in the README). Run `pnpm enroll:finger`. Test the talk button, transcription and QR reading, then repeat the Phase 1 chai payment from the Pi.

## Phase 3: over-limit payment with thumb and World ID (~2 h)

`pnpm enroll:world`, then "pay the photographer 20 dollars": buzz, screen shows the decoded amount, thumb, World App approval, payment. Also record the paths where nothing is paid: World denied, expired, cancelled, wrong thumb, and wrong World ID.

## Phase 4: prize requirements (~2 h)

- Hedera: README with setup, architecture, payment flow and HashScan links (spend log topic, chai payment, photographer payment).
- 0G: request ID and 0G Storage root for each decision in the README, plus contract addresses, and the safe mode demo.
- World: integration debrief (time to first success, friction, missing docs, top improvement) in `docs/world-debrief.md`.

## Phase 5: demo and submission (Sat 02:00–08:00)

Rehearse the demo, record the videos (0G under 3 min, Hedera up to 5 min with HashScan), submit by **08:00**, leaving one hour of buffer.

## Cut unless we're ahead

ERC-8004 identity, ERC-7730 clear signing, the "pays for itself" 0G stretch, the ATECC608A chip.
