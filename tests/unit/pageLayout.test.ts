import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUTTON,
  BUTTON_GAP,
  COLUMN_GAP,
  NOTE_GAP,
  NOTE_LEAST,
  NOTE_MOST,
  PAGE_CHIP_HEIGHT,
  PANEL_X,
  PANEL_Y,
  TRICK_MOST,
  TRUMP_LABEL,
  TRUMP_WIDTH,
  cornersFor,
  hasSides,
  pageLayout,
  noteBeside,
  playedHeight,
  stripBeside,
  type PageLayout,
} from "../../src/table/geometry/page";
import { DESKTOP_FROM, SIDE_FROM, layoutChoiceFor, sideWidthOf } from "../../src/table/layoutChoice";
import type { Size } from "../../src/table/space";
import { CHIP_WIDTH, CORNER_INSET, MOCKUP_CORNERS, SIDE_MIN, directionsFor, handSlots, layoutScaled, type Box, type ScaledWindow } from "../../src/table/geometry/scaled";

interface Fixture {
  windows: { name: string; design: ScaledWindow }[];
}

// The windows the scaled table is tested at, in its own units.
const { windows } = JSON.parse(readFileSync(new URL("./fixtures/mockup-layout.json", import.meta.url), "utf8")) as Fixture;
const COUNTS = [2, 3, 4, 5, 6];

// How far apart two boxes are: the larger of the gaps between their sides, negative where they overlap.
const gap = (a: Box, b: Box): number => Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h));

describe("the corners of the port", () => {
  it("are the mock-up's unless it is given others, and move the table when it is", () => {
    for (const each of windows) {
      for (const count of COUNTS) {
        expect(layoutScaled(each.design, count, MOCKUP_CORNERS), `${each.name} ${count}`).toEqual(layoutScaled(each.design, count));
      }
    }
    // A box at the bottom left that the lower plates must clear lifts them.
    const crowded = { ...MOCKUP_CORNERS, bottomLeft: { w: 400, h: 200 } };
    const plain = layoutScaled(windows[1].design, 6);
    const lifted = layoutScaled(windows[1].design, 6, crowded);
    expect(lifted.seats.map((seat) => seat.y)).not.toEqual(plain.seats.map((seat) => seat.y));
    // The hand keeps as far from each edge as it is told to.
    const narrow = layoutScaled(windows[1].design, 4, { ...MOCKUP_CORNERS, handLeft: 300 });
    expect(narrow.hand.maxSpan).toBeLessThan(layoutScaled(windows[1].design, 4).hand.maxSpan);
    // And the side panels begin where they are told to.
    const wide = windows.find((each) => each.name === "754x247")!.design;
    expect(layoutScaled(wide, 4, { ...MOCKUP_CORNERS, sideTop: 100 }).side?.y).toBe(100);
  });

  it("keep the seats and the wood the given room from each side of the window, and have the side panels then", () => {
    for (const count of COUNTS) {
      const layout = layoutScaled({ w: 731, h: 360, top: 0, bottom: 0 }, count, MOCKUP_CORNERS, { beside: SIDE_MIN + 16 });
      for (const seat of layout.seats.slice(1)) {
        expect(seat.x, `${count}`).toBeGreaterThanOrEqual(SIDE_MIN + 16 - 1e-9);
        expect(seat.x + seat.w, `${count}`).toBeLessThanOrEqual(731 - SIDE_MIN - 16 + 1e-9);
      }
      expect(layout.table.cx - layout.table.R).toBeGreaterThanOrEqual(SIDE_MIN + 16 - 1e-9);
      expect(layout.side, `${count}`).not.toBeNull();
    }
  });
});

