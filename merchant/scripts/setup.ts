/** One-time: associate the merchant account with testnet USDC so it can receive payments. */
import { AccountId, Client, PrivateKey, TokenAssociateTransaction, TokenId } from "@x402/hedera";
import { config } from "../src/config.js";

const raw = process.env.MERCHANT_PRIVATE_KEY?.trim().replace(/^0x/, "");
if (!raw) throw new Error("Missing MERCHANT_PRIVATE_KEY (only needed for this setup step)");
const key = /^30/.test(raw) && raw.length > 64
  ? PrivateKey.fromStringDer(raw)
  : (process.env.MERCHANT_KEY_TYPE ?? "ECDSA").toUpperCase() === "ED25519"
    ? PrivateKey.fromStringED25519(raw)
    : PrivateKey.fromStringECDSA(raw);

const mirror = config.network === "mainnet" ? "https://mainnet.mirrornode.hedera.com" : "https://testnet.mirrornode.hedera.com";
const res = await fetch(`${mirror}/api/v1/accounts/${config.accountId}/tokens?token.id=${config.usdcTokenId}`);
const { tokens } = (await res.json()) as { tokens: { token_id: string; balance: number }[] };
if (tokens.some((t) => t.token_id === config.usdcTokenId)) {
  console.log(`Merchant ${config.accountId} is already associated with USDC ${config.usdcTokenId}`);
} else {
  const client = (config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet()).setOperator(AccountId.fromString(config.accountId), key);
  const receipt = await new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(config.accountId))
    .setTokenIds([TokenId.fromString(config.usdcTokenId)])
    .execute(client)
    .then((r) => r.getReceipt(client));
  console.log(`Associated merchant ${config.accountId} with USDC: ${receipt.status}`);
  client.close();
}
