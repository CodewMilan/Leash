import { z } from "zod";
import { verifyMessage } from "ethers";
import { generateRegistrationOptions,generateAuthenticationOptions,verifyRegistrationResponse,verifyAuthenticationResponse,type RegistrationResponseJSON,type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { AppError,appOrigin } from "../config";
import { consumeChallenge,saveChallenge,type Session } from "./session";
import { randomId } from "../security/crypto";
import { sql } from "../db";
import { address } from "../http/validation";
import { json } from "../http/response";
const rpID=()=>new URL(appOrigin()).hostname;
export async function authenticate(path:string,s:Session,data:Record<string,unknown>):Promise<Response|null> {
    if (path === "auth/logout") {
      await sql("DELETE FROM challenges WHERE session_id=$1", [s.id]);
      await sql("UPDATE sessions SET expires_at=now() WHERE id=$1", [s.id]);
      return json({ signedOut: true }, 200, { "set-cookie": "shagun_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0" });
    }
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
  return null;
}
