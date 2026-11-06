import { Agent } from "./agent.js";
import { pingBrain, verifyBrainAccess } from "./brain/zg.js";
import { config } from "./config.js";
import { loadContacts } from "./contacts.js";
import { initFingerprint } from "./approve/thumb.js";
import { gpio } from "./hw/gpio.js";
import { say, scanCode, startRecording, transcribe } from "./hw/media.js";
import { startServer } from "./server.js";
import { state } from "./state.js";

const agent = new Agent();

await state.loadHistory();
const contacts = await loadContacts();
console.log(`[leash] ${contacts.length} contacts, limit ${config.spendLimitUsdc} USDC, account ${config.hedera.accountId}`);
if (!config.hedera.spendLogTopicId) {
  throw new Error("HEDERA_SPEND_LOG_TOPIC_ID is not set, so payments could not be logged. Run `pnpm setup:hedera` first.");
}

if (config.hardware.enabled) {
  await gpio.start();
  await initFingerprint();
}

function idle() {
  state.setScreen({ phase: "idle", headline: state.screen.brainOnline ? "Hold the button and speak" : "Brain offline", detail: state.screen.brainOnline ? undefined : "I can talk, but I won't pay until 0G is back" });
  gpio.light(state.screen.brainOnline ? "off" : "red");
}

function runEpisode(heard: string, saw: string | null) {
  agent
    .run({ heard, saw })
    .then(() => setTimeout(() => !agent.busy() && idle(), 12_000))
    .catch((err) => console.error("[leash] episode crashed", err));
}

// The 0G heartbeat only drives the status light. Every payment still needs its own live 0G decision.
async function heartbeat() {
  const online = await pingBrain();
  const changed = online !== state.screen.brainOnline;
  state.setBrainOnline(online);
  if (changed && !agent.busy()) idle();
}
const access = await verifyBrainAccess();
if (!access.ok) console.warn(`0G brain offline at boot (${access.detail}); safe mode until it answers`);
state.setBrainOnline(access.ok);
setInterval(heartbeat, 15_000);

startServer({
  ask: ({ text, qr }) => runEpisode(text, qr ?? null),
  cancel: () => agent.cancel(),
  busy: () => agent.busy(),
});

if (gpio.available) {
  let recording: Awaited<ReturnType<typeof startRecording>> | null = null;

  gpio.on("press", async (button) => {
    if (button === "cancel") {
      if (agent.busy()) agent.cancel();
      return;
    }
    if (button !== "talk" || agent.busy() || recording) return;
    state.setScreen({ phase: "listening", headline: "Listening", light: "blue" });
    gpio.light("blue");
    recording = await startRecording();
  });

  gpio.on("release", async (button) => {
    if (button !== "talk" || !recording) return;
    const current = recording;
    recording = null;
    try {
      const wav = await current.stop();
      state.setScreen({ phase: "transcribing", headline: "Got it", detail: "Reading the camera too" });
      const [heard, saw] = await Promise.all([transcribe(wav), scanCode().catch(() => null)]);
      if (!heard) {
        say("I didn't catch that.");
        idle();
        return;
      }
      runEpisode(heard, saw);
    } catch (err) {
      console.error("[leash] capture failed", err);
      state.setScreen({ phase: "error", headline: "Mic or camera failed", detail: err instanceof Error ? err.message : String(err), light: "red" });
    } finally {
      await current.cleanup();
    }
  });
}

idle();
console.log("[leash] ready");
