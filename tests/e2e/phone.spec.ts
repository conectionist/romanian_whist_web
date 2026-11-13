import { expect, test, type Page } from "@playwright/test";
import { createTable, sheet } from "./online";
import { tapCard } from "./support";

// The scaled table, which a touch screen smaller than 1100 by 740 has, and the desktop's, which a mouse has at
// every size. Touch is what Chromium emulates with touch events and the coarse pointer the page asks about.
const touch = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } as const;

const layoutOf = (page: Page) => page.locator(".window").getAttribute("data-layout");
const stripUp = (page: Page) => page.locator(".bidstrip:not([hidden]) .opt:not(:disabled)").first().waitFor();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "off"));
});

test.describe("a mouse in a phone's window", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: false, isMobile: false });

  test("keeps the desktop's table with its menu bar, at a size where a finger would have the scaled one", async ({ page }) => {
    await page.goto("/?solo=4&seed=7&speed=4");
    await stripUp(page);
    expect(await layoutOf(page)).toBe("desktop");
    expect((await page.locator(".menu-band").boundingBox())?.height).toBe(46);
    await expect(page.locator(".stage")).toBeHidden();
    await expect(page.locator(".seat.plate, .seat.mine")).toHaveCount(0);
    expect(await page.locator(".seat").first().evaluate((node) => getComputedStyle(node).width)).toBe("259px");
    expect(await page.locator(".hand").evaluate((node) => node.parentElement?.className)).toBe("space");
    await expect(page.locator(".corner-buttons")).toBeVisible();
  });
});

test.describe("a touch screen of 1280 by 800", () => {
  test.use({ viewport: { width: 1280, height: 800 }, ...touch });

  test("keeps the desktop's table, with phase 8's enlargements and the menu bar", async ({ page }) => {
    await page.goto("/?solo=4&seed=7&speed=4");
    await stripUp(page);
    expect(await layoutOf(page)).toBe("desktop");
    expect((await page.locator(".menu-band").boundingBox())?.height).toBe(46);
    await expect(page.locator(".stage")).toBeHidden();
    // The strip is drawn larger, so a bid is 44 from the next.
    expect(await page.locator(".bidstrip").evaluate((node) => getComputedStyle(node).scale)).not.toBe("none");
    await expect(page.locator(".corner-buttons")).toBeVisible();
  });
});

test.describe("a touch screen too small for the table", () => {
  test.use({ viewport: { width: 380, height: 213 }, ...touch });

  test("is told the game needs more room, and has the table back once the window is as large as the floor", async ({ page }) => {
    await page.goto("/?solo=3&seed=7&speed=4");
    await expect(page.locator("body")).toHaveAttribute("data-status", "at a table");
    expect(await layoutOf(page)).toBe("tooSmall");
    const notice = page.locator(".too-small");
    await expect(notice).toBeVisible();
    await expect(notice.locator("h2")).toHaveText("This window is too small for the table");
    await expect(notice).toContainText("at least 384 × 216 pixels");
    await expect(notice).toContainText("This window is 380 × 213.");
    // The page under it takes no touch and no key.
    expect(await page.locator("#app").evaluate((node) => node.hasAttribute("inert"))).toBe(true);

    // The floor itself still gets the table, drawn at 0.6.
    await page.setViewportSize({ width: 384, height: 216 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
    await expect(notice).toBeHidden();
    expect(await page.locator("#app").evaluate((node) => node.hasAttribute("inert"))).toBe(false);
    await stripUp(page);
    await expect(page.locator(".stage .seat")).toHaveCount(3);

    // One pixel less in either direction and it is gone again.
    await page.setViewportSize({ width: 383, height: 216 });
    await expect(notice).toBeVisible();
    await page.setViewportSize({ width: 384, height: 215 });
    await expect(notice).toBeVisible();
    // A window taller than wide is the hint's, not this.
    await page.setViewportSize({ width: 200, height: 400 });
    await expect(notice).toBeHidden();
  });
});

// The windows the scaled table is tested at: the mock-up's, and the owner's phone in full screen and inside a
// browser's bars.
const WINDOWS = [
  [640, 360],
  [915, 412],
  [829, 690],
  [960, 600],
  [800, 360],
  [780, 360],
  [832, 384],
  [754, 247],
] as const;

interface Box {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// How far apart two boxes are: the larger of the gaps between their sides, negative where they overlap.
function gap(a: Box, b: Box): number {
  return Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h));
}

// The boxes the scaled table draws, as the browser has them.
async function boxes(page: Page): Promise<Record<"plates" | "mine" | "controls" | "cards" | "strip" | "side", Box[]>> {
  return page.evaluate(() => {
    const of = (selector: string, name: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector), (node, at) => {
        const box = node.getBoundingClientRect();
        return { name: `${name} ${at}`, x: box.x, y: box.y, w: box.width, h: box.height };
      });
    return {
      plates: of(".stage .seat.plate:not([hidden])", "plate"),
      mine: of(".stage .seat.mine:not([hidden])", "your plate"),
      controls: of(".stage .round-btn, .stage .round-chip", "control"),
      cards: of(".stage .hcard:not([hidden]) .face", "card"),
      strip: of(".stage .bidstrip:not([hidden])", "strip"),
      side: of(".stage .side-panel:not([hidden])", "side panel"),
    };
  });
}

