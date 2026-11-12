import { defineConfig, devices } from "@playwright/test";

const server = process.env.WHIST_SERVER ?? "libs/romanian_whist_server/build/server/app/whist_server";
const origin = "http://127.0.0.1:8090";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  use: {
    baseURL: origin,
    // The tests read the page in English, and a browser that has not chosen a language is asked to
    // before anything else: this one has chosen. A test of the question starts from nothing.
    storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: "whist.language", value: "en" }] }] },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `${server} --config tests/e2e/server.json`,
    url: "http://127.0.0.1:8090/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
