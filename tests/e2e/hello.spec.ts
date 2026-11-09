import { expect, test } from "@playwright/test";

test("the page loads from the server, says hello and is told it is at no table", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Romanian Whist" })).toBeVisible();
  await expect(page.locator("#status")).toHaveText("at no table");
  await expect(page.locator("#log li")).toHaveText(["welcome", "sync"]);
});
