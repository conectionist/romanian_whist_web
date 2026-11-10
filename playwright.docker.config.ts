import { defineConfig, devices } from "@playwright/test";

// The page as deployed, in a stack that is already running at WHIST_URL.
export default defineConfig({
  testDir: "tests/docker",
  forbidOnly: true,
  use: {
    baseURL: process.env.WHIST_URL ?? "http://127.0.0.1:8000",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
