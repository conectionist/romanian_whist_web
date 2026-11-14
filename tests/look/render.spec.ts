import { expect, test } from "@playwright/test";
import { place, rackOrigin } from "../../src/table/geometry/seats";
import { flightStart } from "./flight";

test("a second state keeps the panels and racks and changes what they show", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/look.html?shot=table-4-players&then=hand-4-cards");
  await page.waitForSelector("body[data-ready]");

  const body = page.locator("body");
  const first = await body.getAttribute("data-first-stamps");
  const second = await body.getAttribute("data-stamps");
  expect(first).not.toBeNull();
  expect(first).not.toBe("");
  // Every panel and rack is the node the first state made.
  expect(second).toBe(first);

  // And what they show is the second state's: its names, in place.
  const names = await page.locator(".seat .name-text").allTextContents();
  expect(names).toEqual(["You", "Bogdan", "Ana", "Costel"]);
  expect(problems).toEqual([]);
});

test("a table with fewer seats hides the ones it no longer has, and keeps their elements", async ({ page }) => {
  await page.goto("/look.html?shot=table-6-players&then=table-3-players");
  await page.waitForSelector("body[data-ready]");

  await expect(page.locator(".seat:not([hidden])")).toHaveCount(3);
  await expect(page.locator(".seat")).toHaveCount(6);
  await expect(page.locator(".rack:not([hidden])")).toHaveCount(2);
});

test("a card that is played flies to the felt, and a trick is swept to its winner", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/look.html?shot=table-4-players&pace=normal");
  await page.waitForSelector("body[data-ready]");
  await expect(page.locator(".trick .card:not([hidden])")).toHaveCount(3);

  const played = await page.evaluate(async () => {
    const look = (window as unknown as { look: { apply(text: string, animate: boolean): Promise<void> } }).look;
    const table = document.querySelector(".trick")!;
    const before = table.querySelectorAll(".card:not([hidden])").length;
    const message = {
      type: "game",
      seq: 1,
      game: 1,
      event: { kind: "cardPlayed", seat: 0, card: "KC" },
      snapshot: {
        you: 0,
        status: "inProgress",
        phase: "playing",
        round: { index: 7, count: 26, type: "normal", tricks: 5, trick: 2, trump: "9S", leader: 3 },
        active: null,
        forbiddenBet: null,
        bets: { placed: 4, sum: 1 },
        table: {
          ledBy: 1,
          leadSuit: "C",
          cards: [
            { seat: 1, card: "8C", winning: false },
            { seat: 2, card: "7S", winning: false },
            { seat: 3, card: "QS", winning: true },
            { seat: 0, card: "KC", winning: false },
          ],
        },
        seats: [
          { name: "Player", bidOrder: 2, bet: 0, won: 0, cards: 3, roundScore: 0, total: 23, wins: 0, losses: 1, hand: ["QD", "7C", "8H"] },
          { name: "Ana", bidOrder: 3, bet: 1, won: 1, cards: 3, roundScore: 0, total: 31, wins: 1, losses: 0 },
          { name: "Bogdan", bidOrder: 4, bet: 0, won: 0, cards: 3, roundScore: 0, total: 16, wins: 0, losses: 2 },
          { name: "Cristina", bidOrder: 1, bet: 0, won: 0, cards: 3, roundScore: 0, total: 5, wins: 0, losses: 3 },
        ],
      },
    };
    const started = look.apply(JSON.stringify(message), true);
    const flying = document.getAnimations().length;
    await started;
    return { before, flying, after: table.querySelectorAll(".card:not([hidden])").length, left: document.getAnimations().length };
  });

  expect(played.before).toBe(3);
  // The new card is in the air, and it has landed when the queue is let go.
  expect(played.flying).toBeGreaterThan(0);
  expect(played.after).toBe(4);
  expect(played.left).toBe(0);

  // The next trick starts with a bare felt: the four cards are swept to the winner, and gone.
  const swept = await page.evaluate(async () => {
    const look = (window as unknown as { look: { apply(text: string, animate: boolean): Promise<void> } }).look;
    const table = document.querySelector(".trick")!;
    const message = {
      type: "game",
      seq: 2,
      game: 1,
      event: { kind: "trickStarted", trick: 3, leader: 3 },
      snapshot: {
        you: 0,
        status: "inProgress",
        phase: "playing",
        round: { index: 7, count: 26, type: "normal", tricks: 5, trick: 3, trump: "9S", leader: 3 },
        active: null,
        forbiddenBet: null,
        bets: { placed: 4, sum: 1 },
        table: { ledBy: 3, leadSuit: null, cards: [] },
        seats: [
          { name: "Player", bidOrder: 2, bet: 0, won: 0, cards: 3, roundScore: 0, total: 23, wins: 0, losses: 1, hand: ["QD", "7C", "8H"] },
          { name: "Ana", bidOrder: 3, bet: 1, won: 1, cards: 3, roundScore: 0, total: 31, wins: 1, losses: 0 },
          { name: "Bogdan", bidOrder: 4, bet: 0, won: 0, cards: 3, roundScore: 0, total: 16, wins: 0, losses: 2 },
          { name: "Cristina", bidOrder: 1, bet: 0, won: 0, cards: 3, roundScore: 0, total: 5, wins: 0, losses: 3 },
        ],
      },
    };
    const started = look.apply(JSON.stringify(message), true);
    const sweeping = document.getAnimations().length;
    const during = table.querySelectorAll(".card:not([hidden])").length;
    await started;
    return { sweeping, during, after: table.querySelectorAll(".card:not([hidden])").length };
  });

  expect(swept.sweeping).toBe(4);
  expect(swept.during).toBe(4);
  expect(swept.after).toBe(0);
  expect(problems).toEqual([]);
});

