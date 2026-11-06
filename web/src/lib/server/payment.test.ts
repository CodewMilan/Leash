import { describe, expect, it } from "vitest";
import { Interface } from "ethers";
import { ERC20_ABI, USDC_ADDRESS, PRICE_UNITS } from "../purchase/model";
import { verifyEvidence, type PaymentEvidence } from "./payment";
const payer="0x1111111111111111111111111111111111111111";
const treasury="0x2222222222222222222222222222222222222222";
const hash="0x"+"a".repeat(64);
const blockHash="0x"+"b".repeat(64);
const iface=new Interface(ERC20_ABI);
function evidence(): PaymentEvidence {
 const event=iface.encodeEventLog(iface.getEvent("Transfer")!,[payer,treasury,PRICE_UNITS]);
 return { chainId:84532, latestBlock:105, transaction:{hash,from:payer,to:USDC_ADDRESS,input:iface.encodeFunctionData("transfer",[treasury,PRICE_UNITS])},receipt:{transactionHash:hash,status:"0x1",blockNumber:"0x64",blockHash,logs:[{address:USDC_ADDRESS,topics:event.topics,data:event.data}]},canonicalHash:blockHash };
}
const order={buyer:payer,treasury,minimumBlock:99};
describe("testnet USDC payment evidence",()=>{
 it("accepts only a confirmed canonical exact transfer",()=>{expect(verifyEvidence(order,hash,evidence())).toBe(true);});
 it("rejects treasury-to-itself transfers even with valid-looking logs",()=>{
  const e=evidence();
  const event=iface.encodeEventLog(iface.getEvent("Transfer")!,[payer,payer,PRICE_UNITS]);
  e.transaction!.input=iface.encodeFunctionData("transfer",[payer,PRICE_UNITS]);
  e.receipt!.logs=[{address:USDC_ADDRESS,topics:event.topics,data:event.data}];
  expect(()=>verifyEvidence({...order,treasury:payer},hash,e)).toThrow(/treasury/i);
 });
 it("waits for confirmations rather than authorizing issuance",()=>{const e=evidence();e.latestBlock=100;expect(verifyEvidence(order,hash,e)).toBe(false);});
 it.each(["network","sender","recipient","amount","token","failed","old","reorg","missing-log","wrong-hash"])("rejects %s evidence",kind=>{
  const e=evidence();
  if(kind==="network")e.chainId=8453;
  if(kind==="sender")e.transaction!.from=treasury;
  if(kind==="recipient")e.transaction!.input=iface.encodeFunctionData("transfer",[payer,PRICE_UNITS]);
  if(kind==="amount")e.transaction!.input=iface.encodeFunctionData("transfer",[treasury,"1"]);
  if(kind==="token")e.receipt!.logs[0].address=payer;
  if(kind==="failed")e.receipt!.status="0x0";
  if(kind==="old")e.receipt!.blockNumber="0x1";
  if(kind==="reorg")e.canonicalHash="0x"+"c".repeat(64);
  if(kind==="missing-log")e.receipt!.logs=[];
  if(kind==="wrong-hash")e.transaction!.hash="0x"+"c".repeat(64);
  expect(()=>verifyEvidence(order,hash,e)).toThrow();
 });
 it("does not accept a transaction that is not mined",()=>{const e=evidence();e.receipt=null;expect(verifyEvidence(order,hash,e)).toBe(false);});
});
