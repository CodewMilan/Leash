import { readFile } from "node:fs/promises";
import { z } from "zod";
import { config } from "./config.js";

const Contact = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  /** x402-protected URL the device requests to pay this contact. `{amount}` / `{qty}` are filled from the decision. */
  endpoint: z.string().url(),
  /** Hedera account the 402 must pay. Anything else is refused. */
  payTo: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().default(""),
});

export type Contact = z.infer<typeof Contact>;

let cache: Contact[] | null = null;

export async function loadContacts(): Promise<Contact[]> {
  if (cache) return cache;
  const raw = await readFile(config.contactsFile, "utf8").catch(() => {
    throw new Error(`Contacts file not found at ${config.contactsFile}. Copy contacts.example.json to contacts.json and fill in real Hedera accounts.`);
  });
  cache = z.array(Contact).min(1).parse(JSON.parse(raw));
  return cache;
}

export async function findContact(id: string): Promise<Contact | undefined> {
  return (await loadContacts()).find((c) => c.id === id);
}
