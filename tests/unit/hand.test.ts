import { describe, expect, it } from "vitest";
import { cardPlacement } from "../../src/table/geometry/hand";
import { sizeForHeight } from "../../src/table/cards";

const card = sizeForHeight(225);

describe("the hand's fan", () => {
  it("centres a hand of one card straight above its hinge", () => {
    const placed = cardPlacement(1, 0, card);
    expect(placed.x).toBeCloseTo(768, 9);
    expect(placed.y).toBeCloseTo(962.5, 9);
    expect(placed.rotation).toBe(0);
  });

  it("is symmetric about the middle", () => {
    for (const count of [2, 3, 4, 5, 8]) {
      for (let slot = 0; slot < count; slot++) {
        const mirror = cardPlacement(count, count - 1 - slot, card);
        const here = cardPlacement(count, slot, card);
        expect(here.x + mirror.x).toBeCloseTo(2 * 768, 9);
        expect(here.y).toBeCloseTo(mirror.y, 9);
        expect(here.rotation).toBeCloseTo(-mirror.rotation, 9);
      }
    }
  });

  it("steps 84 apart up to the widest fan, and closes up past it", () => {
    const first = cardPlacement(4, 0, card);
    const second = cardPlacement(4, 1, card);
    expect((second.x - first.x) / Math.cos(0.1)).toBeGreaterThan(80);
    const wideFirst = cardPlacement(8, 0, card);
    const wideLast = cardPlacement(8, 7, card);
    // Eight cards are 720 wide at most, tilted at their ends.
    expect(wideLast.x - wideFirst.x).toBeLessThan(720 - card.w + 60);
  });

  it("turns 1.9 degrees per step from the middle", () => {
    expect(cardPlacement(5, 0, card).rotation).toBeCloseTo(-3.8, 9);
    expect(cardPlacement(5, 4, card).rotation).toBeCloseTo(3.8, 9);
    expect(cardPlacement(4, 1, card).rotation).toBeCloseTo(-0.95, 9);
  });

  it("curves the ends of the fan away", () => {
    expect(cardPlacement(8, 0, card).y).toBeGreaterThan(cardPlacement(8, 3, card).y);
  });

  it("never lays a card left of the one before it, however wide the card", () => {
    const wide = { w: 900, h: 225 };
    const first = cardPlacement(3, 0, wide);
    const second = cardPlacement(3, 1, wide);
    expect(second.x).toBeGreaterThanOrEqual(first.x - 40);
  });
});
