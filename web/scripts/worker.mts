import { pool } from "../src/lib/server/db";
import { workerTick } from "../src/lib/server/chain/worker";
import { appStatus, required } from "../src/lib/server/config";

required("DATABASE_URL"); required("DATA_ENCRYPTION_KEY"); required("RELAYER_PRIVATE_KEY"); required("ATTESTER_PRIVATE_KEY");
if (!appStatus().services.find((s) => s.name === "Whitechain")?.ready) throw new Error("Configure Whitechain before starting the worker.");
let stopping = false;
let wake: (() => void) | undefined;
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { stopping = true; wake?.(); });
console.log("Shagun worker started. Waiting for gift jobs.");
while (!stopping) {
  try {
    const result = await workerTick();
    if (result?.processed) console.log(JSON.stringify({ event: "worker.tick", ...result }));
  } catch (error) {
    // Raw exceptions can contain RPC credentials or signed claims. Log only a safe type.
    console.error(JSON.stringify({ event: "worker.tick_failed", type: error instanceof Error ? error.name : "UnknownError" }));
  }
  if (!stopping) await new Promise<void>((resolve) => { const timer = setTimeout(resolve, 8_000); wake = () => { clearTimeout(timer); resolve(); }; });
}
await pool().end();
console.log("Shagun worker stopped.");
