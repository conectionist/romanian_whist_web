import { expect, test, type Page } from "@playwright/test";
import { decide, waitForTurn } from "./support";

// Nothing flies, so what is on the table is what the server last said.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
});

const sheet = (page: Page, name: string) => page.locator(`.sheet[data-sheet="${name}"]:not([hidden])`);
const anySheet = (page: Page) => page.locator(".sheet:not([hidden])");

// A table's cells are one flat grid: this is one column of it, as text and whether each cell is bold.
async function column(page: Page, name: string, columns: number, index: number): Promise<{ text: string; strong: boolean }[]> {
  return sheet(page, name)
    .locator(".td")
    .evaluateAll(
      (cells, [count, at]) =>
        cells.filter((_, position) => position % count === at).map((cell) => ({ text: cell.textContent ?? "", strong: cell.classList.contains("strong") })),
      [columns, index],
    );
}

// A game is started and its first question is up: the page has drawn the table and holds a prompt.
async function start(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  await waitForTurn(page);
}

// Answers the bid and the card of the first round, which deals one card: the round is then scored.
async function playFirstRound(page: Page): Promise<void> {
  for (let decisions = 0; decisions < 2; decisions++) {
    await decide(page);
    await expect(page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable")).toHaveCount(0);
  }
}

test.describe("the round sheet", () => {
  test("waits for you with the round's results, shows the history over itself, and Continue deals the next round", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await start(page, "solo=3&seed=7&speed=4&wait=1");
    await playFirstRound(page);

    const round = sheet(page, "round");
    await expect(round).toBeVisible();
    await expect(round.locator(".sheet-title")).toHaveText("Round 1 · 1 card · Normal");
    await expect(round.locator(".th")).toHaveText(["Player", "Bid", "Taken", "Round", "Total"]);
    // A row for each seat, yours first and in bold.
    const names = await column(page, "round", 5, 0);
    expect(names.map((name) => name.text)).toEqual(["Player", "Ana", "Bogdan"]);
    expect(names.map((name) => name.strong)).toEqual([true, false, false]);
    // The table under the dim takes no clicks: the sheet covers it, and Continue is what is live.
    await expect(page.locator(".view")).toHaveJSProperty("inert", true);
    await expect(round.getByRole("button", { name: "Continue" })).toBeEnabled();
    await expect(page.locator('[data-menu="exit"]')).toBeDisabled();

    // Round history, opened over the round sheet and closed back to it.
    await round.getByRole("button", { name: "Round history" }).click();
    await expect(sheet(page, "history")).toBeVisible();
    await expect(sheet(page, "history").locator(".td").first()).toHaveText("1");
    await sheet(page, "history").getByRole("button", { name: "Close" }).click();
    await expect(round).toBeVisible();

    await round.getByRole("button", { name: "Continue" }).click();
    await expect(anySheet(page)).toHaveCount(0);
    await expect(page.locator(".score-round")).toHaveText("Round 2 of 23");
    await waitForTurn(page);
    expect(problems).toEqual([]);
  });

  test("is still up after a reload, with the same round, and Continue still deals the next one", async ({ page }) => {
    await start(page, "solo=3&seed=7&speed=4&wait=1");
    await playFirstRound(page);
    await expect(sheet(page, "round")).toBeVisible();
    const title = await sheet(page, "round").locator(".sheet-title").textContent();

    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    await expect(sheet(page, "round")).toBeVisible();
    await expect(sheet(page, "round").locator(".sheet-title")).toHaveText(title ?? "");

    await sheet(page, "round").getByRole("button", { name: "Continue" }).click();
    await expect(anySheet(page)).toHaveCount(0);
    await expect(page.locator(".score-round")).toHaveText("Round 2 of 23");
  });

  test("is not shown when the game does not wait for you", async ({ page }) => {
    await start(page, "solo=3&seed=7&speed=4");
    await playFirstRound(page);
    await expect(page.locator(".score-round")).toHaveText("Round 2 of 23");
    await expect(anySheet(page)).toHaveCount(0);
  });

  test("takes Esc without opening the pause menu over itself, since it holds the game already", async ({ page }) => {
    await start(page, "solo=3&seed=9&speed=4&wait=1");
    await playFirstRound(page);
    await expect(sheet(page, "round")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page, "round")).toBeVisible();
    await expect(sheet(page, "pause")).toHaveCount(0);
  });
});

