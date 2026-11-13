import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
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
