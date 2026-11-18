import { describe, expect, it } from "vitest";
import { checkPage, scriptHoldsCommit } from "../../tools/smoke.mjs";

describe("the smoke tool", () => {
  // Nothing listens at this address: an empty commit is refused before the tool asks for anything.
  const nowhere = "http://127.0.0.1:1";

  it("refuses an empty commit, which would match any page", async () => {
    await expect(checkPage(nowhere, "web", { webCommit: "" })).rejects.toThrow(/--web-commit is empty/);
    await expect(checkPage(nowhere, "web", { webCommit: "  " })).rejects.toThrow(/--web-commit is empty/);
    await expect(checkPage(nowhere, "server", { serverCommit: "" })).rejects.toThrow(/--server-commit is empty/);
  });

  it("finds the commit the page holds, whole and in quotes, and no other", () => {
    const hash = "0123456789abcdef0123456789abcdef01234567";
    const built = `var a=1;const e="${hash}",t="1.0.0";f(e)`;
    expect(scriptHoldsCommit(built, hash)).toBe(true);
    expect(scriptHoldsCommit(built.replaceAll('"', "'"), hash)).toBe(true);
    // A build of a tree with changes holds the hash with -dirty after it, which is not the hash.
    const dirty = `var a=1;const e="${hash}-dirty",t="1.0.0"`;
    expect(scriptHoldsCommit(dirty, hash)).toBe(false);
    expect(scriptHoldsCommit(dirty, `${hash}-dirty`)).toBe(true);
    // Nor a longer or shorter string, nor the hash alone in the text.
    expect(scriptHoldsCommit(`const e="${hash}0"`, hash)).toBe(false);
    expect(scriptHoldsCommit(`const e="${hash.slice(0, 7)}"`, hash)).toBe(false);
    expect(scriptHoldsCommit(`// ${hash}`, hash)).toBe(false);
  });

  it("takes a commit with a character a pattern would read as its own", () => {
    expect(scriptHoldsCommit('const e="a.c"', "a.c")).toBe(true);
    expect(scriptHoldsCommit('const e="abc"', "a.c")).toBe(false);
  });

  it("refuses a profile it does not know", async () => {
    await expect(checkPage(nowhere, "cdn")).rejects.toThrow(/unknown profile "cdn"/);
  });
});
