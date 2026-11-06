import { pool } from "../src/lib/server/db";
import { migrations } from "../../db/migrations";

const client = await pool().connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(1874,7071)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  for (const migration of migrations) {
    const existing = await client.query("SELECT version FROM schema_migrations WHERE version=$1", [
      migration.version,
    ]);
    if (!existing.rowCount) {
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [migration.version]);
      console.log(`Applied migration ${migration.version}: ${migration.name}.`);
    }
  }
  console.log("Database is up to date.");
  await client.query("COMMIT");
} catch {
  await client.query("ROLLBACK");
  console.error("Migration failed. Verify database access and the migration source.");
  process.exitCode = 1;
} finally {
  client.release();
  await pool().end();
}
