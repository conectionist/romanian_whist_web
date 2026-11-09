import { expect, test, type Page } from "@playwright/test";

// The desktop's screenshot tool's rule for the person: the lowest bid the strip offers, and the first
// legal card in the order the hand is shown. A decision is a bid or a card.
async function decide(page: Page): Promise<void> {
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

async function waitForTurn(page: Page): Promise<void> {
  await page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable").first().waitFor();
}

async function table(page: Page) {
  return {
    round: await page.locator(".score-round").textContent(),
    trick: await page.locator(".tp-title").textContent(),
    felt: await page.locator(".trick .card:not([hidden])").count(),
    hand: await page.locator(".hand .hcard:not([hidden])").count(),
    cards: await page.locator(".trick .card:not([hidden])").evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.card).sort()),
    handCards: await page.locator(".hand .hcard:not([hidden])").evaluateAll((cards) =>
      cards.map((card) => `${(card as HTMLElement).dataset.slot}:${(card as HTMLElement).dataset.card}`).sort(),
    ),
    prompt: await page.locator(".tp-prompt").textContent(),
    rows: await page.locator(".tp-row").allTextContents(),
    active: await page.locator(".seat.active .name-text").allTextContents(),
  };
}

test.describe("with nothing moving", () => {
  test.beforeEach(async ({ page }) => {
    // Nothing flies, so what is on the table is what the server last said.
    await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
  });


  test("a solo game is played against the server, and a reload mid-trick shows the same table", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));

    await page.goto("/?solo=4&seed=42");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");

    // 22 decisions, bids and cards alike: the moment the desktop's screenshot of four players shows.
    for (let decisions = 0; decisions < 22; decisions++) {
      await decide(page);
      // The answer is taken before the next question is asked.
      await expect(page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable")).toHaveCount(0);
    }
    await waitForTurn(page);
    // Every message of the bots' moves has been drawn: the table is where the desktop's picture is.
    await expect(page.locator(".score-round")).toHaveText("Round 8 of 26");

    const before = await table(page);
    expect(before.round).toBe("Round 8 of 26");
    expect(before.trick).toBe("Trick 2 of 5");
    expect(before.felt).toBe(3);
    expect(before.hand).toBe(4);
    expect(before.active).toEqual(["Player"]);
    expect(before.handCards.map((card) => card.split(":")[1])).toEqual(expect.arrayContaining(["8H", "KC", "7C", "QD"]));

    // Reload mid-trick: the sync of the reloaded page shows the same felt, hand and trick panel.
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    await waitForTurn(page);
    const after = await table(page);
    expect(after).toEqual(before);
    expect(problems).toEqual([]);
  });

  test("a game goes on to the end of a round when every answer is the lowest", async ({ page }) => {
    await page.goto("/?solo=3&seed=7");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    for (let decisions = 0; decisions < 6; decisions++) {
      await decide(page);
      await expect(page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable")).toHaveCount(0);
      await waitForTurn(page);
    }
    // A round scored, or a new one dealt, and the table still sits right: three seats, a hand in it.
    await expect(page.locator(".seat:not([hidden])")).toHaveCount(3);
    await expect(page.locator(".rack:not([hidden])")).not.toHaveCount(0);
  });
});

test.describe("with the cards flying", () => {
  test("a solo game is played with the cards flying, and the table lands where the server says", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));

    await page.goto("/?solo=4&seed=42");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    for (let decisions = 0; decisions < 8; decisions++) {
      await decide(page);
      await expect(page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable")).toHaveCount(0);
      await waitForTurn(page);
    }
    // Every flight has landed by the next question, and the table is whole.
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.locator(".seat:not([hidden])")).toHaveCount(4);
    expect(problems).toEqual([]);
  });
});