describe("what the page's corners hold", () => {
  it("is the menu button top left, the chip top right, the round buttons bottom left, and the trump's panel under the menu button", () => {
    const corners = cornersFor(65);
    expect(corners.topRight.w).toBe(CHIP_WIDTH + CORNER_INSET + 6);
    expect(corners.bottomLeft).toEqual({ w: CORNER_INSET + 2 * BUTTON + BUTTON_GAP + 6, h: CORNER_INSET + BUTTON + 6 });
    // Bottom right holds nothing now.
    expect(corners.bottomRight).toEqual({ w: 0, h: 0 });
    // Where there are no side panels the trump's panel stands under the menu button, as wide as its words or its card, and as
    // tall as the button and the gap under it, its word and its card.
    // The trump is in a panel: its word and its card with the panel's padding round them.
    expect(corners.topLeft).toEqual({ w: CORNER_INSET + TRUMP_WIDTH + 2 * PANEL_X + 6, h: CORNER_INSET + BUTTON + CORNER_INSET + TRUMP_LABEL + 65 + PANEL_Y + 6 });
    expect(cornersFor(140).topLeft.w).toBeCloseTo(CORNER_INSET + 140 * (500 / 726) + 2 * PANEL_X + 6, 9);
    // The hand stays clear of the round buttons, the wider of the corners at the foot; nothing is at the right.
    expect(corners.handLeft).toBeGreaterThan(corners.bottomLeft.w);
    expect(corners.handRight).toBe(16);
  });
});

// What of the table's parts overlap, or leave the window, as a list of words. The column at the left is drawn as the
// trick's details at their tallest and the trump at the lowest it can stand, which is just over the round buttons.
function crowded(layout: PageLayout, w: number, h: number, count: number): string[] {
  const found: string[] = [];
  const menu = { x: CORNER_INSET, y: CORNER_INSET, w: BUTTON, h: BUTTON };
  const side = layout.side;
  const trumpAt = (y: number): Box => ({ x: layout.column.x, y, w: layout.trump.w, h: layout.trump.h });
  const trumps: Box[] = side === null ? [trumpAt(layout.column.y)] : [trumpAt(layout.column.y + TRICK_MOST + COLUMN_GAP), trumpAt(layout.column.y + layout.column.h - layout.trump.h)];
  const panels: [string, Box][] =
    side === null
      ? []
      : [
          ["the trick's details", { x: CORNER_INSET, y: side.y, w: side.w, h: TRICK_MOST }],
          ["the scores", { x: w - CORNER_INSET - side.w, y: side.y, w: side.w, h: layout.sideRoom.right }],
        ];
  // The fan at its widest, which is a hand of eight: its span and the cards' lean.
  const fan = handSlots(layout.hand, 8);
  const reach = (layout.hand.ch / 2) * Math.sin((3.5 * layout.hand.rot * Math.PI) / 180);
  const left = Math.min(...fan.map((slot) => slot.x));
  const hand: Box = { x: left - reach, y: layout.hand.top, w: Math.max(...fan.map((slot) => slot.x + layout.hand.cw)) - left + 2 * reach, h: h - layout.hand.top };
  const controls: [string, Box][] = [
    ["the menu button", menu],
    ["the round chip", layout.chip],
    ["the round buttons", layout.buttons],
    ...trumps.map((box, at): [string, Box] => [`the trump (${at})`, box]),
  ];
  const apart = (a: string, one: Box, b: string, other: Box, least = 0) => {
    if (gap(one, other) < least - 1e-9) {
      found.push(`${a} and ${b} are ${gap(one, other).toFixed(1)} apart`);
    }
  };
  for (const [name, box] of controls) {
    if (box.x < CORNER_INSET - 1e-9 || box.x + box.w > w - CORNER_INSET + 1e-9 || box.y < CORNER_INSET - 1e-9 || box.y + box.h > h - CORNER_INSET + 1e-9) {
      found.push(`${name} leaves the window`);
    }
  }
  const foot = [controls[2], ...controls.slice(3)];
  for (const [at, seat] of layout.seats.entries()) {
    const name = at === 0 ? "your plate" : `plate ${at}`;
    // Your plate stands over the foot of the hand by design, between the corners at the foot.
    for (const [other, box] of at === 0 ? [controls[2]] : [...controls, ...panels]) {
      apart(name, seat, other, box);
    }
    if (at > 0) {
      apart(name, seat, "the hand", hand);
    }
    if (seat.x < -1e-9 || seat.x + seat.w > w + 1e-9 || seat.y < -1e-9) {
      found.push(`${name} leaves the window`);
    }
  }
  for (const [name, box] of foot) {
    apart("the hand", hand, name, box);
  }
  // The trump is under the trick's details, and the round buttons under it.
  for (const [name, box] of controls.slice(3)) {
    apart(name, box, "the round buttons", layout.buttons, 6);
    apart(name, box, "the menu button", menu, 6);
  }
  if (side !== null) {
    apart("the trick's details", panels[0][1], "the trump", trumps[0], COLUMN_GAP);
  }
  // The panels stand under the chip and the menu button, and over what is at the foot.
  for (const [name, panel] of panels) {
    for (const [other, box] of controls.slice(0, 3)) {
      apart(name, panel, other, box, 6);
    }
  }
  // The scores panel is 72 tall and 20 more for each player, with the tension line over two lines as it is in the
  // narrowest panel, which is the tallest it is; the column has room for the trick's details and the trump.
  if (side !== null && layout.sideRoom.right < 76 + 20 * count) {
    found.push(`the scores have ${layout.sideRoom.right.toFixed(0)} to stand in`);
  }
  if (side !== null && layout.column.h < TRICK_MOST + COLUMN_GAP + layout.trump.h) {
    found.push(`the column has ${layout.column.h.toFixed(0)} for the trick's details and the trump`);
  }
  // The chip is as wide as the scores where there are some, and no wider than CHIP_WIDTH where there are not.
  if (side !== null ? Math.abs(layout.chip.w - side.w) > 1e-9 || Math.abs(layout.chip.x - (w - CORNER_INSET - side.w)) > 1e-9 : layout.chip.w !== CHIP_WIDTH) {
    found.push("the chip is not as wide as the scores");
  }
  if (side === null && layout.column.w !== layout.trump.w) {
    found.push("the column is not as wide as the trump alone");
  }
  return found;
}

