import { expect, test, type Page } from "@playwright/test";
import { answer, decide, waitForTurn } from "./support";

// Nothing flies, so what is on the table is what the server last said.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
});

const live = (page: Page) => page.locator('[role="log"][aria-live="polite"]');
const said = (page: Page) => live(page).locator("div").allTextContents();

// The first round deals one card: a bid and a card, and the round is scored and held.
async function playFirstRound(page: Page): Promise<void> {
  for (let decisions = 0; decisions < 2; decisions++) {
    await answer(page);
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
  expect(names[0]).toMatch(/^(\d+|Jack|Queen|King|Ace) of (spades|hearts|diamonds|clubs), playable$/);
  await decide(page);
  await expect(page.locator('.sheet[data-sheet="round"]:not([hidden])')).toBeVisible();

  const lines = await said(page);
  // The round's start with its trump, and the question put to you, come before the bids; a deal says nothing.
  expect(lines[0]).toMatch(/^Round 1 of 23\. 1 card\. Trump: (\d+|Jack|Queen|King|Ace) of (spades|hearts|diamonds|clubs)\.$/);
  expect(lines.filter((line) => line === "Your bid. How many tricks?")).toHaveLength(1);
  expect(lines.filter((line) => /^Your turn/.test(line))).toHaveLength(1);
  // Each bid, each card, who took the trick and the round's scores, in the order they happened.
  expect(lines.filter((line) => /^(You bid \d|\w+ bid \d)$/.test(line))).toHaveLength(3);
  expect(lines.filter((line) => /^(You played|\w+ played) the /.test(line))).toHaveLength(3);
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
  await expect(page.locator('.seat[data-seat="0"]')).toHaveAccessibleName("Jucător (tu), Licitează…, mută");
  await decide(page);
  await expect(page.locator(".hand .hcard.playable").first()).toBeVisible();
  expect(await page.locator(".hand .hcard:not([hidden])").first().getAttribute("aria-label")).toMatch(
    /^(Doi|Trei|Patru|Cinci|Șase|Șapte|Opt|Nouă|Zece|Valet|Damă|Popă|As) de (inimă neagră|inimă roșie|romb|treflă), se poate juca$/,
  );
  await decide(page);
  await expect(page.locator('.sheet[data-sheet="round"]:not([hidden])')).toBeVisible();
  const lines = await said(page);
  expect(lines.filter((line) => /^(Ai licitat \d|\w+ a licitat \d)$/.test(line))).toHaveLength(3);
  expect(lines.filter((line) => /^(Ai pus|\w+ a pus) (doi|trei|patru|cinci|șase|șapte|opt|nouă|zece|valet|damă|popă|as) de (inimă neagră|inimă roșie|romb|treflă)$/.test(line))).toHaveLength(3);
  expect(lines[0]).toMatch(/^Runda 1 din 23\. 1 carte\. Atu: (Doi|Trei|Patru|Cinci|Șase|Șapte|Opt|Nouă|Zece|Valet|Damă|Popă|As) de (inimă neagră|inimă roșie|romb|treflă)\.$/);
  expect(lines.filter((line) => line === "Licitația ta. Câte faci?")).toHaveLength(1);
  expect(lines.filter((line) => /mâna\.$/.test(line))).toHaveLength(1);
  expect(lines.some((line) => line.startsWith("Punctajele rundei 1 sunt gata."))).toBe(true);
});

test("every picture of a card is named: the felt, the trump, a rack in a Forehead round and the last trick", async ({ page }) => {
  await page.goto("/?solo=3&seed=7&speed=4&forehead=all&wait=1");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  await waitForTurn(page);
  const named = /^(\d+|Jack|Queen|King|Ace) of (spades|hearts|diamonds|clubs)$/;
  // A Forehead round shows the other players' cards, each named, and the trump is named beside its label.
  const faces = await page.locator(".rack-card.face img").evaluateAll((pictures) => pictures.map((picture) => picture.getAttribute("alt")));
  expect(faces).toHaveLength(2);
  // Each says whose it is.
  expect([...faces].sort()).toEqual(expect.arrayContaining([expect.stringMatching(/^Ana: /), expect.stringMatching(/^Bogdan: /)]));
  for (const alt of faces) {
    expect(alt).toMatch(/^\w+: /);
    expect((alt ?? "").replace(/^\w+: /, "")).toMatch(named);
  }
  expect(await page.locator(".score-trump-card").getAttribute("alt")).toMatch(named);

  // The round played to its held sheet, where the felt still shows the trick.
  await playFirstRound(page);
  // The cards on the felt are named, and so are those of the last trick.
  const felt = await page.locator(".trick .card:not([hidden]) img").evaluateAll((pictures) => pictures.map((picture) => picture.getAttribute("alt")));
  expect(felt.length).toBeGreaterThan(0);
  for (const alt of felt) {
    expect(alt).toMatch(named);
  }
  await page.locator('.sheet[data-sheet="round"] [data-action="continue"]').click();
  await page.locator('[data-button="last-trick"]').click();
  const last = await page.locator('.sheet[data-sheet="last-trick"]:not([hidden]) .mini img').evaluateAll((pictures) => pictures.map((picture) => picture.getAttribute("alt")));
  expect(last).toHaveLength(3);
  for (const alt of last) {
    expect(alt).toMatch(named);
  }
});

test("every picture of a card is named in Romanian as the owner chose, with a capital to start it", async ({ page }) => {
  await page.goto("/?solo=3&seed=7&speed=4&forehead=all&wait=1&lang=ro");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  await waitForTurn(page);
  const named = /^(Doi|Trei|Patru|Cinci|Șase|Șapte|Opt|Nouă|Zece|Valet|Damă|Popă|As) de (inimă neagră|inimă roșie|romb|treflă)$/;
  expect(await page.locator(".score-trump-card").getAttribute("alt")).toMatch(named);
  const faces = await page.locator(".rack-card.face img").evaluateAll((pictures) => pictures.map((picture) => picture.getAttribute("alt")));
  expect(faces).toHaveLength(2);
  for (const alt of faces) {
    expect((alt ?? "").replace(/^\w+: /, "")).toMatch(named);
  }
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
