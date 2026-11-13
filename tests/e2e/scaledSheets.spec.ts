import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { sheet } from "./online";
import { questionOf, tapCard, taken } from "./support";

// The sheets and pages of the scaled table, played by touch at the window of a phone held sideways: where each opens,
// that it closes to the one it was opened from, and the games that go through them.
const touch = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } as const;
const PHONE = { width: 832, height: 384 } as const;

const placementOf = (page: Page, name: string) => sheet(page, name).getAttribute("data-placement");
const layoutOf = (page: Page) => page.locator(".window").getAttribute("data-layout");
const bids = (page: Page) => page.locator(".bidstrip:not([hidden]) .opt:not(:disabled):not([hidden])");
const playable = (page: Page) => page.locator(".hand .hcard.playable");
const noSheet = (page: Page) => expect(page.locator(".sheet:not([hidden])")).toHaveCount(0);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
});

// Opens a sheet and says what it is: where it was put, with the placement the page gives it.
async function opens(page: Page, name: string, placement: string): Promise<void> {
  await expect(sheet(page, name), `${name} is open`).toBeVisible();
  expect(await placementOf(page, name), `${name}'s placement`).toBe(placement);
  // One sheet at a time, and a sheet opens at its top.
  await expect(page.locator(".sheet:not([hidden])")).toHaveCount(1);
  expect(await sheet(page, name).evaluate((node) => node.scrollTop)).toBe(0);
}

// Answers what the table asks, by touch: a bid is one tap and a card is two, the first picking it.
async function answerByTouch(page: Page): Promise<boolean> {
  if ((await bids(page).count()) > 0) {
    await bids(page).first().tap();
    return true;
  }
  if ((await playable(page).count()) === 0) {
    return false;
  }
  const slot = await page.evaluate(() => Math.min(...Array.from(document.querySelectorAll<HTMLElement>(".hand .hcard.playable"), (card) => Number(card.dataset.slot))));
  const card = page.locator(`.hand .hcard.playable[data-slot="${slot}"]`);
  const question = await questionOf(page);
  // The prompt may close between looking at the hand and tapping it, and a card drawn as playable a moment after its
  // answer was taken is not the next question's: a tap on it picks nothing. The card is played by a tap on it once it is
  // picked.
  try {
    for (let tries = 0; tries < 20; tries++) {
      await tapCard(page, card, 3000);
      if (await card.evaluate((node) => node.classList.contains("selected"), undefined, { timeout: 3000 })) {
        await tapCard(page, card, 3000);
        await taken(page, question);
        return true;
      }
      await page.waitForTimeout(50);
    }
  } catch {
    return false;
  }
  return false;
}

// Plays what is asked and goes on at every round's end, until the results are up.
async function playToTheResults(pages: Page[], limit: number, onRound: (page: Page) => Promise<void> = async () => undefined): Promise<void> {
  const until = Date.now() + limit;
  let rounds = 0;
  while (Date.now() < until) {
    if ((await sheet(pages[0], "game-over").count()) > 0) {
      return;
    }
    let moved = false;
    for (const page of pages) {
      const next = sheet(page, "round").locator('[data-action="continue"]:not(:disabled)');
      if ((await next.count()) > 0) {
        if (rounds++ === 0) {
          await onRound(page);
        }
        await next.tap();
        moved = true;
      } else if (await answerByTouch(page)) {
        moved = true;
      }
    }
    if (!moved) {
      await pages[0].waitForTimeout(15);
    }
  }
  throw new Error("the game did not get to its results");
}

// A sheet opened from this one, and closed, is this one again: the round history from a round's end or the results.
async function historyAndBack(page: Page, from: "round" | "game-over"): Promise<void> {
  await sheet(page, from).locator('[data-action="history"]').tap();
  await opens(page, "history", "side");
  await sheet(page, "history").locator('[data-action="close"]').tap();
  await opens(page, from, "bottom");
}

