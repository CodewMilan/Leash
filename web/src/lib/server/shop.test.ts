import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { priceCart } from "../shop/catalog";
import { ShopOrders, type ShopGateway, type ShopTransaction } from "./shop";
const token="11111111-1111-4111-8111-111111111111", cardToken="22222222-2222-4222-8222-222222222222";
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.map(dir=>rm(dir,{recursive:true,force:true})));dirs.length=0;});
async function setup(mode:"success"|"decline"|"auth-timeout"|"clear-timeout"="success"){
 const directory=await mkdtemp(join(tmpdir(),"leash-shop-"));dirs.push(directory);
 let transaction:ShopTransaction|undefined;
 const gateway:ShopGateway={
  authorize:vi.fn(async(card,amount,descriptor)=>{transaction={token,cardToken:card,descriptor,authorized:amount,settled:0,currency:"USD",status:mode==="decline"?"DECLINED":"PENDING",result:mode==="decline"?"USER_TRANSACTION_LIMIT":"APPROVED"};if(mode==="auth-timeout")throw new Error("timeout");return token;}),
  get:vi.fn(async()=>transaction!),find:vi.fn(async()=>transaction||null),
  clear:vi.fn(async()=>{transaction={...transaction!,status:"SETTLED",settled:1200};if(mode==="clear-timeout")throw new Error("timeout");}),
 };
 return {service:new ShopOrders(directory,gateway),gateway};
}
const source={sourceId:"operator",cardToken,lastFour:"6637"};
describe("sandbox shop checkout",()=>{
 it("prices products on the server and rejects malformed carts",()=>{
  expect(priceCart([{sku:"daily-notebook",quantity:1,price:1}]).total).toBe(1200);
  expect(()=>priceCart([{sku:"unknown",quantity:1}])).toThrow();
  expect(()=>priceCart([{sku:"daily-notebook",quantity:-1}])).toThrow();
  expect(()=>priceCart([{sku:"daily-notebook",quantity:1},{sku:"daily-notebook",quantity:1}])).toThrow();
 });
 it("marks paid only after provider settlement and never charges twice",async()=>{
  const {service,gateway}=await setup();const order=await service.create("operator",source,[{sku:"daily-notebook",quantity:1}]);
  expect(order.descriptor).toHaveLength(20);
  const paid=await service.pay(["operator"],order.id);expect(paid.status).toBe("PAID");expect(paid.transactionToken).toBe(token);
  await service.pay(["operator"],order.id);
  expect(gateway.authorize).toHaveBeenCalledTimes(1);expect(gateway.clear).toHaveBeenCalledTimes(1);
  await expect(service.pay(["wallet:other"],order.id)).rejects.toThrow(/belong/i);
 });
 it("does not treat an HTTP-successful decline as a purchase",async()=>{
  const {service,gateway}=await setup("decline");const order=await service.create("operator",source,[{sku:"daily-notebook",quantity:1}]);
  expect((await service.pay(["operator"],order.id)).status).toBe("DECLINED");expect(gateway.clear).not.toHaveBeenCalled();
 });
 it("reconciles uncertain authorization without another authorization",async()=>{
  const {service,gateway}=await setup("auth-timeout");const order=await service.create("operator",source,[{sku:"daily-notebook",quantity:1}]);
  await expect(service.pay(["operator"],order.id)).rejects.toThrow();
  expect((await service.pay(["operator"],order.id)).status).toBe("PAID");expect(gateway.authorize).toHaveBeenCalledTimes(1);
 });
 it("does not send another clearing after an ambiguous capture",async()=>{
  const {service,gateway}=await setup("clear-timeout");const order=await service.create("operator",source,[{sku:"daily-notebook",quantity:1}]);
  await expect(service.pay(["operator"],order.id)).rejects.toThrow();
  expect((await service.pay(["operator"],order.id)).status).toBe("PAID");expect(gateway.clear).toHaveBeenCalledTimes(1);
 });
 it("fails closed when provider evidence belongs to a different card",async()=>{
  const {service,gateway}=await setup();const order=await service.create("operator",source,[{sku:"daily-notebook",quantity:1}]);
  vi.mocked(gateway.get).mockResolvedValue({token,cardToken:"other",descriptor:order.descriptor,authorized:1200,settled:1200,currency:"USD",status:"SETTLED",result:"APPROVED"});
  await expect(service.pay(["operator"],order.id)).rejects.toThrow(/match/i);expect(gateway.clear).not.toHaveBeenCalled();
 });
});
