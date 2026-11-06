import { randomUUID } from "node:crypto";
import { z } from "zod";
import { keccak256 } from "ethers";
import { ZeroHash } from "../../chain";
import { AppError } from "../config";
import { consumeChallenge,saveChallenge,rateLimit,requirePasskey,type Session } from "../auth/session";
import { encrypt,randomId,sha256 } from "../security/crypto";
import { getGift,publicGift } from "./repository";
import { bytes32 } from "../http/validation";
import { verifyWorld,worldRequest,type WorldRequest } from "../world/verification";
import { sql } from "../db";
import { json } from "../http/response";
export async function claimGift(path:string,s:Session,data:Record<string,unknown>):Promise<Response|null> {
    const worldMatch = path.match(/^gifts\/(0x[a-f0-9]{64})\/world$/i);
    if (worldMatch) {
      requirePasskey(s);
      const g = await getGift(worldMatch[1]);
      if (g.status !== "sent" || Number(g.expiry) <= Date.now() / 1000 || g.claim_session) throw new AppError("This gift is already claimed, unavailable, or expired.", 409);
      await rateLimit(`gift:${g.id}`, 20);
      const signal = `${g.id}:${s.id}:${s.credential_id}:${randomId()}`;
      const config = worldRequest(signal);
      const challengeId = await saveChallenge(s.id, "world", { giftId: g.id, config });
      return json({ challengeId, config });
    }
    const claimMatch = path.match(/^gifts\/(0x[a-f0-9]{64})\/claim$/i);
    if (claimMatch) {
      requirePasskey(s);
      const id = claimMatch[1];
      const parsed = z.object({ challengeId: z.string(), secret: bytes32, upi: z.string().trim().regex(/^[a-zA-Z0-9._-]{2,128}@[a-zA-Z0-9.-]{2,64}$/), name: z.string().trim().min(2).max(80), proof: z.unknown() }).parse(data);
      const g = await getGift(id);
      if (g.claim_session === s.id) return json(publicGift(g, true), 202);
      if (g.status !== "sent" || g.claim_session || Number(g.expiry) <= Date.now() / 1000) throw new AppError("This envelope has already been claimed or has expired.", 409);
      if (keccak256(parsed.secret) !== g.secret_hash) throw new AppError("The envelope key is invalid. Open the original gift link.", 403);
      const expected = await consumeChallenge<{ giftId: string; config: WorldRequest }>(parsed.challengeId, s.id, "world");
      if (expected.giftId !== id) throw new AppError("Verification belongs to a different gift.", 403);
      const human = await verifyWorld(parsed.proof, expected.config);
      await rateLimit(`human:${human}`, Number(process.env.MAX_CLAIMS_PER_HUMAN_DAY || "5"), 86400);
      const campaign = g.campaign_id !== ZeroHash;
      if (campaign) {
        const previous = await sql("SELECT gift_id FROM campaign_claims WHERE sender=$1 AND campaign_id=$2 AND human=$3", [g.sender, g.campaign_id, human]);
        if (previous.length) throw new AppError("You have already received a gift from this campaign.", 409);
      }
      // All claim reservation, campaign uniqueness, payout intent, and job writes are one statement.
      const results = await sql(`WITH reservation AS (
        UPDATE gifts SET claim_session=$2,human=$3 WHERE id=$1 AND status='sent' AND claim_session IS NULL RETURNING id,sender,campaign_id
      ), campaign AS (
        INSERT INTO campaign_claims(sender,campaign_id,human,gift_id) SELECT sender,campaign_id,$3,id FROM reservation WHERE campaign_id<>$4
        RETURNING gift_id
      ), payout AS (
        INSERT INTO payouts(gift_id,idempotency_key,details) SELECT id,$5,$6 FROM reservation RETURNING gift_id
      ) INSERT INTO jobs(id,gift_id,kind,payload) SELECT $7,id,'claim',$8 FROM reservation RETURNING gift_id`,
      [id, s.id, human, ZeroHash, randomUUID(), encrypt({ name: parsed.name, upi: parsed.upi }), randomUUID(), encrypt({ secret: parsed.secret, human, session: `0x${sha256(s.id)}` })]);
      if (!results.length) throw new AppError("Someone else has already started claiming this gift.", 409);
      return json(publicGift(await getGift(id), true), 202);
    }
  return null;
}