test.describe("under a finger at 832 by 384, without a table", () => {
  test.use({ viewport: PHONE, ...touch });

  test("the main menu reaches Settings and Rules, the pages go Back to where they were opened from, and Deal starts a game", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await page.goto("/");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    expect(await layoutOf(page)).toBe("scaled");
    // The logo beside the buttons, and Settings, Rules and the language at hand.
    await expect(page.locator(".menu-page")).toBeVisible();
    for (const which of ["new-game", "online", "settings", "rules", "language"]) {
      await expect(page.locator(`[data-menu-page="${which}"]`)).toBeVisible();
    }

    // Settings and Rules, with no table, are bottom sheets and close to the menu.
    for (const [which, close] of [
      ["settings", "done"],
      ["rules", "close"],
    ] as const) {
      await page.locator(`[data-menu-page="${which}"]`).tap();
      await opens(page, which, "bottom");
      await sheet(page, which).locator(`[data-action="${close}"]`).tap();
      await noSheet(page);
      await expect(page.locator(".menu-page")).toBeVisible();
    }
    await page.locator('[data-menu-page="settings"]').tap();
    await opens(page, "settings", "bottom");
    await page.keyboard.press("Escape");
    await noSheet(page);

    // A page has a bar with Back, its title and its one action, and Esc and Back close it.
    await page.locator('[data-menu-page="new-game"]').tap();
    await opens(page, "new-game", "page");
    await expect(sheet(page, "new-game").locator('.page-bar [data-action="deal"]')).toBeVisible();
    await sheet(page, "new-game").locator(".page-back").tap();
    await noSheet(page);
    await page.locator('[data-menu-page="new-game"]').tap();
    await opens(page, "new-game", "page");
    await page.keyboard.press("Escape");
    await noSheet(page);

    // Create a table is opened from Play online, and Back goes to Play online, and then to the menu.
    await page.locator('[data-menu-page="online"]').tap();
    await opens(page, "online", "page");
    await sheet(page, "online").locator('input[name="profileName"]').fill("Maria");
    await sheet(page, "online").locator('[data-action="create"]').tap();
    await opens(page, "create-table", "page");
    await sheet(page, "create-table").locator(".page-back").tap();
    await opens(page, "online", "page");
    await sheet(page, "online").locator(".page-back").tap();
    await noSheet(page);

    // And Deal, in the bar, starts the game.
    await page.locator('[data-menu-page="new-game"]').tap();
    await sheet(page, "new-game").locator('.page-bar [data-action="deal"]').tap();
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    await noSheet(page);
    expect(problems).toEqual([]);
  });

  test("the menu list at a table opens each sheet it lists, and each goes back to the list; Resume and Esc go on with the game", async ({ page }) => {
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    await bids(page).first().waitFor();
    // A solo game waits while the menu is open, and goes on when it is closed.
    await page.locator('.stage [data-round-button="menu"]').tap();
    await opens(page, "menu", "bottom");
    await expect(sheet(page, "menu").locator(".sheet-title")).toHaveText("Paused");
    for (const [item, name, placement, close] of [
      ["history", "history", "side", "close"],
      ["last-trick", "last-trick", "side", "close"],
      ["settings", "settings", "bottom", "done"],
      ["rules", "rules", "bottom", "close"],
    ] as const) {
      await sheet(page, "menu").locator(`[data-menu-item="${item}"]`).tap();
      await opens(page, name, placement);
      await sheet(page, name).locator(`[data-action="${close}"]`).tap();
      await opens(page, "menu", "bottom");
    }
    // Esc closes the sheet on top and no more: from Rules it goes back to the list, and from the list to the table.
    await sheet(page, "menu").locator('[data-menu-item="rules"]').tap();
    await opens(page, "rules", "bottom");
    await page.keyboard.press("Escape");
    await opens(page, "menu", "bottom");
    await sheet(page, "menu").locator('[data-action="resume"]').tap();
    await noSheet(page);
    await page.locator('.stage [data-round-button="menu"]').tap();
    await opens(page, "menu", "bottom");
    await page.keyboard.press("Escape");
    await noSheet(page);
    // The game went on: the strip still asks for a bid, which one tap answers.
    await expect(bids(page).first()).toBeVisible();
  });

  test("the scoreboard's sheet is a side sheet with three tabs, and the round chip, the trump and the panels open it", async ({ page }) => {
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await bids(page).first().waitFor();
    await page.locator('.stage [data-round-button="scores"]').tap();
    await opens(page, "scores", "side");
    const tabs = sheet(page, "scores").locator('[role="tab"]');
    await expect(tabs).toHaveText(["Scores", "History", "Last trick"]);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await tabs.nth(1).tap();
    await expect(sheet(page, "scores").locator('[role="tabpanel"]:not([hidden]) .sheet-table')).toBeVisible();
    await tabs.nth(2).tap();
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    // The arrows move between the tabs, and Esc closes the sheet.
    await tabs.nth(2).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await noSheet(page);
    for (const opener of ['.stage [data-round-button="trump"]', ".stage .side-scores", ".stage .side-trick"]) {
      await page.locator(opener).tap();
      await opens(page, "scores", "side");
      // It opens on the scores, whichever tab it was left on.
      await expect(sheet(page, "scores").locator('[role="tab"]').first()).toHaveAttribute("aria-selected", "true");
      await sheet(page, "scores").locator('[data-action="close"]').tap();
      await noSheet(page);
    }
  });

  test("the table under a sheet takes no touch, and Tab stays in the sheet", async ({ page }) => {
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await bids(page).first().waitFor();
    await page.locator('.stage [data-round-button="menu"]').tap();
    await opens(page, "menu", "bottom");
    // A tap on the round history button, at the foot on the left where the sheet is not, does nothing: the sheet is still
    // up and no other has opened.
    const before = await questionOf(page);
    const button = (await page.locator('.stage [data-round-button="history"]').boundingBox())!;
    await page.touchscreen.tap(button.x + button.width / 2, button.y + button.height / 2);
    await expect(sheet(page, "menu")).toBeVisible();
    await expect(page.locator(".sheet:not([hidden])")).toHaveCount(1);
    expect(await questionOf(page)).toBe(before);
    // Tab goes round the controls of the sheet, and never to the table's.
    const inside = async () => page.evaluate(() => document.activeElement?.closest(".sheet") !== null);
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press("Tab");
      expect(await inside(), `Tab ${step}`).toBe(true);
    }
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press("Shift+Tab");
      expect(await inside(), `Shift+Tab ${step}`).toBe(true);
    }
  });

  test("a layout change while a sheet is open places it again: turned upright and back, it is where it was", async ({ page }) => {
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await bids(page).first().waitFor();
    await page.locator('.stage [data-round-button="scores"]').tap();
    await opens(page, "scores", "side");
    const before = (await sheet(page, "scores").boundingBox())!;
    expect(before.x + before.width).toBeCloseTo(PHONE.width, 0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "desktop");
    // The desktop's table has no scoreboard sheet's side place: the sheet is a dialog in the middle of the window.
    expect(await placementOf(page, "scores")).toBe("dialog");
    const dialog = (await sheet(page, "scores").boundingBox())!;
    expect(dialog.x + dialog.width / 2).toBeCloseTo(640, 0);
    await page.setViewportSize(PHONE);
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
    expect(await placementOf(page, "scores")).toBe("side");
    const after = (await sheet(page, "scores").boundingBox())!;
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.width).toBeCloseTo(before.width, 0);
  });
});

