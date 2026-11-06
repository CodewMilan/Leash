import { randomUUID } from "node:crypto";
import { readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { priceCart, type PricedLine } from "../shop/catalog";
import { readJson, withDiskLock, writeJson } from "./purchase-disk";
export type ShopTransaction = { token: string; cardToken: string; descriptor: string; authorized: number; settled: number; currency: string; status: string; result: string };
export type ShopGateway = {
  authorize: (cardToken: string, amount: number, descriptor: string) => Promise<string>;
  clear: (token: string, amount: number) => Promise<void>;
  get: (token: string) => Promise<ShopTransaction>;
  find: (cardToken: string, descriptor: string, createdAt: string) => Promise<ShopTransaction | null>;
};
export type ShopSource = { sourceId: string; cardToken: string; lastFour: string };
export type ShopOrder = {
  id: string; owner: string; source: ShopSource; items: PricedLine[]; total: number; createdAt: string; descriptor: string;
  status: "CREATED" | "AUTHORIZING" | "AUTHORIZED" | "CLEARING" | "PAID" | "DECLINED";
  authorizationAttempted: boolean; clearAttempted: boolean; transactionToken?: string;
  providerStatus?: string; providerResult?: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function shopReceipt(order: ShopOrder) {
  return { id: order.id, items: order.items, total: order.total, createdAt: order.createdAt, descriptor: order.descriptor,
    status: order.status, lastFour: order.source.lastFour, transactionToken: order.transactionToken || null,
    providerStatus: order.providerStatus || null, providerResult: order.providerResult || null };
}
export type ShopReceipt = ReturnType<typeof shopReceipt>;
export class ShopOrders {
  constructor(private directory: string, private gateway: ShopGateway) {}
  private async save(order: ShopOrder) { await writeJson(this.directory, `${order.id}.json`, order); return order; }
  async read(owners: string[], id: string): Promise<ShopOrder> {
    if (!uuid.test(id)) throw new Error("Invalid shop order ID.");
    const order = await readJson<ShopOrder>(join(this.directory, `${id}.json`));
    if (!order) throw new Error("Shop order not found.");
    if (!owners.includes(order.owner)) throw new Error("This order does not belong to your session.");
    if (order.id !== id || !Number.isSafeInteger(order.total) || order.total < 1 || !uuid.test(order.source.cardToken)
      || ![14, 19].some(length => order.descriptor === `LEASH-${id.replaceAll("-", "").slice(0, length)}`)
      || !["CREATED", "AUTHORIZING", "AUTHORIZED", "CLEARING", "PAID", "DECLINED"].includes(order.status)) throw new Error("Shop order data is invalid. Restore its persistent record before continuing.");
    return order;
  }
  async list(owners: string[]) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const records: ShopOrder[] = [];
    for (const file of (await readdir(this.directory)).filter(file => uuid.test(file.replace(/\.json$/, "")) && file.endsWith(".json"))) {
      const order = await readJson<ShopOrder>(join(this.directory, file));
      if (order && owners.includes(order.owner)) records.push(await this.read(owners, order.id));
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async create(owner: string, source: ShopSource, cart: unknown) {
    if (!owner || !uuid.test(source.cardToken) || !/^\d{4}$/.test(source.lastFour)) throw new Error("Choose an authorized sandbox card.");
    const priced = priceCart(cart);
    const id = randomUUID();
    return this.save({ id, owner, source, ...priced, createdAt: new Date().toISOString(), descriptor: `LEASH-${id.replaceAll("-", "").slice(0, 14)}`,
      status: "CREATED", authorizationAttempted: false, clearAttempted: false });
  }
  private async inspect(order: ShopOrder) {
    if (!order.authorizationAttempted) return order;
    const transaction = order.transactionToken ? await this.gateway.get(order.transactionToken) : await this.gateway.find(order.source.cardToken, order.descriptor, order.createdAt);
    if (!transaction) throw new Error("Authorization outcome is not confirmed. This order will not be charged again. Check status or inspect Lithic before creating another order.");
    if (transaction.cardToken !== order.source.cardToken || transaction.descriptor !== order.descriptor.slice(0, 22) || transaction.currency !== "USD"
      || transaction.authorized !== order.total) throw new Error("Provider transaction does not match this order. No clearing was sent.");
    const updated = { ...order, transactionToken: transaction.token, providerStatus: transaction.status, providerResult: transaction.result };
    if (transaction.status === "SETTLED") {
      if (transaction.result !== "APPROVED" || transaction.settled !== order.total) throw new Error("Provider settlement does not match the order total. Operator review is required.");
      return this.save({ ...updated, status: "PAID" });
    }
    if (["DECLINED", "VOIDED", "EXPIRED"].includes(transaction.status) || transaction.result !== "APPROVED") return this.save({ ...updated, status: "DECLINED" });
    if (transaction.status !== "PENDING") throw new Error("Unknown provider transaction state. Check status without charging again.");
    return this.save({ ...updated, status: order.clearAttempted ? "CLEARING" : "AUTHORIZED" });
  }
  async refresh(owners: string[], id: string) {
    if (!uuid.test(id)) throw new Error("Invalid shop order ID.");
    return withDiskLock(this.directory, id, async () => this.inspect(await this.read(owners, id)));
  }
  async pay(owners: string[], id: string) {
    if (!uuid.test(id)) throw new Error("Invalid shop order ID.");
    return withDiskLock(this.directory, id, async () => {
      let order = await this.read(owners, id);
      if (!order.authorizationAttempted) {
        order = await this.save({ ...order, authorizationAttempted: true, status: "AUTHORIZING" });
        let token: string;
        try { token = await this.gateway.authorize(order.source.cardToken, order.total, order.descriptor); }
        catch { throw new Error("Lithic did not confirm authorization. Check this order’s status; do not submit another payment."); }
        order = await this.save({ ...order, transactionToken: token });
      }
      order = await this.inspect(order);
      if (order.status === "PAID" || order.status === "DECLINED") return order;
      if (order.clearAttempted) return order; // Clearing may create another completion; never retry an ambiguous one.
      if (order.status !== "AUTHORIZED" || !order.transactionToken) throw new Error("Payment is not ready to clear. Check status.");
      order = await this.save({ ...order, status: "CLEARING", clearAttempted: true });
      try { await this.gateway.clear(order.transactionToken!, order.total); }
      catch { throw new Error("Lithic did not confirm clearing. Check this order’s status; clearing will not be sent twice."); }
      return this.inspect(order);
    });
  }
}