describe("pageLayout", () => {
  for (const each of windows) {
    for (const count of COUNTS) {
      describe(`at ${each.name} with ${count} players`, () => {
        const layout = pageLayout(each.design, count);

        it("seats the players in the desktop's directions, on one circle round the table", () => {
          const wanted = directionsFor(count);
          layout.seats.slice(1).forEach((seat, at) => {
            const angle = Math.atan2(seat.y + seat.h / 2 - layout.table.cy, seat.x + seat.w / 2 - layout.table.cx);
            expect(angle, `seat ${at + 1}`).toBeCloseTo(wanted[at], 9);
          });
          expect(layout.angles).toEqual([Math.PI / 2, ...wanted]);
        });

        it("draws the trump as tall as a card played on the felt, or, where the column has no room for more under the trick's details, as tall as it has", () => {
          const played = playedHeight(layout, count);
          expect(layout.trumpCard.h).toBeLessThanOrEqual(played + 1e-9);
          const room = layout.side === null ? Infinity : layout.column.h - TRICK_MOST - COLUMN_GAP - TRUMP_LABEL - PANEL_Y;
          expect(played - layout.trumpCard.h < 0.5 || Math.abs(layout.trumpCard.h - room) < 1e-9, `${layout.trumpCard.h} of ${played}, room ${room}`).toBe(true);
          expect(layout.trumpCard.w).toBeCloseTo((layout.trumpCard.h * 500) / 726, 9);
        });

        it("sizes the trump's panel: the trick's details' width where they show, and otherwise what its card and word need, with the panel's padding; as tall as its word, its card and the padding", () => {
          expect(layout.trump.h).toBeCloseTo(TRUMP_LABEL + layout.trumpCard.h + PANEL_Y, 9);
          expect(layout.trump.w).toBeCloseTo(layout.side === null ? Math.max(TRUMP_WIDTH, layout.trumpCard.w) + 2 * PANEL_X : layout.side.w, 9);
          expect(layout.column.w).toBeCloseTo(layout.trump.w, 9);
        });

        it("keeps every corner's controls, the seats, the hand and the side panels apart, and inside the window", () => {
          expect(crowded(layout, each.design.w, each.design.h, count)).toEqual([]);
          expect(layout.chip.h).toBe(PAGE_CHIP_HEIGHT);
        });
      });
    }
  }

  it("has nothing overlapping at any window between the floor and a tall one, for any number of players", () => {
    // A window is the design's width or its height and more of the other: from 640 by 360 wide, and from 640 by 360 tall.
    const sizes = [
      ...Array.from({ length: 40 }, (_, at) => ({ w: 640 + 20 * at, h: 360 })),
      ...Array.from({ length: 15 }, (_, at) => ({ w: 640, h: 360 + 20 * at })),
    ];
    for (const size of sizes) {
      for (const count of COUNTS) {
        const layout = pageLayout({ ...size, top: 0, bottom: 0 }, count);
        expect(crowded(layout, size.w, size.h, count), `${size.w} by ${size.h} with ${count} players`).toEqual([]);
      }
    }
  });

  it("has the side panels from SIDE_FROM wide up at the design's height, for any number of players, and never loses them as it widens", () => {
    for (const count of COUNTS) {
      expect(hasSides(SIDE_FROM, count), `${count} players`).toBe(true);
      let shown = false;
      for (let w = 640; w <= 1100; w += 2) {
        const side = hasSides(w, count);
        expect(side || !shown, `${w} with ${count} players`).toBe(true);
        shown ||= side;
      }
    }
  });

  // The windows a touch screen gets the scaled table at, in its own pixels: lying down, from the floor up to the desktop's.
  const screens: Size[] = [];
  for (let w = 390; w < DESKTOP_FROM.w; w += 30) {
    for (let h = 216; h <= w && h < DESKTOP_FROM.h; h += 24) {
      if (layoutChoiceFor({ w, h }, true).kind === "scaled") {
        screens.push({ w, h });
      }
    }
  }
  const drawn = (screen: Size, count: number): PageLayout => {
    const choice = layoutChoiceFor(screen, true);
    const scale = choice.kind === "scaled" ? choice.scale : 1;
    return pageLayout({ w: screen.w / scale, h: screen.h / scale, top: 0, bottom: 0 }, count, sideWidthOf(screen, scale));
  };

  it("never hides the side panels on a screen that grows, wider or taller, as a phone's does when its bars go", () => {
    const shown = new Map(screens.flatMap((screen) => COUNTS.map((count) => [`${screen.w} ${screen.h} ${count}`, drawn(screen, count).side !== null] as const)));
    for (const { w, h } of screens) {
      for (const count of COUNTS) {
        if (!shown.get(`${w} ${h} ${count}`)) {
          continue;
        }
        for (const [wider, taller] of [
          [w + 30, h],
          [w, h + 24],
        ]) {
          const next = shown.get(`${wider} ${taller} ${count}`);
          expect(next ?? true, `${w} by ${h} to ${wider} by ${taller} with ${count} players`).toBe(true);
        }
      }
    }
  });

  it("has nothing overlapping on any of those screens, for any number of players", () => {
    for (const screen of screens) {
      for (const count of COUNTS) {
        const layout = drawn(screen, count);
        const choice = layoutChoiceFor(screen, true);
        const scale = choice.kind === "scaled" ? choice.scale : 1;
        expect(crowded(layout, screen.w / scale, screen.h / scale, count), `${screen.w} by ${screen.h} with ${count} players`).toEqual([]);
      }
    }
  });

  it("keeps them on phones lying down, in full screen and with their bars, and drops only those it must on a phone drawn small", () => {
    // Phones from 16:9 to 20:9, in full screen and with a bar along the foot or the side.
    for (const [w, h] of [
      [832, 384],
      [790, 384],
      [784, 360],
      [800, 360],
      [915, 412],
      [892, 412],
      [851, 393],
      [780, 360],
      [740, 360],
    ]) {
      for (const count of COUNTS) {
        expect(drawn({ w, h }, count).side, `${w} by ${h} with ${count} players`).not.toBeNull();
      }
    }
    // A 16:9 phone has them with two or three players, which leave the room, and not with four, which do not.
    expect(drawn({ w: 640, h: 360 }, 3).side).not.toBeNull();
    expect(drawn({ w: 640, h: 360 }, 4).side).toBeNull();
    // Drawn small, inside a browser's bars, a phone as wide as one that has them has them too; a narrower one goes by its width.
    for (const count of COUNTS) {
      expect(drawn({ w: 754, h: 247 }, count).side, `${count} players`).not.toBeNull();
      expect(drawn({ w: 600, h: 300 }, count).side !== null, `${count} players`).toBe(hasSides(640, count));
    }
  });
});