test("the lobby's styles leave the cards as the table draws them", async ({ page }) => {
  // The look page loads every stylesheet the live page does, the lobby's among them: a class of the
  // lobby that a card also wears would shrink the card's face, and give it a border.
  await page.setViewportSize({ width: 1920, height: 1034 });
  await page.goto("/look.html?shot=hand-4-cards");
  await page.waitForSelector("body[data-ready]");
  const face = await page.locator(".hand .hcard .face").first().evaluate((node) => {
    const style = getComputedStyle(node);
    return { width: node.getBoundingClientRect().width, border: style.borderTopWidth, overflow: style.overflow };
  });
  expect(face.width).toBeGreaterThan(100);
  expect(face.border).toBe("0px");
  expect(face.overflow).toBe("visible");
});

test("the menu bar has the desktop's four items, 46 pixels high, and Exit is live over a game", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/look.html?shot=table-4-players");
  await page.waitForSelector("body[data-ready]");

  const bar = page.locator(".menu-band");
  expect((await bar.boundingBox())?.height).toBe(46);
  await expect(bar.locator(".menu-item span")).toHaveText(["New Game", "Settings", "Rules", "Exit"]);
  await expect(bar.locator(".menu-item svg")).toHaveCount(4);
  await expect(bar.locator(".menu-item:disabled")).toHaveCount(0);
  // Exit is at the far right, 16 from the edge.
  const exit = await bar.locator('[data-menu="exit"]').boundingBox();
  expect(Math.round(1920 - (exit!.x + exit!.width))).toBe(16);
});

test("a sheet is placed on whole pixels in the middle of the page below the bar, and narrows and scrolls in a small window", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1034 });
  await page.goto("/look.html?shot=sheet-history");
  await page.waitForSelector("body[data-ready]");
  const sheet = page.locator(".sheet:not([hidden])");
  const box = (await sheet.boundingBox())!;
  expect(box.width).toBe(720);
  expect(Number.isInteger(box.x) && Number.isInteger(box.y)).toBe(true);
  expect(box.x).toBe(600);

  // A window 900 wide and 500 tall: the sheet keeps 16 from the edges and its body scrolls.
  await page.setViewportSize({ width: 900, height: 500 });
  await expect(sheet).toHaveCSS("overflow-y", "auto");
  // The sheet is placed by an observer of the page's size, a moment after the window changes.
  await expect.poll(async () => (await sheet.boundingBox())!.y).toBe(16);
  const small = (await sheet.boundingBox())!;
  expect(small.width).toBe(720);
  expect(small.height).toBe(500 - 32);
  expect(small.y).toBe(16);
  expect(await sheet.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);

  await page.setViewportSize({ width: 600, height: 500 });
  await expect.poll(async () => (await sheet.boundingBox())!.width).toBe(600 - 32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the sheets take no focus ring for the button the page put the keyboard on, and show one for a Tab", async ({ page }) => {
  await page.goto("/look.html?shot=sheet-round");
  await page.waitForSelector("body[data-ready]");
  const resting = await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('.sheet:not([hidden]) [data-action="continue"]')!;
    return { focused: document.activeElement === button, visible: button.matches(":focus-visible") };
  });
  expect(resting).toEqual({ focused: true, visible: false });
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-action"))).toBe("history");
  expect(await page.evaluate(() => document.activeElement?.matches(":focus-visible"))).toBe(true);
  // Tab stays inside the sheet: from the last control it goes round to the first.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-action"))).toBe("continue");
});

