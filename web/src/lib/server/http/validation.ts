import { z } from "zod";
import { getAddress, isAddress } from "ethers";
export const bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const address = z
  .string()
  .refine(isAddress, "Invalid address.")
  .transform((s) => getAddress(s).toLowerCase());
const termsSchema = z.object({
  from: address,
  amount: z.string().regex(/^\d{1,10}$/),
  expiry: z.number().int(),
  secretHash: bytes32,
  boundHuman: bytes32,
  campaignId: bytes32,
  salt: bytes32,
});
export const giftSchema = z.object({
  terms: termsSchema,
  validAfter: z.number().int().nonnegative(),
  validBefore: z.number().int(),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
  label: z.string().trim().min(1).max(80),
});
