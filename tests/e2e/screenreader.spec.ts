import { expect, test, type Page } from "@playwright/test";
import { decide, waitForTurn } from "./support";

// Nothing flies, so what is on the table is what the server last said.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
});

const live = (page: Page) => page.locator('[role="log"][aria-live="polite"]');
const said = (page: Page) => live(page).locator("div").allTextContents();

// The first round deals one card: a bid and a card, and the round is scored and held.
async function playFirstRound(page: Page): Promise<void> {
  for (let decisions = 0; decisions < 2; decisions++) {
    await decide(page);
    await expect(page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable")).toHaveCount(0);
  }
  await expect(page.locator('.sheet[data-sheet="round"]:not([hidden])')).toBeVisible();
}

test("a screen reader is told the table: its cards and name panels have names, and what happens is said politely", async ({ page }) => {
  await page.goto("/?solo=3&seed=7&speed=4&wait=1");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  await waitForTurn(page);

  // The region is polite, and nothing on the screen shows it.
  const region = live(page);
  await expect(region).toHaveAttribute("aria-live", "polite");
  expect(await region.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(1);

  // A name panel says who it is, what they have bid, and whose turn it is; yours says it is yours.
  await expect(page.locator('.seat[data-seat="0"]')).toHaveAccessibleName("Player (you), Bidding…, to move");
  await expect(page.locator('.seat[data-seat="1"]')).toHaveAccessibleName(/^Ana, /);

  await decide(page);
  // The cards of the hand are named, and on your turn whether each can be played.
  await expect(page.locator(".hand .hcard.playable").first()).toBeVisible();
  const names = await page.locator(".hand .hcard:not([hidden])").evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label")));
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^(\d+|Jack|Queen|King|Ace) of (spades|hearts|diamonds|clubs), can be played$/);
  await decide(page);
  await expect(page.locator('.sheet[data-sheet="round"]:not([hidden])')).toBeVisible();

  const lines = await said(page);
  // Each bid, each card, who took the trick and the round's scores, in the order they happened; no deal.
  expect(lines.filter((line) => /^(You bid \d|\w+ bids \d)$/.test(line))).toHaveLength(3);
  expect(lines.filter((line) => /^(You play|\w+ plays) /.test(line))).toHaveLength(3);
  expect(lines.filter((line) => /(wins|win) the trick\.$/.test(line))).toHaveLength(1);
  const scored = lines.filter((line) => line.startsWith("Round 1 is scored."));
  expect(scored).toHaveLength(1);
  expect(scored[0]).toMatch(/You: [+−]?\d+, total \d+\. Ana: [+−]?\d+, total \d+\./);
  expect(lines.findIndex((line) => line.startsWith("Round 1 is scored."))).toBe(lines.length - 1);
});

test("it is told in Romanian in a Romanian page, to the desktop's words", async ({ page }) => {
  await page.goto("/?solo=3&seed=7&speed=4&wait=1&lang=ro");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  await waitForTurn(page);
  await expect(page.locator('.seat[data-seat="0"]')).toHaveAccessibleName("Jucător (tu), Licitează…, la rând");
  await playFirstRound(page);
  const lines = await said(page);
  expect(lines.filter((line) => /^(Ai licitat \d|\w+ licitează \d)$/.test(line))).toHaveLength(3);
  expect(lines.filter((line) => /^(Joci|\w+ joacă) /.test(line))).toHaveLength(3);
  expect(lines.filter((line) => /mâna\.$/.test(line))).toHaveLength(1);
  expect(lines.some((line) => line.startsWith("Punctajele rundei 1 sunt gata."))).toBe(true);
});

test("the game's end is said with who won", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?solo=2&seed=7&speed=4");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  const over = page.locator('.sheet[data-sheet="game-over"]:not([hidden])');
  const until = Date.now() + 100_000;
  while (Date.now() < until && (await over.count()) === 0) {
    if ((await page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable").count()) > 0) {
      await decide(page);
    } else {
      await page.waitForTimeout(20);
    }
  }
  await expect(over).toBeVisible();
  const lines = await said(page);
  expect(lines[lines.length - 1]).toMatch(/^Game over\. .+ (wins|tie for first) with -?\d+ points?\.$|^Game over\. .+ wins with a score of -\d+\.$/);
});
