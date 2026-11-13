import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
// The sheets and pages on the scaled table, one folder for each size and language.
const OUT = join(ROOT, "build/shots/sheets");

type Placement = "side" | "bottom" | "page";

// Every sheet and page, where the scaled table puts it. The pause menu is the list on the scaled table, and
// the online game's is the same list with its own words.
const SHEETS: readonly (readonly [string, Placement])[] = [
  ["sheet-round", "bottom"],
  ["sheet-game-over", "bottom"],
  ["sheet-settings", "bottom"],
  ["sheet-rules", "bottom"],
  ["sheet-pause", "bottom"],
  ["sheet-menu-online", "bottom"],
  ["sheet-history", "side"],
  ["sheet-last-trick", "side"],
  ["sheet-scores", "side"],
  ["sheet-new-game", "page"],
  ["sheet-online", "page"],
  ["sheet-create-table", "page"],
  ["sheet-lobby", "page"],
];

const SIZES = [
  [832, 384],
  [754, 247],
] as const;

const LANGUAGES = [
  ["en", ""],
  ["ro", "-ro"],
] as const;

const READY = "body[data-ready]";
const CONTROLS = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [role="tab"]';

async function open(page: Page, name: string, language: string): Promise<void> {
  await page.goto(`/look.html?shot=${name}&lang=${language}`);
  await page.waitForSelector(READY);
  await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
}

// The controls that can be touched: the ones that take room, in the sheet that is open.
async function touchable(page: Page, within: string) {
  const all = await page.locator(`${within} :is(${CONTROLS})`).all();
  const found = [];
  for (const control of all) {
    if ((await control.boundingBox()) !== null && (await control.isVisible())) {
      found.push(control);
    }
  }
  return found;
}

// What a finger lands on at the middle of a control: the control itself, or the label it is in.
const landsOn = (control: ReturnType<Page["locator"]>) =>
  control.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && (node.contains(hit) || hit.contains(node));
  });