test.describe("a page open when the window changes", () => {
  test.use({ viewport: PHONE, ...touch });

  test("is the desktop's dialog again with its title, its Deal and no Back where the desktop has them, and a page once more when turned back", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-menu-page="new-game"]').tap();
    await opens(page, "new-game", "page");
    const where = () =>
      sheet(page, "new-game").evaluate((node) => ({
        title: node.querySelector(":scope > .sheet-title") !== null,
        bar: node.querySelector(":scope > .page-bar") !== null,
        dealIn: node.querySelector('[data-action="deal"]')?.parentElement?.className ?? null,
        back: getComputedStyle(node.querySelector(".page-back")!).display,
      }));
    expect(await where()).toEqual({ title: false, bar: true, dealIn: "page-bar", back: "grid" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "desktop");
    expect(await placementOf(page, "new-game")).toBe("dialog");
    expect(await where()).toEqual({ title: true, bar: false, dealIn: "sheet-actions", back: "none" });
    await page.setViewportSize(PHONE);
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
    expect(await placementOf(page, "new-game")).toBe("page");
    expect(await where()).toEqual({ title: false, bar: true, dealIn: "page-bar", back: "grid" });
  });
});

test.describe("a whole solo game under a finger at 832 by 384", () => {
  test.use({ viewport: PHONE, ...touch });

  test("is played to the results, with the round's end and the results as bottom sheets that the history goes back to", async ({ page }) => {
    test.setTimeout(280_000);
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await page.goto("/?solo=2&seed=7&speed=4&wait=1");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    expect(await layoutOf(page)).toBe("scaled");
    await bids(page).first().waitFor();

    await playToTheResults([page], 260_000, async (on) => {
      await opens(on, "round", "bottom");
      await historyAndBack(on, "round");
    });
    await opens(page, "game-over", "bottom");
    await expect(sheet(page, "game-over").locator(".sheet-title")).toHaveText("Final results");
    await historyAndBack(page, "game-over");
    await sheet(page, "game-over").locator('[data-action="main-menu"]').tap();
    await expect(page.locator(".menu-page")).toBeVisible();
    expect(problems).toEqual([]);
  });
});

