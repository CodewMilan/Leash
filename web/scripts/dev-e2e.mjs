import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const database = process.env.E2E_DATABASE_URL;
if (!database || !["localhost", "127.0.0.1"].includes(new URL(database).hostname)) throw new Error("E2E_DATABASE_URL must target a disposable local PostgreSQL database.");
const env = { ...process.env, DATABASE_URL: database, DATA_ENCRYPTION_KEY: randomBytes(32).toString("hex"), APP_URL: "http://localhost:3100", NEXT_PUBLIC_PRIVY_APP_ID: "", SHAGUN_BUILD_DIR: ".next-e2e" };
for (const name of ["RELAYER_PRIVATE_KEY", "ATTESTER_PRIVATE_KEY", "VAULT_ADDRESS", "WORLD_APP_ID", "WORLD_RP_ID", "WORLD_SIGNING_KEY", "RAZORPAYX_KEY_ID", "RAZORPAYX_KEY_SECRET", "RAZORPAYX_ACCOUNT_NUMBER", "RAZORPAYX_WEBHOOK_SECRET"]) delete env[name];
const nextEnvPath = new URL("../next-env.d.ts", import.meta.url);
const nextEnv = readFileSync(nextEnvPath, "utf8");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "3100", "--hostname", "localhost"], { env, stdio: "inherit" });
const restore = () => writeFileSync(nextEnvPath, nextEnv);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => { restore(); process.exit(code || 0); });
