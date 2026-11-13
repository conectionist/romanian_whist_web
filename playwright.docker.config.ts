import { defineConfig, devices } from "@playwright/test";

// The page as deployed, in a stack that is already running at WHIST_URL.
const baseURL = process.env.WHIST_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  testDir: "tests/docker",
  forbidOnly: true,
  use: {
    baseURL,
    // The page asks a browser that has not chosen a language to choose one; this one has chosen.
    storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "whist.language", value: "en" }] }] },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
