import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PAGE_CSP, cspCopies } from "../../tools/smoke.mjs";

describe("the content-security-policy", () => {
  test("every file that sends it sends the page's", () => {
    for (const { file, csp } of cspCopies()) {
      expect(csp, file).toBe(PAGE_CSP);
    }
  });

  test("it allows the page's own origin only, and no inline script or style", () => {
    expect(PAGE_CSP).not.toMatch(/unsafe|data:|https?:/);
    expect(PAGE_CSP).toContain("script-src 'self'");
  });

  test("it lets through the manifest and the icons, which are the page's own files: no manifest-src narrows default-src, and img-src is its own", () => {
    expect(PAGE_CSP).toContain("default-src 'self'");
    expect(PAGE_CSP).not.toMatch(/manifest-src/);
    expect(PAGE_CSP).toContain("img-src 'self'");
    const manifest = JSON.parse(readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8")) as { icons: { src: string }[]; start_url: string };
    for (const { src } of manifest.icons) {
      expect(src, "an icon of the page's own origin").toMatch(/^\/[^/]/);
    }
    expect(manifest.start_url).toBe("/");
  });
});
