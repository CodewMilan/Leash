import { config } from "../config.js";
import { FingerprintSensor } from "../hw/fingerprint.js";
import { gpio } from "../hw/gpio.js";

let sensor: FingerprintSensor | null = null;

/** Opens the sensor at boot so a broken wire shows up immediately, not mid-payment. */
export async function initFingerprint() {
  if (!config.hardware.fingerprintPort) return;
  sensor = await FingerprintSensor.open();
  const enrolled = await sensor.templateCount();
  if (enrolled === 0) throw new Error("No thumb enrolled on the fingerprint sensor; run `pnpm enroll:finger`");
  console.log(`[thumb] fingerprint sensor ready, ${enrolled} enrolled`);
}

/**
 * Local human approval. True only if the sensor matched an enrolled thumb.
 * The cancel button aborts. With APPROVE_FALLBACK=button and no sensor, the approve button stands in (shown as such in logs).
 */
export async function approveWithFingerprint(signal: AbortSignal): Promise<boolean> {
  const local = new AbortController();
  const abort = () => local.abort();
  signal.addEventListener("abort", abort);
  const cancelled = gpio.waitForPress(["cancel"], config.hardware.fingerprintTimeoutMs, local.signal).then((b) => {
    if (b === "cancel") local.abort();
  });
  try {
    if (sensor) {
      const result = await sensor.verify(config.hardware.fingerprintTimeoutMs, local.signal);
      return result.matched && !local.signal.aborted;
    }
    if (process.env.APPROVE_FALLBACK === "button" && gpio.available) {
      console.warn("[thumb] no fingerprint sensor; using the approve button as the local approval");
      const pressed = await gpio.waitForPress(["approve", "cancel"], config.hardware.fingerprintTimeoutMs, local.signal);
      return pressed === "approve";
    }
    throw new Error("No fingerprint sensor configured (FINGERPRINT_PORT), so over-limit payments cannot be approved");
  } finally {
    local.abort();
    signal.removeEventListener("abort", abort);
    await cancelled;
  }
}
