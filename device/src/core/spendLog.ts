import { z } from "zod";

/** HCS splits messages over 1024 bytes into chunks, which mirror node readers see as separate messages. */
export const HCS_SINGLE_CHUNK_BYTES = 1024;

const hederaId = z.string().regex(/^\d+\.\d+\.\d+$/);

export const SpendLogEntrySchema = z.object({
  v: z.literal(1),
  kind: z.literal("payment"),
  hederaTxId: z.string().min(1),
  amountUsdc: z.string().regex(/^\d+(\.\d{1,6})?$/),
  tokenId: hederaId,
  payTo: hederaId,
  merchant: z.string().min(1),
  resource: z.string().url(),
  overLimit: z.boolean(),
  approvals: z.object({ fingerprint: z.boolean(), world: z.boolean(), worldReference: z.string().optional() }),
  zgRequestId: z.string().min(1),
  memoryRootHash: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/),
  memoryTxHash: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/),
  at: z.string().datetime(),
});

export type SpendLogEntry = z.infer<typeof SpendLogEntrySchema>;

/** Validates and serialises one spend log entry so it fits a single HCS message. */
export function encodeSpendLogEntry(entry: SpendLogEntry): string {
  const valid = SpendLogEntrySchema.parse(entry);
  if (valid.overLimit && !(valid.approvals.fingerprint && valid.approvals.world)) {
    throw new Error("Over-limit payment logged without both fingerprint and World ID approval");
  }
  const text = JSON.stringify(valid);
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > HCS_SINGLE_CHUNK_BYTES) {
    throw new Error(`Spend log entry is ${bytes} bytes; HCS single messages are limited to ${HCS_SINGLE_CHUNK_BYTES}`);
  }
  return text;
}
