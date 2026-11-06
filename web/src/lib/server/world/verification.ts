import { signRequest } from "@worldcoin/idkit-core/signing";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { AppError, required, worldAction, worldEnvironment } from "../config";
import { humanCommitment } from "../security/crypto";

export function worldRequest(signal: string) {
  const signed = signRequest({
    signingKeyHex: required("WORLD_SIGNING_KEY"),
    action: worldAction(),
  });
  return {
    app_id: required("WORLD_APP_ID"),
    action: worldAction(),
    environment: worldEnvironment(),
    signal,
    rp_context: {
      rp_id: required("WORLD_RP_ID"),
      nonce: signed.nonce,
      created_at: signed.createdAt,
      expires_at: signed.expiresAt,
      signature: signed.sig,
    },
  };
}
export type WorldRequest = ReturnType<typeof worldRequest>;
export async function verifyWorld(proof: unknown, expected: WorldRequest): Promise<string> {
  if (!proof || typeof proof !== "object") throw new AppError("World verification is missing.");
  const result = proof as {
    protocol_version?: string;
    action?: string;
    nonce?: string;
    environment?: string;
    responses?: {
      identifier?: string;
      signal_hash?: string;
      nullifier?: string;
      issuer_schema_id?: number;
    }[];
  };
  if (
    result.protocol_version !== "4.0" ||
    result.action !== expected.action ||
    result.nonce !== expected.rp_context.nonce ||
    result.environment !== expected.environment
  ) {
    throw new AppError("World verification did not match this gift request.", 403);
  }
  const response = result.responses?.find(
    (r) => r.identifier === "proof_of_human" && r.issuer_schema_id === 1,
  );
  if (
    !response?.nullifier ||
    !/^0x[a-f0-9]{1,64}$/i.test(response.nullifier) ||
    !response.signal_hash ||
    !/^0x[a-f0-9]+$/i.test(response.signal_hash) ||
    BigInt(response.signal_hash) !== BigInt(hashSignal(expected.signal))
  ) {
    throw new AppError("A matching Proof of Human is required.", 403);
  }
  const verification = await fetch(
    `https://developer.world.org/api/v4/verify/${required("WORLD_RP_ID")}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proof),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!verification.ok)
    throw new AppError("World could not verify this proof. Please try again.", 403);
  const verified = await verification.json();
  if (verified.success !== true || verified.environment !== expected.environment)
    throw new AppError("World verification was rejected.", 403);
  return humanCommitment(response.nullifier);
}
