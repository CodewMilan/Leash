import { randomUUID } from "node:crypto";
import { verifyTypedData } from "ethers";
import { authorizationTypes,giftNonce,TOKEN_DOMAIN,ZeroHash } from "../../chain";
import { toPaise } from "../../amounts";
import { AppError,indicativeRate,required,vaultAddress } from "../config";
import { rateLimit,type Session } from "../auth/session";
import { encrypt } from "../security/crypto";
import { getGift,publicGift } from "./repository";
import { giftSchema } from "../http/validation";
import { sql } from "../db";
import { json } from "../http/response";
export async function createGift(path:string,s:Session,data:Record<string,unknown>):Promise<Response|null> {
    if (path === "gifts") {
      if (!s.sender) throw new AppError("Sign in as a sender first.", 401);
      vaultAddress(); required("RELAYER_PRIVATE_KEY"); required("ATTESTER_PRIVATE_KEY");
      const parsed = giftSchema.parse(data);
      const { terms: t, validAfter, validBefore, signature, label } = parsed;
      const now = Math.floor(Date.now() / 1000);
      if (t.from !== s.sender || BigInt(t.amount) <= 0n || BigInt(t.amount) > 1_000_000_000n || t.expiry <= now + 60 || t.expiry > now + 30 * 86400 || t.boundHuman !== ZeroHash || t.secretHash === ZeroHash || validBefore <= now || validBefore > now + 600 || validAfter >= now) throw new AppError("Check the gift amount, expiry, and authorization.");
      const id = giftNonce(vaultAddress(), t);
      const signer = verifyTypedData(TOKEN_DOMAIN, authorizationTypes, { from: t.from, to: vaultAddress(), value: t.amount, validAfter, validBefore, nonce: id }, signature);
      if (signer.toLowerCase() !== s.sender) throw new AppError("Gift authorization is invalid.", 403);
      await rateLimit(`sender:${s.sender}`, Number(process.env.MAX_GIFTS_PER_SENDER_DAY || "30"), 86400);
      const rate = indicativeRate();
      const paise = toPaise(BigInt(t.amount), rate);
      if (paise < 100n) throw new AppError("Choose a gift worth at least ₹1 at the indicative rate.");
      const payload = encrypt({ terms: t, validAfter, validBefore, signature });
      await sql(`WITH gift AS (INSERT INTO gifts(id,sender,label,amount,expiry,secret_hash,campaign_id,terms,status,rate,paise)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10) ON CONFLICT(id) DO NOTHING RETURNING id)
        INSERT INTO jobs(id,gift_id,kind,payload) SELECT $11,id,'create',$12 FROM gift ON CONFLICT(gift_id,kind) DO NOTHING`,
      [id, s.sender, label, t.amount, t.expiry, t.secretHash, t.campaignId, JSON.stringify(t), rate, String(paise), randomUUID(), payload]);
      return json(publicGift(await getGift(id), true), 202);
    }
  return null;
}
