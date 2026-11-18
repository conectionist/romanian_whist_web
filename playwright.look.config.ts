import { defineConfig, devices } from "@playwright/test";

// Renders the look page, built into dist-look, with no game server: each fixture at its own size.
export default defineConfig({
  testDir: "tests/look",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  use: {
    baseURL: "http://127.0.0.1:4174",
    deviceScaleFactor: 1,
    // The restart banner names a time of day, which is the same wherever the pictures are made.
    timezoneId: "UTC",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 } }],
  webServer: {
    command: "npx vite preview --mode look --outDir dist-look --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174/look.html",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
