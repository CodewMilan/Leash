import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GiftOrders } from "./gift-orders";
const buyer="0x1111111111111111111111111111111111111111", recipient="0x2222222222222222222222222222222222222222", treasury="0x3333333333333333333333333333333333333333";
const hash="0x"+"a".repeat(64);
const card={token:"11111111-1111-4111-8111-111111111111",lastFour:"6637",expMonth:"11",expYear:"2031",state:"OPEN",spendLimit:10000,spendLimitDuration:"FOREVER"};
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.map(dir=>rm(dir,{recursive:true,force:true})));dirs.length=0;});
async function setup(){
 const directory=await mkdtemp(join(tmpdir(),"leash-order-"));dirs.push(directory);
 const payments={tip:vi.fn(async()=>100),verify:vi.fn(async()=>true)};
 const issuer={issue:vi.fn(async()=>card),get:vi.fn(async()=>card)};
 return {service:new GiftOrders({directory,treasury},payments,()=>issuer),issuer,payments,directory};
}
describe("wallet purchase lifecycle",()=>{
 it("rejects treasury self-payments on the server",async()=>{
  const {service}=await setup();
  await expect(service.create(treasury,recipient)).rejects.toThrow(/treasury/i);
 });
 it("blocks unpaid issuance and anyone other than recipient",async()=>{
  const {service,issuer}=await setup();const order=await service.create(buyer,recipient);
  await expect(service.issue(recipient,order.id)).rejects.toThrow(/payment/i);
  await service.pay(buyer,order.id,hash);
  await expect(service.issue(buyer,order.id)).rejects.toThrow(/recipient/i);
  expect(issuer.issue).not.toHaveBeenCalled();
  expect((await service.issue(recipient,order.id)).lastFour).toBe("6637");
 });
 it("prevents the same payment from buying two cards",async()=>{
  const {service}=await setup();const first=await service.create(buyer,buyer);const second=await service.create(buyer,buyer);
  await service.pay(buyer,first.id,hash);
  await expect(service.pay(buyer,second.id,hash)).rejects.toThrow(/another gift/i);
 });
 it("does not mark pending transactions as paid and rechecks before issuance",async()=>{
  const {service,payments,issuer}=await setup();const order=await service.create(buyer,buyer);
  payments.verify.mockResolvedValue(false);
  expect((await service.pay(buyer,order.id,hash)).status).toBe("AWAITING_PAYMENT");
  await expect(service.issue(buyer,order.id)).rejects.toThrow(/payment/i);
  payments.verify.mockResolvedValue(true);await service.pay(buyer,order.id,hash);
  payments.verify.mockResolvedValue(false);
  await expect(service.issue(buyer,order.id)).rejects.toThrow(/payment/i);
  expect(issuer.issue).not.toHaveBeenCalled();
 });
 it("isolates gifts, prevents unauthorized payment submission, and survives new instances",async()=>{
  const {service,payments,directory,issuer}=await setup();const order=await service.create(buyer,recipient);
  await expect(service.pay(recipient,order.id,hash)).rejects.toThrow(/buyer/i);
  expect(await service.list(treasury)).toEqual([]);
  await service.pay(buyer,order.id,hash);
  const restarted=new GiftOrders({directory,treasury},payments,()=>issuer);
  expect((await restarted.list(recipient))[0].status).toBe("PAID");
  await expect(restarted.read(treasury,order.id)).rejects.toThrow(/belong/i);
 });
});
