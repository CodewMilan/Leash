import { createHmac, timingSafeEqual } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
export const walletCookie = "leash_gift_wallet";
export type WalletChallenge = { address: string; origin: string; nonce: string; expires: number };
export function challengeMessage(value: WalletChallenge) {
  return `${new URL(value.origin).host} wants you to sign in to Leash Gifts with your Ethereum account:\n${value.address}\n\nSign in to buy or receive testnet gift cards. This signature does not send tokens or authorize spending.\n\nURI: ${value.origin}/gifts\nVersion: 1\nChain ID: 84532\nNonce: ${value.nonce}\nExpiration Time: ${new Date(value.expires).toISOString()}`;
}
export function verifyWalletChallenge(challenge: WalletChallenge, signature: string, origin: string, now = Date.now()) {
  if (challenge.origin !== origin || challenge.expires <= now || challenge.expires > now + 300000) throw new Error("Wallet sign-in expired or has the wrong origin. Connect again.");
  let recovered;
  try { recovered = verifyMessage(challengeMessage(challenge), signature); }
  catch { throw new Error("The wallet signature is invalid. Connect again."); }
  if (getAddress(challenge.address) !== getAddress(recovered)) throw new Error("The signature does not belong to the selected wallet.");
  return getAddress(recovered);
}
function mac(value: string, secret: string) { return createHmac("sha256", secret).update(`gift-wallet:${value}`).digest("hex"); }
export function walletSession(address: string, secret: string, now = Date.now()) {
  const value = `${getAddress(address)}.${now + 8 * 3600000}`;
  return `${value}.${mac(value, secret)}`;
}
export function readWalletSession(token: string | undefined, secret: string, now = Date.now()) {
  try {
    if (!token || !secret) return null;
    const [address, expiry, signature, extra] = token.split(".");
    if (extra || !signature || Number(expiry) <= now || Number(expiry) > now + 8 * 3600000 || !Number.isFinite(Number(expiry))) return null;
    const expected = Buffer.from(mac(`${address}.${expiry}`, secret), "hex");
    const actual = Buffer.from(signature, "hex");
    if (actual.length !== expected.length || !/^[0-9a-f]{64}$/.test(signature) || !timingSafeEqual(expected, actual)) return null;
    return getAddress(address);
  } catch { return null; }
}