test.describe("the sheets of the corner buttons and the menu bar", () => {
  test("the last trick says none has finished yet, and then who won the one that did", async ({ page }) => {
    await start(page, "solo=3&seed=7&speed=4");
    await page.locator('[data-button="last-trick"]').click();
    const trick = sheet(page, "last-trick");
    await expect(trick.locator(".sheet-meta")).toHaveText("No trick has finished yet.");
    await expect(trick.locator(".mini:not([hidden])")).toHaveCount(0);
    await trick.getByRole("button", { name: "Close" }).click();
    await expect(anySheet(page)).toHaveCount(0);

    await playFirstRound(page);
    await expect(page.locator(".score-round")).toHaveText("Round 2 of 23");
    await page.locator('[data-button="last-trick"]').click();
    await expect(trick.locator(".mini:not([hidden])")).toHaveCount(3);
    await expect(trick.locator(".mini.win")).toHaveCount(1);
    await expect(trick.locator(".sheet-meta")).toHaveText(/ won it · round 1$|^You won it · round 1$/);
    // Esc closes the sheet and does not pause the game.
    await page.keyboard.press("Escape");
    await expect(anySheet(page)).toHaveCount(0);
  });

  test("the history lists the rounds scored so far, and the rules are for the game on the table", async ({ page }) => {
    await start(page, "solo=3&seed=7&speed=4");
    await playFirstRound(page);
    await expect(page.locator(".score-round")).toHaveText("Round 2 of 23");

    await page.locator('[data-button="history"]').click();
    const history = sheet(page, "history");
    await expect(history.locator(".th")).toHaveText(["Round", "Cards", "Player", "Ana", "Bogdan"]);
    // One round and the totals.
    expect((await column(page, "history", 5, 0)).map((cell) => cell.text)).toEqual(["1", "Total"]);
    await page.keyboard.press("Escape");

    await page.locator('[data-menu="rules"]').click();
    const rules = sheet(page, "rules");
    await expect(rules.locator("li").first()).toHaveText("3 players use Ace down to 9: eight cards each, 24 in all.");
    await expect(rules.locator("li").nth(1)).toContainText("Rounds go 1 (×3)");
    await expect(rules.locator("li").nth(1)).toContainText("23 rounds");
    await rules.getByRole("button", { name: "Close" }).click();
    await expect(anySheet(page)).toHaveCount(0);
  });

  test("a sheet holds the game while it is up, so a reload finds it paused and offers Resume", async ({ page }) => {
    await start(page, "solo=3&seed=7&speed=4");
    await page.locator('[data-menu="rules"]').click();
    await expect(sheet(page, "rules")).toBeVisible();

    // The server holds the game for the sheet. A page loaded now is told so, and shows the pause menu.
    await expect.poll(async () => {
      await page.reload();
      await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
      return sheet(page, "pause").count();
    }).toBe(1);
  });
});

test.describe("the settings", () => {
  test("change the bot speed, the wait and the cards' animation, and the table keeps the speed and the wait", async ({ page }) => {
    await start(page, "solo=3&seed=7&speed=2");
    await page.locator('[data-menu="settings"]').click();
    const settings = sheet(page, "settings");
    await expect(settings.locator(".sheet-title")).toHaveText("Settings");
    const speed = settings.locator('input[type="range"]').first();
    const animations = settings.locator('input[type="range"]').nth(1);
    const wait = settings.locator('input[type="checkbox"]');
    await expect(speed).toHaveValue("2");
    await expect(animations).toHaveValue("0");
    await expect(wait).not.toBeChecked();

    await speed.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(speed).toHaveValue("4");
    await wait.check();
    await animations.focus();
    await page.keyboard.press("End");
    await expect(animations).toHaveValue("3");
    await settings.getByRole("button", { name: "Done" }).click();
    await expect(anySheet(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem("whist.pace"))).toBe("slow");

    // Opened again, it shows what the table says, which is the server's word on what was sent.
    await page.locator('[data-menu="settings"]').click();
    await expect(speed).toHaveValue("4");
    await expect(wait).toBeChecked();
    await expect(animations).toHaveValue("3");
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    await page.keyboard.press("Escape");
    await page.locator('[data-menu="settings"]').click();
    await expect(speed).toHaveValue("4");
    await expect(wait).toBeChecked();
  });
});

