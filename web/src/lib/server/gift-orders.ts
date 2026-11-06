import { randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAddress, isAddress, ZeroAddress } from "ethers";
import { PRICE_UNITS, type GiftOrder } from "../purchase/model";
import { readJson, withDiskLock, writeJson } from "./purchase-disk";
import type { SandboxCard } from "./lithic";
export type OrderPayments = { tip: () => Promise<number>; verify: (order: GiftOrder, hash: string) => Promise<boolean> };
type OrderIssuer = { issue: () => Promise<SandboxCard>; get: () => Promise<SandboxCard | null> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const transactionHash = /^0x[0-9a-f]{64}$/i;
export class GiftOrders {
  constructor(private config: { directory: string; treasury: string }, private payments: OrderPayments, private issuer: (id: string) => OrderIssuer) {}
  private get ordersDir() { return join(this.config.directory, "orders"); }
  private async load(id: string): Promise<GiftOrder> {
    if (!uuid.test(id)) throw new Error("Invalid gift ID.");
    const value = await readJson<GiftOrder>(join(this.ordersDir, `${id}.json`));
    if (!value) throw new Error("Gift not found.");
    if (value.id !== id || !isAddress(value.buyer) || !isAddress(value.recipient) || !isAddress(value.treasury)
      || value.amount !== PRICE_UNITS || !Number.isSafeInteger(value.minimumBlock) || value.minimumBlock < 0
      || !["AWAITING_PAYMENT", "PAID", "CARD_READY"].includes(value.status)
      || (value.txHash !== undefined && !transactionHash.test(value.txHash))) throw new Error("Gift record is invalid. Restore its persistent data before proceeding.");
    return value;
  }
  async read(wallet: string, id: string) {
    const value = await this.load(id);
    if (![value.buyer, value.recipient].some(address => address.toLowerCase() === wallet.toLowerCase())) throw new Error("This gift does not belong to the signed-in wallet.");
    return value;
  }
  async list(wallet: string) {
    await mkdir(this.ordersDir, { recursive: true, mode: 0o700 });
    const files = (await readdir(this.ordersDir)).filter(name => name.endsWith(".json"));
    const orders: GiftOrder[] = [];
    for (const file of files) {
      const value = await this.load(file.slice(0, -5));
      if ([value.buyer, value.recipient].some(address => address.toLowerCase() === wallet.toLowerCase())) orders.push(value);
    }
    return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async create(buyer: string, recipient: string) {
    buyer = getAddress(buyer); recipient = getAddress(recipient);
    if (buyer === getAddress(this.config.treasury)) throw new Error("The treasury cannot buy gifts by paying itself. Use a separate buyer wallet.");
    if (recipient === ZeroAddress || recipient === getAddress(this.config.treasury)) throw new Error("Choose a recipient wallet, not the payment treasury or zero address.");
    return withDiskLock(this.config.directory, `new-${buyer.toLowerCase()}`, async () => {
      const pending = (await this.list(buyer)).filter(order => order.buyer === buyer && order.status === "AWAITING_PAYMENT");
      if (pending.length >= 10) throw new Error("You already have 10 unpaid gifts. Use an existing order before creating another.");
      const value: GiftOrder = { id: randomUUID(), buyer, recipient, treasury: getAddress(this.config.treasury), createdAt: new Date().toISOString(), minimumBlock: (await this.payments.tip()) + 1, amount: PRICE_UNITS, status: "AWAITING_PAYMENT" };
      await writeJson(this.ordersDir, `${value.id}.json`, value);
      return value;
    });
  }
  async pay(wallet: string, id: string, suppliedHash?: string) {
    if (!uuid.test(id)) throw new Error("Invalid gift ID.");
    return withDiskLock(this.config.directory, id, async () => {
      const order = await this.read(wallet, id);
      if (order.buyer.toLowerCase() !== wallet.toLowerCase()) throw new Error("Only the buyer can submit this gift’s payment.");
      if (order.status !== "AWAITING_PAYMENT") return order;
      const hash = (suppliedHash || order.txHash || "").toLowerCase();
      if (!transactionHash.test(hash)) throw new Error("Enter the payment transaction hash from your wallet.");
      const confirmed = await this.payments.verify(order, hash);
      if (confirmed) {
        const claims = join(this.config.directory, "payments");
        await mkdir(claims, { recursive: true, mode: 0o700 });
        const path = join(claims, `${hash}.json`);
        try { await writeFile(path, JSON.stringify({ orderId: id }), { flag: "wx", mode: 0o600 }); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          const claim = await readJson<{ orderId: string }>(path);
          if (claim?.orderId !== id) throw new Error("This transaction has already paid for another gift.");
        }
      }
      const updated: GiftOrder = { ...order, txHash: hash, ...(confirmed ? { status: "PAID", paidAt: new Date().toISOString() } : {}) };
      await writeJson(this.ordersDir, `${id}.json`, updated);
      return updated;
    });
  }
  async getCard(wallet: string, id: string) {
    const order = await this.read(wallet, id);
    if (order.recipient.toLowerCase() !== wallet.toLowerCase()) throw new Error("Only the intended recipient can view this card.");
    return order.status === "AWAITING_PAYMENT" ? null : this.issuer(id).get();
  }
  async issue(wallet: string, id: string) {
    if (!uuid.test(id)) throw new Error("Invalid gift ID.");
    return withDiskLock(this.config.directory, id, async () => {
      const order = await this.read(wallet, id);
      if (order.recipient.toLowerCase() !== wallet.toLowerCase()) throw new Error("Only the intended recipient can issue this card.");
      if (order.status === "AWAITING_PAYMENT" || !order.txHash) throw new Error("This gift needs a verified testnet payment before card issuance.");
      if (!await this.payments.verify(order, order.txHash)) throw new Error("Payment confirmation is pending. Check payment again before issuing.");
      const card = await this.issuer(id).issue();
      await writeJson(this.ordersDir, `${id}.json`, { ...order, status: "CARD_READY" });
      return card;
    });
  }
}