for (const [width, height] of WINDOWS) {
  test.describe(`a touch screen of ${width} by ${height}`, () => {
    test.use({ viewport: { width, height }, ...touch });

    for (const players of [2, 3, 4, 5, 6]) {
      test(`with ${players} players, no plate overlaps another, a corner control, the bid strip or the hand`, async ({ page }) => {
        await page.goto(`/?solo=${players}&seed=7&speed=4`);
        await stripUp(page);
        expect(await layoutOf(page)).toBe("scaled");
        const scale = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".stage")!).getPropertyValue("--scale")));
        const all = await boxes(page);
        expect(all.plates).toHaveLength(players - 1);
        expect(all.mine).toHaveLength(1);
        expect(all.controls).toHaveLength(4);

        // Neighbours keep 4 apart in the window's own units.
        for (const [at, one] of all.plates.entries()) {
          for (const other of all.plates.slice(at + 1)) {
            expect(gap(one, other), `${one.name} and ${other.name}`).toBeGreaterThanOrEqual(4 * scale - 0.6);
          }
        }
        // The plates, and yours, keep clear of the corner controls, the side panels and the strip.
        for (const plate of [...all.plates, ...all.mine]) {
          for (const other of [...all.controls, ...all.side, ...all.strip]) {
            expect(gap(plate, other), `${plate.name} and ${other.name}`).toBeGreaterThanOrEqual(-0.6);
          }
          expect(plate.x, `${plate.name} left`).toBeGreaterThanOrEqual(-0.6);
          expect(plate.x + plate.w, `${plate.name} right`).toBeLessThanOrEqual(width + 0.6);
          expect(plate.y, `${plate.name} top`).toBeGreaterThanOrEqual(-0.6);
        }
        // The hand keeps clear of the other plates and the corner controls. Your own plate is over its foot, by design.
        for (const card of all.cards) {
          for (const other of [...all.plates, ...all.controls]) {
            expect(gap(card, other), `${card.name} and ${other.name}`).toBeGreaterThanOrEqual(-0.6);
          }
        }
        for (const control of all.controls) {
          for (const other of [...all.side, ...all.strip]) {
            expect(gap(control, other), `${control.name} and ${other.name}`).toBeGreaterThanOrEqual(-0.6);
          }
        }
      });
    }
  });
}

test.describe("the controls under a finger, on the scaled table", () => {
  for (const [width, height] of [
    [832, 384],
    [754, 247],
  ] as const) {
    test.describe(`in a window of ${width} by ${height}`, () => {
      test.use({ viewport: { width, height }, ...touch });

      test("a bid and a round button are as large as the scale allows, and no smaller than 44 where the table is drawn full size", async ({ page }) => {
        await page.goto("/?solo=3&seed=7&speed=4");
        await stripUp(page);
        const scale = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".stage")!).getPropertyValue("--scale")));
        const sizes = await page.evaluate(() => {
          const box = (selector: string) => {
            const rect = document.querySelector(selector)!.getBoundingClientRect();
            return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
          };
          return { bid: box(".stage .opt"), menu: box('.stage [data-button="menu"]'), history: box('.stage [data-button="history"]') };
        });
        // Drawn as the mock-up does: 48 units, whatever the scale.
        for (const each of [sizes.bid, sizes.menu, sizes.history]) {
          expect(each.w).toBeCloseTo(48 * scale, 1);
          expect(each.h).toBeCloseTo(48 * scale, 1);
          if (scale >= 44 / 48) {
            expect(each.w).toBeGreaterThanOrEqual(44);
          }
        }
        // A touch up to 22 pixels from the middle of the menu button lands on it, which at the smaller scale is
        // the button's reach beyond its drawing.
        const lands = (x: number, y: number) =>
          page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest("[data-button]")?.getAttribute("data-button") ?? null, [x, y]);
        const middle = { x: sizes.menu.x + sizes.menu.w / 2, y: sizes.menu.y + sizes.menu.h / 2 };
        expect(await lands(middle.x - 21, middle.y)).toBe("menu");
        expect(await lands(middle.x, middle.y + 21)).toBe("menu");
      });
    });
  }
});

