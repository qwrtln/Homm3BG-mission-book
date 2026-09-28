// Playwright configuration for the tier-2 integration suite. Chromium only,
// headless by default, backed by the repository's own dependency-free static
// server (driver/serve.mjs -> driver/static-server.mjs) rather than any
// Playwright-managed web server implementation.

import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT || 8322;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./integration",
  testMatch: "**/*.test.mjs",
  timeout: 120000,
  // Each test gets its own context and page, so tests in one file are
  // independent and may run together.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // On CI: "list" for the job log, "github" for inline annotations on the diff,
  // and an html report uploaded as an artifact, so a red run is diagnosable
  // without a rerun.
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node driver/serve.mjs",
    url: `${BASE_URL}/web/app/`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
});
