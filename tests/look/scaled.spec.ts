import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { flightStart } from "./flight";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
// The scaled table as a phone gets it, one folder for each size and language. Paired with the Android
// mock-up's own pictures of the same screens by tools/pair_scaled.py.
const OUT = join(ROOT, "build/shots/scaled");
const OUT_RO = join(ROOT, "build/shots/scaled-ro");

const SIZES = [
  [640, 360],
  [915, 412],
  [832, 384],
] as const;

const SHOTS = ["table-2-players", "table-3-players", "table-4-players", "table-5-players", "table-6-players", "bidding", "hand-1-card", "hand-4-cards", "hand-8-cards"];

for (const [width, height] of SIZES) {
  test.describe(`the scaled table at ${width} by ${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    for (const [language, out] of [
      ["en", OUT],
      ["ro", OUT_RO],
    ] as const) {
      for (const name of SHOTS) {
        test(`renders ${name} in ${language === "en" ? "English" : "Romanian"}`, async ({ page }) => {
          const problems: string[] = [];
          page.on("pageerror", (error) => problems.push(error.message));
          const folder = join(out, `${width}x${height}`);
          mkdirSync(folder, { recursive: true });
          await page.goto(`/look.html?shot=${name}&lang=${language}`);
          await page.waitForSelector("body[data-ready]");
          await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
          await page.screenshot({ path: join(folder, `${name}.png`), animations: "disabled" });
          expect(problems).toEqual([]);
        });
      }
    }
  });
}

test.describe("the scaled table's words fit their plates, in both languages", () => {
  test.use({ viewport: { width: 640, height: 360 }, hasTouch: true, isMobile: true });

  for (const language of ["en", "ro"]) {
    for (const name of ["table-6-players", "bidding"]) {
      test(`${name} in ${language}: no pill, name or chip is cut off`, async ({ page }) => {
        await page.goto(`/look.html?shot=${name}&lang=${language}`);
        await page.waitForSelector("body[data-ready]");
        const cut = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>(".stage .pill, .stage .name-text, .stage .round-chip .l1, .stage .round-chip .l2"))
            .filter((node) => !node.closest("[hidden]") && node.scrollWidth > node.clientWidth + 0.5)
            .map((node) => `${node.className}: ${node.textContent}`),
        );
        expect(cut).toEqual([]);
      });
    }
  }
});

// What a plate shows of who is at the seat and how long they have, and what a bid said out loud does at the top of
// the window.
const LOOK = join(ROOT, "libs/romanian_whist_server/protocol/look");
const stateOf = (name: string) => JSON.parse(readFileSync(join(LOOK, `${name}.json`), "utf8")).state;

test.describe("the scaled table's plates", () => {
  test.use({ viewport: { width: 832, height: 384 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test("show a person who is away as a sign in the pill, and a computer player in a seat as a badge", async ({ page }) => {
    await page.goto("/look.html?shot=table-4-players");
    await page.waitForSelector("body[data-ready]");
    const table = stateOf("table-4-players").table;
    table.seats[1] = { ...table.seats[1], kind: "human", presence: "away", you: false };
    table.seats[2] = { ...table.seats[2], kind: "human", presence: "replaced", you: false };
    delete table.seats[1].level;
    delete table.seats[2].level;
    await page.evaluate((text) => (window as unknown as { look: { apply(text: string, animate: boolean): Promise<void> } }).look.apply(text, false), JSON.stringify({ type: "tableState", seq: 1, ...table }));
    const away = page.locator('.stage .seat[data-seat="1"]');
    await expect(away.locator(".pill svg")).toHaveCount(1);
    await expect(away.locator(".pill")).toHaveAttribute("data-state", "away");
    await expect(away.locator(".pill")).toHaveAttribute("title", "Away");
    await expect(away.locator(".badge")).toBeHidden();
    const replaced = page.locator('.stage .seat[data-seat="2"]');
    await expect(replaced.locator(".badge")).toBeVisible();
    await expect(replaced.locator(".pill")).toHaveText(/^\d\/\d$/);
    // Neither says it in the chip over the plate, which is for the seconds.
    await expect(away.locator(".presence")).toBeHidden();
    await expect(replaced.locator(".presence")).toBeHidden();
  });

  test("count down your turn's last seconds in a ring round your own plate, with the seconds over it", async ({ page }) => {
    await page.goto("/look.html?shot=table-4-players");
    await page.waitForSelector("body[data-ready]");
    const state = stateOf("table-4-players");
    const prompt = { type: "prompt", seq: 1, id: 9, kind: "play", blind: false, deadline: 10000, hand: state.snapshot.seats[0].hand, legal: [0] };
    type Look = { look: { apply(text: string, animate: boolean): Promise<void>; tick(now: number): void } };
    await page.evaluate(
      async ([text, now]) => {
        const { look } = window as unknown as Look;
        await look.apply(text as string, false);
        look.tick(now as number);
      },
      [JSON.stringify(prompt), 4000] as const,
    );
    const mine = page.locator(".stage .seat.mine");
    const ring = mine.locator("svg.ring");
    await expect(ring).toBeVisible();
    await expect(ring).toHaveAttribute("viewBox", "0 0 184 38");
    await expect(mine.locator(".presence")).toHaveText("6 s");
    await expect(mine).toHaveClass(/counting/);
    // The ring is as large as the plate and a rounding past it, and it takes no touch.
    const plate = (await mine.boundingBox())!;
    const round = (await ring.boundingBox())!;
    expect(Math.abs(round.width - plate.width)).toBeLessThan(4);
    expect(await ring.evaluate((node) => getComputedStyle(node).pointerEvents)).toBe("none");
    await page.evaluate((now) => (window as unknown as Look).look.tick(now), 1_000_000);
    await expect(ring).toBeHidden();
    await expect(mine).not.toHaveClass(/counting/);
  });

  test("keep a bid said out loud over a plate at the top of the window inside it", async ({ page }) => {
    await page.goto("/look.html?shot=table-4-players&lang=en");
    await page.waitForSelector("body[data-ready]");
    const state = stateOf("table-4-players");
    const apply = (snapshot: unknown, seq: number) =>
      page.evaluate(
        (text) => (window as unknown as { look: { apply(text: string, animate: boolean): Promise<void> } }).look.apply(text, false),
        JSON.stringify({ type: "game", seq, game: 1, event: { kind: "betPlaced", seat: 2, bet: 1 }, snapshot }),
      );
    // The seat across the table has not bid, and then bids.
    state.snapshot.seats[2].bet = null;
    await apply(state.snapshot, 1);
    state.snapshot.seats[2].bet = 1;
    await apply(state.snapshot, 2);
    const bubble = page.locator(".stage .bubble:not([hidden])");
    await expect(bubble).toHaveCount(1);
    await expect(bubble).toHaveText("Bids 1");
    // Its plate is at the top of the window, with no room over it.
    const plate = (await page.locator('.stage .seat[data-seat="2"]').boundingBox())!;
    expect(plate.y).toBeLessThan(10);
    expect((await bubble.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  });

  test("keep a card of yours that went early where the table now puts it, when the window changes before the server answers", async ({ page }) => {
    await page.goto("/look.html?shot=table-4-players");
    await page.waitForSelector("body[data-ready]");
    await page.evaluate(() => (window as unknown as { look: { playOwn(card: string): void } }).look.playOwn("KC"));
    const played = page.locator('.trick .card[data-card="KC"]');
    await expect(played).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "desktop");
    // Straight down from the logo, as the desktop lays your card: a logo's radius and half a card from the centre.
    const felt = (await page.locator(".felt").boundingBox())!;
    const at = (await played.boundingBox())!;
    const unit = felt.width / 880;
    expect(at.x + at.width / 2).toBeCloseTo(felt.x + felt.width / 2, 0);
    expect(at.y + at.height / 2).toBeCloseTo(felt.y + felt.height / 2 + (107.5 + 205.2 / 2) * unit, 0);
  });

  test("start a card's flight where it is drawn, raised if it is picked, and as large", async ({ page }) => {
    for (const picked of [false, true]) {
      const start = await flightStart(page, picked);
      expect(Math.abs(start.first.x - start.drawn.x), `picked ${picked}`).toBeLessThan(2);
      expect(Math.abs(start.first.y - start.drawn.y), `picked ${picked}`).toBeLessThan(2);
      expect(Math.abs(start.first.width - start.drawn.width), `picked ${picked}`).toBeLessThan(3);
      if (picked) {
        // The raise is the layout's, 29 units at this scale.
        expect(start.rest.y - start.drawn.y).toBeGreaterThan(25);
      }
    }
  });
});

// Every word of the scaled table's panels is inside its panel, and no panel leaves the window: the line above your
// hand, the strip's note, the side panels' rows, the chip, a plate's name and the notice, in both languages, at the
// smallest window and at two more, for a bid of eight cards and of one, and for a card to play.
const DECK = ["AS", "JS", "8S", "QH", "9H", "7H", "TC", "QD"];

type Json = Record<string, any>;

// The state of a fixture, with the table at the bid for this many cards in everyone's hand.
function bidding(name: string, cards: number, refused: number | null = null): Json {
  const state = structuredClone(stateOf(name)) as Json;
  const snapshot = state.snapshot;
  snapshot.phase = "betting";
  snapshot.active = 0;
  snapshot.bets = { placed: 0, sum: 0 };
  snapshot.forbiddenBet = refused;
  snapshot.round = { ...snapshot.round, tricks: cards, trick: 0, trump: "QD", type: "normal" };
  snapshot.table = { cards: [], leadSuit: null, ledBy: 0 };
  for (const seat of snapshot.seats) {
    Object.assign(seat, { cards, bet: null, won: 0 });
    delete seat.hand;
  }
  snapshot.seats[0].hand = DECK.slice(0, cards);
  state.lastTrick = null;
  state.prompt = { kind: "bet", id: 1, deadline: null, first: refused === null, forbidden: refused, max: cards, hand: DECK.slice(0, cards), roundType: "normal" };
  return state;
}

// The state of a fixture with you to play a card of your hand.
function playing(name: string): Json {
  const state = structuredClone(stateOf(name)) as Json;
  const hand = state.snapshot.seats[0].hand as string[];
  state.snapshot.active = 0;
  state.prompt = { kind: "play", id: 1, deadline: null, blind: false, hand, legal: hand.map((_, at) => at) };
  return state;
}

// Where the line above your hand must show for the test to have looked at it: a bid of eight cards at four seats is
// one the strip has no room for its note beside, in each window, and a card to play always has its line.
const TABLES = [
  ["a bid of eight cards at six seats", () => bidding("bidding", 8), false],
  ["a bid of eight cards at four seats", () => bidding("table-4-players", 8), true],
  ["the last bid of eight cards, one of which is refused, at four seats", () => bidding("table-4-players", 8, 2), true],
  ["the last bid of eight cards, one of which is refused, at six seats", () => bidding("bidding", 8, 2), false],
  ["a bid of one card at six seats", () => bidding("bidding", 1), false],
  ["a bid of one card at four seats", () => bidding("table-4-players", 1), false],
  ["a card to play at four seats", () => playing("hand-8-cards"), true],
  ["a card to play at six seats", () => playing("table-6-players"), true],
] as const;

// What of a panel's text is outside the panel, and what panel is outside the window. A box that clips its text, with
// an ellipsis or without one, has cut a word.
async function strays(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const slack = 0.75;
    // A line of text is drawn taller than the line it is set in when the line is tight, so what may stand out above
    // and below is a quarter of its own height.
    const inside = (inner: DOMRect | DOMRectReadOnly, outer: DOMRect) => {
      const tall = inner.height * 0.25 + slack;
      return inner.left >= outer.left - slack && inner.right <= outer.right + slack && inner.top >= outer.top - tall && inner.bottom <= outer.bottom + tall;
    };
    const clips = (node: Element) => {
      const style = getComputedStyle(node);
      return style.overflowX !== "visible" || style.overflowY !== "visible";
    };
    for (const panel of Array.from(document.querySelectorAll<HTMLElement>(".stage .panel, .stage .trump-corner"))) {
      if (!panel.checkVisibility()) {
        continue;
      }
      const name = `${panel.className.replace("panel", "").trim()} "${(panel.textContent ?? "").trim().slice(0, 40)}"`;
      const box = panel.getBoundingClientRect();
      if (box.left < -slack || box.top < -slack || box.right > window.innerWidth + slack || box.bottom > window.innerHeight + slack) {
        found.push(`${name} is outside the window: ${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)}`);
      }
      const words = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      for (let node = words.nextNode(); node !== null; node = words.nextNode()) {
        const parent = node.parentElement!;
        // Words said to a screen reader are in a box clipped to nothing.
        const unseen = (up: Element | null): boolean => up !== null && up !== panel.parentElement && (getComputedStyle(up).clipPath !== "none" || unseen(up.parentElement));
        if ((node.textContent ?? "").trim() === "" || !parent.checkVisibility() || unseen(parent)) {
          continue;
        }
        // The nearest box between the text and the panel that clips it.
        let clip: Element | null = null;
        for (let up: Element | null = parent; up !== null && clip === null; up = up === panel ? null : up.parentElement) {
          clip = clips(up) ? up : null;
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        const frame = clip === null ? box : clip.getBoundingClientRect();
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width === 0 || inside(rect, frame)) {
            continue;
          }
          found.push(`${name}: "${(node.textContent ?? "").trim().slice(0, 40)}" runs from ${Math.round(rect.left)} to ${Math.round(rect.right)} in a box from ${Math.round(frame.left)} to ${Math.round(frame.right)}`);
          break;
        }
      }
    }
    return found;
  });
}

for (const [width, height] of [
  [754, 247],
  [832, 384],
  [640, 360],
] as const) {
  test.describe(`the scaled table's panels at ${width} by ${height} hold their words`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });

    for (const language of ["en", "ro"]) {
      for (const [what, make, lined] of TABLES) {
        // A browser with no full screen gets the longer notice, which says to add the page to the home screen.
        for (const fullscreen of [true, false]) {
          test(`in ${language}, for ${what}${fullscreen ? "" : ", where the browser has no full screen"}`, async ({ page }) => {
            if (!fullscreen) {
              await page.addInitScript(() => Object.defineProperty(document, "fullscreenEnabled", { value: false }));
            }
            await page.goto(`/look.html?shot=table-4-players&lang=${language}`);
            await page.waitForSelector("body[data-ready]");
            await page.evaluate(
              (text) => (window as unknown as { look: { apply(text: string, animate: boolean): Promise<void> } }).look.apply(text, false),
              JSON.stringify({ type: "sync", seq: 1, ...make() }),
            );
            await page.evaluate(() => document.fonts.ready);
            if (lined) {
              await expect(page.locator(".stage .prompt-line")).toBeVisible();
            }
            expect(await strays(page)).toEqual([]);
          });
        }
      }
    }
  });
}
