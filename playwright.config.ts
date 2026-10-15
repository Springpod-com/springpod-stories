import { defineConfig, devices } from "@playwright/test";

import { OUTBOX_DIR } from "./tests/e2e/outbox";

const PORT = 3100;
// Cloud sessions ship a pre-installed Chromium; CI installs its own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

/** The app and the worker share these, so emails from either land in the test outbox. */
const SERVER_ENV = {
  APP_URL: `http://localhost:${PORT}`,
  EMAIL_PROVIDER: "console",
  // Tests read confirm links from here instead of a real inbox.
  EMAIL_OUTBOX_DIR: OUTBOX_DIR,
  SUBMIT_RATE_LIMIT: "1000",
  MEDIA_RATE_LIMIT: "1000",
  // Staff sign the admin tests in with the development sign-in (localhost only).
  ADMIN_DEV_LOGIN: "1",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-not-for-production-use",
  SAFEGUARDING_LEAD_EMAIL: "safeguarding.lead@springpod.com",
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // The 200 MB upload test is opt-in: `pnpm test:upload`.
  grepInvert: process.env.SLOW_TESTS ? undefined : /@slow/,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: "small-phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true },
      grep: /@layout/,
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: `pnpm build && pnpm start -p ${PORT}`,
      env: SERVER_ENV,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    {
      // Checks, converts and transcribes uploads (fake transcripts outside production).
      command: "pnpm worker",
      env: SERVER_ENV,
      wait: { stdout: /Media worker running/ },
      timeout: 60_000,
    },
  ],
});
