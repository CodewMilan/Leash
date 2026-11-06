import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { JsonRpcProvider, Wallet } from "ethers";
import { config } from "../config.js";

export const zgChainscanTx = (txHash: string) => `https://chainscan-galileo.0g.ai/tx/${txHash}`;
export const zgStoragescan = (txSeq: number) => `https://storagescan-galileo.0g.ai/submission/${txSeq}`;

const signer = new Wallet(config.zg.privateKey, new JsonRpcProvider(config.zg.rpcUrl));
const indexer = new Indexer(config.zg.indexerUrl);

export async function zgWalletAddress() {
  return signer.address;
}

/** Signs and uploads one episode record to 0G Storage with the device's 0G wallet. */
export async function saveMemory(record: Record<string, unknown>): Promise<{ rootHash: string; txHash: string; txSeq: number }> {
  const file = new MemData(new TextEncoder().encode(JSON.stringify(record)));
  const [, treeErr] = await file.merkleTree();
  if (treeErr) throw new Error(`0G Storage merkle tree failed: ${treeErr.message}`);

  // The SDK's typings point at ethers' CJS build; the ESM Wallet is the same object at runtime.
  const [result, err] = await indexer.upload(file, config.zg.rpcUrl, signer as unknown as Parameters<Indexer["upload"]>[2]);
  if (err) throw new Error(`0G Storage upload failed: ${err.message}`);
  if (!("rootHash" in result)) throw new Error("0G Storage returned a multi-file result for a single record");
  return { rootHash: result.rootHash, txHash: result.txHash, txSeq: result.txSeq };
}

export async function loadMemory(rootHash: string): Promise<unknown> {
  const [blob, err] = await indexer.downloadToBlob(rootHash, { proof: true });
  if (err) throw new Error(`0G Storage download failed: ${err.message}`);
  return JSON.parse(await blob.text());
}
