import { expect, test, type Locator, type Page } from "@playwright/test";
import { measure, panelsOn } from "../look/panels";

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

// The first or the last card that can be played, by its place in the fan: the order of the elements is
// not the order they are shown in.
async function cardAt(page: Page, end: "first" | "last"): Promise<Locator> {
  const slot = await page.evaluate((which) => {
    const slots = Array.from(document.querySelectorAll<HTMLElement>(".hand .hcard.playable"), (card) => Number(card.dataset.slot));
    return which === "first" ? Math.min(...slots) : Math.max(...slots);
  }, end);
  return page.locator(`.hand .hcard.playable[data-slot="${slot}"]`);
}

// A tap on the felt between the cards, where nothing is.
async function tapNothing(page: Page): Promise<void> {
  await page.touchscreen.tap(60, 200);
}

// What a turn showed of the pick: that a tap on nothing put it down, and that a tap on another card moved it.
interface Checked {
  cleared: boolean;
  moved: boolean;
}

// A card: a first tap picks it and raises it and plays nothing, a tap on another card moves the pick, a
// tap on nothing puts it down, and a second tap on the picked card plays it. The move can only be tried
// with two cards to choose from, so it waits for a turn that has them.
async function playWithTwoTaps(page: Page, done: Checked): Promise<Checked> {
  const card = await cardAt(page, "first");
  const felt = page.locator(".trick .card:not([hidden])");
  const before = await felt.count();
  const several = (await playable(page).count()) > 1;
  await card.tap();
  await expect(card).toHaveClass(/selected/);
  expect(await felt.count()).toBe(before);
  if (!done.moved && several) {
    expect(await card.locator(".face").evaluate((face) => getComputedStyle(face).transform)).toBe("matrix(1, 0, 0, 1, 0, -30)");
    const other = await cardAt(page, "last");
    await other.tap();
    await expect(other).toHaveClass(/selected/);
    await expect(card).not.toHaveClass(/selected/);
    expect(await felt.count()).toBe(before);
    await other.tap();
    await expect(playable(page)).toHaveCount(0);
    return { ...done, moved: true };
  }
  if (!done.cleared) {
    await tapNothing(page);
    await expect(card).not.toHaveClass(/selected/);
    expect(await felt.count()).toBe(before);
    await card.tap();
    await expect(card).toHaveClass(/selected/);
  }
  await card.tap();
  await expect(playable(page)).toHaveCount(0);
  return { ...done, cleared: true };
}

test("a whole solo game is played by taps on a phone held sideways, from the first bid to the final results", async ({ page }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/?solo=2&seed=7&speed=4&wait=1");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");

  const until = Date.now() + 200_000;
  let answered = 0;
  let checked: Checked = { cleared: false, moved: false };
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
      checked = await playWithTwoTaps(page, checked);
      answered += 1;
    } else {
      await page.waitForTimeout(15);
    }
  }
  expect(answered).toBe(20 + 76);
  // A pick was put down by a tap on nothing, and moved to another card by a tap on it, in this game.
  expect(checked).toEqual({ cleared: true, moved: true });
  await expect(sheet(page, "game-over").locator(".sheet-title")).toHaveText("Final results");
  // The ways on are reached by taps: the sheet fits a window of this height, or scrolls to them.
  await sheet(page, "game-over").locator('[data-action="main-menu"]').tap();
  await expect(page.locator(".menu-page")).toBeVisible();
  expect(problems).toEqual([]);
});