test("the language dialog is the desktop's 560 by 420: the plaque, two flags 160 by 112 at 248 and 32 apart, and their names", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.setViewportSize({ width: 560, height: 420 });
  await page.goto("/look.html?shot=language");
  await page.waitForSelector("body[data-ready]");

  const dialog = (await page.locator(".lang-dialog").boundingBox())!;
  expect(dialog).toMatchObject({ x: 0, y: 0, width: 560, height: 420 });

  // Romanian on the left, with the keyboard, lit as a panel is under the mouse; English beside it.
  const buttons = page.locator(".lang-choice");
  await expect(buttons.locator(".lang-name")).toHaveText(["Română", "English"]);
  const boxes = await buttons.locator(".flag-box").evaluateAll((nodes) =>
    nodes.map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
  expect(boxes).toEqual([
    { x: 104, y: 248, width: 160, height: 112 },
    { x: 296, y: 248, width: 160, height: 112 },
  ]);
  // The flag is 120 by 80 in the middle of its panel, and the name 12 under it.
  const flag = (await buttons.nth(0).locator("svg").boundingBox())!;
  expect(flag).toMatchObject({ x: 124, y: 264, width: 120, height: 80 });
  const name = (await buttons.nth(0).locator(".lang-name").boundingBox())!;
  expect(name.y).toBe(372);

  await expect(buttons.nth(0)).toBeFocused();
  const glow = (node: Element) => getComputedStyle(node).boxShadow;
  const lit = await buttons.nth(0).locator(".flag-box").evaluate(glow);
  const plain = await buttons.nth(1).locator(".flag-box").evaluate(glow);
  expect(lit).not.toBe(plain);
  expect(await buttons.nth(0).locator(".lang-name").evaluate((node) => getComputedStyle(node).color)).toBe("rgb(242, 211, 140)");
  expect(await buttons.nth(1).locator(".lang-name").evaluate((node) => getComputedStyle(node).color)).toBe("rgb(241, 230, 204)");

  // The mouse lights English too, as it does a button of the desktop's, with Romanian still lit.
  await buttons.nth(1).hover();
  expect(await buttons.nth(1).locator(".flag-box").evaluate(glow)).toBe(lit);
  expect(problems).toEqual([]);
});

test("the language dialog is shown smaller in a window that cannot hold it, and nothing scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 210 });
  await page.goto("/look.html?shot=language");
  await page.waitForSelector("body[data-ready]");
  const dialog = (await page.locator(".lang-dialog").boundingBox())!;
  expect(dialog).toMatchObject({ x: 0, y: 0, width: 280, height: 210 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);

  // A tall narrow one, like a phone held upright, shrinks it by its width and centres it.
  await page.setViewportSize({ width: 390, height: 844 });
  // The dialog is refitted when the window's resize is told to the page, a moment after the size is set.
  await expect.poll(async () => (await page.locator(".lang-dialog").boundingBox())!.width).toBeCloseTo(390, 0);
  const tall = (await page.locator(".lang-dialog").boundingBox())!;
  expect(tall.width).toBeCloseTo(390, 0);
  expect(tall.x).toBeCloseTo(0, 0);
  expect(tall.y + tall.height / 2).toBeCloseTo(422, 0);
});

