import { expect, type Locator, type Page } from "@playwright/test";

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

// A tap on a card where a finger would land: the card nearest its middle that is not under another card, since
// the cards of a fan overlap and the middle of one may be another's.
export async function tapCard(page: Page, card: Locator, timeout?: number): Promise<void> {
  const at = await card.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    let best: { x: number; y: number } | null = null;
    for (let row = 1; row < 16; row++) {
      for (let column = 1; column < 16; column++) {
        const x = box.x + (box.width * column) / 16;
        const y = box.y + (box.height * row) / 16;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight || document.elementFromPoint(x, y)?.closest(".hcard") !== node) {
          continue;
        }
        if (best === null || Math.hypot(x - middle.x, y - middle.y) < Math.hypot(best.x - middle.x, best.y - middle.y)) {
          best = { x, y };
        }
      }
    }
    return best;
  }, undefined, { timeout });
  expect(at, "a part of the card that a finger could land on").not.toBeNull();
  await page.touchscreen.tap(at!.x, at!.y);
}

// A tap on the table where nothing is: not a card and not a control, found by asking the page.
export async function tapNothing(page: Page): Promise<void> {
  const at = await page.evaluate(() => {
    for (const [fx, fy] of [
      [0.01, 0.5],
      [0.99, 0.5],
      [0.5, 0.02],
      [0.01, 0.75],
      [0.99, 0.3],
    ]) {
      const x = window.innerWidth * fx;
      const y = window.innerHeight * fy;
      // Nothing within a finger's width of it either: a panel's edge is no place for a tap that is to do nothing.
      const clear = [-8, 0, 8].every((dx) => [-8, 0, 8].every((dy) => document.elementFromPoint(x + dx, y + dy)?.closest("button, .hcard, input, a") === null));
      if (clear) {
        return { x, y };
      }
    }
    return null;
  });
  expect(at, "a place on the table with nothing in it").not.toBeNull();
  await page.touchscreen.tap(at!.x, at!.y);
}
