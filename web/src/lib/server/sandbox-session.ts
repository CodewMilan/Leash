import { createHmac, timingSafeEqual } from "node:crypto";
export const sessionCookie = "leash_lithic_operator";
const duration = 8 * 60 * 60 * 1000;
function sign(value: string, secret: string) { return createHmac("sha256", secret).update(`lithic-sandbox:${value}`).digest("hex"); }
export function equalSecret(a: string, b: string) {
  const first = createHmac("sha256", "compare").update(a).digest();
  const second = createHmac("sha256", "compare").update(b).digest();
  return timingSafeEqual(first, second);
}
export function createSession(secret: string, now = Date.now()) {
  const expiry = String(now + duration);
  return `${expiry}.${sign(expiry, secret)}`;
}
export function validSession(token: string | undefined, secret: string, now = Date.now()) {
  if (!token || !secret) return false;
  const [expiry, signature, extra] = token.split(".");
  const time = Number(expiry);
  return !extra && !!signature && Number.isFinite(time) && time > now && time <= now + duration
    && equalSecret(signature, sign(expiry, secret));
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
