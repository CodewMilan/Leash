# Sandbox ecommerce store

Build `/shop` as a separate catalog/cart/checkout/receipt surface in the existing Next app and brand. Use server-priced merchandise and real Lithic sandbox authorization plus clearing calls. This is Lithic's issuer-side merchant-acquirer simulator, not interoperability with Stripe/Razorpay test gateways and not real merchant bank settlement. No goods are shipped.

- Authenticate card sources using the existing wallet-recipient session or explicit operator sandbox session. Server resolves the card token; clients cannot charge arbitrary card tokens or choose their own prices.
- Persist shop orders before authorization. Fetch only sandbox PAN server-side as required by Lithic's simulator; never log, store, or return PAN/CVV. Full card details remain absent from the UI.
- Verify actual provider transaction status/result, matching card, descriptor, currency and amount. HTTP success from authorization alone is not payment success. Clear only approved pending transactions, then mark paid only after matching SETTLED evidence.
- Persist authorization/clearing intent before external calls. On ambiguous authorization recover by unique merchant descriptor; do not resend. Clearing can create multiple completion events, so never retry an uncertain clearing. Reconcile using transaction reads.
- Test catalog tampering, ownership, decline handling, successful settlement, repeated requests, uncertain authorization and uncertain clearing. Then lint/types/build, browser desktop/mobile checks, and an actual low-value sandbox checkout against existing operator card6637 with a provider dashboard receipt.
- Keep local single-Node persistent disk boundary. Link back to wallet gifts and standalone operator card. Document no live spending and no cross-provider sandbox transfer.
