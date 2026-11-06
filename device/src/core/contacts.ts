import { z } from "zod";

/** A payment the device turns down on purpose. Nothing is signed. */
export class Refused extends Error {}

export const ContactSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  /** x402-protected URL the device requests to pay this contact. `{amount}` / `{qty}` are filled from the decision. */
  endpoint: z.string().url(),
  /** Hedera account the 402 must pay. Anything else is refused. */
  payTo: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().default(""),
});

export type Contact = z.infer<typeof ContactSchema>;

export function parseContacts(raw: unknown): Contact[] {
  const contacts = z.array(ContactSchema).min(1).parse(raw);
  const ids = new Set<string>();
  for (const c of contacts) {
    if (ids.has(c.id)) throw new Error(`Duplicate contact id "${c.id}"`);
    ids.add(c.id);
  }
  return contacts;
}

/** The URL to request for this payment; amounts come from 0G's decision, never from the merchant. */
export function fillEndpoint(contact: Contact, amountUsdc: string | null, qty: number | null): string {
  let url = contact.endpoint;
  if (url.includes("{amount}")) {
    if (!amountUsdc) throw new Refused(`${contact.name} needs an amount; say how much to pay`);
    url = url.replace("{amount}", encodeURIComponent(amountUsdc));
  }
  if (url.includes("{qty}")) url = url.replace("{qty}", String(qty ?? 1));
  return url;
}
