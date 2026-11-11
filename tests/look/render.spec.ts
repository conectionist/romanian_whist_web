import { expect, test } from "@playwright/test";

test("a second state keeps the panels and racks and changes what they show", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/look.html?shot=table-4-players&then=hand-4-cards");
  await page.waitForSelector("body[data-ready]");

  const body = page.locator("body");
  const first = await body.getAttribute("data-first-stamps");
  const second = await body.getAttribute("data-stamps");
  expect(first).not.toBeNull();
  expect(first).not.toBe("");
  // Every panel and rack is the node the first state made.
  expect(second).toBe(first);

  // And what they show is the second state's: its names, in place.
  const names = await page.locator(".seat .name-text").allTextContents();
  expect(names).toEqual(["You", "Bogdan", "Ana", "Costel"]);
  expect(problems).toEqual([]);
});

test("a table with fewer seats hides the ones it no longer has, and keeps their elements", async ({ page }) => {
  await page.goto("/look.html?shot=table-6-players&then=table-3-players");
  await page.waitForSelector("body[data-ready]");

  await expect(page.locator(".seat:not([hidden])")).toHaveCount(3);
  await expect(page.locator(".seat")).toHaveCount(6);
  await expect(page.locator(".rack:not([hidden])")).toHaveCount(2);
});

test("a card that is played flies to the felt, and a trick is swept to its winner", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/look.html?shot=table-4-players&pace=normal");
  await page.waitForSelector("body[data-ready]");
  await expect(page.locator(".trick .card:not([hidden])")).toHaveCount(3);

  const played = await page.evaluate(async () => {
    const look = (window as unknown as { look: { apply(text: string, animate: boolean): Promise<void> } }).look;
    const table = document.querySelector(".trick")!;
    const before = table.querySelectorAll(".card:not([hidden])").length;
    const message = {
      type: "game",
      seq: 1,
      game: 1,
      event: { kind: "cardPlayed", seat: 0, card: "KC" },
      snapshot: {
        you: 0,
        status: "inProgress",
        phase: "playing",
        round: { index: 7, count: 26, type: "normal", tricks: 5, trick: 2, trump: "9S", leader: 3 },
        active: null,
        forbiddenBet: null,
        bets: { placed: 4, sum: 1 },
        table: {
          ledBy: 1,
          leadSuit: "C",
          cards: [
            { seat: 1, card: "8C", winning: false },
            { seat: 2, card: "7S", winning: false },
            { seat: 3, card: "QS", winning: true },
            { seat: 0, card: "KC", winning: false },
          ],
        },
        seats: [
          { name: "Player", bidOrder: 2, bet: 0, won: 0, cards: 3, roundScore: 0, total: 23, wins: 0, losses: 1, hand: ["QD", "7C", "8H"] },
          { name: "Ana", bidOrder: 3, bet: 1, won: 1, cards: 3, roundScore: 0, total: 31, wins: 1, losses: 0 },
          { name: "Bogdan", bidOrder: 4, bet: 0, won: 0, cards: 3, roundScore: 0, total: 16, wins: 0, losses: 2 },
          { name: "Cristina", bidOrder: 1, bet: 0, won: 0, cards: 3, roundScore: 0, total: 5, wins: 0, losses: 3 },
        ],
      },
    };
    const started = look.apply(JSON.stringify(message), true);
    const flying = document.getAnimations().length;
    await started;
    return { before, flying, after: table.querySelectorAll(".card:not([hidden])").length, left: document.getAnimations().length };
  });

  expect(played.before).toBe(3);
  // The new card is in the air, and it has landed when the queue is let go.
  expect(played.flying).toBeGreaterThan(0);
  expect(played.after).toBe(4);
  expect(played.left).toBe(0);

  // The next trick starts with a bare felt: the four cards are swept to the winner, and gone.
  const swept = await page.evaluate(async () => {
    const look = (window as unknown as { look: { apply(text: string, animate: boolean): Promise<void> } }).look;
    const table = document.querySelector(".trick")!;
    const message = {
      type: "game",
      seq: 2,
      game: 1,
      event: { kind: "trickStarted", trick: 3, leader: 3 },
      snapshot: {
        you: 0,
        status: "inProgress",
        phase: "playing",
        round: { index: 7, count: 26, type: "normal", tricks: 5, trick: 3, trump: "9S", leader: 3 },
        active: null,
        forbiddenBet: null,
        bets: { placed: 4, sum: 1 },
        table: { ledBy: 3, leadSuit: null, cards: [] },
        seats: [
          { name: "Player", bidOrder: 2, bet: 0, won: 0, cards: 3, roundScore: 0, total: 23, wins: 0, losses: 1, hand: ["QD", "7C", "8H"] },
          { name: "Ana", bidOrder: 3, bet: 1, won: 1, cards: 3, roundScore: 0, total: 31, wins: 1, losses: 0 },
          { name: "Bogdan", bidOrder: 4, bet: 0, won: 0, cards: 3, roundScore: 0, total: 16, wins: 0, losses: 2 },
          { name: "Cristina", bidOrder: 1, bet: 0, won: 0, cards: 3, roundScore: 0, total: 5, wins: 0, losses: 3 },
        ],
      },
    };
    const started = look.apply(JSON.stringify(message), true);
    const sweeping = document.getAnimations().length;
    const during = table.querySelectorAll(".card:not([hidden])").length;
    await started;
    return { sweeping, during, after: table.querySelectorAll(".card:not([hidden])").length };
  });

  expect(swept.sweeping).toBe(4);
  expect(swept.during).toBe(4);
  expect(swept.after).toBe(0);
  expect(problems).toEqual([]);
});

