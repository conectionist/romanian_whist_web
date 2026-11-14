import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BOX,
  CARD_REACH,
  CHIP_WIDTH,
  FAN_TURN,
  LEAD_RADIUS,
  LOGO_RADIUS,
  LOGO_SHARE,
  NATIVE,
  PLATE_GAP,
  RIM_RADIUS,
  SEAT_CLEARANCE,
  SEAT_INSET,
  SIDE_MAX,
  SIDE_MIN,
  SIDE_RUN,
  directionsFor,
  handPlacement,
  handSlots,
  layoutScaled,
  platesClear,
  playedPlace,
  toTable,
  toWindow,
  type ScaledLayout,
} from "../../src/table/geometry/scaled";
import { DESIGN, DESKTOP_FROM } from "../../src/table/layoutChoice";
import { centre, woodRadius } from "../../src/table/space";

// What the Android mock-up's own layout functions returned, written by tools/mockup_layout.mjs.
interface Table {
  layout: ScaledLayout & { mode: string };
  played: unknown[];
  hands: Record<string, unknown[]>;
}

interface Fixture {
  mockup: { commit: string; short: string };
  constants: {
    directions: Record<string, number[]>;
    corners: Record<string, number[][]>;
    native: { plate: number[]; mine: number[] };
    design: { w: number; h: number };
    desktop: { w: number; h: number };
    seatClearance: number;
    seatInset: number;
    cardReach: number;
    logoShare: number;
    chipWidth: number;
    plateGap: number;
    fanTurn: number;
    side: { min: number; run: number; max: number };
    box: { size: number; centre: number; rim: number; logo: number; lead: number };
  };
  windows: {
    name: string;
    width: number;
    height: number;
    scale: number;
    design: { w: number; h: number; top: number; bottom: number };
    tables: Record<string, Table>;
  }[];
}

const fixture = JSON.parse(readFileSync(new URL("./fixtures/mockup-layout.json", import.meta.url), "utf8")) as Fixture;

const TOLERANCE = 1e-6;

// Every number in `got` is within TOLERANCE of the one at the same place in `want`, and nothing is
// in one and not the other. `skip` names the keys the page does not carry.
function differences(got: unknown, want: unknown, path: string, skip: readonly string[] = []): string[] {
  if (typeof want === "number") {
    return typeof got === "number" && Math.abs(got - want) <= TOLERANCE ? [] : [`${path}: ${String(got)} is not ${want}`];
  }
  if (want === null || typeof want !== "object") {
    return got === want ? [] : [`${path}: ${String(got)} is not ${String(want)}`];
  }
  if (got === null || typeof got !== "object") {
    return [`${path}: ${String(got)} is not an object`];
  }
  if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) {
      return [`${path}: the lengths differ`];
    }
    return want.flatMap((each, at) => differences(got[at], each, `${path}[${at}]`));
  }
  const keys = Object.keys(want).filter((key) => !skip.includes(key));
  const extra = Object.keys(got).filter((key) => !keys.includes(key));
  return [...extra.map((key) => `${path}.${key} is not in the mock-up's`), ...keys.flatMap((key) => differences((got as Record<string, unknown>)[key], (want as Record<string, unknown>)[key], `${path}.${key}`))];
}

describe("the fixture", () => {
  it("records the mock-up it was made from", () => {
    expect(fixture.mockup.short).toBe("a9ea8a7");
    expect(fixture.mockup.commit.startsWith(fixture.mockup.short)).toBe(true);
  });

  it("holds every window the page is tested at, with every table size", () => {
    expect(fixture.windows.map((each) => each.name)).toEqual(["640x360", "915x412", "829x690", "829x690-with-bars", "960x600", "800x360", "780x360", "832x384", "754x247"]);
    for (const each of fixture.windows) {
      expect(Object.keys(each.tables)).toEqual(["2", "3", "4", "5", "6"]);
    }
  });

  it("draws the owner's phone inside a browser's bars at 0.686, in a design window 1099 wide", () => {
    const phone = fixture.windows.find((each) => each.name === "754x247");
    expect(phone?.scale).toBeCloseTo(0.686, 3);
    expect(phone?.design.w).toBeCloseTo(1098.95, 2);
    expect(phone?.design.h).toBe(360);
  });
});

describe("the constants", () => {
  it("are the mock-up's", () => {
    const c = fixture.constants;
    expect([DESIGN.w, DESIGN.h]).toEqual([c.design.w, c.design.h]);
    expect([DESKTOP_FROM.w, DESKTOP_FROM.h]).toEqual([c.desktop.w, c.desktop.h]);
    expect([NATIVE.plate.w, NATIVE.plate.h]).toEqual(c.native.plate);
    expect([NATIVE.mine.w, NATIVE.mine.h]).toEqual(c.native.mine);
    expect(SEAT_CLEARANCE).toBe(c.seatClearance);
    expect(SEAT_INSET).toBe(c.seatInset);
    expect(CARD_REACH).toBe(c.cardReach);
    expect(LOGO_SHARE).toBe(c.logoShare);
    expect(CHIP_WIDTH).toBe(c.chipWidth);
    expect(PLATE_GAP).toBe(c.plateGap);
    expect(FAN_TURN).toBe(c.fanTurn);
    expect([SIDE_MIN, SIDE_RUN, SIDE_MAX]).toEqual([c.side.min, c.side.run, c.side.max]);
    expect([BOX, BOX / 2, RIM_RADIUS, LOGO_RADIUS, LEAD_RADIUS]).toEqual([c.box.size, c.box.centre, c.box.rim, c.box.logo, c.box.lead]);
    expect(BOX).toBe(2 * woodRadius);
  });

  it("seat each player in the desktop's direction, which is the mock-up's", () => {
    for (const [count, wanted] of Object.entries(fixture.constants.directions)) {
      const got = directionsFor(Number(count));
      expect(got).toHaveLength(Number(count) - 1);
      wanted.forEach((angle, at) => expect(got[at]).toBeCloseTo(angle, 12));
    }
  });

  it("take each direction from the corner the desktop puts that panel at", () => {
    for (const [count, corners] of Object.entries(fixture.constants.corners)) {
      corners.forEach(([x, y], at) => {
        const angle = Math.atan2(y + 118 / 2 - centre.y, x + 140 - centre.x);
        expect(directionsFor(Number(count))[at]).toBeCloseTo(angle, 12);
      });
    }
  });
});

