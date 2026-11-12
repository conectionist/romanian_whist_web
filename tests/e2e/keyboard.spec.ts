import { expect, test } from "@playwright/test";
import { ASK, answerByKeys, dealByKeys, playToTheResults, sheet, tabTo } from "./keyboard";

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
    // The picked card is raised, and nothing is played until Enter.
    await page.keyboard.press("ArrowRight");
    await expect(card).toHaveClass(/selected/);
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

test("Space lets a held round go when the keyboard is on nothing, and the digits do not act in a text field", async ({ page }) => {
  await page.goto("/?solo=3&seed=7&speed=4&wait=1");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  for (let answers = 0; answers < 2; answers++) {
    await page.locator(ASK).first().waitFor();
    await answerByKeys(page, answers);
    await expect(page.locator(ASK)).toHaveCount(0);
  }
  const round = sheet(page, "round");
  await expect(round).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Space");
  await expect(round).toHaveCount(0);
  await expect(page.locator(".score-round")).toHaveText("Round 2 of 23");
  await page.locator(ASK).first().waitFor();

  // A digit typed in New Game's name field is a character, with the table behind it asking for a bid.
  await page.keyboard.press("Alt+N");
  await tabTo(page, 'input[name="humanName"]');
  await page.keyboard.press("Control+A");
  await page.keyboard.type("A1");
  await expect(sheet(page, "new-game").locator('input[name="humanName"]')).toHaveValue("A1");
  await page.keyboard.press("Escape");
  await expect(sheet(page, "new-game")).toHaveCount(0);
});
