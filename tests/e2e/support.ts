import type { Page } from "@playwright/test";

// The desktop's screenshot tool's rule for the person: the lowest bid the strip offers, and the first
// legal card in the order the hand is shown. A decision is a bid or a card.
export async function decide(page: Page): Promise<void> {
  const ask = page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable");
  await ask.first().waitFor();
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
  await page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable").first().waitFor();
}

