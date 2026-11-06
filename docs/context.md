# Leash: project context

Everything decided so far, so any teammate or AI agent opening this repo starts with the full picture. Hackathon: ETHGlobal Mumbai (Jio World Convention Centre). Hacking ends **Sat Nov 7, 09:00 IST**, hard deadline. Judging 09:30–12:30 IST.

## Ground rules

- **No mocks anywhere.** Every integration (0G, Hedera, World) is real. If a credential is missing, that step fails loudly; it never fakes a result.
- **Safe mode is not a fallback decision.** If 0G is unreachable, Leash refuses to pay. It never decides locally on anything that moves money (0G's rules disqualify faked fallbacks).
- Secrets live in environment variables (see `.env.example`), never in code or chat.

## Problem

AI agents are starting to spend real money, and they can be tricked into it (prompt injection in webpages, emails, messages). Today's approval check lives in the same app or phone the agent uses, so a fooled or hacked agent can fake or click it. People either can't trust agents with money, or trust them blindly.

**Why now:** on Oct 29, 2026 Binance lost about $6.3B from hot wallets after attackers got inside its software and got it to sign withdrawals outside the normal approval flow (they used EIP-7702 delegation). Every check was software. Agent payments are also the biggest theme at this event (Hedera x402, World Agent Pass).

## Product

Leash is a handheld AI assistant that pays for things for you but can never spend over your limit without your thumb.

1. You press a button and speak ("pay the photographer 20 dollars"); optionally point the camera at a bill or QR code.
2. The device turns speech into text locally (Whisper) and reads QR codes.
3. The 0G AI makes the decision and returns a receipt (request ID).
4. The decision is saved to 0G Storage as memory.
5. Under the spending limit: pays automatically. Over it: device buzzes, its own screen shows the real amount and recipient, you press your thumb on the fingerprint sensor (security chip signs), then a fresh World ID Agent Pass check on your phone. Both must be valid.
6. Payment goes over x402 in USDC on Hedera; receipt on HashScan plus an entry in an HCS topic (spending log).
7. If 0G is unreachable: red light, "brain offline", it can still talk but will not pay.

**One-liner:** "AI agents can now spend your money, and they can be tricked into it. Leash keeps the AI in charge of thinking and your thumb in charge of paying."

**Why hardware:** approval lives on a separate device with its own screen, its own locked key and a human's thumb, so even a hacked agent or phone can't approve. Same reason hardware wallets exist.

**Why not a Ledger:** Ledger makes you approve every transaction (useless for an agent spending all day) and only shows what the transaction says. Leash auto-pays small amounts under a limit, only asks for big ones, and checks the payment against what you said and what its camera saw. Ledger protects keys; Leash protects the agent's decisions.

## Workflow diagram

See [workflow.md](./workflow.md).

## Prize targets (3 partner picks)

| Partner | Track | Amounts | Must show |
|---|---|---|---|
| 0G | Physical AI: Agents with a Body (personal-device lane) | $2,500 / $1,500 / $1,000 best real hardware | 0G call inside the decision loop; episode log on 0G Storage with a request ID per decision; live hardware demo at the 0G booth; safe-stop if 0G is unreachable (a faked fallback disqualifies); contract addresses; video under 3 min. Not wanted: a chatbot with a robot avatar. |
| Hedera | AI Agents That Pay: x402 on Hedera | $3,000 / $2,000 / $1,500 | x402-protected endpoint settling on Hedera testnet via a listed facilitator (Official x402, Ax402, Blocky402) or our own; an agent completes a paid request end to end with no human approving; README with setup, architecture, payment flow and at least one Hedera transaction ID; video ≤5 min linking HashScan. Extra points: budgets / per-merchant limits / human approval above a threshold, ERC-8004 or HCS-14 identity, HCS topic as spend audit log, settling in HTS USDC, Hedera Agent Kit. |
| World | World ID Agent Pass | $2,500 / $1,500 / $1,000 | Official Agent Pass; full journey (request, user completes, backend-validated result, protected action); a denied / expired / cancelled path where nothing happens; validate on the backend, never trust the client; integration debrief (time to first success, friction, missing docs, top improvement). Note: proofs currently use fake identities. |
| ETHGlobal | Finalist | $1,000 + $500 travel per person (3–5 people) | 4-min demo + 3-min Q&A; criteria include WOW |

Stretch (same 0G pick): Agents That Pay for Themselves ($1,000 × 2) if merchant fees fund the agent's 0G compute with no human top-up.

Rough judgment call: ceiling about $14–16k including finalist, expected about $3.5–4k.

## Ethereum standards to use

- **ERC-7730 + EIP-712 (clear signing):** the device decodes and shows the payment in plain words on its own screen. Do this.
- **ERC-8004 (Trustless Agents):** on-chain identity for Leash; validation records point to 0G receipts. Hedera extra points. Do this.
- **EIP-7951 (P-256 verify precompile):** the security chip signs with P-256; verify on-chain. Unverified whether Hedera EVM supports it; check early, else verify in Solidity or server-side.
- **Avoid EIP-7702** for the spending limit: it was the Binance attack path.

## Hardware (bill of materials, rough INR)

| Part | Purpose | ₹ |
|---|---|---|
| Raspberry Pi 4 Model B (4 GB, or 8 GB) + official 15 W USB-C PSU (5 V 3 A) + heatsink/fan case | Device computer (Whisper tiny/base via whisper.cpp, QR, network) | 6,000–9,500 |
| 2 × microSD 32–64 GB A2 | OS + backup | 1,200 |
| Pi Camera Module 3 (its included standard 15-pin cable fits the Pi 4) | Reads bills / QR codes | 2,500–3,200 |
| USB mini microphone | Voice input (simplest; I2S mics also work on Pi 4) | 300–600 |
| MAX98357A + 3 W speaker, or USB speaker | Spoken confirmations | 300–500 |
| 3.5" HDMI/SPI display (+ micro-HDMI cable) | Shows real amount and recipient | 1,500–2,500 |
| R503 (preferred), R307 or AS608 fingerprint sensor + CP2102/CH340 USB-serial | Thumb approval (check AS608 voltage: often 3.3 V only) | 850–1,450 |
| ATECC608A breakout (alt: Infineon OPTIGA, SparkFun crypto co-processor) | Locked device key | 300–800 |
| 3 buttons, RGB LED / WS2812 ring, coin vibration motor + 2N2222 + diode | Talk / approve / cancel, status, buzz | 200–350 |
| 15 W+ USB-C power bank (10,000 mAh) or Pi UPS HAT | Runs in hand | 1,200–2,000 |
| Jumpers, headers, perfboard, case, standoffs | Assembly | 650–1,300 |

Total about ₹16–21k. Also needed: a phone with a verified World App, a laptop for the backend, a phone hotspot. Optional: PN532 NFC, pan-tilt bracket + 2 × MG90S.

## Local vs 0G

| Runs locally on the Pi | Runs on 0G |
|---|---|
| Push-to-talk, Whisper speech-to-text, QR reading, short spoken replies, answering in safe mode | Every decision that moves money, vision on the bill/photo, memory (0G Storage) |

## Credentials needed (environment variables)

See `.env.example`. Priority order: Hedera testnet accounts + testnet USDC (token `0.0.429274`), 0G Private Computer API key + 0G wallet with Galileo testnet tokens, World Agent Pass client ID/secret, a verified World App on a phone.

## Open decisions

1. Team split (hardware / payments / AI / frontend).
2. Board: **Raspberry Pi 4 (decided)**.
3. Stack: default TypeScript/Node for the server and dashboard, Python on the Pi.
4. Demo merchants: default a "chai stall" and a "photo print" x402 endpoint.
5. Demo spending limit: default 5 USDC.

## Useful links

- Prizes: https://ethglobal.com/events/mumbai/prizes
- 0G Private Computer models: https://pc.0g.ai/models
- Hedera x402: https://docs.hedera.com/solutions/ai/x402 (pay: /pay-with-x402, merchant: /merchant-integration, facilitators: /facilitators, scheme: /exact-scheme)
- World Agent Pass: https://auth.world.org/docs (portal: https://auth.world.org/portal)
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004 · EIP-7951: https://eips.ethereum.org/EIPS/eip-7951