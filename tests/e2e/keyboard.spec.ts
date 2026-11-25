import { expect, test, type Page } from "@playwright/test";
import { ASK, answerByKeys, dealByKeys, playToTheResults, sheet, tabTo, untilCardsToChooseFrom } from "./keyboard";
import { visitor, withServer } from "./ownServer";

// Nothing flies, so what is on the table is what the server last said.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
});

test("a whole solo game is played with the keyboard alone, from the main menu to the final results", async ({ page }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
  await dealByKeys(page, { waitForMe: true });

  const answered = await playToTheResults(page);
  // Twenty rounds of two players: a bid in each, and a card in each of the 76 tricks.
  expect(answered).toBe(20 + 76);

  const over = sheet(page, "game-over");
  await expect(over.locator(".sheet-title")).toHaveText("Final results");
  // The results have the keyboard, and Enter on Main menu leaves the table: the way out is a key too.
  await tabTo(page, '[data-action="main-menu"]');
  await page.keyboard.press("Enter");
  await expect(page.locator(".menu-page")).toBeVisible();
  expect(problems).toEqual([]);
});

test.describe("the table's keys", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?solo=3&seed=7&speed=4");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    await page.locator(ASK).first().waitFor();
  });

  test("a bid is a digit, the struck-out digit bids nothing, and Left and Right pick one that Enter takes", async ({ page }) => {
    const strip = page.locator(".bidstrip:not([hidden])");
    await expect(strip).toBeVisible();
    // A digit above the highest bid is not a bid.
    await page.keyboard.press("9");
    await expect(strip).toBeVisible();
    // Right picks the first bid and lights it as the cursor lights one; Left the one before it, if any.
    await page.keyboard.press("ArrowRight");
    await expect(strip.locator(".opt.selected")).toHaveText("0");
    await expect(strip.locator(".opt.selected")).toBeFocused();
    // The pick is said to a screen reader as a pressed button, the others as not pressed.
    await expect(strip.locator('.opt[aria-pressed="true"]')).toHaveText("0");
    await expect(strip.locator('.opt[aria-pressed="false"]').first()).toHaveText("1");
    await page.keyboard.press("ArrowRight");
    await expect(strip.locator(".opt.selected")).toHaveText("1");
    await page.keyboard.press("ArrowLeft");
    await expect(strip.locator(".opt.selected")).toHaveText("0");
    await page.keyboard.press("Enter");
    await expect(strip).toBeHidden();
  });

  test("a card is a digit from the left, and Left and Right pick a card that can be played, raised as the cursor raises one", async ({ page }) => {
    // The first round deals one card: bid, and the card is asked.
    await page.keyboard.press("0");
    await expect(page.locator(".hand .hcard.playable").first()).toBeVisible();
    const card = page.locator(".hand .hcard.playable").first();
    // The picked card is raised and named, and nothing is played until Enter.
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("ArrowRight");
    await expect(card).toHaveClass(/selected/);
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(card).toHaveAccessibleName(/, playable$/);
    expect(await card.locator(".face").evaluate((face) => getComputedStyle(face).transform)).toBe("matrix(1, 0, 0, 1, 0, -30)");
    await expect(page.locator(".trick .card:not([hidden])")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(page.locator(".hand .hcard.playable")).toHaveCount(0);
  });

  test("a modified digit and a held digit do nothing", async ({ page }) => {
    const strip = page.locator(".bidstrip:not([hidden])");
    await page.keyboard.press("Control+0");
    await page.keyboard.press("Alt+0");
    await page.keyboard.press("Shift+0");
    await expect(strip).toBeVisible();
    // A held key repeats: the first press answers, and the repeats are not heard.
    await page.keyboard.down("0");
    await page.keyboard.down("0");
    await page.keyboard.down("0");
    await page.keyboard.up("0");
    await expect(strip).toBeHidden();
  });

  test("Alt+R opens the rules, over which no digit bids or plays and Esc closes them, Alt+S the settings, and Alt+X the pause menu", async ({ page }) => {
    await page.keyboard.press("Alt+R");
    await expect(sheet(page, "rules")).toBeVisible();
    // The sheet holds the table: a digit and the arrows do nothing to it.
    await page.keyboard.press("0");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page.locator(".bidstrip:not([hidden])")).toHaveCount(1);
    await expect(page.locator(".bidstrip .opt.selected")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(sheet(page, "rules")).toHaveCount(0);

    await page.keyboard.press("Alt+S");
    await expect(sheet(page, "settings")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Alt+X");
    await expect(sheet(page, "pause")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page, "pause")).toHaveCount(0);
    // The table takes the keys again.
    await page.keyboard.press("0");
    await expect(page.locator(".bidstrip:not([hidden])")).toBeHidden();
  });

  test("Tab reaches the controls of the table, and focus is always to be seen", async ({ page }) => {
    // The menu bar, then the corner buttons, the bids; each takes the keyboard in turn and shows it.
    const seen: string[] = [];
    for (let presses = 0; presses < 20; presses++) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const node = document.activeElement as HTMLElement | null;
        if (node === null || node === document.body) {
          return null;
        }
        // Shown as the page shows a focused control of its kind: a bid is picked, a menu item has its
        // hover fill, and any other has an outline.
        const style = getComputedStyle(node);
        const kind = node.matches(".opt") ? "opt" : node.matches(".btn") ? "btn" : node.matches(".menu-item") ? "menu-item" : node.className;
        const lit = kind === "opt" ? node.classList.contains("selected") : kind === "menu-item" ? style.backgroundColor !== "rgba(0, 0, 0, 0)" : style.outlineStyle !== "none";
        return `${kind}:${lit}`;
      });
      if (where !== null) {
        seen.push(where);
      }
    }
    expect(seen.length).toBeGreaterThan(8);
    expect(seen.filter((one) => one.endsWith(":false"))).toEqual([]);
    expect(seen.some((one) => one.startsWith("menu-item"))).toBe(true);
    expect(seen.some((one) => one.startsWith("opt"))).toBe(true);
    expect(seen.some((one) => one.startsWith("btn"))).toBe(true);
  });
});

