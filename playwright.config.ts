import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local secrets (app env, E2E_PORT) come from the gitignored .env file.
// In CI the file is absent and the variables come from the job.
if (existsSync(".env")) process.loadEnvFile(".env");

// 4321 is the Astro preview default (astro preview, no port set in astro.config.mjs).
// E2E_PORT overrides it when that port is taken on this machine (local `astro dev`).
// Number("") is 0 and Number(undefined) is NaN: both fall back to 4321 (an empty E2E_PORT= line is common).
const requestedPort = Number(process.env.E2E_PORT);
const PORT = requestedPort > 0 ? requestedPort : 4321;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Production-like build + preview (Cloudflare adapter, reads .dev.vars), on the port above.
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Astro 7 moves `astro preview` into a background daemon when it detects an AI agent;
    // keep it in the foreground so Playwright owns the process.
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
  },
});