test.describe("the layout changing in the middle of a game", () => {
  test.use({ viewport: { width: 832, height: 384 }, ...touch });

  // The table as it stands in whichever layout it is in: where each part is mounted, and what it carries from the other.
  async function mounts(page: Page) {
    return page.evaluate(() => {
      const parent = (selector: string) => document.querySelector(selector)?.parentElement?.className ?? null;
      const inline = (selector: string, property: string) => (document.querySelector<HTMLElement>(selector)?.style as unknown as Record<string, string>)[property] ?? null;
      return {
        layout: document.querySelector(".window")!.getAttribute("data-layout"),
        hand: parent(".hand"),
        strip: parent(".bidstrip"),
        trick: parent(".trick"),
        lead: parent(".lead-mark"),
        panel: parent(".seat"),
        trickTransform: inline(".trick", "transform"),
        stripLeft: inline(".bidstrip", "left"),
        plates: document.querySelectorAll(".seat.plate, .seat.mine").length,
        bar: getComputedStyle(document.querySelector(".menu-band")!).display,
        stage: getComputedStyle(document.querySelector(".stage")!).display,
        hud: document.querySelector<HTMLElement>(".hud")!.hidden,
        viewTop: document.querySelector(".view")!.getBoundingClientRect().top,
        flying: document.getAnimations().length,
      };
    });
  }

  test("redraws from the model with nothing of the other layout left, a card in the air included", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await page.addInitScript(() => window.localStorage.setItem("whist.pace", "slow"));
    await page.goto("/?solo=3&seed=7&speed=2");
    await stripUp(page);
    // The scaled table has the whole window, with none of the desktop's corner panels, buttons or menu bar.
    expect(await mounts(page)).toMatchObject({ layout: "scaled", hand: "stage", strip: "stage", trick: "stage", lead: "trick", panel: "stage", bar: "none", hud: true, viewTop: 0 });

    // To the desktop's table while a bid is asked for.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "desktop");
    expect(await mounts(page)).toMatchObject({ layout: "desktop", hand: "space", strip: "space-top", trick: "space", lead: "space", panel: "space", trickTransform: "", stripLeft: "", plates: 0, stage: "none", hud: false, viewTop: 46 });
    expect(await page.locator(".menu-band").boundingBox()).toMatchObject({ height: 46 });
    await page.setViewportSize({ width: 832, height: 384 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
    await stripUp(page);
    await page.locator(".bidstrip:not([hidden]) .opt:not(:disabled)").first().tap();

    // Your card in the air when the window is turned and then turned back.
    await page.locator(".hand .hcard.playable").first().waitFor();
    const card = page.locator(".hand .hcard.playable").first();
    const name = await card.getAttribute("data-card");
    await tapCard(page, card);
    await tapCard(page, card);
    expect(await page.evaluate(() => document.getAnimations().length), "the card is in the air").toBeGreaterThan(0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "desktop");
    // What was in the air landed with the change, and is not left to finish in the other layout's places.
    expect((await mounts(page)).flying).toBe(0);
    // Wherever the card is, it is in the felt of the table now drawn, under the logo.
    const played = page.locator(`.trick .card[data-card="${name}"]`);
    await expect(played).toBeVisible();
    const felt = (await page.locator(".felt").boundingBox())!;
    const lying = (await played.boundingBox())!;
    expect(lying.x).toBeGreaterThan(felt.x);
    expect(lying.x + lying.width).toBeLessThan(felt.x + felt.width);
    expect(lying.y).toBeGreaterThan(felt.y);
    expect(lying.y + lying.height).toBeLessThan(felt.y + felt.height);
    expect(await mounts(page)).toMatchObject({ layout: "desktop", hand: "space", trick: "space", trickTransform: "", plates: 0, stage: "none" });

    await page.setViewportSize({ width: 832, height: 384 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
    expect(await mounts(page)).toMatchObject({ layout: "scaled", hand: "stage", trick: "stage", lead: "trick", panel: "stage", bar: "none" });
    const wood = (await page.locator(".felt").boundingBox())!;
    const again = (await page.locator(`.trick .card[data-card="${name}"]`).boundingBox()) ?? (await played.boundingBox())!;
    expect(again.x).toBeGreaterThan(wood.x);
    expect(again.x + again.width).toBeLessThan(wood.x + wood.width);

    // And a phone turned upright is the desktop's table with the hint over it, and turned back it is the scaled one again.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "desktop");
    await expect(page.locator(".rotate-hint")).toBeVisible();
    await page.setViewportSize({ width: 832, height: 384 });
    await expect(page.locator(".window")).toHaveAttribute("data-layout", "scaled");
    await expect(page.locator(".rotate-hint")).toBeHidden();
    expect(problems).toEqual([]);
  });

  test("a tap on a card, or a focus on it, does not carry the table up to show the part below the window", async ({ page }) => {
    await page.goto("/?solo=4&seed=7&speed=4");
    await stripUp(page);
    await page.locator(".bidstrip:not([hidden]) .opt:not(:disabled)").first().tap();
    const card = page.locator(".hand .hcard.playable").first();
    await card.waitFor();
    const scrolled = () => page.evaluate(() => ({ view: document.querySelector(".view")!.scrollTop, stage: document.querySelector(".stage")!.getBoundingClientRect().top }));
    // The keyboard on a card, which the browser scrolls into view, and then a tap, which Playwright does.
    await card.evaluate((node) => node.focus());
    await expect(card).toHaveClass(/selected/);
    expect(await scrolled()).toEqual({ view: 0, stage: 0 });
    await tapCard(page, card);
    expect(await scrolled()).toEqual({ view: 0, stage: 0 });
  });

  test("a resize that keeps the scale draws the table for the new window", async ({ page }) => {
    await page.goto("/?solo=4&seed=7&speed=4");
    await stripUp(page);
    const before = (await page.locator(".stage .seat.mine").boundingBox())!;
    // Same height, so the same scale, and a window wider by 100: the table moves to the middle of it.
    await page.setViewportSize({ width: 932, height: 384 });
    await expect.poll(async () => (await page.locator(".stage .seat.mine").boundingBox())!.x).toBeCloseTo(before.x + 50, 0);
  });
});

test.describe("the scaled table's buttons", () => {
  test.use({ viewport: { width: 832, height: 384 }, ...touch });

  const open = (page: Page, name: string) => sheet(page, name);

  test("Pause raises the pause menu in a solo game, and the round chip, the side panels and the two round buttons open the sheets", async ({ page }) => {
    await page.goto("/?solo=3&seed=7&speed=4&wait=1");
    await stripUp(page);
    const menu = page.locator('.stage [data-button="menu"]');
    await expect(menu).toHaveAttribute("aria-label", "Pause");
    await menu.tap();
    await expect(open(page, "pause")).toBeVisible();
    await open(page, "pause").locator('[data-action="resume"]').tap();
    await expect(open(page, "pause")).toHaveCount(0);

    for (const [button, name] of [
      ['.stage [data-button="history"]', "history"],
      ['.stage [data-button="last-trick"]', "last-trick"],
      ['.stage [data-button="scores"]', "history"],
      [".stage .side-trick", "history"],
      [".stage .side-scores", "history"],
    ] as const) {
      await page.locator(button).tap();
      await expect(open(page, name), button).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(open(page, name), button).toHaveCount(0);
    }
    // Esc raises the pause menu, as it does on the desktop's table.
    await page.keyboard.press("Escape");
    await expect(open(page, "pause")).toBeVisible();
  });

  test("The button is Menu at an online table, and raises the offer to leave", async ({ page }) => {
    await createTable(page, "Alice", { seats: 3, others: ["computer", "computer"], speed: "fastest" });
    await sheet(page, "lobby").locator('[data-action="start"]').click();
    await expect(page.locator(".stage .seat:not([hidden])")).toHaveCount(3);
    const menu = page.locator('.stage [data-button="menu"]');
    await expect(menu).toHaveAttribute("aria-label", "Menu");
    await menu.tap();
    await expect(open(page, "leave").locator(".sheet-title")).toHaveText("Leave the table?");
    await open(page, "leave").getByRole("button", { name: "Stay" }).tap();
    await expect(open(page, "leave")).toHaveCount(0);
  });
});