// The smallest windows the page is asked to work in: a phone held sideways, and a smaller one.
for (const [width, height] of [
  [844, 390],
  [740, 360],
]) {
  test.describe(`a window of ${width} by ${height}`, () => {
    test.use({ viewport: { width, height } });

    test("the main menu, New Game and Deal, and Play online, Create and the lobby's Fill and Start, are all within a tap's reach", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
      // Nothing of the main menu is cut off at the top or the foot, whatever its size.
      const fits = await page.evaluate(() => {
        const bar = document.querySelector(".menu-band")!.getBoundingClientRect().bottom;
        const logo = document.querySelector(".menu-logo")!.getBoundingClientRect();
        const last = document.querySelector('[data-menu-page="online"]')!.getBoundingClientRect();
        return { top: logo.top >= bar, foot: last.bottom <= window.innerHeight, across: document.documentElement.scrollWidth <= window.innerWidth };
      });
      expect(fits).toEqual({ top: true, foot: true, across: true });

      await page.locator('[data-menu-page="new-game"]').tap();
      await expect(sheet(page, "new-game")).toBeVisible();
      // A sheet taller than the window opens at its top, and its Deal is reached by scrolling to it.
      expect(await sheet(page, "new-game").evaluate((node) => node.scrollTop)).toBe(0);
      // Closed where it was scrolled to, it opens at its top again.
      await sheet(page, "new-game").evaluate((node) => (node.scrollTop = node.scrollHeight));
      expect(await sheet(page, "new-game").evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await sheet(page, "new-game").locator('[data-action="cancel"]').tap();
      await expect(sheet(page, "new-game")).toHaveCount(0);
      await page.locator('[data-menu-page="new-game"]').tap();
      await expect(sheet(page, "new-game")).toBeVisible();
      expect(await sheet(page, "new-game").evaluate((node) => node.scrollTop)).toBe(0);
      await sheet(page, "new-game").locator('[data-action="cancel"]').tap();
      await expect(sheet(page, "new-game")).toHaveCount(0);

      await page.locator('[data-menu-page="online"]').tap();
      await expect(sheet(page, "online")).toBeVisible();
      await sheet(page, "online").locator('input[name="profileName"]').fill("Maria");
      await sheet(page, "online").locator('[data-action="create"]').tap();
      await sheet(page, "create-table").locator('[data-action="create"]').tap();
      const lobby = sheet(page, "lobby");
      await expect(lobby).toBeVisible();
      // "Take this seat" is drawn 32 tall and is 44 to a finger: a touch 21 above or below its middle lands on it.
      const take = lobby.locator('[data-action="take-seat"]:visible').first();
      await take.evaluate((node) => node.scrollIntoView({ block: "center" }));
      const middle = (await take.boundingBox())!;
      const lands = (y: number) =>
        page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest("[data-action]")?.getAttribute("data-action") ?? null, [middle.x + middle.width / 2, y]);
      expect(middle.height).toBe(32);
      expect([await lands(middle.y + 16 - 21), await lands(middle.y + 16 + 21)]).toEqual(["take-seat", "take-seat"]);
      await lobby.locator('[data-action="fill"]').tap();
      await lobby.locator('[data-action="start"]:not(:disabled)').tap();
      await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
      await page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable").first().waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}

// A sheet taller than the window opens at its top under a mouse too: focusing its Deal button, which
// is at its foot, does not scroll to it.
test.describe("a small window under a mouse", () => {
  test.use({ viewport: { width: 740, height: 360 }, hasTouch: false, isMobile: false });

  test("New Game opens at its top, with its Deal button focused", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-menu-page="new-game"]').click();
    const newGame = sheet(page, "new-game");
    await expect(newGame).toBeVisible();
    await expect(newGame.locator('[data-action="deal"]')).toBeFocused();
    expect(await newGame.evaluate((node) => node.scrollTop)).toBe(0);
  });

  test("a sheet scrolled and closed opens at its top again", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-menu-page="new-game"]').click();
    const newGame = sheet(page, "new-game");
    await expect(newGame).toBeVisible();
    await newGame.evaluate((node) => (node.scrollTop = node.scrollHeight));
    expect(await newGame.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await newGame.locator('[data-action="cancel"]').click();
    await expect(newGame).toHaveCount(0);
    await page.locator('[data-menu-page="new-game"]').click();
    await expect(newGame).toBeVisible();
    expect(await newGame.evaluate((node) => node.scrollTop)).toBe(0);
  });
});

// The other players' panels are worked out once for a window and a seat count, so they stand still while a
// game goes through bidding, play, a round scored and the next round's bidding, whatever the corner panels
// say meanwhile; and in each of those they are on nothing.
for (const players of [5, 6]) {
  test.describe(`${players} players in a window of 740 by 360`, () => {
    test.use({ viewport: { width: 740, height: 360 } });

    test("the other players' panels stand still through a round and into the next", async ({ page }) => {
      test.setTimeout(90_000);
      // Where every panel and rack stood in each frame.
      await page.addInitScript(() => {
        const stood = new Set<string>();
        (window as unknown as { stood: Set<string> }).stood = stood;
        const watch = () => {
          const seats = Array.from(document.querySelectorAll<HTMLElement>(".seat:not([hidden])"))
            .filter((seat) => seat.dataset.seat !== "0")
            .map((seat) => `${seat.dataset.seat}:${seat.style.left},${seat.style.top},${seat.style.scale}`);
          // A rack with no cards is hidden and keeps its place.
          const racks = Array.from(document.querySelectorAll<HTMLElement>(".rack"), (rack) => `${rack.style.left},${rack.style.top},${rack.style.transform}`);
          if (seats.length > 0) {
            stood.add(JSON.stringify([seats, racks]));
          }
          requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
      });
      await page.goto(`/?solo=${players}&seed=3&speed=4&wait=1`);
      await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");

      const measured: string[] = [];
      const looked = async (when: string) => {
        measured.push(...panelsOn((await measure(page)).drawn).map((pair) => `${when}: ${pair}`));
      };
      const strip = page.locator(".bidstrip:not([hidden]) .opt:not(:disabled):not([hidden])");
      const cards = page.locator(".hand .hcard.playable");
      const next = sheet(page, "round").locator('[data-action="continue"]:not(:disabled)');
      let scored = false;
      let bidding = 0;
      let playing = 0;
      for (const until = Date.now() + 70_000; Date.now() < until; ) {
        if ((await strip.count()) > 0) {
          if (scored) {
            await looked("the next round's bidding");
            break;
          }
          if (bidding++ === 0) {
            await looked("bidding");
          }
          await strip.first().click();
        } else if ((await cards.count()) > 0) {
          if (playing++ === 0) {
            await looked("play");
          }
          await cards.first().click();
        } else if ((await next.count()) > 0) {
          await looked("the round scored");
          scored = true;
          await next.click();
        }
        await page.waitForTimeout(30);
      }
      expect(scored).toBe(true);
      expect(measured).toEqual([]);
      const stood = await page.evaluate(() => Array.from((window as unknown as { stood: Set<string> }).stood));
      expect(stood).toHaveLength(1);
    });
  });
}

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

test.describe("a phone held upright", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("is asked to turn it, in the page's language, and is not when it is turned", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    const hint = page.locator(".rotate-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText("Turn your phone sideways: the table needs the room.");
    // It does not stand in the way of a touch, nor over the table.
    expect(await hint.evaluate((node) => getComputedStyle(node).pointerEvents)).toBe("none");
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(hint).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hint).toBeVisible();

    await page.goto("/?lang=ro");
    await expect(page.locator(".rotate-hint")).toHaveText("Ține telefonul pe orizontală: masa are nevoie de loc.");
  });

  test("is asked at a table too, below it", async ({ page }) => {
    await page.goto("/?solo=3&seed=7&speed=4");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    const hint = (await page.locator(".rotate-hint").boundingBox())!;
    const felt = (await page.locator(".wood").boundingBox())!;
    expect(hint.y).toBeGreaterThan(felt.y + felt.height);
  });
});

test.describe("a narrow upright window with a mouse", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: false, isMobile: false });

  test("is not asked to turn anything", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    await expect(page.locator(".rotate-hint")).toBeHidden();
  });
});