for (const [width, height] of SIZES) {
  test.describe(`the sheets and pages at ${width} by ${height} under a finger`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    for (const [language, suffix] of LANGUAGES) {
      for (const [name, placement] of SHEETS) {
        test(`${name} in ${language} is a ${placement === "page" ? "page" : `${placement} sheet`}, inside the window, with every control in reach`, async ({ page }) => {
          const problems: string[] = [];
          page.on("pageerror", (error) => problems.push(error.message));
          await open(page, name, language);
          const folder = join(OUT, `${width}x${height}${suffix}`);
          mkdirSync(folder, { recursive: true });
          const sheet = page.locator(".sheet:not([hidden])");
          await expect(sheet).toHaveCount(1);
          await expect(sheet).toHaveAttribute("data-placement", placement);
          // A sheet opens at its top.
          expect(await sheet.evaluate((node) => node.scrollTop)).toBe(0);
          await page.screenshot({ path: join(folder, `${name}.png`), animations: "disabled" });

          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          const box = (await sheet.boundingBox())!;
          expect(box.x, "left").toBeGreaterThanOrEqual(-0.5);
          expect(box.x + box.width, "right").toBeLessThanOrEqual(width + 0.5);
          expect(box.y, "top").toBeGreaterThanOrEqual(-0.5);
          expect(box.y + box.height, "bottom").toBeLessThanOrEqual(height + 0.5);
          if (placement === "bottom") {
            // Risen from the foot of the window, in the middle of it.
            expect(box.y + box.height).toBeCloseTo(height, 0);
            expect(box.x + box.width / 2).toBeCloseTo(width / 2, 0);
          } else if (placement === "side") {
            // At the right, the whole height, no more than 0.46 of the window: the table stays in view.
            expect(box.x + box.width).toBeCloseTo(width, 0);
            expect(box.y).toBeCloseTo(0, 0);
            expect(box.height).toBeCloseTo(height, 0);
            expect(box.width).toBeLessThanOrEqual(width * 0.46 + 1);
          } else {
            expect(box.width).toBeCloseTo(width, 0);
            expect(box.height).toBeCloseTo(height, 0);
          }

          const controls = await touchable(page, ".sheet:not([hidden])");
          expect(controls.length, "controls").toBeGreaterThan(0);
          for (const control of controls) {
            // Scrolled to the middle of the sheet, where nothing pinned is over it, or as near as the end allows.
            await control.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
            const label = ((await control.textContent()) || (await control.getAttribute("aria-label")) || (await control.getAttribute("type")) || "").trim();
            const at = (await control.boundingBox())!;
            expect(at.x, `${label} left`).toBeGreaterThanOrEqual(box.x - 0.5);
            expect(at.x + at.width, `${label} right`).toBeLessThanOrEqual(box.x + box.width + 0.5);
            expect(at.y, `${label} top`).toBeGreaterThanOrEqual(-0.5);
            expect(at.y + at.height, `${label} bottom`).toBeLessThanOrEqual(height + 0.5);
            // Nothing pinned over it: not the actions at the foot, nor a page's bar at the top.
            expect(await landsOn(control), `${label} is under something`).toBe(true);
          }
          expect(problems).toEqual([]);
        });
      }
    }

    test("a bottom sheet keeps its actions at its foot while its body scrolls under them, and a page keeps its bar at the top", async ({ page }) => {
      await open(page, "sheet-rules", "en");
      const sheet = page.locator(".sheet:not([hidden])");
      expect(await sheet.evaluate((node) => node.scrollHeight > node.clientHeight), "the rules are longer than the sheet").toBe(true);
      const foot = async () => sheet.evaluate((node) => node.querySelector(".sheet-actions")!.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom);
      expect(await foot()).toBeCloseTo(0, 0);
      await sheet.evaluate((node) => node.scrollTo(0, node.scrollHeight));
      expect(await sheet.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      expect(await foot()).toBeCloseTo(0, 0);

      await open(page, "sheet-create-table", "en");
      const bar = async () => sheet.evaluate((node) => node.querySelector(".page-bar")!.getBoundingClientRect().top);
      expect(await bar()).toBeCloseTo(0, 0);
      await sheet.evaluate((node) => node.scrollTo(0, node.scrollHeight));
      expect(await bar()).toBeCloseTo(0, 0);
      // The bar has Back, the title and the page's one action.
      const inBar = await sheet.locator(".page-bar").evaluate((node) => Array.from(node.children, (child) => child.className.split(" ")[0] || child.tagName));
      expect(inBar).toHaveLength(3);
      expect(inBar[0]).toBe("page-back");
      expect(inBar[1]).toBe("sheet-title");
      await expect(sheet.locator('.page-bar [data-action="create"]')).toHaveCount(1);
    });

    test("the table under a sheet takes no touch: the dim over it catches it", async ({ page }) => {
      for (const name of ["sheet-history", "sheet-rules"]) {
        await open(page, name, "en");
        const covered = await page.evaluate(() => {
          const hit = document.elementFromPoint(6, window.innerHeight / 2);
          return hit !== null && hit.closest(".sheet-layer") !== null && hit.closest(".sheet") === null;
        });
        expect(covered, name).toBe(true);
      }
    });

    for (const [language, suffix] of LANGUAGES) {
      test(`the scoreboard's three tabs in ${language} each show their own panel and fit the side sheet`, async ({ page }) => {
        await open(page, "sheet-scores", language);
        const folder = join(OUT, `${width}x${height}${suffix}`);
        mkdirSync(folder, { recursive: true });
        const sheet = page.locator(".sheet:not([hidden])");
        const tabs = sheet.locator('[role="tab"]');
        await expect(tabs).toHaveCount(3);
        await expect(sheet.locator('[role="tablist"]')).toHaveCount(1);
        await expect(sheet.locator('[role="tabpanel"]:not([hidden])')).toHaveCount(1);
        for (const [index, shot] of ["sheet-scores", "sheet-scores-history", "sheet-scores-last-trick"].entries()) {
          await tabs.nth(index).tap();
          await expect(tabs.nth(index)).toHaveAttribute("aria-selected", "true");
          await expect(sheet.locator('[role="tabpanel"]:not([hidden])')).toHaveCount(1);
          await expect(sheet.locator('[role="tabpanel"]:not([hidden])')).toHaveAttribute("id", (await tabs.nth(index).getAttribute("aria-controls"))!);
          const panel = (await sheet.locator('[role="tabpanel"]:not([hidden])').boundingBox())!;
          const box = (await sheet.boundingBox())!;
          expect(panel.x + panel.width, shot).toBeLessThanOrEqual(box.x + box.width + 0.5);
          expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth), `${shot} fits across`).toBe(true);
          await page.screenshot({ path: join(folder, `${shot}.png`), animations: "disabled" });
        }
      });
    }

    for (const [language, suffix] of LANGUAGES) {
      test(`the main menu in ${language} has the logo beside its buttons, Settings, Rules and the language, all inside the window`, async ({ page }) => {
        await page.goto(`/look.html?shot=menu&lang=${language}`);
        await page.waitForSelector(READY);
        const folder = join(OUT, `${width}x${height}${suffix}`);
        mkdirSync(folder, { recursive: true });
        await page.screenshot({ path: join(folder, "menu.png"), animations: "disabled" });
        const logo = (await page.locator(".menu-logo").boundingBox())!;
        const buttons = (await page.locator(".menu-actions").boundingBox())!;
        // Side by side, the logo on the left.
        expect(logo.x + logo.width).toBeLessThanOrEqual(buttons.x + 0.5);
        for (const control of await touchable(page, ".menu-page")) {
          const at = (await control.boundingBox())!;
          const label = ((await control.textContent()) || (await control.getAttribute("aria-label")) || "").trim();
          expect(at.x, `${label} left`).toBeGreaterThanOrEqual(-0.5);
          expect(at.x + at.width, `${label} right`).toBeLessThanOrEqual(width + 0.5);
          expect(at.y, `${label} top`).toBeGreaterThanOrEqual(-0.5);
          expect(at.y + at.height, `${label} bottom`).toBeLessThanOrEqual(height + 0.5);
          expect(await landsOn(control), label).toBe(true);
        }
        for (const which of ["settings", "rules"]) {
          await expect(page.locator(`[data-menu-page="${which}"]`)).toBeVisible();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });
    }
  });
}

