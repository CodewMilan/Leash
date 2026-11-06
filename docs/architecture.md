# Leash architecture

0G does the thinking, the device does all the signing. The Leash device (Raspberry Pi 4) runs the agent, enforces the spending limit and holds every key that moves money or writes records. Nothing off the device can make it pay.

## Parts

```mermaid
flowchart LR
    subgraph Device["Leash device (Raspberry Pi 4)"]
        IO["Mic, camera, screen,<br/>buttons, buzzer, fingerprint"]
        Agent["Agent app<br/>limit check"]
        Keys["Keys: Hedera wallet,<br/>0G wallet"]
    end

    Phone["Phone<br/>World App"]
    ZG["0G<br/>AI + Storage"]
    World["World Agent Pass"]

    subgraph Laptop["Laptop"]
        Merchant["Merchant<br/>x402 endpoint"]
        Dash["Dashboard<br/>read-only"]
    end

    Hedera["Hedera testnet<br/>USDC + HCS log"]

    Device <-->|"decide, save memory"| ZG
    Device <-->|"check proof"| World
    Phone -->|"human approves"| World
    Device <-->|"signed payment"| Merchant
    Merchant -->|"settle via facilitator"| Hedera
    Device -->|"signed spend log"| Hedera
    Dash -.->|"reads"| Hedera
    Dash -.->|"reads"| ZG
```

## One payment, step by step

```mermaid
sequenceDiagram
    actor You
    participant Pi as Leash device
    participant ZG as 0G
    participant W as World
    participant M as Merchant
    participant H as Hedera

    You->>Pi: Press button and speak
    Pi->>Pi: Speech to text, read QR
    Pi->>ZG: Decide
    alt 0G unreachable
        Pi->>Pi: Safe mode, red light, no payment
    else 0G answers
        ZG-->>Pi: amount, recipient, request ID
        Pi->>ZG: Save memory (device signs)
        Pi->>M: Request resource
        M-->>Pi: 402, pay X USDC to merchant
        Pi->>Pi: Build the payment, check it matches 0G's decision
        alt Over the limit
            Pi->>You: Buzz, screen shows amount + recipient from the payment itself
            You->>Pi: Thumb on sensor
            Pi->>W: Start Agent Pass check
            You->>W: Approve in World App
            W-->>Pi: Proof, checked by the device
        end
        Pi->>M: Retry with payment (device signs)
        M->>H: Facilitator settles USDC transfer
        M-->>Pi: 200 + transaction ID
        Pi->>H: Spend log entry (device signs)
        Pi->>You: "Paid", speaker says "Done"
    end
```

If the thumb or World check fails, times out or is cancelled, the device never signs, so nothing moves.

## Who signs what

| Key | Lives on | Signs |
|---|---|---|
| Hedera wallet key | Device | Every payment and every spend log entry |
| 0G wallet key | Device | Memory uploads to 0G Storage |
| 0G API key | Device | Nothing, it only authenticates AI calls |
| World client secret | Device | Nothing, it authenticates proof checks with World |
| Fingerprint | Sensor | Nothing, it sends yes/no to the device |
| World proof | Phone | Proof that a human approved |
| Merchant key | Laptop | Setup only (USDC token association) |

## Why this is safe, and where it isn't

- 0G is the agent's brain but signs nothing. A tricked decision still has to pass the device's limit check, and big amounts need your thumb and World ID.
- The screen shows the amount and recipient taken from the payment the device is about to sign, so what you see is what gets paid.
- A hacked phone, laptop or merchant can't make the device sign.
- Weak point: keys are files on the Pi. Someone with root access or the SD card can take them. Production would keep them in a secure element together with the fingerprint check.
