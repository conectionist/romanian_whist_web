import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { answer, waitForTurn } from "./support";

const ORIGIN = "http://127.0.0.1:8090";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

// The names the server's catalogue holds, by the language each is for.
const NAMES = JSON.parse(readFileSync(join(ROOT, "public/player_names.json"), "utf8")) as { name: string; language: string }[];
const namesIn = (language: string) => new Set(NAMES.filter((entry) => entry.language === language || entry.language === "any").map((entry) => entry.name));

test.use({ storageState: { cookies: [], origins: [{ origin: ORIGIN, localStorage: [{ name: "whist.language", value: "ro" }] }] } });

// Nothing flies, so what is on the table is what the server last said.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
});

const sheet = (page: Page, name: string) => page.locator(`.sheet[data-sheet="${name}"]:not([hidden])`);

test("a game in Romanian: New Game draws Romanian names, and the table, its prompts and a sheet are in Romanian", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
  await page.locator('[data-menu-page="new-game"]').click();

  const game = sheet(page, "new-game");
  await expect(game.locator(".sheet-title")).toHaveText("Joc nou");
  await expect(game.locator('input[name="humanName"]')).toHaveValue("Jucător");
  await expect(game.locator(".ng-summary")).toHaveText("26 de runde - cam 40 de minute");
  // The opponents are named from the Romanian list, as the desktop's New Game names them.
  const opponents = await game.locator('input[name^="botName"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(opponents).toHaveLength(3);
  for (const name of opponents) {
    expect(namesIn("ro").has(name), name).toBe(true);
  }
  await expect(game.getByRole("button", { name: "Împarte" })).toBeEnabled();

  // Wait for me after each round, so the round sheet is held and can be read.
  await game.getByLabel("Așteaptă-mă după fiecare rundă").check();
  await game.locator('input[name="fixedDeal"]').check();
  await game.locator('input[name="seed"]').fill("7");
  await game.locator('.sliders input[type="range"]').first().focus();
  await page.keyboard.press("End");
  await game.getByRole("button", { name: "Împarte" }).click();

  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
  await waitForTurn(page);
  await expect(page.locator(".score-round")).toHaveText("Runda 1 din 26");
  const seats = await page.locator(".seat:not([hidden]) .name-text").allTextContents();
  expect(seats).toHaveLength(4);
  expect(seats.slice(1).sort()).toEqual([...opponents].sort());
  // What the table says of the round and of what is asked, in the desktop's Romanian.
  await expect(page.locator(".tp-title")).toHaveText("Licitație");
  await expect(page.locator(".tp-prompt")).toHaveText("Licitația ta. Câte faci?");

  // The first round deals one card: a bid, a card, and the round is scored and held for Continue.
  for (let decisions = 0; decisions < 2; decisions++) {
    await answer(page);
  }
  const round = sheet(page, "round");
  await expect(round).toBeVisible();
  await expect(round.locator(".sheet-title")).toHaveText("Runda 1 · 1 carte · Normală");
  await expect(round.locator(".th")).toHaveText(["Jucător", "Licitat", "Făcute", "Runda", "Total"]);
  await expect(round.getByRole("button", { name: "Istoricul rundelor" })).toBeVisible();
  await round.getByRole("button", { name: "Continuă" }).click();
  await expect(page.locator(".score-round")).toHaveText("Runda 2 din 26");

  // The rules, from the menu bar, in Romanian.
  await page.locator('[data-menu="rules"]').click();
  await expect(sheet(page, "rules").locator(".sheet-title")).toHaveText("Regulile pe scurt");
  await expect(sheet(page, "rules")).toContainText("26 de runde");
  expect(problems).toEqual([]);
});

test("the server draws a Romanian host's computer players' names from the Romanian ones, and an English host's from the English", async ({ page, browser }) => {
  // A table of three that its host fills with computer players: the server names them in the
  // language the host's page said hello in.
  async function filled(host: Page): Promise<string[]> {
    await host.goto("/");
    await expect(host.locator("body")).toHaveAttribute("data-status", "at no table");
    await host.locator('[data-menu-page="online"]').click();
    const online = sheet(host, "online");
    await online.locator('input[name="profileName"]').fill("Host");
    await online.locator('[data-action="create"]').click();
    const create = sheet(host, "create-table");
    await create.locator('input[name="seats"]').fill("4");
    for (const index of [0, 1, 2]) {
      await create.locator(`select[name="seatKind${index}"]`).selectOption("open");
    }
    await create.locator('[data-action="create"]').click();
    const lobby = sheet(host, "lobby");
    await expect(lobby).toBeVisible();
    await lobby.locator('[data-action="fill"]').click();
    await expect(lobby.locator('.lobby-seat[data-kind="computer"]')).toHaveCount(3);
    return lobby.locator('.lobby-seat[data-kind="computer"] .lobby-name').allTextContents();
  }

  const romanian = await filled(page);
  expect(romanian).toHaveLength(3);
  for (const name of romanian) {
    expect(namesIn("ro").has(name), name).toBe(true);
  }

  const context = await browser.newContext({ storageState: { cookies: [], origins: [{ origin: ORIGIN, localStorage: [{ name: "whist.language", value: "en" }] }] } });
  await context.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
  const english = await filled(await context.newPage());
  expect(english).toHaveLength(3);
  for (const name of english) {
    expect(namesIn("en").has(name), name).toBe(true);
  }
  await context.close();
});