// A finger needs room: at a window with a scale of 1 or more, every control of every sheet is 44 pixels or more
// across the way it is touched, and so are the main menu's.
test.describe("the controls at 832 by 384 under a finger", () => {
  test.use({ viewport: { width: 832, height: 384 }, hasTouch: true, isMobile: true });

  for (const [name] of SHEETS) {
    test(`${name} has no control under 44 pixels`, async ({ page }) => {
      await open(page, name, "en");
      const small: string[] = [];
      for (const control of await touchable(page, ".sheet:not([hidden])")) {
        await control.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
        // A control in a label is touched through the label.
        const size = await control.evaluate((node) => {
          const own = node.getBoundingClientRect();
          const label = node.closest("label")?.getBoundingClientRect();
          return { width: Math.max(own.width, label?.width ?? 0), height: Math.max(own.height, label?.height ?? 0), text: node.textContent || node.getAttribute("aria-label") || node.className };
        });
        if (size.height < 43.5 || size.width < 43.5) {
          small.push(`${size.text}: ${Math.round(size.width)} by ${Math.round(size.height)}`);
        }
      }
      expect(small).toEqual([]);
    });
  }

  test("the main menu has no control under 44 pixels", async ({ page }) => {
    await page.goto("/look.html?shot=menu");
    await page.waitForSelector(READY);
    const small: string[] = [];
    for (const control of await touchable(page, ".menu-page")) {
      const at = (await control.boundingBox())!;
      if (at.height < 43.5 || at.width < 43.5) {
        small.push(`${(await control.textContent()) || (await control.getAttribute("aria-label"))}: ${Math.round(at.width)} by ${Math.round(at.height)}`);
      }
    }
    expect(small).toEqual([]);
  });
});

