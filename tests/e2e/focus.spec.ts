import { expect, test } from "@playwright/test";
import { decide, waitForTurn } from "./support";

// Nothing flies, so what is on the table is what the server last said.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
});

test("a mouse press on a card that cannot be played leaves the keyboard on nothing, so a later Enter plays nothing unseen", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?solo=3&seed=7&speed=4");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");

  // Play on, the lowest bid and the first card, until the hand holds a card that cannot be played.
  const until = Date.now() + 100_000;
  while ((await page.locator(".hand .hcard.illegal").count()) === 0) {
    expect(Date.now()).toBeLessThan(until);
    await waitForTurn(page);
    if ((await page.locator(".hand .hcard.illegal").count()) > 0) {
      break;
    }
    await decide(page);
    await page.waitForTimeout(20);
  }
  const illegal = page.locator(".hand .hcard.illegal").first();
  // A card that cannot be played is aria-disabled, which a click waits on: the press is made anyway.
  await illegal.click({ force: true });
  expect(await illegal.evaluate((card) => card === document.activeElement)).toBe(false);
  expect(await page.evaluate(() => document.activeElement?.closest(".hand, .bidstrip") ?? null)).toBeNull();

  // A card that can be played is played by a click, and in the next trick Enter plays nothing.
  const title = await page.locator(".tp-title").textContent();
  await decide(page);
  await expect(page.locator(".tp-title")).not.toHaveText(title ?? "");
  await waitForTurn(page);
  const asked = await page.locator(".hand .hcard.playable, .bidstrip:not([hidden]) .opt:not(:disabled)").count();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await expect(page.locator(".hand .hcard.playable, .bidstrip:not([hidden]) .opt:not(:disabled)")).toHaveCount(asked);
});

test("a press let go somewhere else leaves no mouse press behind, so a later bare activation only picks the card", async ({ page }) => {
  await page.goto("/?solo=3&seed=7&speed=4");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  const asked = ".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable";
  await waitForTurn(page);
  await decide(page);
  const card = page.locator(".hand .hcard.playable").first();
  await card.waitFor();
  // The mouse goes down on the card and is let go over the felt, where nothing is clicked.
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(20, 120);
  await page.mouse.up();
  await expect(page.locator(".hand .hcard.playable")).toHaveCount(1);
  // Once its click could have come, a bare activation is a key's: it picks the card and plays nothing.
  await page.waitForTimeout(600);
  await page.evaluate(() => (document.querySelector(".hand .hcard.playable") as HTMLElement).click());
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(300);
  await expect(page.locator(asked)).toHaveCount(1);
  await expect(page.locator(".trick .card:not([hidden])")).toHaveCount(0);
});
