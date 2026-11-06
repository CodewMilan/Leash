import { randomBytes } from "node:crypto";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { getAddress, isAddress, ZeroAddress } from "ethers";
import { NextRequest, NextResponse } from "next/server";
import { purchaseConfig } from "@/lib/server/purchase-config";
import { HttpError, privateHeaders, purchaseError, smallBody } from "@/lib/server/purchase-api";
import { readJson, writeJson } from "@/lib/server/purchase-disk";
import { sameOrigin } from "@/lib/server/sandbox-session";
import { challengeMessage, readWalletSession, verifyWalletChallenge, walletCookie, walletSession, type WalletChallenge } from "@/lib/server/wallet-auth";
let attempts = 0; let windowStart = 0;
const challengeCookie = "leash_wallet_challenge";
export async function GET(request: NextRequest) {
  const config = purchaseConfig();
  return NextResponse.json({ config: config.publicConfig, wallet: readWalletSession(request.cookies.get(walletCookie)?.value, config.accessCode) }, { headers: privateHeaders });
}
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) throw new HttpError(403, "Invalid request origin.");
    const config = purchaseConfig();
    if (!config.publicConfig.configured) throw new HttpError(503, "Configure the testnet checkout environment and restart the app.");
    if (Date.now() - windowStart > 60000) { attempts = 0; windowStart = Date.now(); }
    if (++attempts > 60) throw new HttpError(429, "Too many wallet requests. Wait one minute and try again.");
    const body = await smallBody(request);
    const origin = new URL(request.url).origin;
    const directory = join(config.directory, "challenges");
    const options = { httpOnly: true, sameSite: "strict" as const, secure: new URL(request.url).protocol === "https:", path: "/" };
    if (body.action === "challenge") {
      if (typeof body.address !== "string" || !isAddress(body.address) || getAddress(body.address) === ZeroAddress) throw new HttpError(400, "Choose a valid wallet address.");
      const challenge: WalletChallenge = { address: getAddress(body.address), nonce: randomBytes(32).toString("hex"), origin, expires: Date.now() + 300000 };
      await writeJson(directory, `${challenge.nonce}.json`, challenge);
      const response = NextResponse.json({ message: challengeMessage(challenge), nonce: challenge.nonce }, { headers: privateHeaders });
      response.cookies.set(challengeCookie, challenge.nonce, { ...options, maxAge: 300 });
      return response;
    }
    if (body.action !== "verify" || typeof body.nonce !== "string" || !/^[0-9a-f]{64}$/.test(body.nonce)
      || typeof body.signature !== "string" || body.signature.length > 1024 || request.cookies.get(challengeCookie)?.value !== body.nonce) throw new HttpError(400, "Wallet challenge is invalid. Connect again.");
    const path = join(directory, `${body.nonce}.json`);
    const challenge = await readJson<WalletChallenge>(path);
    if (!challenge) throw new HttpError(400, "Wallet challenge was already used or expired. Connect again.");
    const address = verifyWalletChallenge(challenge, body.signature, origin);
    try { await rename(path, `${path}.used`); }
    catch { throw new HttpError(400, "This sign-in challenge has already been used. Connect again."); }
    const response = NextResponse.json({ wallet: address }, { headers: privateHeaders });
    response.cookies.set(walletCookie, walletSession(address, config.accessCode), { ...options, maxAge: 8 * 3600 });
    response.cookies.set(challengeCookie, "", { ...options, maxAge: 0 });
    return response;
  } catch (error) { return purchaseError(error); }
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: privateHeaders });
  const response = NextResponse.json({ wallet: null }, { headers: privateHeaders });
  response.cookies.set(walletCookie, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