// The table drawn small says so, and offers full screen, over the top plate and clear of the hand, the strip and the
// round's chip.
test.describe("the notice for a table drawn small, at 754 by 247", () => {
  test.use({ viewport: { width: 754, height: 247 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  for (const [language, suffix] of LANGUAGES) {
    for (const shot of ["table-4-players", "bidding", "hand-8-cards"]) {
      test(`in ${language} shows over ${shot}, clear of the hand, the strip and the chip`, async ({ page }) => {
        await page.goto(`/look.html?shot=${shot}&lang=${language}`);
        await page.waitForSelector(READY);
        const folder = join(OUT, `754x247${suffix}`);
        mkdirSync(folder, { recursive: true });
        const notice = page.locator(".scaled-notice");
        await expect(notice).toBeVisible();
        await expect(notice).toHaveAttribute("role", "status");
        await expect(notice.locator(".notice-btn:not(.notice-dismiss)")).toBeVisible();
        await page.screenshot({ path: join(folder, `notice-${shot}.png`), animations: "disabled" });
        const at = (await notice.boundingBox())!;
        expect(at.x).toBeGreaterThanOrEqual(0);
        expect(at.x + at.width).toBeLessThanOrEqual(754 + 0.5);
        expect(at.y).toBeGreaterThanOrEqual(0);
        for (const covered of [".hand .hcard:not([hidden])", ".bidstrip .opt:not([hidden])", ".round-chip", ".round-btn"]) {
          for (const node of await page.locator(covered).all()) {
            const other = await node.boundingBox();
            if (other === null) {
              continue;
            }
            const across = at.x < other.x + other.width && other.x < at.x + at.width;
            const down = at.y < other.y + other.height && other.y < at.y + at.height;
            expect(across && down, `${covered} is under the notice`).toBe(false);
          }
        }
      });
    }
  }

  test("says to add the page to the home screen where the browser has no full screen, with no button for it", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(document, "fullscreenEnabled", { value: false }));
    await page.goto("/look.html?shot=table-4-players&lang=en");
    await page.waitForSelector(READY);
    const notice = page.locator(".scaled-notice");
    await expect(notice).toContainText("Add the page to the home screen");
    await expect(notice.locator(".notice-btn:not(.notice-dismiss)")).toBeHidden();
    await page.screenshot({ path: join(OUT, "754x247", "notice-home-screen.png"), animations: "disabled" });
    await page.goto("/look.html?shot=table-4-players&lang=ro");
    await page.waitForSelector(READY);
    await expect(page.locator(".scaled-notice")).toContainText("Adaugă pagina pe ecranul de pornire");
    await page.screenshot({ path: join(OUT, "754x247-ro", "notice-home-screen.png"), animations: "disabled" });
  });

  test("goes where the window is big enough for the table at full size, and comes back where it is not", async ({ page }) => {
    await page.goto("/look.html?shot=table-4-players");
    await page.waitForSelector(READY);
    await expect(page.locator(".scaled-notice")).toBeVisible();
    await page.setViewportSize({ width: 832, height: 384 });
    await expect(page.locator(".scaled-notice")).toBeHidden();
    await page.setViewportSize({ width: 754, height: 247 });
    await expect(page.locator(".scaled-notice")).toBeVisible();
  });
});

// A mouse at the phone's window size has the desktop's table and every sheet as the centred dialog it was.
test.describe("every sheet under a mouse at 844 by 390", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: false, isMobile: false });

  for (const [name] of SHEETS) {
    test(`${name} is a centred dialog`, async ({ page }) => {
      await page.goto(`/look.html?shot=${name}`);
      await page.waitForSelector(READY);
      await expect(page.locator(".window")).toHaveAttribute("data-layout", "desktop");
      const sheet = page.locator(".sheet:not([hidden])");
      await expect(sheet).toHaveCount(1);
      await expect(sheet).toHaveAttribute("data-placement", "dialog");
      await expect(sheet.locator(".page-back")).toBeHidden();
      await expect(page.locator(".page-bar")).toHaveCount(0);
      const box = (await sheet.boundingBox())!;
      expect(box.x + box.width / 2).toBeCloseTo(844 / 2, 0);
      expect(box.y).toBeGreaterThanOrEqual(16);
      expect(box.y + box.height).toBeLessThanOrEqual(390);
    });
  }
});
