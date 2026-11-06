import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: process.env.LIVE ? ["test/**/*.live.ts"] : ["test/**/*.test.ts"],
    testTimeout: process.env.LIVE ? 60_000 : 5_000,
  },
});
