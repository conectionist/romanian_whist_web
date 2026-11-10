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

    await page.goto("/?solo=4&seed=42&speed=4");
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
    await page.goto("/?solo=3&seed=7&speed=4");
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
  test("your own card is in the air the moment you click it", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));

    await page.goto("/?solo=4&seed=42&speed=4");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");

    // Bid until a card is asked for.
    const asked = page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable");
    for (;;) {
      await asked.first().waitFor();
      if ((await page.locator(".bidstrip:not([hidden])").count()) === 0) {
        break;
      }
      await page.locator(".bidstrip:not([hidden]) .opt:not(:disabled)").first().click();
      await expect(asked).toHaveCount(0);
    }

    // Clicked in the page, so what is counted is what the click itself left running: a flight that
    // a redraw in the same click cut short would not be there.
    const flying = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".hand .hcard.playable"));
      cards.sort((a, b) => Number(a.dataset.slot) - Number(b.dataset.slot));
      cards[0].click();
      return document
        .getAnimations()
        .filter((animation) => (animation.effect as KeyframeEffect | null)?.target?.closest(".trick") !== null && animation.playState === "running")
        .length;
    });
    expect(flying).toBe(1);

    // It lands on the felt, and nothing is left running.
    await expect(page.locator(".trick .card:not([hidden])")).not.toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(problems).toEqual([]);
  });

  test("a blind card keeps its back until the server says it was played, then flies from the middle back", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));

    // What each flight over the felt started from, as it started.
    await page.addInitScript(() => {
      const starts: { transform: string; opacity: number; height: number }[] = [];
      const seen = new Set<Animation>();
      (window as unknown as { starts: typeof starts }).starts = starts;
      const watch = () => {
        for (const animation of document.getAnimations()) {
          const effect = animation.effect as KeyframeEffect | null;
          if (effect?.target?.closest(".trick") && !seen.has(animation)) {
            seen.add(animation);
            const first = effect.getKeyframes()[0];
            starts.push({ transform: String(first.transform), opacity: Number(first.opacity), height: (effect.target as HTMLElement).offsetHeight });
          }
        }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });

    // Every one-card round is a Forehead round, so the first deal is blind.
    await page.goto("/?solo=4&seed=42&speed=4&forehead=all");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");

    const asked = page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable");
    for (;;) {
      await asked.first().waitFor();
      if ((await page.locator(".bidstrip:not([hidden])").count()) === 0) {
        break;
      }
      await page.locator(".bidstrip:not([hidden]) .opt:not(:disabled)").first().click();
      await expect(asked).toHaveCount(0);
    }

    // One back, a card that is not shown to you.
    await expect(page.locator(".hand .hcard:not([hidden])")).toHaveCount(1);
    expect(await page.locator(".hand .hcard.playable").getAttribute("data-card")).toBeNull();
    const backHeight = await page.locator(".hand .hcard.playable").evaluate((back) => (back as HTMLElement).offsetHeight);

    // Clicked in the page, so what is counted is what the click itself left behind. The card is not
    // known yet, so none flies; the back is still in the fan.
    const clicked = await page.evaluate(() => {
      (document.querySelector(".hand .hcard.playable") as HTMLElement).click();
      return {
        backs: document.querySelectorAll(".hand .hcard:not([hidden])").length,
        flying: document.getAnimations().filter((animation) => (animation.effect as KeyframeEffect | null)?.target?.closest(".trick")).length,
      };
    });
    expect(clicked).toEqual({ backs: 1, flying: 0 });

    // The server's word: the card is on the felt, and the back has gone.
    await expect(page.locator(".trick .card:not([hidden])")).not.toHaveCount(0);
    await expect(page.locator(".hand .hcard:not([hidden])")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);

    // A computer player's card leaves its panel small and faint, and a swept card starts at its own
    // size; yours starts opaque, at the size of the card in the fan.
    const starts = await page.evaluate(() => (window as unknown as { starts: { transform: string; opacity: number; height: number }[] }).starts);
    const fromFan = starts.filter((start) => start.opacity === 1 && !start.transform.endsWith("scale(1)"));
    expect(fromFan).toHaveLength(1);
    const scale = Number(/scale\(([\d.]+)\)/.exec(fromFan[0].transform)?.[1]);
    expect(scale).toBeCloseTo(backHeight / fromFan[0].height, 1);
    expect(problems).toEqual([]);
  });

  test("a solo game is played with the cards flying, and the table lands where the server says", async ({ page }) => {
    // The computer players move at the desktop's default speed, a few seconds a round.
    test.setTimeout(90_000);
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));

    // Every card that was ever in the air over the felt, counted as they go.
    await page.addInitScript(() => {
      const flown = new Set<Animation>();
      (window as unknown as { flown: Set<Animation> }).flown = flown;
      window.setInterval(() => {
        for (const animation of document.getAnimations()) {
          if ((animation.effect as KeyframeEffect | null)?.target?.closest(".trick")) {
            flown.add(animation);
          }
        }
      }, 10);
    });

    await page.goto("/?solo=4&seed=42");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    // A bid, a card, and the next round's bid: the first trick has been played in between.
    for (let decisions = 0; decisions < 3; decisions++) {
      await decide(page);
      await expect(page.locator(".bidstrip:not([hidden]) .opt:not(:disabled), .hand .hcard.playable:not([hidden])")).toHaveCount(0);
      await waitForTurn(page);
    }
    // Your card and the three computer players' flew; the queue did not catch up on them.
    expect(await page.evaluate(() => (window as unknown as { flown: Set<Animation> }).flown.size)).toBeGreaterThanOrEqual(4);
    // Every flight has landed by the next question, and the table is whole.
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.locator(".seat:not([hidden])")).toHaveCount(4);
    expect(problems).toEqual([]);
  });
});
