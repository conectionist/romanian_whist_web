import { expect, test } from "@playwright/test";

test("the page loads from the server, says hello, and draws the empty table at no table", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  // hello, then the welcome and a sync that says there is no table.
  await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
  expect(await page.evaluate(() => window.localStorage.getItem("whist.token"))).toMatch(/^[A-Za-z0-9_-]{22}$/);

  // The room, the rim, the felt and the round logo; no seats and no corner panels.
  await expect(page.locator(".wood")).toBeVisible();
  await expect(page.locator(".felt")).toBeVisible();
  await expect(page.locator(".medal-letters div")).toHaveText(["Romanian", "Whist"]);
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
