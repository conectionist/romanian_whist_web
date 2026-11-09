import { describe, expect, it } from "vitest";
import { cardPlacementOf, leadMarkPlacementOf, leadSeat } from "../../src/table/geometry/trick";
import { frameRotation } from "../../src/table/geometry/rack";
import { place } from "../../src/table/geometry/seats";
import { centre } from "../../src/table/space";

describe("the trick round the logo", () => {
  it("puts your card straight below the logo, unturned", () => {
    const placed = cardPlacementOf(4, 0, 0);
    expect(placed?.x).toBe(768);
    expect(placed?.y).toBeCloseTo(722.1, 9);
    expect(placed?.rotation).toBe(0);
  });

  it("puts everyone else's on their rack's angle, turned as their rack is", () => {
    for (const seatCount of [3, 4, 5, 6]) {
      for (let seat = 1; seat < seatCount; seat++) {
        const placed = cardPlacementOf(seatCount, 0, seat);
        const seatPlace = place(seatCount, 0, seat);
        expect(placed?.rotation).toBe(frameRotation(seatPlace?.angle as number));
        const radius = 107.5 + (seatCount <= 4 ? 205.2 : 181.2) / 2;
        expect(Math.hypot((placed?.x ?? 0) - centre.x, (placed?.y ?? 0) - centre.y)).toBeCloseTo(radius, 9);
      }
    }
  });

  it("puts a watcher's seat 0 where the human would be", () => {
    expect(cardPlacementOf(4, -1, 0)).toEqual(cardPlacementOf(4, 0, 0));
  });

  it("has no place for a seat that is not at the table", () => {
    expect(cardPlacementOf(4, 0, 4)).toBeNull();
    expect(leadMarkPlacementOf(4, 0, 4)).toBeNull();
  });

  it("puts your lead mark half way between your card's bottom edge and your hand's top", () => {
    const placed = leadMarkPlacementOf(4, 0, 0);
    expect(placed?.x).toBe(768);
    expect(placed?.y).toBeCloseTo(837.35, 9);
  });

  it("puts the others' lead marks on the gold line", () => {
    const placed = leadMarkPlacementOf(4, 0, 2);
    expect(Math.hypot((placed?.x ?? 0) - centre.x, (placed?.y ?? 0) - centre.y)).toBeCloseTo(416, 9);
  });

  describe("leadSeat", () => {
    it("shows no mark outside the play phase", () => {
      expect(leadSeat("betting", 4, [], 1)).toBeNull();
      expect(leadSeat("roundScored", 4, [{ seat: 2 }], 1)).toBeNull();
      expect(leadSeat("gameOver", 4, [], 1)).toBeNull();
    });

    it("shows none with no seats", () => {
      expect(leadSeat("playing", 0, [], 0)).toBeNull();
    });

    it("is the first card's seat, even once the trick is won and the leader has moved on", () => {
      expect(leadSeat("playing", 4, [{ seat: 3 }, { seat: 0 }, { seat: 1 }, { seat: 2 }], 2)).toBe(3);
    });

    it("is the seat that leads next while nothing is down", () => {
      expect(leadSeat("playing", 4, [], 2)).toBe(2);
      expect(leadSeat("playing", 4, [], null)).toBeNull();
    });
  });
});