test("a single word of lettering keeps the swash of its W, which a box the height of the line would cut off", async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 420 });
  await page.goto("/look.html?shot=language");
  await page.waitForSelector("body[data-ready]");
  const letters = page.locator(".lang-logo .medal-letters");
  // The box reaches up by --lift where the gradient is its top colour, and the text keeps its place.
  const text = (await letters.locator("div").boundingBox())!;
  const box = (await letters.boundingBox())!;
  expect(await letters.evaluate((node) => getComputedStyle(node).paddingTop)).toBe("14px");
  // Measured on the page, where the plaque is drawn at 1.26 of its size.
  expect(text.y - box.y).toBeCloseTo(14 * 1.26, 1);
});

// What a finger enlarges is the desktop's table, which a touch screen has from 1100 by 740 and a phone held
// upright has at its width. A touch screen smaller than 1100 by 740 and wider than tall has the scaled table,
// with sizes of its own, which its own tests look at.
for (const [width, height] of [
  [1280, 800],
  [390, 844],
]) {
  test.describe(`under a finger, in a window of ${width} by ${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });

    test("a card played from the fan starts its flight where it is drawn, and as large", async ({ page }) => {
      const start = await flightStart(page, false);
      expect(Math.abs(start.first.x - start.drawn.x)).toBeLessThan(2);
      expect(Math.abs(start.first.y - start.drawn.y)).toBeLessThan(2);
      expect(Math.abs(start.first.width - start.drawn.width)).toBeLessThan(3);
    });

    test("a picked card, which is raised, starts its flight where it is drawn raised", async ({ page }) => {
      const start = await flightStart(page, true);
      // The raise is 30 table units, drawn at the fan's scale: some 12 pixels here, which a flight from the
      // rest would jump by.
      expect(start.rest.y - start.drawn.y).toBeGreaterThan(8);
      expect(Math.abs(start.first.x - start.drawn.x)).toBeLessThan(2);
      expect(Math.abs(start.first.y - start.drawn.y)).toBeLessThan(2);
      expect(Math.abs(start.first.width - start.drawn.width)).toBeLessThan(3);
    });

    test("the sliders are 44 tall under a finger, about the line a mouse sees them on, and a touch is on its own", async ({ page }) => {
      await page.goto("/look.html?shot=sheet-settings");
      await page.waitForSelector("body[data-ready]");
      const sliders = await page.locator(".sheet:not([hidden]) .slider").evaluateAll((rows) =>
        rows.map((row) => {
          const input = row.querySelector("input")!.getBoundingClientRect();
          return { height: input.height, middle: input.y + input.height / 2 - row.getBoundingClientRect().y };
        }),
      );
      expect(sliders.length).toBeGreaterThan(1);
      for (const slider of sliders) {
        expect(slider.height).toBeGreaterThanOrEqual(44);
        expect(slider.middle).toBeCloseTo(11, 1);
      }
      // A touch up to 21 pixels above or below a slider's line is on that slider's own input.
      const inputs = page.locator(".sheet:not([hidden]) .slider input");
      for (let at = 0; at < sliders.length; at++) {
        await inputs.nth(at).scrollIntoViewIfNeeded();
        const line = await inputs.nth(at).evaluate((input) => {
          const box = input.getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        });
        for (const offset of [-21, 0, 21]) {
          const hit = await inputs.nth(at).evaluate((input, [x, y]) => document.elementFromPoint(x, y) === input, [line.x, line.y + offset]);
          expect(hit, `slider ${at}, ${offset} from its line`).toBe(true);
        }
      }
    });

    test("the hand's cards are drawn 32 pixels apart or more, and the bid strip 44, and neither is smaller than the mouse's", async ({ page }) => {
      await page.goto("/look.html?shot=hand-8-cards");
      await page.waitForSelector("body[data-ready]");
      const lefts = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".hand .hcard:not([hidden])"), (card) => card.getBoundingClientRect().x).sort((a, b) => a - b));
      expect(lefts).toHaveLength(8);
      for (let at = 1; at < lefts.length; at++) {
        expect(lefts[at] - lefts[at - 1]).toBeGreaterThanOrEqual(30);
      }
      // The fan is no wider than the window, and stays on it.
      expect(lefts[0]).toBeGreaterThanOrEqual(0);

      await page.goto("/look.html?shot=bidding");
      await page.waitForSelector("body[data-ready]");
      const pitch = await page.evaluate(() => {
        const boxes = Array.from(document.querySelectorAll<HTMLElement>(".bidstrip .opt:not([hidden])"), (button) => button.getBoundingClientRect());
        return boxes.length > 1 ? boxes[1].x - boxes[0].x : 0;
      });
      expect(pitch).toBeGreaterThanOrEqual(43.5);
    });
  });
}

test.describe("under a mouse", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: false, isMobile: false });

  test("the same table is drawn as it always was: the fan and the strip at the table's own scale", async ({ page }) => {
    await page.goto("/look.html?shot=hand-8-cards");
    await page.waitForSelector("body[data-ready]");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".hand")!).scale)).toBe("none");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".bidstrip")!).scale)).toBe("none");
  });

  test("a picked card starts its flight from the rest, as the desktop's does", async ({ page }) => {
    const start = await flightStart(page, true);
    expect(start.rest.y - start.drawn.y).toBeGreaterThan(5);
    expect(Math.abs(start.first.x - start.rest.x)).toBeLessThan(2);
    expect(Math.abs(start.first.y - start.rest.y)).toBeLessThan(2);
  });

  test("the sliders are 14 tall, as they were", async ({ page }) => {
    await page.goto("/look.html?shot=sheet-settings");
    await page.waitForSelector("body[data-ready]");
    const heights = await page.locator(".sheet:not([hidden]) .slider input").evaluateAll((inputs) => inputs.map((input) => input.getBoundingClientRect().height));
    expect(heights).not.toHaveLength(0);
    expect(new Set(heights)).toEqual(new Set([14]));
  });
});

// The smallest windows a mouse is asked to work in, and every sheet and page that does not need a
// server: nothing runs off the side, nothing is placed off the top, and every control is within
// reach, by scrolling the sheet to it if the sheet is taller than the window. A finger has the scaled
// table's sheets in these windows, which sheets.spec.ts measures.
for (const [width, height] of [
  [844, 390],
  [832, 384],
  [740, 360],
  [754, 247],
]) {
  test.describe(`a window of ${width} by ${height} under a mouse`, () => {
    test.use({ viewport: { width, height }, hasTouch: false, isMobile: false });

    for (const name of ["sheet-round", "sheet-history", "sheet-last-trick", "sheet-game-over", "sheet-rules", "sheet-settings", "sheet-pause"]) {
      test(`${name} fits, and every one of its controls can be reached`, async ({ page }) => {
        await page.goto(`/look.html?shot=${name}`);
        await page.waitForSelector("body[data-ready]");
        const sheet = page.locator(".sheet:not([hidden])");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const box = (await sheet.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(16);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
        // A page's Back button is for the scaled table, and is not there for a mouse.
        for (const button of await sheet.locator("button:not(:disabled):not(.page-back), input:not(:disabled)").all()) {
          await button.scrollIntoViewIfNeeded();
          const at = (await button.boundingBox())!;
          expect(at.x, "left").toBeGreaterThanOrEqual(0);
          expect(at.x + at.width, "right").toBeLessThanOrEqual(width);
          expect(at.y, "top").toBeGreaterThanOrEqual(16);
          expect(at.y + at.height, "bottom").toBeLessThanOrEqual(height);
        }
      });
    }

    test("the main menu fits between the bar and the foot, and the language dialog fits the window", async ({ page }) => {
      // A mouse has the desktop's menu page and its bar at any size, and below 360 tall they do not fit; a finger has the
      // scaled menu page there, which sheets.spec.ts measures.
      test.skip(height < 360, "the desktop's main menu is for windows 360 tall or more");
      await page.goto("/look.html?shot=menu");
      await page.waitForSelector("body[data-ready]");
      const menu = await page.evaluate(() => {
        const bar = document.querySelector(".menu-band")!.getBoundingClientRect().bottom;
        const logo = document.querySelector(".menu-logo")!.getBoundingClientRect();
        const last = document.querySelector('[data-menu-page="online"]')!.getBoundingClientRect();
        return { top: logo.top >= bar, foot: last.bottom <= window.innerHeight, across: document.documentElement.scrollWidth <= window.innerWidth };
      });
      expect(menu).toEqual({ top: true, foot: true, across: true });

      await page.goto("/look.html?shot=language");
      await page.waitForSelector("body[data-ready]");
      const dialog = (await page.locator(".lang-dialog").boundingBox())!;
      expect(dialog.y).toBeGreaterThanOrEqual(0);
      expect(dialog.y + dialog.height).toBeLessThanOrEqual(height + 0.5);
      expect(dialog.x + dialog.width).toBeLessThanOrEqual(width + 0.5);
    });
  });
}

// The seats stand where the table has them, at the table's own scale, under a finger as under a mouse: the
// panels and the racks are at the places the layout gives them in a window of any size.
for (const [touch, pointer] of [
  [false, "a mouse"],
  [true, "a finger"],
] as const) {
  test.describe(`the seats under ${pointer}`, () => {
    test.use({ hasTouch: touch, isMobile: touch });

    // A finger has the desktop's table from 1100 by 740, and in a window taller than wide.
    for (const [width, height] of touch
      ? [
          [1280, 800],
          [390, 844],
          [1920, 1080],
        ]
      : [
          [844, 390],
          [740, 360],
          [1920, 1080],
        ]) {
      for (const seatCount of [3, 4, 5, 6]) {
        test(`${seatCount} players, in a window of ${width} by ${height}, have their panels and racks at the table's own places`, async ({ page }) => {
          await page.setViewportSize({ width, height });
          await page.goto(`/look.html?shot=table-${seatCount}-players`);
          await page.waitForSelector("body[data-ready]");
          for (let seat = 0; seat < seatCount; seat++) {
            const panel = page.locator(`.seat[data-seat="${seat}"]`);
            const own = place(seatCount, 0, seat)!;
            const at = await panel.evaluate((node) => ({ x: parseFloat(node.style.left), y: parseFloat(node.style.top), scale: getComputedStyle(node).scale }));
            expect(at, `seat ${seat}`).toEqual({ x: own.panel.x, y: own.panel.y, scale: "none" });
            if (own.angle !== null) {
              const rack = await page.locator(".rack").nth(seat).evaluate((node) => ({ x: parseFloat(node.style.left), y: parseFloat(node.style.top) }));
              const origin = rackOrigin(own.angle);
              expect(rack.x, `rack ${seat}`).toBeCloseTo(origin.x, 2);
              expect(rack.y, `rack ${seat}`).toBeCloseTo(origin.y, 2);
            }
          }
        });
      }
    }
  });
}

