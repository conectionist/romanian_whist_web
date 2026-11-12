import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { decide } from "./support";

// Online tables, played by several browsers at once: each in a context of its own, so each is its own
// member with its own token, as three people on three machines are.

export const sheet = (page: Page, name: string) => page.locator(`.sheet[data-sheet="${name}"]:not([hidden])`);

export interface TableOptions {
  seats?: number;
  // What each of the other seats is: open for a person, or a computer player.
  others?: ("open" | "computer")[];
  // The turn timer's value in milliseconds, as the sheet's select holds it.
  timer?: string;
  allOnesForehead?: boolean;
  waitAfterRound?: boolean;
  speed?: "slowest" | "fastest";
}

// Makes a table as its host and waits in its lobby; returns its code.
export async function createTable(page: Page, name: string, options: TableOptions = {}): Promise<string> {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
  await page.locator('[data-menu-page="online"]').click();
  const online = sheet(page, "online");
  await online.locator('input[name="profileName"]').fill(name);
  await online.getByRole("button", { name: "Create a table" }).click();
  const create = sheet(page, "create-table");
  await expect(create).toBeVisible();
  if (options.seats !== undefined) {
    await create.locator('input[name="seats"]').fill(String(options.seats));
  }
  const others = options.others ?? [];
  for (const [index, kind] of others.entries()) {
    await create.locator(`select[name="seatKind${index}"]`).selectOption(kind === "open" ? "open" : "ducking");
  }
  if (options.timer !== undefined) {
    await create.locator('select[name="turnTimer"]').selectOption(options.timer);
  }
  if (options.allOnesForehead === true) {
    await create.locator('input[name="allOnesForehead"]').check();
  }
  if (options.waitAfterRound === true) {
    await create.locator('input[name="waitEachRound"]').check();
  }
  if (options.speed !== undefined) {
    await create.locator('.sliders input[type="range"]').first().focus();
    await page.keyboard.press(options.speed === "fastest" ? "End" : "Home");
  }
  await create.getByRole("button", { name: "Create", exact: true }).click();
  const lobby = sheet(page, "lobby");
  await expect(lobby).toBeVisible();
  const title = (await lobby.locator(".sheet-title").textContent()) ?? "";
  const code = /Table ([A-Z0-9]{6})/.exec(title)?.[1];
  expect(code, title).toBeDefined();
  await expect(page).toHaveURL(new RegExp(`/t/${code}$`));
  return code as string;
}

// Joins a table from its link, in a context of its own, and waits in its lobby.
export async function joinByLink(browser: Browser, code: string, name: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await context.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
  const page = await context.newPage();
  await page.goto(`/t/${code}`);
  const join = sheet(page, "online");
  await expect(join.locator(".sheet-title")).toHaveText(`Join table ${code}`);
  await expect(join.locator('input[name="tableCode"]')).toHaveValue(code);
  await join.locator('input[name="profileName"]').fill(name);
  await join.getByRole("button", { name: "Join", exact: true }).click();
  await expect(sheet(page, "lobby")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/t/${code}$`));
  return { context, page };
}

// Joins a table by typing its code, from the main menu, in a context of its own.
export async function joinByCode(browser: Browser, typed: string, name: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await context.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
  await page.locator('[data-menu-page="online"]').click();
  const join = sheet(page, "online");
  await join.locator('input[name="profileName"]').fill(name);
  await join.locator('input[name="tableCode"]').fill(typed);
  await join.getByRole("button", { name: "Join", exact: true }).click();
  await expect(sheet(page, "lobby")).toBeVisible();
  return { context, page };
}

export const ASK = ".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable";

// Answers whatever each page is asked, round after round, until `done` says so: every person plays
// as the screenshot tool's does, the lowest bid and the first legal card.
export async function playUntil(pages: Page[], done: () => Promise<boolean>, limit = 400): Promise<void> {
  for (let turns = 0; turns < limit; turns++) {
    if (await done()) {
      return;
    }
    let answered = false;
    for (const page of pages) {
      if (page.isClosed()) {
        continue;
      }
      if ((await page.locator(ASK).count()) > 0) {
        await decide(page);
        await expect(page.locator(ASK)).toHaveCount(0);
        answered = true;
      }
    }
    if (!answered) {
      await pages[0].waitForTimeout(60);
    }
  }
  throw new Error("the game did not get there");
}
