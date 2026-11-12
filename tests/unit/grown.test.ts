import { describe, expect, it } from "vitest";
import { fanBounds, scaledAbout } from "../../src/table/geometry/hand";
import { grownPlaces, overlaps, rackFootprint, rectShape, type Room } from "../../src/table/geometry/grown";
import { places } from "../../src/table/geometry/seats";
import { sizeForHeight } from "../../src/table/cards";
import { centre, feltRadius, handCardHeight, panelSize, type Rect } from "../../src/table/space";

// An 844 by 390 window's room, as the view finds it with six players: the corner panels, the bid strip
// and the hand's fan, in table units.
const PHONE: Room = {
  view: { x: -929, y: -174, w: 3395, h: 1364 },
  keep: [
    { x: -913, y: -158, w: 590, h: 390 },
    { x: 1922, y: -158, w: 527, h: 1170 },
    { x: -913, y: 1020, w: 767, h: 260 },
  ],
  covered: [
    { x: -125, y: 348, w: 1787, h: 447 },
    { x: 127, y: 739, w: 1282, h: 415 },
  ],
  gap: 16,
};

const ROOMY: Room = { view: { x: -2000, y: -1000, w: 5600, h: 3400 }, keep: [], covered: [], gap: 16 };

function standsApart(a: Rect, b: Rect): boolean {
  return a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
}

// Everything a layout promises, for the seats other than yours.
function expectClear(seatCount: number, grown: ReturnType<typeof grownPlaces>, room: Room): void {
  const others = grown.places.flatMap((place) => (place === null || place.human ? [] : [place]));
  const mine = grown.places.find((place) => place?.human === true) ?? null;
  for (const place of others) {
    expect(place.panel.w).toBeCloseTo(panelSize.w * grown.grow, 6);
    expect(place.panel.x).toBeGreaterThanOrEqual(room.view.x);
    expect(place.panel.y).toBeGreaterThanOrEqual(room.view.y);
    expect(place.panel.x + place.panel.w).toBeLessThanOrEqual(room.view.x + room.view.w);
    expect(place.panel.y + place.panel.h).toBeLessThanOrEqual(room.view.y + room.view.h);
    for (const stand of [...room.keep, ...room.covered, ...(mine === null ? [] : [mine.panel])]) {
      expect(standsApart(place.panel, stand), `${JSON.stringify(place.panel)} on ${JSON.stringify(stand)}`).toBe(true);
    }
    const nearX = Math.max(place.panel.x - centre.x, 0, centre.x - place.panel.x - place.panel.w);
    const nearY = Math.max(place.panel.y - centre.y, 0, centre.y - place.panel.y - place.panel.h);
    expect(Math.hypot(nearX, nearY)).toBeGreaterThanOrEqual(feltRadius);
    expect(overlaps(rackFootprint(place.angle as number), rectShape(place.panel)), "its rack on its panel").toBe(false);
  }
  others.forEach((place, at) => {
    others.slice(at + 1).forEach((other) => {
      expect(standsApart(place.panel, other.panel), "two panels").toBe(true);
      expect(overlaps(rackFootprint(place.angle as number), rackFootprint(other.angle as number)), "two racks").toBe(false);
      expect(overlaps(rackFootprint(place.angle as number), rectShape(other.panel)), "a rack on another's panel").toBe(false);
    });
  });
  expect(others).toHaveLength(seatCount - (mine === null ? 0 : 1));
}

describe("the other players' panels drawn larger", () => {
  it("are the table's own when no growth is asked for, or the table has no room to give", () => {
    for (const seatCount of [2, 3, 4, 5, 6]) {
      expect(grownPlaces(seatCount, 0, 1, PHONE)).toEqual({ grow: 1, places: places(seatCount, 0) });
    }
    const crammed: Room = { ...PHONE, view: { x: -100, y: -100, w: 300, h: 300 } };
    expect(grownPlaces(4, 0, 2, crammed)).toEqual({ grow: 1, places: places(4, 0) });
  });

  it("grow as far as asked in a room with space, and keep clear of each other and of the rim's felt", () => {
    for (const seatCount of [2, 3, 4, 5, 6]) {
      const grown = grownPlaces(seatCount, 0, 2.2, ROOMY);
      expect(grown.grow, `${seatCount} seats`).toBe(2.2);
      expectClear(seatCount, grown, ROOMY);
    }
  });

  it("grow as far as the room allows, keeping clear of the corner panels, the strip and the fan", () => {
    for (const seatCount of [3, 4, 5, 6]) {
      const grown = grownPlaces(seatCount, 0, 2.2, PHONE);
      expect(grown.grow, `${seatCount} seats`).toBeGreaterThan(1.7);
      expect(grown.grow).toBeLessThanOrEqual(2.2);
      expectClear(seatCount, grown, PHONE);
    }
  });

  it("leave your own panel where the table puts it, at its own size", () => {
    const grown = grownPlaces(5, 0, 2, PHONE);
    expect(grown.places[0]).toEqual(places(5, 0)[0]);
  });

  it("stand round the table in the order of the seats, clockwise from the bottom", () => {
    for (const seatCount of [3, 4, 5, 6]) {
      const grown = grownPlaces(seatCount, 0, 2.2, PHONE);
      const turns = grown.places.slice(1).map((place) => (((place?.angle as number) - Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));
      expect([...turns].sort((a, b) => a - b)).toEqual(turns);
    }
  });

  it("include a watcher's seat at the bottom, which has no hand to keep clear of", () => {
    const room: Room = { ...PHONE, covered: PHONE.covered.slice(0, 1) };
    const grown = grownPlaces(6, -1, 2.2, room);
    expect(grown.grow).toBeGreaterThan(1.2);
    expectClear(6, grown, room);
    expect(grown.places.every((place) => place !== null && !place.human)).toBe(true);
  });

  it("are the same each time they are asked for", () => {
    expect(grownPlaces(6, 0, 2.2, PHONE)).toEqual(grownPlaces(6, 0, 2.2, PHONE));
  });
});

describe("the room a hand's fan takes", () => {
  const card = sizeForHeight(handCardHeight);
  const origin = { x: 768, y: 1024 };

  it("is the box round all eight cards at the table's own scale", () => {
    const fan = fanBounds(card, 1, origin);
    expect(fan.x).toBeGreaterThan(300);
    expect(fan.x + fan.w).toBeLessThan(1240);
    expect(fan.y).toBeGreaterThan(800);
  });

  it("grows about the point it is scaled about", () => {
    const fan = fanBounds(card, 1.6, origin);
    const plain = fanBounds(card, 1, origin);
    expect(fan.w).toBeCloseTo(plain.w * 1.6, 3);
    expect(fan.y + fan.h).toBeCloseTo(origin.y + (plain.y + plain.h - origin.y) * 1.6, 3);
    expect(scaledAbout({ x: origin.x, y: origin.y, rotation: 0 }, 1.6, origin).y).toBe(origin.y);
  });
});
