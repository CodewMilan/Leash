import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, timeout: 40_000,
  use: { baseURL: "http://localhost:3100", headless: true, trace: "retain-on-failure", screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined } },
  reporter: process.env.CI ? "github" : "list",
  webServer: { command: "node scripts/dev-e2e.mjs", url: "http://localhost:3100/api/health", reuseExistingServer: false, timeout: 180_000 },
});
