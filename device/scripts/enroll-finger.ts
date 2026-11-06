/** Enrolls the owner's thumb on the fingerprint sensor. Usage: pnpm enroll:finger [slot] */
import { FingerprintSensor } from "../src/hw/fingerprint.js";

const slot = Number(process.argv[2] ?? "1");
const sensor = await FingerprintSensor.open();
console.log(`Sensor ready, ${await sensor.templateCount()} finger(s) enrolled. Enrolling into slot ${slot}.`);
await sensor.enroll(slot, (msg) => console.log(msg));
console.log("Enrolled. Verifying, place the thumb once more...");
const result = await sensor.verify(20_000);
console.log(result.matched ? `Matched slot ${result.pageId} (score ${result.score})` : "No match, enroll again");
await sensor.close();
