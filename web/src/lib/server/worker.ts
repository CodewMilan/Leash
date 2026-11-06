import { Contract, Interface, JsonRpcProvider, Transaction, Wallet, keccak256, parseEther } from "ethers";
import { randomUUID } from "node:crypto";
import { claimTypes, vaultAbi, type GiftTerms } from "../chain";
import { AppError, officialToken, required, rpcUrl, vaultAddress } from "./config";
import { decrypt, encrypt, randomId, sha256 } from "./crypto";
import { sql, withWorkerLock } from "./db";
import { executePayout } from "./payouts";
import type { GiftRow } from "./gifts";

type Job = { id: string; gift_id: string; kind: "create" | "claim" | "settle" | "refund"; payload: string; raw_tx: string | null; tx_hash: string | null; attempts: number };
const states = ["missing", "sent", "claimed", "settled", "returned"];
const iface = new Interface(vaultAbi);

async function enqueue(giftId: string, kind: string, payload: unknown = {}) {
  await sql("INSERT INTO jobs(id,gift_id,kind,payload) VALUES($1,$2,$3,$4) ON CONFLICT(gift_id,kind) DO NOTHING", [randomUUID(), giftId, kind, encrypt(payload)]);
}
async function prepareCall(job: Job, signer: Wallet) {
  if (job.kind === "create") {
    const p = decrypt<{ terms: GiftTerms; validAfter: number; validBefore: number; signature: string }>(job.payload);
    if (p.validBefore <= Date.now() / 1000) throw new AppError("Gift authorization expired before submission. Create a new envelope.");
    return iface.encodeFunctionData("createGiftWithAuthorization", [p.terms, p.validAfter, p.validBefore, p.signature]);
  }
  if (job.kind === "claim") {
    const p = decrypt<{ secret: string; human: string; session: string }>(job.payload);
    const attestation = { giftId: job.gift_id, human: p.human, session: p.session, nonce: `0x${randomId()}`, deadline: Math.floor(Date.now() / 1000) + 300 };
    const attester = new Wallet(required("ATTESTER_PRIVATE_KEY"));
    const signature = await attester.signTypedData({ name: "ShagunVault", version: "1", chainId: 1874, verifyingContract: vaultAddress() }, claimTypes, attestation);
    return iface.encodeFunctionData("claim", [job.gift_id, p.secret, p.human, p.session, attestation.nonce, attestation.deadline, signature]);
  }
  if (job.kind === "settle") return iface.encodeFunctionData("cashOut", [job.gift_id, `0x${sha256(`payout:${job.gift_id}`)}`]);
  if (job.kind === "refund") return iface.encodeFunctionData("refundExpired", [job.gift_id]);
  void signer;
  throw new AppError("Operation is not allowlisted.");
}
async function finishJob(job: Job, txHash: string) {
  const columns = { create: ["sent", "created_tx"], claim: ["claimed", "claim_tx"], settle: ["settled", "settlement_tx"], refund: ["returned", "refund_tx"] } as const;
  const [status, column] = columns[job.kind];
  // Only constant allowlisted identifiers enter this statement.
  await sql(`WITH gift AS (UPDATE gifts SET status=$2,${column}=$3,error=NULL WHERE id=$1 RETURNING id)
    UPDATE jobs SET status='done',error=NULL WHERE id=$4 AND EXISTS(SELECT 1 FROM gift)`, [job.gift_id, status, txHash, job.id]);
  if (job.kind === "claim") await enqueue(job.gift_id, "settle");
}
async function processJob(job: Job, provider: JsonRpcProvider, signer: Wallet) {
  let raw: string;
  if (job.raw_tx) raw = decrypt<string>(job.raw_tx);
  else {
    const data = await prepareCall(job, signer);
    const estimated = await provider.estimateGas({ from: signer.address, to: vaultAddress(), data });
    const gasLimit = estimated * 12n / 10n;
    const cap = BigInt(process.env.MAX_GAS_PER_TX || "600000");
    if (gasLimit > cap) throw new AppError("Transaction exceeds the relayer gas limit.");
    const fee = await provider.getFeeData();
    const gasPrice = fee.gasPrice;
    if (!gasPrice || gasPrice > BigInt(process.env.MAX_GAS_PRICE_WEI || "1000000000000")) throw new AppError("Network gas price exceeds the relayer budget.");
    const day = new Date().toISOString().slice(0, 10);
    const budget = parseEther(process.env.MAX_DAILY_GAS_WBT || "0.1");
    const reserved = await sql(`INSERT INTO gas_spending(day,reserved) VALUES($1,$2)
      ON CONFLICT(day) DO UPDATE SET reserved=gas_spending.reserved+$2 WHERE gas_spending.reserved+$2<=$3 RETURNING day`, [day, String(gasLimit * gasPrice), String(budget)]);
    if (gasLimit * gasPrice > budget || !reserved.length) throw new AppError("The relayer daily budget is exhausted.");
    const nonce = await provider.getTransactionCount(signer.address, "pending");
    raw = await signer.signTransaction({ chainId: 1874, type: 0, nonce, gasLimit, gasPrice, to: vaultAddress(), data, value: 0 });
    const hash = keccak256(raw);
    // Persist the signed transaction BEFORE broadcasting, making crash recovery deterministic.
    await sql("UPDATE jobs SET raw_tx=$2,tx_hash=$3,status='broadcast' WHERE id=$1", [job.id, encrypt(raw), hash]);
  }
  const hash = keccak256(raw);
  let receipt = await provider.getTransactionReceipt(hash);
  if (!receipt) {
    try { await provider.broadcastTransaction(raw); }
    catch (error) {
      if (!(await provider.getTransaction(hash))) throw error;
    }
    receipt = await provider.waitForTransaction(hash, Number(process.env.CHAIN_CONFIRMATIONS || "1"), 30_000);
  }
  if (!receipt) throw new Error("ConfirmationPending");
  if (receipt.status !== 1) throw new AppError("The chain rejected this operation.");
  if (receipt.to?.toLowerCase() !== vaultAddress().toLowerCase()) throw new AppError("Receipt recipient did not match vault.");
  const tx = Transaction.from(raw);
  const operation = iface.parseTransaction({ data: tx.data });
  if (!operation || !["createGiftWithAuthorization", "claim", "cashOut", "refundExpired"].includes(operation.name)) throw new AppError("Receipt operation is not allowlisted.");
  await finishJob(job, hash);
}
async function failJob(job: Job, error: unknown) {
  const terminal = error instanceof AppError && error.status !== 503;
  const message = terminal ? error.message : "Confirmation or provider response is pending. The worker will reconcile it.";
  await sql("UPDATE jobs SET status=$2,attempts=attempts+1,error=$3,next_attempt=now()+interval '30 seconds' WHERE id=$1", [job.id, terminal ? "failed" : "queued", message]);
  if (terminal && job.kind === "create") await sql("UPDATE gifts SET status='failed',error=$2 WHERE id=$1 AND status='pending'", [job.gift_id, message]);
  else if (terminal && job.kind === "claim") {
    // A reverted claim moved no tokens. Free its local reservation so a fresh verification can retry.
    await sql(`WITH released AS (UPDATE gifts SET claim_session=NULL,human=NULL,error=$2 WHERE id=$1 AND status='sent' RETURNING id),
      campaign AS (DELETE FROM campaign_claims WHERE gift_id IN (SELECT id FROM released)),
      payout AS (DELETE FROM payouts WHERE gift_id IN (SELECT id FROM released) AND payout_id IS NULL)
      DELETE FROM jobs WHERE id=$3 AND gift_id IN (SELECT id FROM released)`, [job.gift_id, message, job.id]);
  } else await sql("UPDATE gifts SET error=$2 WHERE id=$1", [job.gift_id, message]);
}
export async function workerTick() {
  return withWorkerLock(async () => {
    const provider = new JsonRpcProvider(rpcUrl());
    try {
      if ((await provider.getNetwork()).chainId !== 1874n) throw new AppError("Worker requires Whitechain chain 1874.");
      const signer = new Wallet(required("RELAYER_PRIVATE_KEY"));
      const contract = new Contract(vaultAddress(), vaultAbi, provider);
      if ((await contract.usdt()).toLowerCase() !== officialToken().toLowerCase() ||
        (await contract.relayer()).toLowerCase() !== signer.address.toLowerCase() ||
        (await contract.operator()).toLowerCase() !== signer.address.toLowerCase() ||
        (await contract.attester()).toLowerCase() !== new Wallet(required("ATTESTER_PRIVATE_KEY")).address.toLowerCase()) {
        throw new AppError("Vault token or role configuration did not match.");
      }
      const expired = await sql<GiftRow>("SELECT * FROM gifts WHERE status='sent' AND expiry<=$1 AND claim_session IS NULL LIMIT 100", [Math.floor(Date.now() / 1000)]);
      for (const gift of expired) await enqueue(gift.id, "refund");
      // Repair a restart between confirmed claim persistence and settlement job creation.
      const claimed = await sql<{ id: string }>("SELECT id FROM gifts WHERE status='claimed' LIMIT 100");
      for (const gift of claimed) await enqueue(gift.id, "settle");
      const jobs = await sql<Job>("SELECT * FROM jobs WHERE status IN ('queued','broadcast') AND next_attempt<=now() ORDER BY created_at LIMIT 10");
      for (const job of jobs) {
        try {
          // A permissionless external refund may have already completed.
          const onchain = await contract.gifts(job.gift_id);
          if (job.kind === "refund" && states[Number(onchain.state)] === "returned") {
            const events = await contract.queryFilter(contract.filters.Returned(job.gift_id), Number(process.env.VAULT_DEPLOY_BLOCK || "0"));
            if (!events.length) throw new Error("ReturnReceiptPending");
            await finishJob(job, events[events.length - 1].transactionHash);
          } else await processJob(job, provider, signer);
        } catch (error) { await failJob(job, error); }
      }
      const payouts = await sql<{ gift_id: string }>(`SELECT p.gift_id FROM payouts p JOIN gifts g ON g.id=p.gift_id
        WHERE g.status='settled' AND p.status IN ('pending','queued','processing') ORDER BY p.created_at LIMIT 10`);
      for (const payout of payouts) {
        try { await executePayout(payout.gift_id); }
        catch { await sql("UPDATE payouts SET error='Test payout is pending provider reconciliation.',updated_at=now() WHERE gift_id=$1", [payout.gift_id]); }
      }
      await sql("DELETE FROM challenges WHERE expires_at<now()-interval '1 day'");
      await sql("DELETE FROM rate_limits WHERE resets_at<now()-interval '1 day'");
      return { processed: jobs.length, payoutsChecked: payouts.length };
    } finally { provider.destroy(); }
  });
}
