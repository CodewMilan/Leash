import { test, expect, type Page } from "@playwright/test";
import { createCipheriv, createHash } from "node:crypto";
const address = `0x${"11".repeat(20)}`;
const giftId = `0x${"22".repeat(32)}`;
const secret = `0x${"33".repeat(32)}`;
const note = "A little love for you. Make a wish!";
const noteIv = Buffer.alloc(12, 7);
const noteKey = createHash("sha256")
  .update(Buffer.concat([Buffer.from("shagun-message:"), Buffer.from(secret.slice(2), "hex")]))
  .digest();
const noteCipher = createCipheriv("aes-256-gcm", noteKey, noteIv);
const noteBody = Buffer.concat([
  noteCipher.update(note, "utf8"),
  noteCipher.final(),
  noteCipher.getAuthTag(),
]);
const sealedNote = `v1.${noteIv.toString("base64url")}.${noteBody.toString("base64url")}`;
const gift = () => ({
  id: giftId,
  label: "Birthday test gift",
  amount: "51500000",
  expiry: Math.floor(Date.now() / 1000) + 86400,
  status: "sent",
  campaign: false,
  createdAt: new Date().toISOString(),
  createdTx: `0x${"44".repeat(32)}`,
  claimTx: null,
  settlementTx: null,
  refundTx: null,
  payoutId: null,
  payoutStatus: null,
  paise: "0",
  canViewReceipt: true,
  claimPending: false,
  error: null,
  design: "birthday",
  sealedMessage: null,
});
const card = () => ({
  giftId,
  status: "ready",
  lastFour: "4242",
  expMonth: "12",
  expYear: "2030",
  network: "Mastercard",
  budgetCents: 5150,
  reservedCents: 300,
  clearedCents: 800,
  availableCents: 4050,
  error: null,
  settlementPending: false,
});
async function fixture(
  page: Page,
  options: {
    history?: boolean;
    key?: boolean;
    claim?: boolean;
    note?: boolean;
    authError?: boolean;
  } = {},
) {
  let funded = true;
  let cardStatus = "ready";
  let currentGift = gift();
  let giftPosts = 0;
  await page.addInitScript(
    ({ address, giftId, secret, keepKey }) => {
      if (keepKey) sessionStorage.setItem(`shagun-envelope:${giftId}`, secret);
      const provider = {
        isMetaMask: true,
        request: async ({ method }: { method: string }) => {
          if (method === "eth_chainId") return "0x752";
          if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
          if (method === "eth_signTypedData_v4" || method === "personal_sign")
            return `0x${"11".repeat(65)}`;
          return null;
        },
        on: () => {},
        removeListener: () => {},
      };
      Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
    },
    { address, giftId, secret, keepKey: !!options.key },
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/", "");
    let body: unknown = {};
    let status = 200;
    if (path === "status")
      body = {
        ready: true,
        chainId: 1874,
        rate: "84",
        testMode: true,
        services: ["Sender sign-in", "Gift storage", "Whitechain", "Virtual cards"].map((name) => ({
          name,
          ready: true,
          detail: name,
        })),
      };
    else if (path === "session") body = { sender: address, passkey: false };
    else if (path === "balance") body = { balance: "100000000" };
    else if (path === "gift-config") body = { vault: `0x${"55".repeat(20)}`, chainId: 1874 };
    else if (path === "gifts" && route.request().method() === "POST") {
      giftPosts++;
      const payload = route.request().postDataJSON();
      expect(payload.terms.amount).toBe("51500000");
      currentGift = {
        ...gift(),
        id: giftId,
        status: "pending",
        createdTx: null as unknown as string,
      };
      funded = false;
      body = currentGift;
      status = 202;
      // Use the app-generated secret for the fixture gift, preserving the real link-generation path.
      await page.evaluate((id) => {
        const key = Object.keys(sessionStorage).find((key) => key.startsWith("shagun-envelope:"));
        if (key) sessionStorage.setItem(`shagun-envelope:${id}`, sessionStorage.getItem(key)!);
      }, giftId);
    } else if (path === "gifts")
      body = {
        gifts:
          options.history || giftPosts
            ? [
                funded
                  ? { ...currentGift, status: "sent", createdTx: gift().createdTx }
                  : currentGift,
              ]
            : [],
      };
    else if (path === `gifts/${giftId}`)
      body = options.claim
        ? { ...gift(), status: "claimed", claimTx: gift().createdTx }
        : { ...currentGift, sealedMessage: options.note ? sealedNote : null };
    else if (path === "auth/passkey/options" && options.authError) {
      body = { error: "Passkey service is temporarily unavailable. Please try again." };
      status = 503;
    } else if (path === `gifts/${giftId}/card`)
      body = {
        card: {
          ...card(),
          status: cardStatus,
          ...(cardStatus === "preparing" ? { lastFour: null, expMonth: null, expYear: null } : {}),
        },
      };
    else if (path === `gifts/${giftId}/card/embed`) {
      body = { error: "Card provider is temporarily unavailable. Try again." };
      status = 503;
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return {
    fund: () => {
      funded = true;
    },
    setCard: (value: string) => {
      cardStatus = value;
    },
    posts: () => giftPosts,
  };
}

test("guided review preserves entries and exposes sharing only after confirmation", async ({
  page,
}) => {
  const flow = await fixture(page);
  await page.goto("/dashboard");
  await page.getByLabel("GIFT AMOUNT · USDT", { exact: true }).fill("51.50");
  await page.getByRole("radio", { name: "Birthday", exact: true }).click();
  await page
    .getByLabel("A NOTE FOR THEM · OPTIONAL", { exact: true })
    .fill("A little love for you.");
  await page.getByRole("button", { name: "Review gift", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review your gift", exact: false })).toBeFocused();
  await expect(page.getByText("A little love for you.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit gift", exact: false }).click();
  await expect(page.getByLabel("GIFT AMOUNT · USDT", { exact: true })).toHaveValue("51.50");
  await page.getByRole("button", { name: "Review gift", exact: true }).click();
  await page.screenshot({ path: "test-results/ux-review-desktop.png", fullPage: true });
  await page.getByRole("button", { name: /Approve in / }).click();
  await expect(page.getByRole("heading", { name: "Confirming your gift" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy claim link", exact: true })).toHaveCount(0);
  flow.fund();
  await page.getByRole("button", { name: "Refresh gifts", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy claim link", exact: true })).toBeVisible();
  const link = page.getByLabel("PRIVATE CLAIM LINK", { exact: true });
  await expect(link).toHaveValue(new RegExp(`/claim/${giftId}#0x[a-f0-9]{64}$`));
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copy claim link", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Automatic copy" })).toBeVisible();
  await expect(link).toBeFocused();
  expect(flow.posts()).toBe(1);
});

test("history distinguishes a missing private link from its receipt", async ({ page }) => {
  await fixture(page, { history: true });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Share gift", exact: true }).click();
  await expect(page.getByText("Claim link unavailable in this tab", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy claim link", exact: true })).toHaveCount(0);
  await page.goto(`/gifts/${giftId}`);
  await expect(
    page.getByText("This is a receipt, not a claim link.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Waiting for recipient", { exact: true })).toBeVisible();
  await expect(page.getByText(/private gift link accepted/)).toHaveCount(0);
});

test("ready card fits mobile and polling does not erase secure-detail errors", async ({ page }) => {
  const flow = await fixture(page, { claim: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/claim/${giftId}`);
  const region = page.getByRole("region", { name: "Your Shagun prepaid gift card" });
  await expect(region).toHaveAttribute("data-card-state", "ready");
  await expect(page.locator("main > :first-child")).toHaveAttribute(
    "aria-label",
    "Your Shagun prepaid gift card",
  );
  await expect(region.getByText("Mastercard ending in 4242", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(region.getByText("Gift budget", { exact: true })).toBeHidden();
  await region.getByText("Budget and activity", { exact: false }).click();
  await expect(region.getByText("Gift budget", { exact: true })).toBeVisible();
  await region.getByText("Budget and activity", { exact: false }).click();
  await page.screenshot({ path: "test-results/ux-card-mobile.png", fullPage: true });
  const desktop = await page.context().newPage();
  await desktop.setViewportSize({ width: 1280, height: 900 });
  await fixture(desktop, { claim: true });
  await desktop.goto(`/claim/${giftId}`);
  await expect(
    desktop.getByRole("region", { name: "Your Shagun prepaid gift card" }),
  ).toHaveAttribute("data-card-state", "ready");
  await desktop.screenshot({
    path: "test-results/ux-card-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await desktop.close();
  await region.getByRole("button", { name: "Open secure card details" }).click();
  await expect(
    region.getByRole("alert").filter({ hasText: "Card provider is temporarily unavailable" }),
  ).toBeVisible();
  await region.getByRole("button", { name: "Refresh card status", exact: true }).click();
  await expect(
    region.getByRole("alert").filter({ hasText: "Card provider is temporarily unavailable" }),
  ).toBeVisible();
  flow.setCard("reconciliation");
  await region.getByRole("button", { name: "Refresh card status", exact: true }).click();
  await expect(region).toHaveAttribute("data-card-state", "reconciliation");
  await expect(region.getByRole("link", { name: /sandbox shop/ })).toHaveCount(0);
});

test("recipient sees their design and private note before the passkey step", async ({ page }) => {
  await fixture(page, { note: true, authError: true });
  await page.goto(`/claim/${giftId}#${secret}`);
  await expect(page.getByRole("blockquote")).toContainText(note);
  await expect(page.getByRole("button", { name: /Connect/ })).toHaveCount(0);
  await expect(page.locator(".claim-art .tone-pink")).toBeVisible();
  await expect(page.getByRole("button", { name: "Claim gift", exact: true })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Claim progress" })).toBeVisible();
  await page.screenshot({ path: "test-results/recipient-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/recipient-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Create a passkey", exact: true }).dblclick();
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Passkey service is temporarily unavailable" });
  await expect(alert).toBeFocused();
  // A successful background gift refresh must not dismiss an unresolved action error.
  await page.waitForResponse((response) => response.url().endsWith(`/api/gifts/${giftId}`));
  await expect(alert).toBeVisible();
  await expect(page.getByRole("button", { name: "Create a passkey", exact: true })).toBeEnabled();
});

test("incomplete recipient links explain recovery before offering authentication", async ({
  page,
}) => {
  await fixture(page, { note: true });
  await page.goto(`/claim/${giftId}`);
  await expect(
    page.getByRole("heading", { name: "Ask for the complete gift link." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create a passkey", exact: true })).toHaveCount(0);
  await expect(page.getByRole("blockquote")).toHaveCount(0);
  await page.evaluate((secret) => {
    window.location.hash = secret;
  }, secret);
  await expect(page.getByRole("button", { name: "Create a passkey", exact: true })).toBeVisible();
  await expect(page.getByRole("blockquote")).toContainText(note);
});
