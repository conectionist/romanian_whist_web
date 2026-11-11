import { expect, test, type Page } from "@playwright/test";
import { decide, waitForTurn } from "./support";

// Nothing flies, so what is on the table is what the server last said.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
});

const sheet = (page: Page, name: string) => page.locator(`.sheet[data-sheet="${name}"]:not([hidden])`);

async function menu(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
  await expect(page.locator(".menu-page")).toBeVisible();
}

test.describe("New Game", () => {
  test("is opened from the main menu on the desktop's defaults, and has its fields, bounds and validation", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await menu(page);
    await page.locator('[data-menu-page="new-game"]').click();
    const game = sheet(page, "new-game");
    await expect(game.locator(".sheet-title")).toHaveText("New Game");
    await expect(game.getByLabel("I'm playing")).toBeChecked();
    await expect(game.locator('input[name="humanName"]')).toHaveValue("Player");
    await expect(game.locator('input[name="opponents"]')).toHaveValue("3");
    await expect(game.locator(".ng-opponent")).toHaveCount(3);
    await expect(game.locator(".ng-summary")).toHaveText("26 rounds - about 40 minutes");
    // The terminal's quick-game levels, and a man or a woman each, named to match.
    expect(await game.locator('select[name="botLevel0"]').inputValue()).toBe("reckoner-beta");
    expect(await game.locator('select[name="botLevel1"]').inputValue()).toBe("cyborg");
    expect(await game.locator('select[name="botLevel2"]').inputValue()).toBe("low-risk");
    const names = await game.locator('input[name^="botName"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(3);

    // A count changes the rows, keeping the names already there, and the summary with it.
    await game.locator('input[name="opponents"]').fill("2");
    await expect(game.locator(".ng-opponent")).toHaveCount(2);
    await expect(game.locator(".ng-summary")).toContainText("23 rounds");
    expect(await game.locator('input[name="botName0"]').inputValue()).toBe(names[0]);
    await game.locator('input[name="opponents"]').fill("3");
    await expect(game.locator(".ng-opponent")).toHaveCount(3);

    // A name that clashes with another, in any case, is marked and Deal is disabled until it is fixed.
    await game.locator('input[name="botName0"]').fill("player");
    await expect(game.locator(".ng-error")).toHaveText("Two players cannot both be called player.");
    await expect(game.getByRole("button", { name: "Deal" })).toBeDisabled();
    await game.locator('input[name="botName0"]').fill("Ana");
    await game.locator('input[name="humanName"]').fill("");
    await expect(game.locator(".ng-error")).toHaveText("Every player needs a name.");
    await game.locator('input[name="humanName"]').fill("Hana Gheorghe");
    await expect(game.locator(".ng-error")).toHaveText("");
    await expect(game.getByRole("button", { name: "Deal" })).toBeEnabled();
    // Watching has no seat of yours, so its range is two to six and your name does not count.
    await game.getByLabel("I'm watching").check();
    await expect(game.locator('input[name="opponents"]')).toHaveAttribute("min", "2");
    await expect(game.locator('input[name="opponents"]')).toHaveAttribute("max", "6");
    await expect(game.locator('input[name="humanName"]')).toBeDisabled();
    await game.getByLabel("I'm playing").check();
    await expect(game.locator('input[name="opponents"]')).toHaveAttribute("max", "5");
    expect(problems).toEqual([]);
  });

  test("deals the game it shows, and the next New Game opens on that setup", async ({ page }) => {
    await menu(page);
    await page.locator('[data-menu-page="new-game"]').click();
    const game = sheet(page, "new-game");
    await game.locator('input[name="humanName"]').fill("Hana");
    await game.locator('input[name="opponents"]').fill("2");
    await game.locator('input[name="botName0"]').fill("Ana");
    await game.locator('input[name="botName1"]').fill("Bogdan");
    await game.locator('select[name="botLevel0"]').selectOption("ducking");
    await game.getByLabel("8-1-8 - the other way round").check();
    await game.locator('input[name="fixedDeal"]').check();
    await game.locator('input[name="seed"]').fill("7");
    await game.locator('.sliders input[type="range"]').first().focus();
    await page.keyboard.press("End");
    await game.getByRole("button", { name: "Deal" }).click();

    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    await expect(page.locator(".menu-page")).toBeHidden();
    await expect(page.locator(".sheet:not([hidden])")).toHaveCount(0);
    await waitForTurn(page);
    // The rules said what was asked: three players, 23 rounds, and each player named as typed.
    await expect(page.locator(".score-round")).toHaveText("Round 1 of 23");
    const seats = await page.locator(".seat:not([hidden]) .name-text").allTextContents();
    expect([...seats].sort()).toEqual(["Ana", "Bogdan", "Hana"]);
    // Every seat has a portrait the server accepted, and yours is a person's.
    await expect(page.locator(".seat:not([hidden]) .portrait img[src]")).toHaveCount(3);

    // Leave, and New Game opens on the setup that was dealt.
    await page.keyboard.press("Escape");
    await sheet(page, "pause").getByRole("button", { name: "Main menu" }).click();
    await expect(page.locator(".menu-page")).toBeVisible();
    await page.locator('[data-menu-page="new-game"]').click();
    await expect(game.locator('input[name="humanName"]')).toHaveValue("Hana");
    await expect(game.locator('input[name="opponents"]')).toHaveValue("2");
    // The levels come back as they were, and so does each opponent's gender; the names are drawn afresh
    // each time the dialog opens, as the desktop's are, and can be typed over again.
    await expect(game.locator('select[name="botLevel0"]')).toHaveValue("ducking");
    expect(await game.locator('input[name="botName0"]').inputValue()).not.toBe("");
    await expect(game.getByLabel("8-1-8 - the other way round")).toBeChecked();
    await expect(game.locator('input[name="seed"]')).toHaveValue("7");
    // And a reload, with nothing but the browser's storage to remember it by.
    await page.reload();
    await page.locator('[data-menu="new-game"]').click();
    await expect(game.locator('input[name="humanName"]')).toHaveValue("Hana");
    await expect(game.locator('select[name="botLevel0"]')).toHaveValue("ducking");
  });

  test("makes a game to watch, which plays itself to its final results", async ({ page }) => {
    test.setTimeout(120_000);
    await menu(page);
    await page.locator('[data-menu-page="new-game"]').click();
    const game = sheet(page, "new-game");
    await game.getByLabel("I'm watching").check();
    await game.locator('input[name="opponents"]').fill("2");
    await game.locator('input[name="botName0"]').fill("Ana");
    await game.locator('input[name="botName1"]').fill("Bogdan");
    await game.locator('.sliders input[type="range"]').first().focus();
    await page.keyboard.press("End");
    await game.getByRole("button", { name: "Deal" }).click();

    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    await expect(page.locator(".seat:not([hidden])")).toHaveCount(2);
    // Nobody to answer for: no hand, no strip, and the round count of two players.
    await expect(page.locator(".hand")).toBeHidden();
    await expect(page.locator(".bidstrip:not([hidden])")).toHaveCount(0);
    await expect(page.locator(".score-round")).toContainText("of 20");
    // The game goes on to the end with no one at the controls, and the results are offered.
    const over = sheet(page, "game-over");
    await expect(over).toBeVisible({ timeout: 90_000 });
    await expect(over.locator(".sheet-title")).toHaveText("Final results");
    await expect(over.locator(".sheet-meta")).toHaveText(/(Ana|Bogdan)( and (Ana|Bogdan))? (wins|tie)/);
    await expect(over.getByRole("button", { name: "Play again" })).toBeVisible();
    // A watcher has no You in the last trick, and the history has every round.
    await over.getByRole("button", { name: "Round history" }).click();
    await expect(sheet(page, "history").locator(".th")).toHaveText(["Round", "Cards", "Ana", "Bogdan"]);
  });

  test("over a game that is running holds it, can be cancelled, and replaces it when dealt", async ({ page }) => {
    await page.goto("/?solo=3&seed=7&speed=4");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    await waitForTurn(page);
    await page.locator('[data-menu="new-game"]').click();
    const game = sheet(page, "new-game");
    await expect(game).toBeVisible();
    // The game is held for it: a reload finds it paused.
    await game.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".sheet:not([hidden])")).toHaveCount(0);
    await decide(page);
    await expect(page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable")).toHaveCount(0);
    await waitForTurn(page);

    await page.locator('[data-menu="new-game"]').click();
    await game.getByRole("button", { name: "Deal" }).click();
    // Three computer players and you: a table of four, from the first round.
    await expect(page.locator(".seat:not([hidden])")).toHaveCount(4);
    await expect(page.locator(".score-round")).toHaveText("Round 1 of 26");
    await waitForTurn(page);
  });

  test("is asked by Rules and Settings at no table for the setup it keeps, and they change it", async ({ page }) => {
    await menu(page);
    await page.locator('[data-menu="rules"]').click();
    await expect(sheet(page, "rules").locator("li").first()).toHaveText("4 players use Ace down to 7: eight cards each, 32 in all.");
    await sheet(page, "rules").getByRole("button", { name: "Close" }).click();
    await page.locator('[data-menu="settings"]').click();
    const settings = sheet(page, "settings");
    await expect(settings.locator('input[type="range"]').first()).toHaveValue("2");
    await settings.locator('input[type="range"]').first().focus();
    await page.keyboard.press("End");
    await settings.locator('input[type="checkbox"]').check();
    await settings.getByRole("button", { name: "Done" }).click();
    await page.locator('[data-menu="new-game"]').click();
    const game = sheet(page, "new-game");
    await expect(game.locator('.sliders input[type="range"]').first()).toHaveValue("4");
    await expect(game.getByLabel("Wait for me after each round")).toBeChecked();
  });
});
