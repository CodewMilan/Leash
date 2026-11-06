/** Pins the owner's World ID: runs one device-flow check and prints the `sub` to put in WORLD_OWNER_SUB. */
import QRCode from "qrcode";
import { startWorldCheck } from "../src/approve/world.js";

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());

const check = await startWorldCheck(null, controller.signal, { requireOwner: false });
console.log(await QRCode.toString(check.url, { type: "terminal", small: true }));
console.log(`Open ${check.url} on your phone (code ${check.userCode}), then approve in World App.`);
const result = await check.result;
if (!result.verified || !result.sub) {
  console.error(`Not verified: ${result.reason}`);
  process.exit(1);
}
console.log(`Verified (acr=${result.acr}, amr=${JSON.stringify(result.amr)}).`);
console.log(`Add this to the device .env:  WORLD_OWNER_SUB=${result.sub}`);
