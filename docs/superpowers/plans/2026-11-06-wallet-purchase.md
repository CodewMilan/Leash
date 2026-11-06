# Testnet wallet purchase → Lithic sandbox card

Approved scope: browser wallet connection and ownership signature, Base Sepolia test-USDC payment, server verification, then recipient-only Lithic sandbox card issuance. This is not conversion of crypto into a funded live card.

- Fixed 100 test-USDC purchase; default recipient is buyer, optional separate EVM recipient. No real-money network option.
- Server issues a single-use, origin-bound, five-minute wallet challenge and an eight-hour signed HttpOnly session after EIP-191 signature verification. Session wallet owns all order access.
- Persist orders, per-order issuance directories, payment transaction claims, and authentication challenges on local disk. A transaction cannot pay for two gifts. Preserve the original operator demo separately at `/sandbox`.
- Verify chain 84532, official Circle test-USDC contract, direct transfer calldata and matching Transfer log, payer, treasury, exact amount, receipt success, canonical block and three confirmations. Payments must occur after order creation. Recheck payment before first issuance.
- Client never supplies amount, card limit, provider identifiers or verified-payment flags. Only the intended recipient can issue/recover a card after payment.
- Use existing Lithic adapter with one durable reservation per order. No card reset/reissue on uncertain failure.
- Build sender checkout and received/sent gift lists with pending-transaction recovery, explorer links, and clear testnet/sandbox labels. User approves all wallet signatures and sends transactions in their own wallet.
- TDD: challenge replay/expiry/tampering, payment evidence rejection, duplicate payment claim, recipient authorization and payment gate; final lint/types/tests/build, real testnet RPC smoke check and browser checks. Actual wallet payment needs a user-controlled wallet with test-USDC and test ETH; never claim that payment happened if it has not.

Runtime remains a local persistent single Node instance. A local testnet-only treasury wallet may be generated into ignored environment configuration; no private wallet keys are requested from users or exposed to the browser.