test("Enter plays only what is picked: a card that kept the keyboard from a pick is not played in the next trick", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?solo=3&seed=7&speed=4");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  const held = await untilCardsToChooseFrom(page, 2);
  expect(held).toBeGreaterThanOrEqual(2);
  const slots = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".hand .hcard.playable"), (card) => Number(card.dataset.slot)).sort((a, b) => a - b));
  const title = await page.locator(".tp-title").textContent();

  // Pick the first card with an arrow, then play the last that can be played by its digit.
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(`.hand .hcard.playable[data-slot="${slots[0]}"]`)).toHaveClass(/selected/);
  await page.keyboard.press(String(slots[slots.length - 1] + 1));
  await expect(page.locator(".hand .hcard.selected")).toHaveCount(0);

  // In the next trick the first card is asked for again, and nothing is picked. The keyboard is not left
  // on it, so Enter plays nothing, and a card Enter did play would have been raised first.
  await expect(page.locator(".tp-title")).not.toHaveText(title ?? "");
  await page.locator(".hand .hcard.playable").first().waitFor();
  const asked = await page.locator(".hand .hcard.playable").count();
  expect(await page.evaluate(() => document.activeElement?.closest(".hand, .bidstrip") ?? null)).toBeNull();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await expect(page.locator(".hand .hcard.playable")).toHaveCount(asked);
  await expect(page.locator(".hand .hcard.selected")).toHaveCount(0);

  // Right picks, and Enter then plays what was seen raised.
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".hand .hcard.selected")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".hand .hcard.playable")).toHaveCount(0);
});

