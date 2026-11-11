import { expect, test } from "@playwright/test";

test("the page loads from the server, says hello, and shows the main menu over the empty table at no table", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  // hello, then the welcome and a sync that says there is no table.
  await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
  expect(await page.evaluate(() => window.localStorage.getItem("whist.token"))).toMatch(/^[A-Za-z0-9_-]{22}$/);

  // The room, the rim, the felt and the round logo under the menu page; no seats and no corner panels.
  await expect(page.locator(".wood")).toBeVisible();
  await expect(page.locator(".felt")).toBeVisible();
  await expect(page.locator(".table-top .medal-letters div")).toHaveText(["Romanian", "Whist"]);
  // The main menu: the plaque, New Game and Play online, and no Quit, which a page cannot do.
  await expect(page.locator(".menu-page")).toBeVisible();
  await expect(page.locator(".menu-page .medal-letters div")).toHaveText(["Romanian", "Whist"]);
  await expect(page.locator(".menu-btn span")).toHaveText(["New Game", "Play online"]);
  await expect(page.locator(".seat:not([hidden])")).toHaveCount(0);
  await expect(page.locator(".hud")).toBeHidden();

  expect(problems).toEqual([]);
});

test("the page keeps its member across a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
  const token = await page.evaluate(() => window.localStorage.getItem("whist.token"));

  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
  expect(await page.evaluate(() => window.localStorage.getItem("whist.token"))).toBe(token);
});

test("a stored token the server cannot read is dropped, and the page still gets its table state", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.token", "not a token"));
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
  expect(await page.evaluate(() => window.localStorage.getItem("whist.token"))).toMatch(/^[A-Za-z0-9_-]{22}$/);
});
