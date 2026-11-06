/** Bench test without the mic: pnpm ask "pay the photographer 20 dollars" [--qr "<text>"] */
const args = process.argv.slice(2);
const qrIndex = args.indexOf("--qr");
const qr = qrIndex >= 0 ? args.splice(qrIndex, 2)[1] : null;
const text = args.join(" ").trim();
if (!text) {
  console.error('Usage: pnpm ask "pay the photographer 20 dollars" [--qr "<text>"]');
  process.exit(1);
}
const port = process.env.DEVICE_PORT ?? "7070";
const res = await fetch(`http://127.0.0.1:${port}/local/ask`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ text, qr }),
});
console.log(res.status, await res.text());
console.log(`Watch it on http://localhost:${port}/screen`);
