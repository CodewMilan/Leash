import {
  Contract,
  Interface,
  JsonRpcProvider,
  Transaction,
  Wallet,
  keccak256,
  parseEther,
} from "ethers";
import { randomUUID } from "node:crypto";
import { claimTypes, vaultAbi, ZeroHash, type GiftTerms } from "../../chain";
import { AppError, officialToken, required, rpcUrl, vaultAddress, integerSetting } from "../config";
import { decrypt, encrypt, randomId, sha256 } from "../security/crypto";
import { sql, withWorkerLock } from "../db";
import { issueGiftCard } from "../cards/issuance";
import { processCardEvents, reconcileCardTransactions } from "../cards/ledger";
import { lithic } from "../cards/lithic";
import { executePayout } from "../payouts/razorpay";
import type { GiftRow } from "../gifts/repository";

type Job = {
  id: string;
  gift_id: string;
  kind: "create" | "claim" | "settle" | "refund" | "close_card" | `spend:${string}`;
  payload: string;
  raw_tx: string | null;
  tx_hash: string | null;
  attempts: number;
};
const states = ["missing", "sent", "claimed", "settled", "returned"];
const iface = new Interface(vaultAbi);

async function enqueue(giftId: string, kind: string, payload: unknown = {}) {
  await sql(
    "INSERT INTO jobs(id,gift_id,kind,payload) VALUES($1,$2,$3,$4) ON CONFLICT(gift_id,kind) DO NOTHING",
    [randomUUID(), giftId, kind, encrypt(payload)],
  );
}
async function prepareCall(job: Job) {
  if (job.kind === "create") {
    const p = decrypt<{
      terms: GiftTerms;
      validAfter: number;
      validBefore: number;
      signature: string;
    }>(job.payload);
    if (p.validBefore <= Date.now() / 1000)
      throw new AppError("Gift authorization expired before submission. Create a new envelope.");
    return iface.encodeFunctionData("createGiftWithAuthorization", [
      p.terms,
      p.validAfter,
      p.validBefore,
      p.signature,
    ]);
  }
  if (job.kind === "claim") {
    const p = decrypt<{ secret: string; human: string; session: string }>(job.payload);
    const attestation = {
      giftId: job.gift_id,
      human: p.human,
      session: p.session,
      nonce: `0x${randomId()}`,
      deadline: Math.floor(Date.now() / 1000) + 300,
    };
    const attester = new Wallet(required("ATTESTER_PRIVATE_KEY"));
    const signature = await attester.signTypedData(
      { name: "ShagunVault", version: "1", chainId: 1874, verifyingContract: vaultAddress() },
      claimTypes,
      attestation,
    );
    return iface.encodeFunctionData("claim", [
      job.gift_id,
      p.secret,
      p.human,
      p.session,
      attestation.nonce,
      attestation.deadline,
      signature,
    ]);
  }
  if (job.kind.startsWith("spend:")) {
    const p = decrypt<{ amount: string; spendRef: string }>(job.payload);
    return iface.encodeFunctionData("spend", [job.gift_id, p.amount, p.spendRef]);
  }
  if (job.kind === "close_card") {
    const [card] = await sql<{
      status: string;
      card_token: string | null;
      request_started: boolean;
      reserved_cents: string;
    }>("SELECT status,card_token,request_started,reserved_cents FROM gift_cards WHERE gift_id=$1", [
      job.gift_id,
    ]);
    if (!card || card.status !== "closing" || BigInt(card.reserved_cents) !== 0n)
      throw new AppError("Card return is pending reconciliation.", 503);
    if (card.card_token ? !(await reconcileCardTransactions(job.gift_id)) : card.request_started)
      throw new AppError("Card return is pending reconciliation.", 503);
    return iface.encodeFunctionData("closeClaimed", [job.gift_id]);
  }
  if (job.kind === "settle") {
    const [gift] = await sql<{ redemption: string | null }>(
      "SELECT redemption FROM gifts WHERE id=$1",
      [job.gift_id],
    );
    if (gift?.redemption === "card")
      throw new AppError("Card gifts cannot use whole-gift cash-out.");
    return iface.encodeFunctionData("cashOut", [
      job.gift_id,
      `0x${sha256(`payout:${job.gift_id}`)}`,
    ]);
  }
  if (job.kind === "refund") return iface.encodeFunctionData("refundExpired", [job.gift_id]);
  throw new AppError("Operation is not allowlisted.");
}
async function finishJob(job: Job, txHash: string) {
  if (job.kind.startsWith("spend:")) {
    await sql(
      `WITH gift AS (
      UPDATE gifts g SET status='claimed',
      settlement_tx=$2,error=NULL FROM gift_cards c WHERE g.id=$1 AND c.gift_id=g.id RETURNING g.id)
      UPDATE jobs SET status='done',error=NULL WHERE id=$3 AND EXISTS(SELECT 1 FROM gift)`,
      [job.gift_id, txHash, job.id],
    );
    return;
  }
  if (job.kind === "close_card") {
    await sql("UPDATE gift_cards SET status='closed',updated_at=now() WHERE gift_id=$1", [
      job.gift_id,
    ]);
    await sql("UPDATE gifts SET status='returned',refund_tx=$2,error=NULL WHERE id=$1", [
      job.gift_id,
      txHash,
    ]);
    await sql("UPDATE jobs SET status='done',error=NULL WHERE id=$1", [job.id]);
    return;
  }
  const columns = {
    create: ["sent", "created_tx"],
    claim: ["claimed", "claim_tx"],
    settle: ["settled", "settlement_tx"],
    refund: ["returned", "refund_tx"],
  } as const;
  if (!(job.kind in columns)) throw new AppError("Unknown job kind.");
  const [status, column] = columns[job.kind as keyof typeof columns];
  // Only constant allowlisted identifiers enter this statement.
  await sql(
    `WITH gift AS (UPDATE gifts SET status=$2,${column}=$3,error=NULL WHERE id=$1 RETURNING id)
    UPDATE jobs SET status='done',error=NULL WHERE id=$4 AND EXISTS(SELECT 1 FROM gift)`,
    [job.gift_id, status, txHash, job.id],
  );
  if (job.kind === "claim") {
    const [gift] = await sql<{ redemption: string | null }>(
      "SELECT redemption FROM gifts WHERE id=$1",
      [job.gift_id],
    );
    if (gift?.redemption !== "card") await enqueue(job.gift_id, "settle");
  }
}
async function processJob(
  job: Job,
  provider: JsonRpcProvider,
  signer: Wallet,
  assertLock: () => Promise<void>,
) {
  await assertLock();
  let raw: string;
  if (job.raw_tx) raw = decrypt<string>(job.raw_tx);
  else {
    const data = await prepareCall(job);
    let estimated: bigint;
    try {
      estimated = await provider.estimateGas({ from: signer.address, to: vaultAddress(), data });
    } catch (error) {
      if ((error as { code?: string }).code === "CALL_EXCEPTION")
        throw new AppError(
          "The vault rejected this operation. Check gift status and account funding.",
        );
      throw error;
    }
    const gasLimit = (estimated * 12n) / 10n;
    const cap = BigInt(process.env.MAX_GAS_PER_TX || "600000");
    if (gasLimit > cap) throw new AppError("Transaction exceeds the relayer gas limit.");
    const fee = await provider.getFeeData();
    const gasPrice = fee.gasPrice;
    if (!gasPrice || gasPrice > BigInt(process.env.MAX_GAS_PRICE_WEI || "1000000000000"))
      throw new AppError("Network gas price exceeds the relayer budget.");
    const day = new Date().toISOString().slice(0, 10);
    const totalBudget = parseEther(process.env.MAX_DAILY_GAS_WBT || "0.1");
    const budget = job.kind === "refund" ? totalBudget : (totalBudget * 9n) / 10n;
    if (gasLimit * gasPrice > budget)
      throw new AppError("Transaction exceeds the relayer daily budget.", 503);
    const reserved = await sql(
      `INSERT INTO gas_spending(day,reserved) VALUES($1,$2)
      ON CONFLICT(day) DO UPDATE SET reserved=gas_spending.reserved+$2 WHERE gas_spending.reserved+$2<=$3 RETURNING day`,
      [day, String(gasLimit * gasPrice), String(budget)],
    );
    if (!reserved.length) throw new AppError("The relayer daily budget is exhausted.", 503);
    const nonce = await provider.getTransactionCount(signer.address, "pending");
    raw = await signer.signTransaction({
      chainId: 1874,
      type: 0,
      nonce,
      gasLimit,
      gasPrice,
      to: vaultAddress(),
      data,
      value: 0,
    });
    const hash = keccak256(raw);
    // Persist the signed transaction BEFORE broadcasting, making crash recovery deterministic.
    const inserted = await sql(
      "UPDATE jobs SET raw_tx=$2,tx_hash=$3,status='broadcast' WHERE id=$1 AND raw_tx IS NULL RETURNING id",
      [job.id, encrypt(raw), hash],
    );
    if (!inserted.length) {
      const [persisted] = await sql<{ raw_tx: string }>("SELECT raw_tx FROM jobs WHERE id=$1", [
        job.id,
      ]);
      if (!persisted?.raw_tx) throw new Error("TransactionJournalUnavailable");
      raw = decrypt<string>(persisted.raw_tx);
    }
  }
  const hash = keccak256(raw);
  let receipt = await provider.getTransactionReceipt(hash);
  if (!receipt) {
    await assertLock();
    try {
      await provider.broadcastTransaction(raw);
    } catch (error) {
      if (!(await provider.getTransaction(hash))) throw error;
    }
    receipt = await provider.waitForTransaction(
      hash,
      integerSetting("CHAIN_CONFIRMATIONS", 1, 64),
      30_000,
    );
  }
  if (!receipt) throw new Error("ConfirmationPending");
  const confirmations = integerSetting("CHAIN_CONFIRMATIONS", 1, 64);
  if ((await receipt.confirmations()) < confirmations) {
    receipt = await provider.waitForTransaction(hash, confirmations, 30_000);
    if (!receipt) throw new Error("ConfirmationPending");
  }
  if (receipt.status !== 1) throw new AppError("The chain rejected this operation.");
  if (receipt.to?.toLowerCase() !== vaultAddress().toLowerCase())
    throw new AppError("Receipt recipient did not match vault.");
  const tx = Transaction.from(raw);
  const operation = iface.parseTransaction({ data: tx.data });
  if (
    !operation ||
    ![
      "createGiftWithAuthorization",
      "claim",
      "cashOut",
      "refundExpired",
      "spend",
      "closeClaimed",
    ].includes(operation.name)
  )
    throw new AppError("Receipt operation is not allowlisted.");
  await finishJob(job, hash);
  if (job.kind.startsWith("spend:")) {
    const onchain = await new Contract(vaultAddress(), vaultAbi, provider).gifts(job.gift_id);
    if (states[Number(onchain.state)] === "settled")
      await sql("UPDATE gifts SET status='settled' WHERE id=$1", [job.gift_id]);
  }
}
async function failJob(job: Job, error: unknown) {
  const terminal = error instanceof AppError && error.status !== 503;
  const message = terminal
    ? error.message
    : "Confirmation or provider response is pending. The worker will reconcile it.";
  await sql(
    "UPDATE jobs SET status=$2,attempts=attempts+1,error=$3,next_attempt=now()+interval '30 seconds' WHERE id=$1",
    [job.id, terminal ? "failed" : "queued", message],
  );
  if (terminal && job.kind === "create")
    await sql("UPDATE gifts SET status='failed',error=$2 WHERE id=$1 AND status='pending'", [
      job.gift_id,
      message,
    ]);
  else if (terminal && job.kind === "claim") {
    // A reverted claim moved no tokens. Free its local reservation so a fresh verification can retry.
    await sql(
      `WITH released AS (UPDATE gifts SET claim_session=NULL,human=NULL,error=$2 WHERE id=$1 AND status='sent' RETURNING id),
      campaign AS (DELETE FROM campaign_claims WHERE gift_id IN (SELECT id FROM released)),
      payout AS (DELETE FROM payouts WHERE gift_id IN (SELECT id FROM released) AND payout_id IS NULL)
      DELETE FROM jobs WHERE id=$3 AND gift_id IN (SELECT id FROM released)`,
      [job.gift_id, message, job.id],
    );
  } else await sql("UPDATE gifts SET error=$2 WHERE id=$1", [job.gift_id, message]);
}
export async function workerTick() {
  return withWorkerLock(async (assertLock) => {
    const provider = new JsonRpcProvider(rpcUrl());
    try {
      if ((await provider.getNetwork()).chainId !== 1874n)
        throw new AppError("Worker requires Whitechain chain 1874.");
      const signer = new Wallet(required("RELAYER_PRIVATE_KEY"));
      const contract = new Contract(vaultAddress(), vaultAbi, provider);
      if (
        (await contract.usdt()).toLowerCase() !== officialToken().toLowerCase() ||
        (await contract.relayer()).toLowerCase() !== signer.address.toLowerCase() ||
        (await contract.operator()).toLowerCase() !== signer.address.toLowerCase() ||
        (await contract.attester()).toLowerCase() !==
          new Wallet(required("ATTESTER_PRIVATE_KEY")).address.toLowerCase()
      ) {
        throw new AppError("Vault token or role configuration did not match.");
      }
      // Fail before processing claims or issuing cards against a legacy whole-gift vault.
      // The current ABI must decode the tracked spent field and expose replay protection.
      await contract.usedSpendRefs(ZeroHash);
      const capability = await contract.gifts(ZeroHash);
      if (typeof capability.spent !== "bigint")
        throw new AppError("This vault does not support card settlement.", 503);
      const expired = await sql<GiftRow>(
        "SELECT * FROM gifts WHERE status='sent' AND expiry<=$1 AND claim_session IS NULL LIMIT 100",
        [Math.floor(Date.now() / 1000)],
      );
      for (const gift of expired) await enqueue(gift.id, "refund");
      // Repair a restart between confirmed claim persistence and settlement job creation.
      const claimed = await sql<{ id: string }>(
        "SELECT id FROM gifts WHERE status='claimed' AND redemption IS DISTINCT FROM 'card' LIMIT 100",
      );
      for (const gift of claimed) await enqueue(gift.id, "settle");
      await processCardEvents();
      const cardsToIssue = await sql<{
        id: string;
      }>(`SELECT g.id FROM gifts g LEFT JOIN gift_cards c ON c.gift_id=g.id
        WHERE g.status='claimed' AND g.redemption='card' AND g.claim_tx IS NOT NULL
        AND (c.gift_id IS NULL OR (c.status='preparing' AND c.next_attempt<=now())) LIMIT 10`);
      for (const gift of cardsToIssue) {
        await assertLock();
        try {
          await issueGiftCard(gift.id);
        } catch {
          await sql(
            "UPDATE gift_cards SET error='Card preparation is awaiting provider reconciliation.',next_attempt=now()+interval '30 seconds',updated_at=now() WHERE gift_id=$1",
            [gift.id],
          );
        }
      }
      const neverIssued = await sql<{ gift_id: string }>(
        `SELECT c.gift_id FROM gift_cards c JOIN gifts g ON g.id=c.gift_id
        WHERE c.status='closing' AND c.card_token IS NULL AND c.request_started=false AND g.expiry<=$1`,
        [Math.floor(Date.now() / 1000)],
      );
      for (const card of neverIssued) await enqueue(card.gift_id, "close_card");
      const expiredCards = await sql<{ gift_id: string; card_token: string }>(
        `SELECT c.gift_id,c.card_token FROM gift_cards c JOIN gifts g ON g.id=c.gift_id
        WHERE g.expiry<=$1 AND c.card_token IS NOT NULL AND c.status IN ('ready','closing') LIMIT 10`,
        [Math.floor(Date.now() / 1000)],
      );
      for (const card of expiredCards) {
        await assertLock();
        try {
          await sql(
            "UPDATE gift_cards SET status='closing',updated_at=now() WHERE gift_id=$1 AND status='ready'",
            [card.gift_id],
          );
          const providerCard = await lithic<{ state: string }>(`cards/${card.card_token}`);
          if (providerCard.state !== "CLOSED") {
            if (providerCard.state !== "PAUSED")
              await lithic(`cards/${card.card_token}`, {
                method: "PATCH",
                body: { state: "PAUSED" },
              });
            await lithic(`cards/${card.card_token}`, {
              method: "PATCH",
              body: { state: "CLOSED" },
            });
          }
          if (await reconcileCardTransactions(card.gift_id)) {
            const onchain = await contract.gifts(card.gift_id);
            const [balance] = await sql<{ cleared_cents: string }>(
              "SELECT cleared_cents FROM gift_cards WHERE gift_id=$1",
              [card.gift_id],
            );
            if (BigInt(onchain.spent) !== BigInt(balance.cleared_cents) * 10_000n) continue;
            if (states[Number(onchain.state)] === "settled")
              await sql("UPDATE gift_cards SET status='closed',updated_at=now() WHERE gift_id=$1", [
                card.gift_id,
              ]);
            else await enqueue(card.gift_id, "close_card");
          }
        } catch {
          await sql(
            "UPDATE gift_cards SET error='Unused funds are pending card and transaction reconciliation.',updated_at=now() WHERE gift_id=$1",
            [card.gift_id],
          );
        }
      }
      const jobs = await sql<Job>(
        "SELECT * FROM jobs WHERE status IN ('queued','broadcast') AND next_attempt<=now() ORDER BY created_at LIMIT 10",
      );
      for (const job of jobs) {
        await assertLock();
        try {
          // A permissionless external refund may have already completed.
          const onchain = await contract.gifts(job.gift_id);
          if (job.kind === "refund" && states[Number(onchain.state)] === "returned") {
            const events = await contract.queryFilter(
              contract.filters.Returned(job.gift_id),
              Number(process.env.VAULT_DEPLOY_BLOCK || "0"),
            );
            if (!events.length) throw new Error("ReturnReceiptPending");
            await finishJob(job, events[events.length - 1].transactionHash);
          } else await processJob(job, provider, signer, assertLock);
        } catch (error) {
          await failJob(job, error);
        }
      }
      const payouts = await sql<{
        gift_id: string;
      }>(`SELECT p.gift_id FROM payouts p JOIN gifts g ON g.id=p.gift_id
        WHERE g.status='settled' AND p.status IN ('pending','queued','processing') ORDER BY p.created_at LIMIT 10`);
      for (const payout of payouts) {
        await assertLock();
        try {
          await executePayout(payout.gift_id);
        } catch {
          await sql(
            "UPDATE payouts SET error='Test payout is pending provider reconciliation.',updated_at=now() WHERE gift_id=$1",
            [payout.gift_id],
          );
        }
      }
      await sql("DELETE FROM challenges WHERE expires_at<now()-interval '1 day'");
      await sql("DELETE FROM rate_limits WHERE resets_at<now()-interval '1 day'");
      await sql(
        "INSERT INTO service_heartbeats(name,checked_at) VALUES('worker',now()) ON CONFLICT(name) DO UPDATE SET checked_at=now()",
      );
      return { processed: jobs.length, payoutsChecked: payouts.length };
    } finally {
      provider.destroy();
    }
  });
}