describe("stripBeside", () => {
  const narrow = pageLayout({ w: 640, h: 360, top: 0, bottom: 0 }, 4);
  const wide = pageLayout({ w: 1099, h: 360, top: 0, bottom: 0 }, 4);
  const across = (layout: PageLayout) => ({ x: layout.bid.x, w: layout.bid.w, mid: layout.band.mid });

  it("keeps the strip to the right of the trump where the two meet, and in the middle", () => {
    // A strip as tall as the band is is over the trump, which is under the menu button.
    const area = { x: 24, w: 592, mid: narrow.column.y + 20 };
    const fit = stripBeside(narrow, area, 100);
    expect(fit.x).toBe(narrow.column.x + narrow.trump.w + 6);
    expect(fit.x + fit.w / 2).toBeCloseTo(narrow.table.cx, 9);
    expect(fit.w).toBeLessThan(area.w);
  });

  it("leaves it alone where it is below the trump, where it is already to the right of it, and where the trump is in the side panels' column", () => {
    const below = { x: 24, w: 592, mid: narrow.column.y + narrow.trump.h + 100 };
    expect(stripBeside(narrow, below, 60)).toEqual({ x: 24, w: 592 });
    expect(stripBeside(narrow, { x: 200, w: 240, mid: narrow.column.y + 20 }, 100)).toEqual({ x: 200, w: 240 });
    expect(wide.side).not.toBeNull();
    expect(stripBeside(wide, { ...across(wide), mid: wide.column.y + 20 }, 100)).toEqual({ x: wide.bid.x, w: wide.bid.w });
  });
});