// A phone's context, with a page that plays at the speed the tests do.
async function phone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: PHONE, ...touch });
  await context.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
  return { context, page: await context.newPage() };
}

test.describe("a whole online game under a finger at 832 by 384", () => {
  test("is made on the Play online and Create a table pages, joined by its link, started from the lobby page and played to the results by two phones", async ({ browser }) => {
    test.setTimeout(290_000);
    const alice = await phone(browser);
    const bob = await phone(browser);
    const problems: string[] = [];
    for (const each of [alice, bob]) {
      each.page.on("pageerror", (error) => problems.push(error.message));
    }
    const page = alice.page;
    await page.goto("/");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    await page.locator('[data-menu-page="online"]').tap();
    await opens(page, "online", "page");
    await sheet(page, "online").locator('input[name="profileName"]').fill("Alice");
    await sheet(page, "online").locator('[data-action="create"]').tap();
    await opens(page, "create-table", "page");
    const create = sheet(page, "create-table");
    await create.locator('input[name="seats"]').fill("2");
    await create.locator('select[name="seatKind0"]').selectOption("open");
    await create.locator('input[name="waitEachRound"]').check();
    await create.locator('.sliders input[type="range"]').first().focus();
    await page.keyboard.press("End");
    await create.locator('.page-bar [data-action="create"]').tap();
    await opens(page, "lobby", "page");
    const code = /Table ([A-Z0-9]{6})/.exec((await sheet(page, "lobby").locator(".sheet-title").textContent()) ?? "")?.[1];
    expect(code).toBeDefined();
    await expect(sheet(page, "lobby").locator('.page-bar [data-action="start"]')).toBeDisabled();

    // Bob comes by the link, to the Play online page with the code in it, and joins.
    await bob.page.goto(`/t/${code}`);
    await opens(bob.page, "online", "page");
    await expect(sheet(bob.page, "online").locator('input[name="tableCode"]')).toHaveValue(code!);
    await sheet(bob.page, "online").locator('input[name="profileName"]').fill("Bob");
    await sheet(bob.page, "online").locator('.page-bar [data-action="join"]').tap();
    await opens(bob.page, "lobby", "page");

    await sheet(page, "lobby").locator('.page-bar [data-action="start"]:not(:disabled)').tap();
    for (const each of [alice, bob]) {
      await expect(each.page.locator("body")).toHaveAttribute("data-status", "at a table");
      expect(await layoutOf(each.page)).toBe("scaled");
      await expect(each.page.locator(".stage .seat:not([hidden])")).toHaveCount(2);
    }
    // The menu at an online table is the same list, which does not hold the game.
    await bob.page.locator('.stage [data-round-button="menu"]').tap();
    await opens(bob.page, "menu", "bottom");
    await expect(sheet(bob.page, "menu").locator(".sheet-title")).toHaveText("Menu");
    await expect(sheet(bob.page, "menu").locator('[data-menu-item="leave"]')).toContainText("Leave table");
    await sheet(bob.page, "menu").locator('[data-action="stay"]').tap();
    await noSheet(bob.page);

    await playToTheResults([alice.page, bob.page], 270_000, async (on) => {
      await opens(on, "round", "bottom");
      await historyAndBack(on, "round");
    });
    await opens(alice.page, "game-over", "bottom");
    await expect(sheet(alice.page, "game-over").locator(".sheet-title")).toHaveText("Final results");
    await historyAndBack(alice.page, "game-over");
    await expect(sheet(alice.page, "game-over").getByRole("button", { name: "Leave table" })).toBeVisible();
    expect(problems).toEqual([]);
    await alice.context.close();
    await bob.context.close();
  });
});

