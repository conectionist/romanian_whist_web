import { expect, test, type Locator, type Page } from "@playwright/test";

// A phone held sideways: a touch screen of 844 by 390, which Chromium emulates with touch events and
// the coarse pointer the stylesheet asks about. Every answer here is a tap.
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

// Nothing flies, so what is on the table is what the server last said.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
});

const sheet = (page: Page, name: string) => page.locator(`.sheet[data-sheet="${name}"]:not([hidden])`);
const bids = (page: Page) => page.locator(".bidstrip:not([hidden]) .opt:not(:disabled):not([hidden])");
const playable = (page: Page) => page.locator(".hand .hcard.playable");

// The first card that can be played, by its place in the fan.
async function firstCard(page: Page): Promise<Locator> {
  const slot = await page.evaluate(() => Math.min(...Array.from(document.querySelectorAll<HTMLElement>(".hand .hcard.playable"), (card) => Number(card.dataset.slot))));
  return page.locator(`.hand .hcard.playable[data-slot="${slot}"]`);
}

// A tap on the felt between the cards, where nothing is.
async function tapNothing(page: Page): Promise<void> {
  await page.touchscreen.tap(60, 200);
}

// The first card: a first tap picks it and raises it and plays nothing, a tap on another card moves the
// pick, a tap on nothing puts it down, and a second tap on the picked card plays it.
async function playWithTwoTaps(page: Page, careful: boolean): Promise<void> {
  const card = await firstCard(page);
  const felt = page.locator(".trick .card:not([hidden])");
  const before = await felt.count();
  await card.tap();
  await expect(card).toHaveClass(/selected/);
  expect(await felt.count()).toBe(before);
  if (careful) {
    expect(await card.locator(".face").evaluate((face) => getComputedStyle(face).transform)).toBe("matrix(1, 0, 0, 1, 0, -30)");
    if ((await playable(page).count()) > 1) {
      const other = playable(page).last();
      await other.tap();
      await expect(other).toHaveClass(/selected/);
      await expect(card).not.toHaveClass(/selected/);
      expect(await felt.count()).toBe(before);
      await other.tap();
      await expect(playable(page)).toHaveCount(0);
      return;
    }
    await tapNothing(page);
    await expect(card).not.toHaveClass(/selected/);
    expect(await felt.count()).toBe(before);
    await card.tap();
    await expect(card).toHaveClass(/selected/);
  }
  await card.tap();
  await expect(playable(page)).toHaveCount(0);
}

test("a whole solo game is played by taps on a phone held sideways, from the first bid to the final results", async ({ page }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/?solo=2&seed=7&speed=4&wait=1");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");

  const until = Date.now() + 200_000;
  let answered = 0;
  let careful = true;
  while (Date.now() < until) {
    if ((await sheet(page, "game-over").count()) > 0) {
      break;
    }
    const next = sheet(page, "round").locator('[data-action="continue"]:not(:disabled)');
    if ((await next.count()) > 0) {
      await next.tap();
      continue;
    }
    if ((await bids(page).count()) > 0) {
      // A bid takes one tap: there is no card to pick first.
      await bids(page).first().tap();
      answered += 1;
    } else if ((await playable(page).count()) > 0) {
      await playWithTwoTaps(page, careful);
      careful = false;
      answered += 1;
    } else {
      await page.waitForTimeout(15);
    }
  }
  expect(answered).toBe(20 + 76);
  await expect(sheet(page, "game-over").locator(".sheet-title")).toHaveText("Final results");
  // The ways on are reached by taps: the sheet fits a window of this height, or scrolls to them.
  await sheet(page, "game-over").locator('[data-action="main-menu"]').tap();
  await expect(page.locator(".menu-page")).toBeVisible();
  expect(problems).toEqual([]);
});

test("a bid is 44 pixels from the next one under a finger, and a corner button is 44 tall", async ({ page }) => {
  await page.goto("/?solo=3&seed=7&speed=4");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  await bids(page).first().waitFor();
  const centres = await bids(page).evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width };
    }),
  );
  expect(centres.length).toBeGreaterThan(1);
  for (let at = 1; at < centres.length; at++) {
    expect(centres[at].x - centres[at - 1].x).toBeGreaterThanOrEqual(43.5);
  }
  // A touch 22 above or below the middle of a bid, and half the way to its neighbour, still lands on it.
  const lands = (x: number, y: number) => page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest(".opt")?.textContent ?? null, [x, y]);
  expect(await lands(centres[0].x, centres[0].y - 21)).toBe("0");
  expect(await lands(centres[0].x, centres[0].y + 21)).toBe("0");
  expect(await lands(centres[0].x + 21, centres[0].y)).toBe("0");

  const corner = await page.evaluate(() => {
    const box = document.querySelector('[data-button="history"]')!.getBoundingClientRect();
    const at = (y: number) => document.elementFromPoint(box.x + box.width / 2, y)?.closest("[data-button]")?.getAttribute("data-button") ?? null;
    // The button stands on the window's edge, so its touch area grows upward: 43 up from its foot.
    return { top: at(box.bottom - 43), foot: at(box.bottom - 2), over: at(box.bottom - 46) };
  });
  expect(corner).toEqual({ top: "history", foot: "history", over: null });
});

test("the table asks for no zoom and no callout, and selects nothing, whatever is held down", async ({ page }) => {
  await page.goto("/?solo=3&seed=7&speed=4");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  const styles = await page.evaluate(() => {
    const view = getComputedStyle(document.querySelector(".view")!);
    return { action: view.touchAction, select: view.userSelect };
  });
  expect(styles.action).toBe("manipulation");
  expect(styles.select).toBe("none");
});
