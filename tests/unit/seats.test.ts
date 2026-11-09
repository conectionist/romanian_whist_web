import { describe, expect, it } from "vitest";
import {
  humanSeated,
  onCircle,
  panelRect,
  place,
  places,
  rackAngle,
  rackOrigin,
  stepsFromBottom,
} from "../../src/table/geometry/seats";
import { bottomPanel, centre, fitBox, panelSize, woodRadius, type Rect } from "../../src/table/space";

function centreOf(rect: Rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function panelsFor(seatCount: number, humanSeat: number): Rect[] {
  return Array.from({ length: seatCount }, (_, seat) => panelRect(seatCount, humanSeat, seat) as Rect);
}

describe("the seat layout", () => {
  it("puts the panels where the mock-up tuned them", () => {
    expect(panelRect(4, 0, 2)).toEqual({ x: 638.5, y: -140, w: 259, h: 118 });
    expect(panelRect(3, 0, 1)).toEqual({ x: 106.5, y: 49, w: 259, h: 118 });
    expect(panelRect(6, 0, 5)).toEqual({ x: 1265.5, y: 700, w: 259, h: 118 });
  });

  it("puts the human at the bottom whichever seat it is", () => {
    for (let seatCount = 2; seatCount <= 6; seatCount++) {
      for (let human = 0; human < seatCount; human++) {
        expect(panelRect(seatCount, human, human)).toEqual(bottomPanel);
      }
    }
  });

  it("runs the seats clockwise from the human", () => {
    for (let seatCount = 3; seatCount <= 6; seatCount++) {
      const panels = panelsFor(seatCount, 0);
      expect(centreOf(panels[1]).x).toBeLessThan(centre.x);
      expect(centreOf(panels[seatCount - 1]).x).toBeGreaterThan(centre.x);
    }
    expect(stepsFromBottom(4, 2, 2)).toBe(0);
    expect(stepsFromBottom(4, 2, 3)).toBe(1);
    expect(stepsFromBottom(4, 2, 0)).toBe(2);
    expect(stepsFromBottom(4, 2, 1)).toBe(3);
  });

  it("keeps each step's panel whoever is at the bottom", () => {
    for (let seatCount = 2; seatCount <= 6; seatCount++) {
      const reference = panelsFor(seatCount, 0);
      for (let bottom = 0; bottom < seatCount; bottom++) {
        const turned = panelsFor(seatCount, bottom);
        for (let step = 0; step < seatCount; step++) {
          expect(turned[(bottom + step) % seatCount]).toEqual(reference[step]);
        }
      }
    }
  });

  it("lays a watcher's table out as though seat 0 were the human, with no hand", () => {
    for (let seatCount = 2; seatCount <= 6; seatCount++) {
      expect(panelsFor(seatCount, -1)).toEqual(panelsFor(seatCount, 0));
    }
    expect(panelsFor(4, 9)).toEqual(panelsFor(4, -1));
    expect(panelRect(4, -1, 0)).toEqual(bottomPanel);
    expect(place(4, -1, 0)?.human).toBe(false);
    expect(place(4, -1, 0)?.angle).toBeCloseTo(Math.PI / 2, 9);
  });

  it("is every panel's size, and sits outside the wooden rim, inside the fit box, overlapping none", () => {
    for (let seatCount = 2; seatCount <= 6; seatCount++) {
      const panels = panelsFor(seatCount, 0);
      for (const panel of panels) {
        expect(panel.w).toBe(panelSize.w);
        expect(panel.h).toBe(panelSize.h);
        expect(panel.x).toBeGreaterThanOrEqual(fitBox.x);
        expect(panel.y).toBeGreaterThanOrEqual(fitBox.y);
        expect(panel.x + panel.w).toBeLessThanOrEqual(fitBox.x + fitBox.w);
        expect(panel.y + panel.h).toBeLessThanOrEqual(fitBox.y + fitBox.h);

        const nearestX = Math.max(panel.x, Math.min(centre.x, panel.x + panel.w));
        const nearestY = Math.max(panel.y, Math.min(centre.y, panel.y + panel.h));
        expect(Math.hypot(nearestX - centre.x, nearestY - centre.y)).toBeGreaterThanOrEqual(woodRadius + 10);
      }
      for (let left = 0; left < panels.length; left++) {
        for (let right = left + 1; right < panels.length; right++) {
          const a = panels[left];
          const b = panels[right];
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart, `${seatCount} seats: ${left} and ${right}`).toBe(true);
        }
      }
    }
  });

  it("has no panels for a table the layout has no row for", () => {
    expect(panelRect(0, 0, 0)).toBeNull();
    expect(panelRect(1, 0, 0)).toBeNull();
    expect(panelRect(7, 0, 0)).toBeNull();
    expect(panelRect(4, 0, 4)).toBeNull();
    expect(place(4, 0, 4)).toBeNull();
  });

  it("seats somebody only at a seat that is at the table", () => {
    expect(humanSeated(4, 0)).toBe(true);
    expect(humanSeated(4, 3)).toBe(true);
    expect(humanSeated(4, -1)).toBe(false);
    expect(humanSeated(4, 4)).toBe(false);
  });

  it("gives a seat its panel, and its rack's angle unless it is yours", () => {
    for (let seatCount = 2; seatCount <= 6; seatCount++) {
      for (const humanSeat of [-1, 0, seatCount - 1]) {
        const all = places(seatCount, humanSeat);
        expect(all).toHaveLength(seatCount);
        all.forEach((entry, seat) => {
          expect(entry).not.toBeNull();
          const yours = humanSeat === seat;
          expect(entry?.human).toBe(yours);
          expect(entry?.panel).toEqual(panelRect(seatCount, humanSeat, seat));
          if (yours) {
            expect(entry?.angle).toBeNull();
          } else {
            expect(entry?.angle).toBe(rackAngle(entry?.panel as Rect));
          }
        });
      }
    }
  });

  it("never slides a rack along the rim, for the panels the table has", () => {
    for (let seatCount = 2; seatCount <= 6; seatCount++) {
      for (const panel of panelsFor(seatCount, 0)) {
        const straight = Math.atan2(centreOf(panel).y - centre.y, centreOf(panel).x - centre.x);
        expect(rackAngle(panel)).toBe(straight);
      }
    }
  });

  it("slides a rack clockwise past a panel that covers the rim, and a further 9 degrees", () => {
    // A panel moved onto the rim's right-hand point.
    const covering: Rect = { x: centre.x + 452 - 129.5, y: centre.y - 59, w: 259, h: 118 };
    const slid = rackAngle(covering);
    expect(slid).toBeGreaterThan(0);
    const at = rackOrigin(slid - (9 * Math.PI) / 180 - 1e-9);
    const clear = at.y >= covering.y + covering.h + 10 || at.y <= covering.y - 10 || at.x <= covering.x - 10 || at.x >= covering.x + covering.w + 10;
    expect(clear).toBe(true);
  });

  it("finds the point on a circle, y down", () => {
    expect(onCircle(0, 100)).toEqual({ x: 868, y: 512 });
    const down = onCircle(Math.PI / 2, 100);
    expect(down.x).toBeCloseTo(768, 9);
    expect(down.y).toBeCloseTo(612, 9);
    expect(rackOrigin(Math.PI / 2).y).toBeCloseTo(964, 9);
  });
});
