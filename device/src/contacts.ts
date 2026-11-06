import { readFile } from "node:fs/promises";
import { config } from "./config.js";
import { parseContacts, type Contact } from "./core/contacts.js";

export type { Contact } from "./core/contacts.js";

let cache: Contact[] | null = null;

export async function loadContacts(): Promise<Contact[]> {
  if (cache) return cache;
  const raw = await readFile(config.contactsFile, "utf8").catch(() => {
    throw new Error(`Contacts file not found at ${config.contactsFile}. Copy contacts.example.json to contacts.json and fill in real Hedera accounts.`);
  });
  cache = parseContacts(JSON.parse(raw));
  return cache;
}

export async function findContact(id: string): Promise<Contact | undefined> {
  return (await loadContacts()).find((c) => c.id === id);
}
