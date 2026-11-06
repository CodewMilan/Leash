import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
export async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("Persistent purchase data could not be read. Restore the server data before continuing."); }
}
export async function writeJson(directory: string, filename: string, value: unknown) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, join(directory, filename));
}
export async function withDiskLock<T>(directory: string, name: string, work: () => Promise<T>) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, `${name}.lock`);
  try { await mkdir(lock); }
  catch { throw new Error("Another request is updating this gift. Refresh its status shortly."); }
  try { return await work(); }
  finally { await rm(lock, { recursive: true, force: true }); }
}