// Full screen, which a headless browser cannot be put in the way a phone is: the page's request for it is observed by
// a stand-in for requestFullscreen and for the orientation lock, and a page in full screen is shown to it by a stand-in
// for what it asks the document, with the window made larger as a phone's is.
const STUBS = () => {
  const seen = { fullscreen: 0, lock: [] as string[], refuse: false };
  Object.assign(window, { __seen: seen, __fullscreenElement: null });
  Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
  Object.defineProperty(document, "fullscreenElement", { get: () => (window as unknown as { __fullscreenElement: Element | null }).__fullscreenElement, configurable: true });
  Element.prototype.requestFullscreen = function () {
    seen.fullscreen += 1;
    return seen.refuse ? Promise.reject(new Error("refused")) : Promise.resolve();
  };
  Object.defineProperty(screen, "orientation", {
    value: {
      lock: (orientation: string) => {
        seen.lock.push(orientation);
        return seen.refuse ? Promise.reject(new Error("refused")) : Promise.resolve();
      },
    },
    configurable: true,
  });
};

type Seen = { fullscreen: number; lock: string[]; refuse: boolean };
const seenOf = (page: Page) => page.evaluate(() => (window as unknown as { __seen: Seen }).__seen);
const fullscreenIs = (page: Page, on: boolean) =>
  page.evaluate((now) => {
    (window as unknown as { __fullscreenElement: Element | null }).__fullscreenElement = now ? document.documentElement : null;
    document.dispatchEvent(new Event("fullscreenchange"));
  }, on);

