import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
// The scaled table as a phone gets it, one folder for each size and language. Paired with the Android
// mock-up's own pictures of the same screens by tools/pair_scaled.py.
const OUT = join(ROOT, "build/shots/scaled");
const OUT_RO = join(ROOT, "build/shots/scaled-ro");

const SIZES = [
  [640, 360],
  [915, 412],
  [832, 384],
] as const;

const SHOTS = ["table-2-players", "table-3-players", "table-4-players", "table-5-players", "table-6-players", "bidding", "hand-1-card", "hand-4-cards", "hand-8-cards"];

for (const [width, height] of SIZES) {
  test.describe(`the scaled table at ${width} by ${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    for (const [language, out] of [
      ["en", OUT],
      ["ro", OUT_RO],
    ] as const) {
      for (const name of SHOTS) {
        test(`renders ${name} in ${language === "en" ? "English" : "Romanian"}`, async ({ page }) => {
          const problems: string[] = [];
          page.on("pageerror", (error) => problems.push(error.message));
          const folder = join(out, `${width}x${height}`);
          mkdirSync(folder, { recursive: true });
          await page.goto(`/look.html?shot=${name}&lang=${language}`);
          await page.waitForSelector("body[data-ready]");
          await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
          await page.screenshot({ path: join(folder, `${name}.png`), animations: "disabled" });
          expect(problems).toEqual([]);
        });
      }
    }
  });
}

test.describe("the scaled table's words fit their plates, in both languages", () => {
  test.use({ viewport: { width: 640, height: 360 }, hasTouch: true, isMobile: true });

  for (const language of ["en", "ro"]) {
    for (const name of ["table-6-players", "bidding"]) {
      test(`${name} in ${language}: no pill, name or chip is cut off`, async ({ page }) => {
        await page.goto(`/look.html?shot=${name}&lang=${language}`);
        await page.waitForSelector("body[data-ready]");
        const cut = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>(".stage .pill, .stage .name-text, .stage .round-chip .l1, .stage .round-chip .l2"))
            .filter((node) => !node.closest("[hidden]") && node.scrollWidth > node.clientWidth + 0.5)
            .map((node) => `${node.className}: ${node.textContent}`),
        );
        expect(cut).toEqual([]);
      });
    }
  }
});