test("the menu bar has the desktop's four items, 46 pixels high, and Exit is live over a game", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/look.html?shot=table-4-players");
  await page.waitForSelector("body[data-ready]");

  const bar = page.locator(".menu-band");
  expect((await bar.boundingBox())?.height).toBe(46);
  await expect(bar.locator(".menu-item span")).toHaveText(["New Game", "Settings", "Rules", "Exit"]);
  await expect(bar.locator(".menu-item svg")).toHaveCount(4);
  await expect(bar.locator(".menu-item:disabled")).toHaveCount(0);
  // Exit is at the far right, 16 from the edge.
  const exit = await bar.locator('[data-menu="exit"]').boundingBox();
  expect(Math.round(1920 - (exit!.x + exit!.width))).toBe(16);
});

test("a sheet is placed on whole pixels in the middle of the page below the bar, and narrows and scrolls in a small window", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1034 });
  await page.goto("/look.html?shot=sheet-history");
  await page.waitForSelector("body[data-ready]");
  const sheet = page.locator(".sheet:not([hidden])");
  const box = (await sheet.boundingBox())!;
  expect(box.width).toBe(720);
  expect(Number.isInteger(box.x) && Number.isInteger(box.y)).toBe(true);
  expect(box.x).toBe(600);

  // A window 900 wide and 500 tall: the sheet keeps 16 from the edges and its body scrolls.
  await page.setViewportSize({ width: 900, height: 500 });
  await expect(sheet).toHaveCSS("overflow-y", "auto");
  // The sheet is placed by an observer of the page's size, a moment after the window changes.
  await expect.poll(async () => (await sheet.boundingBox())!.y).toBe(16);
  const small = (await sheet.boundingBox())!;
  expect(small.width).toBe(720);
  expect(small.height).toBe(500 - 32);
  expect(small.y).toBe(16);
  expect(await sheet.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);

  await page.setViewportSize({ width: 600, height: 500 });
  await expect.poll(async () => (await sheet.boundingBox())!.width).toBe(600 - 32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the sheets take no focus ring for the button the page put the keyboard on, and show one for a Tab", async ({ page }) => {
  await page.goto("/look.html?shot=sheet-round");
  await page.waitForSelector("body[data-ready]");
  const resting = await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('.sheet:not([hidden]) [data-action="continue"]')!;
    return { focused: document.activeElement === button, visible: button.matches(":focus-visible") };
  });
  expect(resting).toEqual({ focused: true, visible: false });
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-action"))).toBe("history");
  expect(await page.evaluate(() => document.activeElement?.matches(":focus-visible"))).toBe(true);
  // Tab stays inside the sheet: from the last control it goes round to the first.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-action"))).toBe("continue");
});
