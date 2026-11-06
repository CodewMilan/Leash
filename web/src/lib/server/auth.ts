import { randomUUID } from "node:crypto";
import { sql } from "./db";
import { AppError, appOrigin } from "./config";
import { randomId, sha256 } from "./crypto";

export type Session = { id: string; sender: string | null; credential_id: string | null; authenticated_at: Date | null };
export async function session(request: Request): Promise<Session> {
  const token = request.headers.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith("shagun_session="))?.slice(15);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError("Sign in to continue.", 401);
  const [row] = await sql<Session>("SELECT id,sender,credential_id,authenticated_at FROM sessions WHERE token_hash=$1 AND expires_at>now()", [sha256(token)]);
  if (!row) throw new AppError("Your session expired. Sign in again.", 401);
  return row;
}
export async function createSession() {
  const token = randomId();
  const id = randomUUID();
  await sql("INSERT INTO sessions(id,token_hash,expires_at) VALUES($1,$2,now()+interval '12 hours')", [id, sha256(token)]);
  return { id, cookie: `shagun_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=43200${appOrigin().startsWith("https:") ? "; Secure" : ""}` };
}
export async function saveChallenge(sessionId: string, kind: string, context: unknown) {
  const id = randomUUID();
  await sql("INSERT INTO challenges(id,session_id,kind,context,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')", [id, sessionId, kind, JSON.stringify(context)]);
  return id;
}
export async function consumeChallenge<T>(id: string, sessionId: string, kind: string): Promise<T> {
  const [row] = await sql<{ context: T }>("UPDATE challenges SET consumed_at=now() WHERE id=$1 AND session_id=$2 AND kind=$3 AND consumed_at IS NULL AND expires_at>now() RETURNING context", [id, sessionId, kind]);
  if (!row) throw new AppError("This confirmation expired or was already used. Please try again.", 409);
  return row.context;
}
export async function rateLimit(bucket: string, max: number, seconds = 3600) {
  const [row] = await sql<{ count: number }>(`INSERT INTO rate_limits(bucket,count,resets_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN rate_limits.resets_at<now() THEN 1 ELSE rate_limits.count+1 END,
    resets_at=CASE WHEN rate_limits.resets_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.resets_at END RETURNING count`, [bucket, seconds]);
  if (row.count > max) throw new AppError("Too many attempts. Please try again later.", 429);
}
export function requirePasskey(s: Session) {
  if (!s.credential_id || !s.authenticated_at || Date.now() - new Date(s.authenticated_at).getTime() > 10 * 60_000) {
    throw new AppError("Confirm with your device before claiming.", 401);
  }
}
