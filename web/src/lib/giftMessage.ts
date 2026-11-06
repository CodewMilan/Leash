import { getBytes } from "ethers";
import { MESSAGE_MAX } from "./designs";

/** Recipient notes are sealed with the envelope secret, so only claim-link holders can read them. */
const PREFIX = "v1";
const encoder = new TextEncoder();

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function fromB64url(text: string) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
async function keyFor(secret: string) {
  const material = new Uint8Array([...encoder.encode("shagun-message:"), ...getBytes(secret)]);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export const sealedMessagePattern = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,800}$/;

export async function sealMessage(secret: string, message: string) {
  const text = message.trim();
  if (!text) return null;
  if (text.length > MESSAGE_MAX) throw new Error(`Keep the note under ${MESSAGE_MAX} characters.`);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await keyFor(secret),
    encoder.encode(text),
  );
  return `${PREFIX}.${b64url(iv)}.${b64url(new Uint8Array(sealed))}`;
}

export async function openMessage(secret: string, sealed: string) {
  if (!sealedMessagePattern.test(sealed)) return null;
  const [, iv, body] = sealed.split(".");
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64url(iv) },
      await keyFor(secret),
      fromB64url(body),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
