import { expect, test, type Page } from "@playwright/test";

// What covers the page: the language dialog and the page for a window too small for the table. The page takes no touch and
// no key while either is there.
const touch = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } as const;
const PHONE = { width: 832, height: 384 } as const;
const SMALL = { width: 380, height: 213 } as const;

const inert = (page: Page) => page.locator("#app").evaluate((node) => node.hasAttribute("inert"));

test.use({ viewport: PHONE, ...touch });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
});

test.describe("the page under the language dialog and the too-small page", () => {
  test("stays covered while the dialog is up, though the window goes under the floor and back", async ({ page }) => {
    await page.goto("/");
    await page.locator(".menu-lang").tap();
    await expect(page.locator(".lang-dialog")).toBeVisible();
    expect(await inert(page)).toBe(true);
    await page.setViewportSize(SMALL);
    await expect(page.locator(".too-small")).toBeVisible();
    expect(await inert(page)).toBe(true);
    await page.setViewportSize(PHONE);
    await expect(page.locator(".too-small")).toBeHidden();
    // The dialog is still up, so the page is still covered.
    await expect(page.locator(".lang-dialog")).toBeVisible();
    expect(await inert(page)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator(".lang-dialog")).toHaveCount(0);
    expect(await inert(page)).toBe(false);
  });

  test("stays covered while the too-small page is up, though the dialog is closed", async ({ page }) => {
    await page.goto("/");
    await page.locator(".menu-lang").tap();
    await expect(page.locator(".lang-dialog")).toBeVisible();
    await page.setViewportSize(SMALL);
    await expect(page.locator(".too-small")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".lang-dialog")).toHaveCount(0);
    // The window is still too small for the table, so the page is still covered.
    expect(await inert(page)).toBe(true);
    await page.setViewportSize(PHONE);
    await expect(page.locator(".too-small")).toBeHidden();
    expect(await inert(page)).toBe(false);
  });

  test("takes no Esc under the too-small page: a solo game is not paused by it", async ({ page }) => {
    const sent: string[] = [];
    page.on("websocket", (socket) => socket.on("framesent", (frame) => sent.push(String(frame.payload))));
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await page.locator(".bidstrip:not([hidden]) .opt:not(:disabled)").first().waitFor();
    await page.setViewportSize(SMALL);
    await expect(page.locator(".too-small")).toBeVisible();
    sent.length = 0;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    expect(sent.filter((each) => /pause/.test(each))).toEqual([]);
    await page.setViewportSize(PHONE);
    await expect(page.locator(".too-small")).toBeHidden();
    // The game was not held: nothing is up over it, and the strip still asks.
    await expect(page.locator(".sheet:not([hidden])")).toHaveCount(0);
    await expect(page.locator(".bidstrip:not([hidden]) .opt:not(:disabled)").first()).toBeVisible();
  });
});