describe("layoutScaled", () => {
  for (const window of fixture.windows) {
    for (const [count, table] of Object.entries(window.tables)) {
      it(`gives the mock-up's numbers at ${window.name} with ${count} players`, () => {
        const got = layoutScaled(window.design, Number(count));
        expect(differences(got, table.layout, "layout", ["mode"])).toEqual([]);
      });
    }
  }

  it("places every player where the mock-up does, in the mock-up's order", () => {
    // Yours first, then clockwise.
    const table = fixture.windows[1].tables["4"].layout;
    expect(table.seats.map((seat) => seat.kind)).toEqual(["mine", "plate", "plate", "plate"]);
    expect(table.seats[0].w).toBe(184);
    expect(table.seats[1].w).toBeLessThanOrEqual(128);
  });
});

describe("playedPlace", () => {
  for (const window of fixture.windows) {
    for (const [count, table] of Object.entries(window.tables)) {
      it(`lays the played cards as the mock-up does at ${window.name} with ${count} players`, () => {
        const layout = layoutScaled(window.design, Number(count));
        const got = layout.angles.map((angle) => playedPlace(Number(count), angle, layout));
        expect(differences(got, table.played, "played")).toEqual([]);
      });
    }
  }
});

describe("handSlots", () => {
  for (const window of fixture.windows) {
    for (const [count, table] of Object.entries(window.tables)) {
      it(`fans a hand as the mock-up does at ${window.name} with ${count} players`, () => {
        const layout = layoutScaled(window.design, Number(count));
        const got = Object.fromEntries(Object.keys(table.hands).map((size) => [size, handSlots(layout.hand, Number(size))]));
        expect(differences(got, table.hands, "hands")).toEqual([]);
      });
    }
  }

  it("puts a card's centre where its top-left corner, turned about the hinge, takes it", () => {
    const layout = layoutScaled(fixture.windows[1].design, 4);
    const fan = layout.hand;
    for (const count of [1, 5, 8]) {
      const slots = handSlots(fan, count);
      slots.forEach((slot, at) => {
        const place = handPlacement(fan, count, at);
        // The card's centre before the turn is half a card below its top-left, and the hinge is 1.3
        // heights down, so the centre is 0.8 heights above the hinge once it has turned.
        const hinge = { x: slot.x + fan.cw / 2, y: slot.y + 1.3 * fan.ch };
        const turn = (slot.rot * Math.PI) / 180;
        expect(place.x).toBeCloseTo(hinge.x + 0.8 * fan.ch * Math.sin(turn), 9);
        expect(place.y).toBeCloseTo(hinge.y - 0.8 * fan.ch * Math.cos(turn), 9);
        expect(place.rotation).toBe(slot.rot);
      });
    }
  });
});

describe("platesClear", () => {
  it("holds for what layoutScaled gives, at every window and size", () => {
    for (const window of fixture.windows) {
      for (const count of [2, 3, 4, 5, 6]) {
        const layout = layoutScaled(window.design, count);
        const plates = layout.seats.slice(1);
        expect(platesClear(plates, plates[0].w, plates[0].h), `${window.name} ${count}`).toBe(true);
      }
    }
  });

  it("fails for plates that touch or overlap, and passes at the gap", () => {
    expect(platesClear([{ x: 0, y: 0 }, { x: 100, y: 0 }], 128, 54)).toBe(false);
    expect(platesClear([{ x: 0, y: 0 }, { x: 128 + PLATE_GAP - 1, y: 0 }], 128, 54)).toBe(false);
    expect(platesClear([{ x: 0, y: 0 }, { x: 128 + PLATE_GAP, y: 0 }], 128, 54)).toBe(true);
    expect(platesClear([{ x: 0, y: 0 }, { x: 10, y: 54 + PLATE_GAP }], 128, 54)).toBe(true);
  });
});

describe("the table's units", () => {
  it("map to the window's and back", () => {
    const layout = layoutScaled(fixture.windows[1].design, 5);
    const back = toTable(layout, toWindow(layout, { x: 900, y: 300 }));
    expect(back.x).toBeCloseTo(900, 9);
    expect(back.y).toBeCloseTo(300, 9);
    // The table's centre is the circle's.
    const middle = toWindow(layout, centre);
    expect(middle.x).toBeCloseTo(layout.table.cx, 9);
    expect(middle.y).toBeCloseTo(layout.table.cy, 9);
  });
});