test.describe("pause", () => {
  test("Esc raises the pause menu, a reload finds the game held, Resume lets it go, and Main menu leaves the table", async ({ page }) => {
    await start(page, "solo=3&seed=7&speed=4");
    await page.keyboard.press("Escape");
    const pause = sheet(page, "pause");
    await expect(pause).toBeVisible();
    await expect(pause.locator(".sheet-title")).toHaveText("Paused");
    await expect(pause.getByRole("button", { name: "Resume" })).toBeFocused();

    await expect.poll(async () => {
      await page.reload();
      await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
      return sheet(page, "pause").count();
    }).toBe(1);

    await sheet(page, "pause").getByRole("button", { name: "Resume" }).click();
    await expect(anySheet(page)).toHaveCount(0);
    // Let go: a page loaded now finds the game running, and no sheet.
    await expect.poll(async () => {
      await page.reload();
      await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
      await page.waitForTimeout(150);
      return anySheet(page).count();
    }).toBe(0);

    // Exit says the same as Esc, and Esc again drops it.
    await page.locator('[data-menu="exit"]').click();
    await expect(sheet(page, "pause")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(anySheet(page)).toHaveCount(0);

    await page.keyboard.press("Escape");
    await sheet(page, "pause").getByRole("button", { name: "Main menu" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    await expect(anySheet(page)).toHaveCount(0);
    await expect(page.locator('[data-menu="exit"]')).toBeDisabled();
  });
});

test.describe("the end of a game", () => {
  test("shows the standings with the winner starred, Play again opens New Game for the next and Main menu leaves", async ({ page }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await start(page, "solo=2&seed=3&speed=4");

    // 20 rounds, answered with the lowest bid and the first legal card, until the sheet comes up.
    const over = sheet(page, "game-over");
    for (let decisions = 0; decisions < 300 && (await over.count()) === 0; decisions++) {
      await Promise.race([waitForTurn(page), over.waitFor()]);
      if ((await over.count()) > 0) {
        break;
      }
      await decide(page);
    }
    await expect(over).toBeVisible();
    await expect(over.locator(".sheet-title")).toHaveText("Final results");
    await expect(over.locator(".th")).toHaveText(["Place", "Player", "Total", ""]);
    const players = await column(page, "game-over", 4, 1);
    expect(players.map((cell) => cell.text).sort()).toEqual(["Ana", "Player"]);
    await expect(over.locator(".sheet-meta")).toHaveText(/ wins with -?\d+ points?\.| wins with a score of -\d+\.|tie for first with/);
    // The winner, or both on a tie, has the star, and every other row has none.
    const stars = (await column(page, "game-over", 4, 3)).map((cell) => cell.text);
    expect(stars.filter((star) => star === "★").length).toBeGreaterThanOrEqual(1);
    expect(stars.filter((star) => star === "★").length).toBe(players.filter((cell) => cell.strong).length);
    await expect(over.getByRole("button", { name: "Play again" })).toBeFocused();

    // A reload finds the table as it ended, with the same standings.
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    await expect(over).toBeVisible();
    expect((await column(page, "game-over", 4, 1)).map((cell) => cell.text).sort()).toEqual(["Ana", "Player"]);

    // As the desktop's, Play again opens New Game, and Cancel puts the results back.
    await over.getByRole("button", { name: "Play again" }).click();
    const game = sheet(page, "new-game");
    await expect(game).toBeVisible();
    await game.getByRole("button", { name: "Cancel" }).click();
    await expect(over).toBeVisible();
    await over.getByRole("button", { name: "Play again" }).click();
    await game.getByRole("button", { name: "Deal" }).click();
    await expect(anySheet(page)).toHaveCount(0);
    await expect(page.locator(".score-round")).toHaveText(/^Round 1 of \d+$/);
    await waitForTurn(page);

    // Esc, then Main menu: the table is left and nothing is shown for it.
    await page.keyboard.press("Escape");
    await sheet(page, "pause").getByRole("button", { name: "Main menu" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
    expect(problems).toEqual([]);
  });
});
