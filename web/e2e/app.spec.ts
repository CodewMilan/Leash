import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";

let db: Pool;
test.beforeAll(async () => {
  const url = process.env.E2E_DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Use a disposable local E2E database.");
  db = new Pool({ connectionString: url });
});
test.afterAll(async () => {
  await db.end();
});
async function seed(status = "sent", expired = false) {
  const id = `0x${randomBytes(32).toString("hex")}`,
    secret = `0x${randomBytes(32).toString("hex")}`;
  const { keccak256, ZeroHash } = await import("ethers");
  await db.query(
    `INSERT INTO gifts(id,sender,label,amount,expiry,secret_hash,campaign_id,terms,status,rate,paise)
    VALUES($1,$2,'E2E fixture only',25000000,$3,$4,$5,'{}',$6,'84.00',210000)`,
    [
      id,
      `0x${"11".repeat(20)}`,
      Math.floor(Date.now() / 1000) + (expired ? -60 : 3600),
      keccak256(secret),
      ZeroHash,
      status,
    ],
  );
  return { id, secret };
}
test("dashboard is usable at phone and desktop widths without invented gifts", async ({ page }) => {
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "A little goes a long way." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review gift", exact: true })).toBeVisible();
    await expect(page.getByText("Recipient cards run in sandbox", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "$51", exact: true }).click();
    await expect(page.getByLabel("GIFT AMOUNT · USDT")).toHaveValue("51");
    await page.getByRole("radio", { name: "Birthday" }).click();
    await expect(page.getByRole("radio", { name: "Birthday" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: "test-results/dashboard-desktop.png", fullPage: true });
});
test("a real browser passkey is verified server-side and its assertion cannot be replayed", async ({
  page,
  context,
}) => {
  const gift = await seed();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/claim/${gift.id}#${gift.secret}`);
  await expect(page.getByRole("heading", { name: "A little something for you." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claim gift" })).toHaveCount(0);
  const verified = page.waitForResponse((r) => r.url().endsWith("/api/auth/passkey/verify"));
  await page.getByRole("button", { name: "Create a passkey" }).click();
  const result = await verified;
  expect(result.status()).toBe(200);
  await expect(page.getByText("Passkey confirmed", { exact: true })).toBeVisible();
  const replay = await page.request.post("/api/auth/passkey/verify", {
    headers: { origin: "http://localhost:3100" },
    data: result.request().postDataJSON(),
  });
  expect(replay.status()).toBe(409);
  await expect(page.getByLabel("YOUR UPI ID", { exact: true })).toHaveCount(0);
  const claiming = page.waitForResponse((r) => r.url().endsWith(`/api/gifts/${gift.id}/claim`));
  await page.getByRole("button", { name: "Claim gift" }).click();
  expect((await claiming).status()).toBe(202);
  await expect(page.getByRole("heading", { name: "Confirming your claim" })).toBeVisible();
  const [claimRow] = (
    await db.query("SELECT redemption,claim_session FROM gifts WHERE id=$1", [gift.id])
  ).rows;
  expect(claimRow.redemption).toBe("card");
  expect(claimRow.claim_session).toBeTruthy();
  expect((await db.query("SELECT gift_id FROM payouts WHERE gift_id=$1", [gift.id])).rowCount).toBe(
    0,
  );
  await expect(page.getByText("Test payout complete", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/claim-phone.png", fullPage: true });
});
test("consumed and expired envelopes show denied states", async ({ page }) => {
  const consumed = await seed("claimed");
  await page.goto(`/claim/${consumed.id}#${consumed.secret}`);
  await expect(
    page.getByText("This envelope has already been claimed.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Claim gift" })).toHaveCount(0);
  const expired = await seed("sent", true);
  await page.goto(`/claim/${expired.id}#${expired.secret}`);
  await expect(page.getByRole("heading", { name: "This envelope has expired." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claim gift" })).toHaveCount(0);
});

test("Leash Gifts entry redirects to Shagun and shared issuance is retired", async ({ page }) => {
  await page.goto("/gifts");
  await expect(page).toHaveURL("http://localhost:3100/dashboard");
  expect((await page.request.post("/api/sandbox/card")).status()).toBe(410);
  expect((await page.request.post("/api/sandbox/session", { data: {} })).status()).toBe(410);
});
