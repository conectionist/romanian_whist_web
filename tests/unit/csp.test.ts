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
});