describe("noteBeside", () => {
  const phone = pageLayout({ w: 1099, h: 360, top: 0, bottom: 0 }, 4);
  const strip = (layout: PageLayout, bottom: number) => ({ cx: layout.bid.x + layout.bid.w / 2, w: layout.bid.w, bottom });

  it("puts the words directly under the strip, in the middle of it and no wider", () => {
    const under = strip(phone, 138);
    const note = noteBeside(phone, under)!;
    expect(note.cx).toBe(under.cx);
    expect(note.top).toBe(138 + NOTE_GAP);
    expect(note.w).toBeLessThanOrEqual(under.w);
  });

  it("keeps between the plates that are as low as it is, with room for its words on two lines", () => {
    // A strip low enough for the plates at the sides of the table to be beside the words.
    const note = noteBeside(phone, strip(phone, 138))!;
    const lower = phone.seats.slice(1).filter((seat) => seat.y < note.top + NOTE_MOST && seat.y + seat.h > note.top);
    expect(lower.length).toBeGreaterThan(0);
    for (const seat of lower) {
      expect(seat.x + seat.w <= note.cx - note.w / 2 || seat.x >= note.cx + note.w / 2, `plate at ${seat.x}`).toBe(true);
    }
    expect(note.w).toBeGreaterThanOrEqual(NOTE_LEAST);
  });

  it("is a panel above the plates' row as wide as the strip, where nothing is as low as it", () => {
    const high = noteBeside(phone, strip(phone, 80))!;
    expect(high.w).toBe(strip(phone, 80).w);
  });

  it("is nothing where the words would reach the top of the hand, or the plates leave less than it needs", () => {
    expect(noteBeside(phone, strip(phone, phone.hand.top - NOTE_MOST))).toBeNull();
    expect(noteBeside(phone, strip(phone, phone.hand.top - NOTE_MOST - NOTE_GAP - 2))).not.toBeNull();
    const crowded = pageLayout({ w: 640, h: 360, top: 0, bottom: 0 }, 6);
    expect(noteBeside(crowded, { cx: crowded.table.cx, w: 468, bottom: 215 })).not.toBeNull();
    // Plates so close that the words have no room between them.
    const squeezed = { ...phone, seats: phone.seats.map((seat, at) => (at === 0 ? seat : { ...seat, x: phone.table.cx + (at % 2 === 0 ? 40 : -40) - seat.w / 2, y: 150 })) };
    expect(noteBeside(squeezed, strip(phone, 138))).toBeNull();
  });
});
