# Project context

The previous product (handheld Leash device, merchant server, 0G, Hedera payments, World ID) was removed. This repo is the website in `web/` only.

The current product direction is gift redemption into virtual cards. Do not rebuild the old device, merchant, or payment flow unless asked.

## Gift recipient demo

The root route redirects to `/gifts`, a browser-local recipient demo with received gift, onboarding, virtual-card generation, timeout recovery, and simulated purchase. Bridge/Stripe, real identity verification, authentication, and funding are not connected. See the root README for limitations and the integration boundary.
