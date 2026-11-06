/**
 * One-time setup, signed by the device key:
 *  1. associate the device account with testnet USDC (skipped if already associated)
 *  2. create the spend log HCS topic with the device key as submit key (skipped if HEDERA_SPEND_LOG_TOPIC_ID is set)
 */
import { AccountBalanceQuery, TokenAssociateTransaction, TopicCreateTransaction } from "@hashgraph/sdk";
import { config } from "../src/config.js";
import { deviceAccountId, deviceKey, hashscanTopic, hederaClient } from "../src/hedera/client.js";
import { usdcBalance } from "../src/hedera/mirror.js";

const client = hederaClient();

const balance = await new AccountBalanceQuery().setAccountId(deviceAccountId).execute(client);
console.log(`Device account ${deviceAccountId}: ${balance.hbars.toString()}`);

const usdc = await usdcBalance(deviceAccountId.toString());
if (usdc !== null) {
  console.log(`USDC ${config.hedera.usdcTokenId} already associated, balance ${usdc} USDC`);
} else {
  const tx = await new TokenAssociateTransaction()
    .setAccountId(deviceAccountId)
    .setTokenIds([config.hedera.usdcTokenId])
    .freezeWith(client)
    .sign(deviceKey);
  const receipt = await (await tx.execute(client)).getReceipt(client);
  console.log(`Associated USDC ${config.hedera.usdcTokenId}: ${receipt.status}`);
  console.log("Now fund it from the Circle faucet: https://faucet.circle.com (Hedera testnet)");
}

if (config.hedera.spendLogTopicId) {
  console.log(`Spend log topic already set: ${config.hedera.spendLogTopicId} (${hashscanTopic(config.hedera.spendLogTopicId)})`);
} else {
  const tx = await new TopicCreateTransaction()
    .setTopicMemo("Leash spend log: device-signed payment receipts")
    .setSubmitKey(deviceKey.publicKey)
    .setAdminKey(deviceKey.publicKey)
    .freezeWith(client)
    .sign(deviceKey);
  const receipt = await (await tx.execute(client)).getReceipt(client);
  const topicId = receipt.topicId!.toString();
  console.log(`Created spend log topic ${topicId} (${hashscanTopic(topicId)})`);
  console.log(`Add this to the device .env:  HEDERA_SPEND_LOG_TOPIC_ID=${topicId}`);
}

client.close();