// The slowest computer players rest 2.4 seconds on a round, so a sheet that is gone within one second
// was closed by the key.
test("Space closes the round sheet the game only rests on, with the keyboard on nothing as the last answer left it, and the digits do not act in a text field", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/?solo=3&seed=7&speed=0");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  await page.locator(ASK).first().waitFor();

  // A digit typed in New Game's name field is a character, with the table behind it asking for a bid.
  await page.keyboard.press("Alt+N");
  await tabTo(page, 'input[name="humanName"]');
  await page.keyboard.press("Control+A");
  await page.keyboard.type("A1");
  await expect(sheet(page, "new-game").locator('input[name="humanName"]')).toHaveValue("A1");
  await page.keyboard.press("Escape");
  await expect(sheet(page, "new-game")).toHaveCount(0);

  for (let answers = 0; answers < 2; answers++) {
    await page.locator(ASK).first().waitFor();
    await answerByKeys(page, answers);
    await expect(page.locator(ASK)).toHaveCount(0);
  }
  const round = sheet(page, "round");
  await expect(round).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("body")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(round).toHaveCount(0, { timeout: 1000 });
  await expect(page.locator(".score-round")).toHaveText("Round 2 of 23", { timeout: 10_000 });
});

// Where the keyboard is: on the open sheet, on the strip of notices, or anywhere else, which a sheet over the table
// must never let it reach.
async function keyboardOn(page: Page): Promise<string> {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (node?.closest(".sheet-layer .sheet:not([hidden])")) {
      return "sheet";
    }
    if (node?.closest(".notices")) {
      return "notices";
    }
    return node === null || node === document.body ? "nothing" : `${node.tagName}.${node.className}`;
  });
}

// Tab, or Shift+Tab, until the keyboard is on the wanted button, each stop on the way checked.
async function tabWithinTo(page: Page, wanted: string, key = "Tab"): Promise<void> {
  for (let presses = 0; presses < 12; presses++) {
    await page.keyboard.press(key);
    expect(["sheet", "notices"]).toContain(await keyboardOn(page));
    if (await page.evaluate((selector) => document.activeElement?.matches(selector) === true, wanted)) {
      return;
    }
  }
  throw new Error(`Tab did not reach ${wanted}`);
}

// A server of its own, which asks after two seconds of waiting on you, the pause counted, and gives four to answer.
test("with a sheet up, Tab reaches the notice's I'm here and I'm back, Enter on either sends back, and Tab never leaves for the table", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await withServer(8093, { still_here_after_ms: 2000, still_here_answer_ms: 4000 }, async (_running, keep) => {
    const context = await visitor(browser, 8093);
    keep(context);
    const page = await context.newPage();
    const sent: string[] = [];
    page.on("websocket", (socket) => socket.on("framesent", (frame) => sent.push(String(JSON.parse(String(frame.payload)).type))));
    await page.goto("/?solo=3");
    await page.locator(ASK).first().waitFor();
    await page.keyboard.press("Escape");
    const pause = sheet(page, "pause");
    await expect(pause).toBeVisible();
    await expect(pause.locator('[data-action="resume"]')).toBeFocused();

    const asking = page.locator('.notice[data-notice="still-here"]');
    await expect(asking).toBeVisible({ timeout: 15_000 });
    await tabWithinTo(page, '.notice[data-notice="still-here"] .notice-btn');
    const before = sent.length;
    await page.keyboard.press("Enter");
    await expect(asking).toHaveCount(0);
    await expect.poll(() => sent.slice(before)).toEqual(["back"]);
    // The sheet is still up, and has the keyboard back from the notice that went.
    await expect(pause).toBeVisible();
    await expect(pause.locator('[data-action="resume"]')).toBeFocused();

    // Asked again and left unanswered, the server counts you gone, which stays until something is sent.
    const gone = page.locator('.notice[data-notice="gone"]');
    await expect(gone).toBeVisible({ timeout: 20_000 });
    // Round and round both ways, the keyboard stays on the sheet and the strip.
    for (const key of ["Tab", "Shift+Tab"]) {
      const seen = new Set<string>();
      for (let presses = 0; presses < 7; presses++) {
        await page.keyboard.press(key);
        seen.add(await keyboardOn(page));
      }
      expect([...seen].sort()).toEqual(["notices", "sheet"]);
    }
    await tabWithinTo(page, '.notice[data-notice="gone"] .notice-btn', "Shift+Tab");
    const later = sent.length;
    await page.keyboard.press("Enter");
    await expect(gone).toHaveCount(0);
    await expect.poll(() => sent.slice(later)).toEqual(["back"]);
    await expect(pause).toBeVisible();
    await expect(pause.locator('[data-action="resume"]')).toBeFocused();
  });
});
