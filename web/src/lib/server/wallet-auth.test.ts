import { describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import { challengeMessage, verifyWalletChallenge, walletSession, readWalletSession } from "./wallet-auth";
describe("wallet ownership authentication",()=>{
 it("requires the correct wallet, origin and unexpired challenge",async()=>{
  const wallet=Wallet.createRandom();const now=1000;
  const challenge={address:wallet.address,origin:"http://localhost:3000",nonce:"a".repeat(64),expires:now+300000};
  const signature=await wallet.signMessage(challengeMessage(challenge));
  expect(verifyWalletChallenge(challenge,signature,challenge.origin,now)).toBe(wallet.address);
  expect(()=>verifyWalletChallenge(challenge,signature,"https://evil.example",now)).toThrow();
  expect(()=>verifyWalletChallenge(challenge,signature,challenge.origin,challenge.expires+1)).toThrow();
  const other=Wallet.createRandom();
  expect(()=>verifyWalletChallenge({...challenge,address:other.address},signature,challenge.origin,now)).toThrow();
 });
 it("binds signed sessions to the address and expiry",()=>{
  const address=Wallet.createRandom().address;const secret="test-secret";
  const token=walletSession(address,secret,1000);
  expect(readWalletSession(token,secret,1001)).toBe(address);
  expect(readWalletSession(token+'a',secret,1001)).toBeNull();
  expect(readWalletSession(token,secret,1000+9*3600000)).toBeNull();
  expect(readWalletSession(token,"wrong-secret",1001)).toBeNull();
 });
});
