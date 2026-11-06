import { TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { config } from "../config.js";
import { encodeSpendLogEntry, type SpendLogEntry } from "../core/spendLog.js";
import { deviceKey, hederaClient } from "./client.js";

export type { SpendLogEntry } from "../core/spendLog.js";

/** Writes one entry to the HCS spending diary. The topic's submit key is the device key, so only the device can write. */
export async function appendSpendLog(entry: SpendLogEntry): Promise<{ topicId: string; sequenceNumber: string }> {
  const topicId = config.hedera.spendLogTopicId;
  if (!topicId) throw new Error("HEDERA_SPEND_LOG_TOPIC_ID is not set; run `pnpm setup:hedera` first");
  const message = encodeSpendLogEntry(entry);
  const client = hederaClient();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .freezeWith(client)
    .sign(deviceKey);
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  return { topicId, sequenceNumber: receipt.topicSequenceNumber?.toString() ?? "?" };
}
