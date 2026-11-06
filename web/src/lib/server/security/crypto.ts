import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { required, AppError } from "../config";

export const randomId = () => randomBytes(32).toString("hex");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
function key() {
  const value = required("DATA_ENCRYPTION_KEY");
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new AppError("DATA_ENCRYPTION_KEY must be 32 bytes encoded as hex.", 503);
  return Buffer.from(value, "hex");
}
export function encrypt(value: unknown): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [nonce, cipher.getAuthTag(), encrypted].map((b) => b.toString("base64url")).join(".");
}
export function decrypt<T>(value: string): T {
  const [nonce, tag, data] = value.split(".").map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), nonce);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}
export function humanCommitment(nullifier: string) {
  return `0x${createHmac("sha256", key())
    .update(`shagun-human:${BigInt(nullifier).toString()}`)
    .digest("hex")}`;
}
