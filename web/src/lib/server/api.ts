import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Contract, JsonRpcProvider, Wallet, getAddress, isAddress, keccak256, verifyMessage, verifyTypedData } from "ethers";
import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { authorizationTypes, giftNonce, TOKEN_DOMAIN, ZeroHash, type GiftTerms } from "../chain";
import { csvCell, toPaise, tokenAmount } from "../amounts";
import { AppError, appOrigin, appStatus, indicativeRate, officialToken, required, rpcUrl, vaultAddress } from "./config";
import { consumeChallenge, createSession, rateLimit, requirePasskey, saveChallenge, session } from "./auth";
import { encrypt, randomId, sha256 } from "./crypto";
import { getGift, publicGift, type GiftRow } from "./gifts";
import { sql } from "./db";
import { verifyWorld, worldRequest, type WorldRequest } from "./world";
import { receiveWebhook } from "./payouts";

const bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const address = z.string().refine(isAddress, "Invalid address.").transform((s) => getAddress(s).toLowerCase());
const termsSchema = z.object({ from: address, amount: z.string().regex(/^\d{1,10}$/), expiry: z.number().int(), secretHash: bytes32,
  boundHuman: bytes32, campaignId: bytes32, salt: bytes32 });
const giftSchema = z.object({ terms: termsSchema, validAfter: z.number().int().nonnegative(), validBefore: z.number().int(),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/), label: z.string().trim().min(1).max(80) });
const rpID = () => new URL(appOrigin()).hostname;
const json = (data: unknown, status = 200, headers?: HeadersInit) => Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("Expected a JSON request.", 415);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 48_000) throw new AppError("Request is too large.", 413);
  try { return JSON.parse(raw); } catch { throw new AppError("Invalid request."); }
}
export async function handleApi(request: Request): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\//, "").replace(/\/$/, "");
    if (request.method === "GET" && path === "status") return json(appStatus());
    if (request.method === "POST" && path === "webhooks/razorpay") return receiveWebhook(request);
    if (request.method === "POST" && request.headers.get("origin") !== appOrigin()) throw new AppError("Request origin is not allowed.", 403);
    if (request.method === "POST" && path === "session") {
      try { const s = await session(request); return json({ sender: s.sender, passkey: !!s.credential_id }); } catch (e) { if (!(e instanceof AppError) || e.status !== 401) throw e; }
      await rateLimit(`session:${sha256(request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local")}`, 60);
      const created = await createSession();
      return json({ sender: null, passkey: false }, 200, { "set-cookie": created.cookie });
    }
    const s = await session(request);
    if (request.method === "GET") {
      if (path === "session") return json({ sender: s.sender, passkey: !!s.credential_id });
      if (path === "gifts" || path === "gifts/export") {
        if (!s.sender) throw new AppError("Sign in as a sender first.", 401);
        const rows = await sql<GiftRow>(`SELECT g.*,p.payout_id,p.status AS payout_status FROM gifts g LEFT JOIN payouts p ON p.gift_id=g.id WHERE g.sender=$1 ORDER BY g.created_at DESC LIMIT 500`, [s.sender]);
        if (path === "gifts/export") {
          const header = ["Gift ID", "Label", "USDT", "Status", "Expires (UTC)", "Create transaction", "Claim transaction", "Return transaction", "UPI test payout ID", "UPI test payout status"];
          const csv = [header, ...rows.map((g) => [g.id, g.label, tokenAmount(g.amount, 6).replaceAll(",", ""), g.status, new Date(Number(g.expiry) * 1000).toISOString(), g.created_tx, g.claim_tx, g.refund_tx, g.payout_id, g.payout_status])].map((r) => r.map(csvCell).join(",")).join("\r\n");
          return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="shagun-gifts.csv"', "cache-control": "no-store" } });
        }
        return json({ gifts: rows.map((g) => publicGift(g, true)) });
      }
      if (path === "balance") {
        if (!s.sender) throw new AppError("Sign in as a sender first.", 401);
        const provider = new JsonRpcProvider(rpcUrl());
        try {
          if ((await provider.getNetwork()).chainId !== 1874n) throw new AppError("Whitechain configuration has the wrong chain ID.", 503);
          const token = new Contract(officialToken(), ["function balanceOf(address) view returns(uint256)"], provider);
          return json({ balance: String(await token.balanceOf(s.sender)) });
        } finally { provider.destroy(); }
      }
      if (/^gifts\/0x[a-f0-9]{64}$/i.test(path)) {
        const g = await getGift(path.split("/")[1]);
        return json(publicGift(g, g.sender === s.sender || g.claim_session === s.id));
      }
      throw new AppError("Page not found.", 404);
    }
    if (request.method !== "POST") throw new AppError("Method not supported.", 405);
    await rateLimit(`request:${s.id}`, 100, 60);
    const data = await body(request);
    if (path === "auth/sender/options") {
      const from = address.parse(data.address);
      const message = `Sign in to Shagun\nOrigin: ${appOrigin()}\nAddress: ${from}\nChain ID: 1874\nNonce: ${randomId()}\nExpires: ${new Date(Date.now() + 300_000).toISOString()}`;
      const challengeId = await saveChallenge(s.id, "sender", { message, address: from });
      return json({ challengeId, message });
    }
    if (path === "auth/sender/verify") {
      const challenge = await consumeChallenge<{ message: string; address: string }>(z.string().parse(data.challengeId), s.id, "sender");
      if (verifyMessage(challenge.message, z.string().parse(data.signature)).toLowerCase() !== challenge.address) throw new AppError("Sender sign-in failed.", 403);
      await sql("UPDATE sessions SET sender=$1 WHERE id=$2", [challenge.address, s.id]);
      return json({ sender: challenge.address });
    }
    if (path === "auth/passkey/options") {
      const mode = z.enum(["register", "login"]).parse(data.mode);
      const options = mode === "register" ? await generateRegistrationOptions({ rpName: "Shagun", rpID: rpID(), userName: `Shagun ${s.id.slice(0, 8)}`, userID: new TextEncoder().encode(s.id), attestationType: "none", supportedAlgorithmIDs: [-7, -257], authenticatorSelection: { residentKey: "required", userVerification: "required" } })
        : await generateAuthenticationOptions({ rpID: rpID(), userVerification: "required" });
      const challengeId = await saveChallenge(s.id, `passkey-${mode}`, { challenge: options.challenge });
      return json({ challengeId, options });
    }
    if (path === "auth/passkey/verify") {
      const mode = z.enum(["register", "login"]).parse(data.mode);
      const expected = await consumeChallenge<{ challenge: string }>(z.string().parse(data.challengeId), s.id, `passkey-${mode}`);
      let credentialId: string;
      if (mode === "register") {
        const result = await verifyRegistrationResponse({ response: data.response as RegistrationResponseJSON, expectedChallenge: expected.challenge,
          expectedOrigin: appOrigin(), expectedRPID: rpID(), requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] });
        if (!result.verified) throw new AppError("Your device confirmation failed.", 403);
        const c = result.registrationInfo.credential;
        credentialId = c.id;
        await sql("INSERT INTO credentials(id,public_key,counter,transports,user_id) VALUES($1,$2,$3,$4,$5)", [c.id, Buffer.from(c.publicKey).toString("base64url"), c.counter, JSON.stringify(c.transports || []), s.id]);
      } else {
        const response = data.response as AuthenticationResponseJSON;
        const [c] = await sql<{ id: string; public_key: string; counter: string; transports: string[] }>("SELECT * FROM credentials WHERE id=$1", [response.id]);
        if (!c) throw new AppError("This passkey is not registered with Shagun.", 403);
        const result = await verifyAuthenticationResponse({ response, expectedChallenge: expected.challenge, expectedOrigin: appOrigin(), expectedRPID: rpID(), requireUserVerification: true,
          credential: { id: c.id, publicKey: new Uint8Array(Buffer.from(c.public_key, "base64url")), counter: Number(c.counter), transports: c.transports } });
        if (!result.verified) throw new AppError("Your device confirmation failed.", 403);
        credentialId = c.id;
        const updated = await sql("UPDATE credentials SET counter=$1 WHERE id=$2 AND counter=$3 RETURNING id", [result.authenticationInfo.newCounter, c.id, c.counter]);
        if (!updated.length) throw new AppError("This passkey confirmation was already used.", 409);
      }
      await sql("UPDATE sessions SET credential_id=$1,authenticated_at=now() WHERE id=$2", [credentialId, s.id]);
      return json({ verified: true });
    }
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
    throw new AppError("Page not found.", 404);
  } catch (error) {
    if (error instanceof AppError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message || "Check your input." }, 400);
    if ((error as { code?: string }).code === "23505") return json({ error: "This gift or campaign has already been claimed." }, 409);
    // Do not leak database connection strings, proofs, secrets, or upstream error bodies.
    console.error("Shagun request failed:", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "This service is temporarily unavailable. Please try again." }, 503);
  }
}
