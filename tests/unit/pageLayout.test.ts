import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUTTON,
  BUTTON_GAP,
  PAGE_CHIP_HEIGHT,
  TRUMP_LABEL,
  TRUMP_WIDTH,
  cornersFor,
  pageLayout,
  playedHeight,
} from "../../src/table/geometry/page";
import { CHIP_WIDTH, CORNER_INSET, MOCKUP_CORNERS, directionsFor, handSlots, layoutScaled, type Box, type ScaledWindow } from "../../src/table/geometry/scaled";

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
});

describe("what the page's corners hold", () => {
  it("is the mock-up's top corners, the round buttons bottom left and the trump bottom right", () => {
    const corners = cornersFor(65);
    expect(corners.topLeft).toEqual(MOCKUP_CORNERS.topLeft);
    expect(corners.topRight.w).toBe(CHIP_WIDTH + CORNER_INSET + 6);
    expect(corners.bottomLeft).toEqual({ w: CORNER_INSET + 2 * BUTTON + BUTTON_GAP + 6, h: CORNER_INSET + BUTTON + 6 });
    // The trump is as wide as its words or its card, and as tall as its word and its card.
    expect(corners.bottomRight).toEqual({ w: CORNER_INSET + TRUMP_WIDTH + 6, h: CORNER_INSET + TRUMP_LABEL + 65 + 6 });
    expect(cornersFor(140).bottomRight.w).toBeCloseTo(CORNER_INSET + 140 * (500 / 726) + 6, 9);
    // The hand stays clear of whichever of the two is wider.
    expect(corners.handLeft).toBeGreaterThan(corners.bottomLeft.w);
    expect(corners.handRight).toBeGreaterThan(corners.bottomRight.w);
  });
});

describe("pageLayout", () => {
  for (const each of windows) {
    for (const count of COUNTS) {
      describe(`at ${each.name} with ${count} players`, () => {
        const layout = pageLayout(each.design, count);
        const { w, h } = each.design;

        it("seats the players in the desktop's directions, on one circle round the table", () => {
          const wanted = directionsFor(count);
          layout.seats.slice(1).forEach((seat, at) => {
            const angle = Math.atan2(seat.y + seat.h / 2 - layout.table.cy, seat.x + seat.w / 2 - layout.table.cx);
            expect(angle, `seat ${at + 1}`).toBeCloseTo(wanted[at], 9);
          });
          expect(layout.angles).toEqual([Math.PI / 2, ...wanted]);
        });

        it("draws the trump as tall as a card played on the felt, and no taller", () => {
          const played = playedHeight(layout, count);
          expect(layout.trumpCard.h).toBeLessThanOrEqual(played + 1e-9);
          expect(played - layout.trumpCard.h).toBeLessThan(0.5);
          expect(layout.trumpCard.w).toBeCloseTo((layout.trumpCard.h * 500) / 726, 9);
        });

        it("keeps every corner's controls, the seats, the hand and the side panels apart, and inside the window", () => {
          const menu = { x: CORNER_INSET, y: CORNER_INSET, w: BUTTON, h: BUTTON };
          const side = layout.side;
          const panels: Box[] =
            side === null
              ? []
              : [
                  { x: CORNER_INSET, y: side.y, w: side.w, h: layout.sideRoom.left },
                  { x: w - CORNER_INSET - side.w, y: side.y, w: side.w, h: layout.sideRoom.right },
                ];
          // The fan at its widest, which is a hand of eight: its span, the cards' lean and the plate over its foot.
          const fan = handSlots(layout.hand, 8);
          const reach = (layout.hand.ch / 2) * Math.sin((3.5 * layout.hand.rot * Math.PI) / 180);
          const hand: Box = {
            x: Math.min(...fan.map((slot) => slot.x)) - reach,
            y: layout.hand.top,
            w: Math.max(...fan.map((slot) => slot.x + layout.hand.cw)) - Math.min(...fan.map((slot) => slot.x)) + 2 * reach,
            h: h - layout.hand.top,
          };
          const controls: [string, Box][] = [
            ["the menu button", menu],
            ["the round chip", layout.chip],
            ["the round buttons", layout.buttons],
            ["the trump", layout.trump],
          ];
          for (const [name, box] of controls) {
            expect(box.x, `${name} left`).toBeGreaterThanOrEqual(CORNER_INSET - 1e-9);
            expect(box.x + box.w, `${name} right`).toBeLessThanOrEqual(w - CORNER_INSET + 1e-9);
            expect(box.y, `${name} top`).toBeGreaterThanOrEqual(CORNER_INSET - 1e-9);
            expect(box.y + box.h, `${name} bottom`).toBeLessThanOrEqual(h - CORNER_INSET + 1e-9);
          }
          const seats = layout.seats.map((seat, at) => [at === 0 ? "your plate" : `plate ${at}`, seat] as [string, Box]);
          const others: [string, Box][] = [...controls, ...panels.map((box, at): [string, Box] => [at === 0 ? "the left panel" : "the right panel", box])];
          for (const [seatName, seat] of seats.slice(1)) {
            for (const [name, box] of others) {
              expect(gap(seat, box), `${seatName} and ${name}`).toBeGreaterThanOrEqual(-1e-9);
            }
            expect(gap(seat, hand), `${seatName} and the hand`).toBeGreaterThanOrEqual(-1e-9);
          }
          // Your plate stands over the foot of the hand by design, and between the two corners at the foot.
          for (const [name, box] of [controls[2], controls[3]]) {
            expect(gap(seats[0][1], box), `your plate and ${name}`).toBeGreaterThanOrEqual(-1e-9);
          }
          for (const [name, box] of [controls[2], controls[3]]) {
            expect(gap(hand, box), `the hand and ${name}`).toBeGreaterThanOrEqual(-1e-9);
          }
          // The panels stand over the corners at the foot, the chip and the menu over the panels.
          for (const panel of panels) {
            for (const [name, box] of controls) {
              expect(gap(panel, box), `a side panel and ${name}`).toBeGreaterThanOrEqual(6 - 1e-9);
            }
          }
          expect(layout.chip.h).toBe(PAGE_CHIP_HEIGHT);
        });

        it("leaves room under the side panels for what a full panel holds", () => {
          if (layout.side === null) {
            expect(layout.sideRoom).toEqual({ left: 0, right: 0 });
            return;
          }
          // The scores panel is 72 tall and 20 more for each player, with the tension line over two lines as it is in the
          // narrowest panel, which is the tallest a panel is.
          const most = 76 + 20 * count;
          expect(layout.sideRoom.right).toBeGreaterThanOrEqual(most);
          expect(layout.sideRoom.left).toBeGreaterThanOrEqual(most);
        });
      });
    }
  }
});
