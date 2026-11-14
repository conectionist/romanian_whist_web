import { expect, test, type Locator, type Page } from "@playwright/test";
import { sheet } from "./online";

// The on-screen keyboard of a phone takes more than half of the window's height. A browser that resizes the layout
// viewport for it makes the page see a window too short for the table, which must change nothing: the field being
// typed in keeps the keyboard and is shown above it. Chromium here has no keyboard, so the window is made as short as
// the keyboard makes it.
const touch = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } as const;
const KEYBOARD = 0.45;

const FIELDS = 'input.field:not([readonly]):not([type="checkbox"]):not([type="radio"]):not([type="range"])';

type Opener = (page: Page) => Promise<string>;

// Each page of the scaled layout that has a field to type in, and how to get to it.
const PAGES: readonly [string, Opener][] = [
  [
    "new-game",
    async (page) => {
      await page.goto("/");
      await page.locator('[data-menu-page="new-game"]').tap();
      return "new-game";
    },
  ],
  [
    "online",
    async (page) => {
      await page.goto("/");
      await page.locator('[data-menu-page="online"]').tap();
      return "online";
    },
  ],
  [
    "create-table",
    async (page) => {
      await page.goto("/");
      await page.locator('[data-menu-page="online"]').tap();
      await sheet(page, "online").locator('input[name="profileName"]').fill("Maria");
      await sheet(page, "online").locator('[data-action="create"]').tap();
      return "create-table";
    },
  ],
];

async function state(field: Locator) {
  return field.evaluate((node) => {
    const input = node as HTMLInputElement;
    const box = input.getBoundingClientRect();
    const bar = input.closest(".sheet")?.querySelector(".page-bar")?.getBoundingClientRect();
    const frame = document.querySelector(".window") as HTMLElement;
    return {
      focused: document.activeElement === input,
      connected: input.isConnected,
      visible: input.checkVisibility(),
      layout: frame.dataset.layout,
      tooSmall: !document.querySelector<HTMLElement>(".too-small")!.hidden,
      inert: document.getElementById("app")!.hasAttribute("inert"),
      placement: input.closest<HTMLElement>(".sheet")?.dataset.placement,
      bar: bar !== undefined,
      top: box.top - (bar?.bottom ?? 0),
      bottom: frame.clientHeight - box.bottom,
      width: box.width,
    };
  });
}

for (const [width, height] of [
  [754, 247],
  [832, 384],
] as const) {
  test.describe(`the on-screen keyboard at ${width} by ${height}`, () => {
    test.use({ viewport: { width, height }, ...touch });

    for (const [name, open] of PAGES) {
      test(`leaves the ${name} page as it is, and keeps the field that is typed in, shown, focused and typed into`, async ({ page }) => {
        const problems: string[] = [];
        page.on("pageerror", (error) => problems.push(error.message));
        await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
        await open(page);
        const on = sheet(page, name);
        await expect(on).toBeVisible();
        const fields = on.locator(FIELDS);
        const count = await fields.count();
        expect(count, "fields to type in").toBeGreaterThan(0);
        for (let at = 0; at < count; at++) {
          const field = fields.nth(at);
          if (!(await field.isVisible())) {
            continue;
          }
          const label = (await field.getAttribute("aria-label")) ?? `field ${at}`;
          await field.scrollIntoViewIfNeeded();
          await field.tap();
          expect((await state(field)).focused, `${label} takes the focus`).toBe(true);

          // The keyboard comes up and takes its share of the window.
          await page.setViewportSize({ width, height: Math.round(height * KEYBOARD) });
          await page.waitForTimeout(300);
          const up = await state(field);
          expect(up, label).toMatchObject({ focused: true, connected: true, visible: true, layout: "scaled", tooSmall: false, inert: false, placement: "page", bar: true });
          // It is shown above the keyboard and under the page's bar, in the window that is left.
          expect(up.top, `${label} is under the bar`).toBeGreaterThanOrEqual(-0.5);
          expect(up.bottom, `${label} is above the keyboard`).toBeGreaterThanOrEqual(-0.5);
          // What is typed lands in it.
          const typed = (await field.getAttribute("type")) === "number" ? "2" : "Zed";
          await page.keyboard.type(typed);
          expect(await field.inputValue(), label).toMatch(new RegExp(`${typed}$`));

          // The keyboard goes, and the page is as it was.
          await page.setViewportSize({ width, height });
          await page.waitForTimeout(200);
          expect(await state(field), label).toMatchObject({ connected: true, layout: "scaled", tooSmall: false, inert: false, placement: "page", bar: true });
          await field.blur();
        }
        expect(problems).toEqual([]);
      });
    }
  });
}

test.describe("a turn of the phone while a field is typed in", () => {
  test.use({ viewport: { width: 754, height: 247 }, ...touch });

  test("is a change of window, which the keyboard's height is not: the width changes, and the layout is chosen again", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-menu-page="online"]').tap();
    const field = sheet(page, "online").locator('input[name="profileName"]');
    await field.tap();
    await page.setViewportSize({ width: 754, height: 111 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
    // Upright, a phone's window is taller than wide: the desktop's table with the hint to turn it.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "desktop");
    await page.setViewportSize({ width: 754, height: 247 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
  });

  test("with no field typed in, a window made shorter is a window made shorter: too small for the table, as before", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".menu-page")).toBeVisible();
    await page.setViewportSize({ width: 754, height: 111 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "tooSmall");
    await expect(page.locator(".too-small")).toBeVisible();
    await page.setViewportSize({ width: 754, height: 247 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
  });

  test("a page that opens with a field focused opens at its top, and is scrolled only when the keyboard comes", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-menu-page="new-game"]').tap();
    const on = sheet(page, "new-game");
    await expect(on.locator(":focus")).toHaveCount(1);
    await page.waitForTimeout(400);
    expect(await on.evaluate((node) => node.scrollTop)).toBe(0);
  });

  test("is told, by the page, that the keyboard shrinks only what is seen of it", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator('meta[name="viewport"]').getAttribute("content")).toContain("interactive-widget=resizes-visual");
  });
});
