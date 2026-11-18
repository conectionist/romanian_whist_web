import { expect, type Page } from "@playwright/test";

// The page played with the keyboard alone: nothing in this file or its spec touches the mouse, the
// screen or a control by clicking, which a unit test checks. What is read of the page is read from the
// DOM, and every answer is a key.

export const ASK = ".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable";
export const sheet = (page: Page, name: string) => page.locator(`.sheet[data-sheet="${name}"]:not([hidden])`);

// Tab until the keyboard is on something that matches, as a person looks for it.
export async function tabTo(page: Page, selector: string, limit = 80): Promise<void> {
  for (let presses = 0; presses < limit; presses++) {
    if (await page.evaluate((wanted) => document.activeElement?.matches(wanted) === true, selector)) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab did not reach ${selector}`);
}

// New Game from the main menu: Alt+N opens it, and the fields are reached with Tab. Two seats, the
// fastest computer player, and the round sheet held for Space.
export async function dealByKeys(page: Page, options: { waitForMe: boolean }): Promise<void> {
  await page.keyboard.press("Alt+N");
  const game = sheet(page, "new-game");
  await expect(game).toBeVisible();
  await tabTo(page, 'input[name="opponents"]');
  await page.keyboard.press("Control+A");
  await page.keyboard.type("1");
  await tabTo(page, '.sliders input[type="range"]');
  await page.keyboard.press("End");
  if (options.waitForMe) {
    await tabTo(page, 'input[name="waitEachRound"]');
    await page.keyboard.press("Space");
  }
  await tabTo(page, '[data-action="deal"]');
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
}

// One answer to what the table asks: the lowest bid or the first card that can be played. The arrows
// and Enter on the odd turns, the digits on the even, so both ways are used.
export async function answerByKeys(page: Page, turn: number): Promise<boolean> {
  const asking = await page.evaluate(() => {
    const strip = document.querySelector(".bidstrip:not([hidden])");
    if (strip !== null) {
      const bids = Array.from(strip.querySelectorAll<HTMLButtonElement>(".opt:not(:disabled):not([hidden])"), (button) => Number(button.dataset.bid));
      return { kind: "bid" as const, first: Math.min(...bids) };
    }
    const slots = Array.from(document.querySelectorAll<HTMLElement>(".hand .hcard.playable"), (card) => Number(card.dataset.slot));
    return slots.length > 0 ? { kind: "card" as const, first: Math.min(...slots) } : null;
  });
  if (asking === null) {
    return false;
  }
  if (turn % 2 === 0) {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
  } else {
    await page.keyboard.press(String(asking.kind === "bid" ? asking.first : asking.first + 1));
  }
  return true;
}

// Plays on, answering what is asked and letting each round go with Space, until the results are up.
export async function playToTheResults(page: Page, seconds = 150): Promise<number> {
  const until = Date.now() + seconds * 1000;
  let answered = 0;
  while (Date.now() < until) {
    if ((await sheet(page, "game-over").count()) > 0) {
      return answered;
    }
    if ((await sheet(page, "round").locator('[data-action="continue"]:not(:disabled)').count()) > 0) {
      await page.keyboard.press("Space");
      await page.waitForTimeout(20);
      continue;
    }
    if (await answerByKeys(page, answered)) {
      answered += 1;
    }
    await page.waitForTimeout(15);
  }
  throw new Error("the game did not reach its results");
}

// Answers what is asked, by keys, until the hand is asked for a card with at least this many that can
// be played, and returns how many cards the hand holds then.
export async function untilCardsToChooseFrom(page: Page, playable: number, seconds = 60): Promise<number> {
  const until = Date.now() + seconds * 1000;
  let answered = 0;
  while (Date.now() < until) {
    const now = await page.evaluate(() => ({
      playable: document.querySelectorAll(".hand .hcard.playable").length,
      held: document.querySelectorAll(".hand .hcard:not([hidden])").length,
    }));
    if (now.playable >= playable) {
      return now.held;
    }
    if ((await sheet(page, "round").locator('[data-action="continue"]:not(:disabled)').count()) > 0) {
      await page.keyboard.press("Space");
    } else if (await answerByKeys(page, answered)) {
      answered += 1;
    }
    await page.waitForTimeout(15);
  }
  throw new Error("the hand never had that many cards to choose from");
}
