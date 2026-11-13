import { expect, type Page } from "@playwright/test";

const ASK = ".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable";

// The desktop's screenshot tool's rule for the person: the lowest bid the strip offers, and the first
// legal card in the order the hand is shown. A decision is a bid or a card.
export async function decide(page: Page): Promise<void> {
  await page.locator(ASK).first().waitFor();
  if ((await page.locator(".bidstrip:not([hidden])").count()) > 0) {
    await page.locator(".bidstrip:not([hidden]) .opt:not(:disabled)").first().click();
    return;
  }
  // The slots in display order, not the order their elements were made in.
  const slot = await page.evaluate(() => {
    const playable = Array.from(document.querySelectorAll<HTMLElement>(".hand .hcard.playable"));
    return playable.map((card) => Number(card.dataset.slot)).sort((a, b) => a - b)[0];
  });
  await page.locator(`.hand .hcard.playable[data-slot="${slot}"]`).click();
}

export async function waitForTurn(page: Page): Promise<void> {
  await page.locator(ASK).first().waitFor();
}

// The question the table is on: its round, and the bidding or the trick. The person answers each once.
export async function questionOf(page: Page): Promise<string> {
  return page.evaluate(() => [".score-round", ".tp-title"].map((part) => document.querySelector(part)?.textContent ?? "").join(" / "));
}

// Waits until an answer is taken: nothing is asked, or the table is on a later question. A computer
// player at the top speed answers before the page can be looked at, so the moment with nothing asked
// may never be seen.
export async function taken(page: Page, before: string): Promise<void> {
  await expect.poll(async () => (await page.locator(ASK).count()) === 0 || (await questionOf(page)) !== before).toBe(true);
}

// Decides, and waits until the answer is taken.
export async function answer(page: Page): Promise<void> {
  await waitForTurn(page);
  const before = await questionOf(page);
  await decide(page);
  await taken(page, before);
}