test.describe("full screen", () => {
  test.use({ viewport: { width: 754, height: 247 }, ...touch });

  test("is asked for by the notice at a table drawn small, and then the phone is asked to be held sideways", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await page.addInitScript(STUBS);
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await bids(page).first().waitFor();
    const notice = page.locator(".stage .scaled-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("The table is small here.");
    expect(await seenOf(page)).toEqual({ fullscreen: 0, lock: [], refuse: false });
    await notice.locator('[data-action="fullscreen"]').tap();
    expect(await seenOf(page)).toEqual({ fullscreen: 1, lock: ["landscape"], refuse: false });
    // The notice is up until the page is in full screen, which the browser says.
    await expect(notice).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("is a request the browser may refuse, which the page ignores", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("console", (message) => message.type() === "error" && problems.push(message.text()));
    await page.addInitScript(STUBS);
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await bids(page).first().waitFor();
    await page.evaluate(() => ((window as unknown as { __seen: Seen }).__seen.refuse = true));
    await page.locator('.stage .scaled-notice [data-action="fullscreen"]').tap();
    await expect.poll(async () => (await seenOf(page)).fullscreen).toBe(1);
    // A refused request leaves the page as it was, and the lock asked for after it is refused too.
    expect((await seenOf(page)).lock).toEqual(["landscape"]);
    await expect(page.locator(".stage .scaled-notice")).toBeVisible();
    await expect(page.locator(".stage .seat:not([hidden])")).toHaveCount(3);
    expect(problems).toEqual([]);
  });

  test("entering and leaving it redraws the table for the window it then has, and hides and shows the notice and every button", async ({ page }) => {
    await page.addInitScript(STUBS);
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await bids(page).first().waitFor();
    const scale = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".stage")!).getPropertyValue("--scale")));
    const plate = async () => (await page.locator(".stage .seat.mine").boundingBox())!;
    expect(await scale()).toBeCloseTo(754 / 1098.95, 1);
    await expect(page.locator(".stage .scaled-notice")).toBeVisible();
    const small = await plate();

    // In full screen the window is the screen, which is larger, and the browser says so.
    await fullscreenIs(page, true);
    await page.setViewportSize({ width: 915, height: 412 });
    await expect(page.locator(".stage .scaled-notice")).toBeHidden();
    await expect(page.locator('[data-action="fullscreen"]:visible')).toHaveCount(0);
    expect(await scale()).toBeGreaterThan(1);
    // The table is drawn again for the larger window, not stretched: its plate has moved with the window's middle.
    expect((await plate()).x).not.toBeCloseTo(small.x, 0);
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
    await expect(page.locator(".stage .seat:not([hidden])")).toHaveCount(3);

    // And out of it, the table is drawn small again with the notice, which nothing dismissed.
    await fullscreenIs(page, false);
    await page.setViewportSize({ width: 754, height: 247 });
    await expect(page.locator(".stage .scaled-notice")).toBeVisible();
    expect(await scale()).toBeCloseTo(754 / 1098.95, 1);
    expect((await plate()).x).toBeCloseTo(small.x, 0);

    // The browser saying so is enough to hide it, without the window changing size.
    await fullscreenIs(page, true);
    await expect(page.locator(".stage .scaled-notice")).toBeHidden();
    await fullscreenIs(page, false);
    await expect(page.locator(".stage .scaled-notice")).toBeVisible();
  });

  test("is not offered to a page from the home screen, nor to a mouse, nor to a browser with none, which is told to add the page instead", async ({ page, browser }) => {
    // From the home screen.
    await page.addInitScript(STUBS);
    await page.addInitScript(() => {
      const ask = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        const real = ask(query);
        return /display-mode: (standalone|fullscreen)/.test(query) ? ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList) : real;
      };
    });
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await bids(page).first().waitFor();
    await expect(page.locator(".stage .scaled-notice")).toBeHidden();
    await expect(page.locator('[data-action="fullscreen"]:visible')).toHaveCount(0);

    // A mouse has the desktop's table at any size, with no notice.
    const mouse = await browser.newContext({ viewport: { width: 754, height: 247 }, hasTouch: false, isMobile: false });
    const there = await mouse.newPage();
    await there.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
    await there.goto("/?solo=3&seed=7&speed=4&wait=1");
    await expect(there.locator(".window")).toHaveAttribute("data-layout", "desktop");
    await expect(there.locator(".scaled-notice")).toBeHidden();
    await mouse.close();

    // A browser with no full screen is told about the home screen, and has no button for it.
    const bare = await browser.newContext({ viewport: { width: 754, height: 247 }, ...touch });
    const none = await bare.newPage();
    await none.addInitScript(() => {
      window.localStorage.setItem("whist.pace", "off");
      Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true });
    });
    await none.goto("/?solo=3&seed=7&speed=4&wait=1");
    await expect(none.locator(".stage .scaled-notice")).toContainText("Add the page to the home screen");
    await expect(none.locator('.stage .scaled-notice [data-action="fullscreen"]')).toBeHidden();
    await bare.close();
  });

  test("is offered on the upright hint, the too-small page, the scaled main menu and the menu list, and put away for the visit with the notice's ×", async ({ page }) => {
    await page.addInitScript(STUBS);
    await page.goto("/");
    await expect(page.locator('.menu-page [data-action="fullscreen"]')).toBeVisible();
    await page.locator('.menu-page [data-action="fullscreen"]').tap();
    expect((await seenOf(page)).fullscreen).toBe(1);

    // The menu list at a window that draws the table at its size or larger.
    await page.setViewportSize(PHONE);
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await bids(page).first().waitFor();
    await page.locator('.stage [data-round-button="menu"]').tap();
    await expect(sheet(page, "menu").locator('[data-action="fullscreen"]')).toBeVisible();
    await sheet(page, "menu").locator('[data-action="fullscreen"]').tap();
    expect((await seenOf(page)).fullscreen).toBe(1);
    await page.keyboard.press("Escape");

    // The hint on a phone held upright, and the page for a window below the floor.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.rotate-hint [data-action="fullscreen"]')).toBeVisible();
    await page.setViewportSize({ width: 380, height: 213 });
    await expect(page.locator('.too-small [data-action="fullscreen"]')).toBeVisible();

    // The notice is put away by its ×, for the visit, and a reload does not bring it back.
    await page.setViewportSize({ width: 754, height: 247 });
    const notice = page.locator(".stage .scaled-notice");
    await expect(notice).toBeVisible();
    await notice.locator(".notice-dismiss").tap();
    await expect(notice).toBeHidden();
    await page.reload();
    await bids(page).first().waitFor();
    await expect(notice).toBeHidden();
  });
});

