import { TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { config } from "../config.js";
import { deviceKey, hederaClient } from "./client.js";

export interface SpendLogEntry {
  v: 1;
  kind: "payment";
  hederaTxId: string;
  amountUsdc: string;
  tokenId: string;
  payTo: string;
  merchant: string;
  resource: string;
  overLimit: boolean;
  approvals: { fingerprint: boolean; world: boolean; worldReference?: string };
  zgRequestId: string;
  memoryRootHash: string;
  memoryTxHash: string;
  at: string;
}

/** Writes one entry to the HCS spending diary. The topic's submit key is the device key, so only the device can write. */
export async function appendSpendLog(entry: SpendLogEntry): Promise<{ topicId: string; sequenceNumber: string }> {
  const topicId = config.hedera.spendLogTopicId;
  if (!topicId) throw new Error("HEDERA_SPEND_LOG_TOPIC_ID is not set; run `pnpm setup:hedera` first");
  const client = hederaClient();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(entry))
    .freezeWith(client)
    .sign(deviceKey);
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  return { topicId, sequenceNumber: receipt.topicSequenceNumber?.toString() ?? "?" };
}
