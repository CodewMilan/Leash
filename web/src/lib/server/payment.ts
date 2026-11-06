import { Interface } from "ethers";
import { CHAIN_ID, CONFIRMATIONS, ERC20_ABI, PRICE_UNITS, USDC_ADDRESS } from "../purchase/model";
const iface = new Interface(ERC20_ABI);
type RpcTransaction = { hash: string; from: string; to: string | null; input: string };
type RpcReceipt = { transactionHash: string; status: string; blockNumber: string; blockHash: string; logs: { address: string; topics: string[]; data: string }[] };
export type PaymentEvidence = { chainId: number; latestBlock: number; transaction: RpcTransaction | null; receipt: RpcReceipt | null; canonicalHash: string | null };
export function verifyEvidence(order: { buyer: string; treasury: string; minimumBlock: number }, hash: string, evidence: PaymentEvidence) {
  if (order.buyer.toLowerCase() === order.treasury.toLowerCase()) throw new Error("A treasury self-transfer cannot pay for a gift.");
  if (evidence.chainId !== CHAIN_ID) throw new Error("The payment RPC must be Base Sepolia. Mainnet payments are not accepted.");
  const { transaction: tx, receipt } = evidence;
  if (!tx) return false;
  if (tx.hash.toLowerCase() !== hash.toLowerCase() || tx.from.toLowerCase() !== order.buyer.toLowerCase()
    || tx.to?.toLowerCase() !== USDC_ADDRESS.toLowerCase()) throw new Error("Payment must be a direct test-USDC transfer from this order’s buyer.");
  let decoded;
  try { decoded = iface.decodeFunctionData("transfer", tx.input); }
  catch { throw new Error("This transaction is not a USDC transfer."); }
  if (String(decoded[0]).toLowerCase() !== order.treasury.toLowerCase() || decoded[1] !== BigInt(PRICE_UNITS)) throw new Error("Payment recipient or amount does not match this order.");
  if (!receipt) return false;
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || receipt.status !== "0x1") throw new Error("This payment failed or does not match the transaction.");
  const block = Number(BigInt(receipt.blockNumber));
  if (block < order.minimumBlock) throw new Error("This payment predates the order. Use the payment created for this order.");
  if (receipt.blockHash.toLowerCase() !== evidence.canonicalHash?.toLowerCase()) throw new Error("Payment block is no longer canonical. Check the replacement transaction.");
  const transfer = receipt.logs.some(log => {
    if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) return false;
    try {
      const event = iface.parseLog(log);
      return event?.name === "Transfer" && String(event.args[0]).toLowerCase() === order.buyer.toLowerCase()
        && String(event.args[1]).toLowerCase() === order.treasury.toLowerCase() && event.args[2] === BigInt(PRICE_UNITS);
    } catch { return false; }
  });
  if (!transfer) throw new Error("The official test-USDC contract did not confirm this payment.");
  return evidence.latestBlock - block + 1 >= CONFIRMATIONS;
}
export class BaseSepoliaPayments {
  constructor(private url = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org") {}
  async rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    let response;
    try {
      response = await fetch(this.url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    } catch { throw new Error("Base Sepolia RPC is unavailable. No payment was marked verified; try checking again."); }
    if (!response.ok) throw new Error("Base Sepolia RPC request failed. Try checking again.");
    const data = await response.json();
    if (data.error || !("result" in data)) throw new Error("Base Sepolia could not return payment evidence. Try checking again.");
    return data.result as T;
  }
  async tip() {
    const [chain, block] = await Promise.all([this.rpc<string>("eth_chainId"), this.rpc<string>("eth_blockNumber")]);
    if (Number(BigInt(chain)) !== CHAIN_ID) throw new Error("RPC configuration must point to Base Sepolia (84532).");
    return Number(BigInt(block));
  }
  async verify(order: { buyer: string; treasury: string; minimumBlock: number }, hash: string) {
    const [latestBlock, transaction, receipt] = await Promise.all([this.tip(), this.rpc<RpcTransaction | null>("eth_getTransactionByHash", [hash]), this.rpc<RpcReceipt | null>("eth_getTransactionReceipt", [hash])]);
    const canonical = receipt ? await this.rpc<{ hash: string } | null>("eth_getBlockByNumber", [receipt.blockNumber, false]) : null;
    return verifyEvidence(order, hash, { chainId: CHAIN_ID, latestBlock, transaction, receipt, canonicalHash: canonical?.hash || null });
  }
}