test.describe("the web app manifest", () => {
  test("is served by the game server as JSON, with icons that are PNG files of the sizes it says, linked from the page and allowed by its policy", async ({ page, request }) => {
    const violations: string[] = [];
    await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (event) => ((window as unknown as { __blocked: string[] }).__blocked = [...((window as unknown as { __blocked?: string[] }).__blocked ?? []), event.blockedURI])));
    await page.goto("/");
    const links = await page.evaluate(() => ({
      manifest: document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? null,
      apple: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ?? null,
      theme: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null,
    }));
    expect(links.manifest).toMatch(/\/manifest\.json$/);
    const response = await request.get(links.manifest!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/^application\/(manifest\+)?json/);
    const manifest = await response.json();
    expect(manifest).toMatchObject({ name: "Romanian Whist", display: "fullscreen", orientation: "landscape", start_url: "/", scope: "/" });
    expect(links.theme).toBe(manifest.theme_color);
    for (const icon of [...manifest.icons, { src: new URL(links.apple!).pathname, sizes: "180x180", type: "image/png" }]) {
      const file = await request.get(icon.src);
      expect(file.status(), icon.src).toBe(200);
      expect(file.headers()["content-type"], icon.src).toBe(icon.type);
      const bytes = await file.body();
      expect(bytes.subarray(1, 4).toString(), icon.src).toBe("PNG");
      expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.src).toBe(icon.sizes);
    }
    // The page's own fetches of them are allowed by its policy: nothing is blocked.
    await page.evaluate(async (urls) => {
      for (const url of urls) {
        const image = new Image();
        image.src = url;
        await image.decode();
      }
    }, [new URL(links.apple!).pathname, ...manifest.icons.map((icon: { src: string }) => icon.src)]);
    await page.evaluate(async (url) => (await fetch(url)).json(), links.manifest!);
    violations.push(...((await page.evaluate(() => (window as unknown as { __blocked?: string[] }).__blocked)) ?? []));
    expect(violations).toEqual([]);
  });
});

test.describe("a mouse at 844 by 390", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: false, isMobile: false });

  test("has the desktop's table and each sheet as a centred dialog, which the menu bar, the corner buttons and Esc raise", async ({ page }) => {
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await bids(page).first().waitFor();
    expect(await layoutOf(page)).toBe("desktop");
    const dialog = async (name: string) => {
      await expect(sheet(page, name)).toBeVisible();
      expect(await placementOf(page, name), name).toBe("dialog");
      const box = (await sheet(page, name).boundingBox())!;
      expect(box.x + box.width / 2).toBeCloseTo(422, 0);
      await expect(sheet(page, name).locator(".page-back")).toBeHidden();
    };
    await page.locator('[data-menu="settings"]').click();
    await dialog("settings");
    await sheet(page, "settings").locator('[data-action="done"]').click();
    await page.locator('[data-menu="rules"]').click();
    await dialog("rules");
    await sheet(page, "rules").locator('[data-action="close"]').click();
    await page.locator('[data-button="history"]').click();
    await dialog("history");
    await sheet(page, "history").locator('[data-action="close"]').click();
    await page.keyboard.press("Escape");
    await dialog("pause");
    // The menu list is for the scaled table: a mouse is never shown it.
    await expect(page.locator(".menu-sheet:not([hidden])")).toHaveCount(0);
  });
});