// The words of the Romanian are longer, so no button of a sheet's actions may be cut off by the sheet's edge,
// nor the sheet made wider than itself, at any window the page works in.
const ACTION_SHEETS = [
  "sheet-round",
  "sheet-history",
  "sheet-last-trick",
  "sheet-game-over",
  "sheet-rules",
  "sheet-settings",
  "sheet-pause",
  "sheet-new-game",
  "sheet-online",
  "sheet-create-table",
  "sheet-lobby",
];

for (const [width, height] of [
  [1280, 760],
  [844, 390],
  [832, 384],
  [740, 360],
  [754, 247],
] as const) {
  test.describe(`in Romanian, in a window of ${width} by ${height} under a mouse`, () => {
    test.use({ viewport: { width, height }, hasTouch: false, isMobile: false });

    for (const name of ACTION_SHEETS) {
      test(`${name} has every button of its actions inside it`, async ({ page }) => {
        await page.goto(`/look.html?shot=${name}&lang=ro`);
        await page.waitForSelector("body[data-ready]");
        const sheet = page.locator(".sheet:not([hidden])");
        const box = (await sheet.boundingBox())!;
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        const buttons = await sheet.locator(".sheet-actions button, .sheet-actions select, .sheet-actions input").all();
        expect(buttons.length).toBeGreaterThan(0);
        for (const button of buttons) {
          await button.scrollIntoViewIfNeeded();
          const at = (await button.boundingBox())!;
          const label = (await button.textContent()) ?? "";
          expect(at.x, `${label} left`).toBeGreaterThanOrEqual(box.x);
          expect(at.x + at.width, `${label} right`).toBeLessThanOrEqual(box.x + box.width);
        }
      });
    }
  });
}
