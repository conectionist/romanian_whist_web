import { describe, expect, it } from "vitest";
import { checkPage } from "../../tools/smoke.mjs";

describe("the smoke tool", () => {
  // Nothing listens at this address: an empty commit is refused before the tool asks for anything.
  const nowhere = "http://127.0.0.1:1";

  it("refuses an empty commit, which would match any page", async () => {
    await expect(checkPage(nowhere, "web", { webCommit: "" })).rejects.toThrow(/--web-commit is empty/);
    await expect(checkPage(nowhere, "web", { webCommit: "  " })).rejects.toThrow(/--web-commit is empty/);
    await expect(checkPage(nowhere, "server", { serverCommit: "" })).rejects.toThrow(/--server-commit is empty/);
  });

  it("refuses a profile it does not know", async () => {
    await expect(checkPage(nowhere, "cdn")).rejects.toThrow(/unknown profile "cdn"/);
  });
});
