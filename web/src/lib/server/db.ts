import { Pool } from "pg";
import { required } from "./config";

export interface Database {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}
const globalDb = globalThis as typeof globalThis & { shagunPool?: Pool; shagunTestDb?: Database };
export function pool() {
  return (globalDb.shagunPool ??= new Pool({
    connectionString: required("DATABASE_URL"),
    max: 8,
    connectionTimeoutMillis: 8_000,
    application_name: "shagun",
  }));
}
export async function sql<T = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await (globalDb.shagunTestDb || pool()).query(text, values);
  return result.rows as T[];
}
export function setTestDatabase(db?: Database) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Test database injection is only available in tests.");
  globalDb.shagunTestDb = db;
}
export async function withWorkerLock<T>(
  fn: (assertLock: () => Promise<void>) => Promise<T>,
): Promise<T | undefined> {
  const client = await pool().connect();
  let disconnected = false;
  const onError = () => {
    disconnected = true;
  };
  client.on("error", onError);
  try {
    const result = await client.query("SELECT pg_try_advisory_lock(1874, 7070) AS locked");
    if (!result.rows[0].locked) return;
    const assertLock = async () => {
      if (disconnected) throw new Error("WorkerLockConnectionLost");
      await client.query("SELECT 1");
    };
    try {
      return await fn(assertLock);
    } finally {
      await client.query("SELECT pg_advisory_unlock(1874, 7070)");
    }
  } finally {
    client.off("error", onError);
    client.release(disconnected);
  }
}
