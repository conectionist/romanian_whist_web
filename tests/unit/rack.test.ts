import { describe, expect, it } from "vitest";
import {
  artTransform,
  cardQuad,
  cardSize,
  cardTransform,
  cssMatrix3d,
  extent,
  farMagnification,
  frameRotation,
  mapPoint,
  railRect,
  scaledSource,
} from "../../src/table/geometry/rack";
import { sizeForHeight } from "../../src/table/cards";
import { places } from "../../src/table/geometry/seats";

describe("the rack's geometry", () => {
  it("makes a card as wide as the art makes a card 90 tall", () => {
    expect(cardSize()).toEqual({ w: 62, h: 90 });
    expect(sizeForHeight(90).w).toBe(62);
  });

  it("projects each flat corner to its quad corner, for every card of every rack", () => {
    const size = cardSize();
    const corners = [
      { x: 0, y: 0 },
      { x: size.w, y: 0 },
      { x: size.w, y: size.h },
      { x: 0, y: size.h },
    ];
    for (let count = 1; count <= 8; count++) {
      for (let index = 0; index < count; index++) {
        const quad = cardQuad(count, index);
        const matrix = cardTransform(count, index);
        corners.forEach((corner, at) => {
          const mapped = mapPoint(matrix, corner);
          expect(mapped.x).toBeCloseTo(quad[at].x, 9);
          expect(mapped.y).toBeCloseTo(quad[at].y, 9);
        });
      }
    }
  });

  it("projects the same corners when the picture is made larger", () => {
    const size = cardSize();
    const quad = cardQuad(5, 1);
    const matrix = scaledSource(cardTransform(5, 1), 2);
    const mapped = mapPoint(matrix, { x: size.w * 2, y: size.h * 2 });
    expect(mapped.x).toBeCloseTo(quad[2].x, 9);
    expect(mapped.y).toBeCloseTo(quad[2].y, 9);
  });

  it("has no quad for a card the rack does not hold", () => {
    expect(cardQuad(3, 3)).toEqual([]);
    expect(cardQuad(3, -1)).toEqual([]);
  });

  it("widens a card toward its far end, which has risen toward the viewer", () => {
    const quad = cardQuad(1, 0);
    const top = quad[1].x - quad[0].x;
    const bottom = quad[2].x - quad[3].x;
    expect(top).toBeCloseTo(62, 9);
    expect(bottom).toBeCloseTo(62 * farMagnification(), 9);
    expect(farMagnification()).toBeCloseTo(300 / (300 - 90 * Math.sin((50 * Math.PI) / 180)), 12);
  });

  it("fans a row open toward its owner, the middle card of an odd row unturned", () => {
    const middle = cardQuad(3, 1);
    expect(middle[0].x).toBeCloseTo(-31, 9);
    expect(middle[1].x).toBeCloseTo(31, 9);
    const left = cardQuad(3, 0);
    const right = cardQuad(3, 2);
    expect(left[2].x).toBeLessThan(left[3].x + 62 * farMagnification());
    expect(right[0].x).toBeGreaterThan(left[0].x);
  });

  it("lays art to fill the flat card, and turns a face half round", () => {
    expect(artTransform({ w: 310, h: 450 }, false)).toEqual([62 / 310, 0, 0, 90 / 450, 0, 0]);
    expect(artTransform({ w: 310, h: 450 }, true)).toEqual([-62 / 310, 0, 0, -90 / 450, 62, 90]);
  });

  it("has no rail without cards, and a rail 16 wider than the row", () => {
    expect(railRect(0)).toBeNull();
    expect(extent(0)).toBeNull();
    const rail = railRect(1);
    expect(rail).not.toBeNull();
    // The row's width plus 16, magnified a little by the rail's raise.
    expect(rail?.w).toBeCloseTo((62 + 16) * (300 / 292), 9);
    expect(rail?.y).toBeLessThan(0);
  });

  it("covers the rail and every card in a rack's extent", () => {
    const all = extent(8);
    const rail = railRect(8);
    expect(all?.x).toBeLessThanOrEqual(rail?.x ?? 0);
    expect((all?.x ?? 0) + (all?.w ?? 0)).toBeGreaterThanOrEqual((rail?.x ?? 0) + (rail?.w ?? 0));
    for (let index = 0; index < 8; index++) {
      for (const corner of cardQuad(8, index)) {
        expect(corner.y).toBeLessThanOrEqual((all?.y ?? 0) + (all?.h ?? 0) + 1e-9);
        expect(corner.x).toBeGreaterThanOrEqual((all?.x ?? 0) - 1e-9);
      }
    }
  });

  it("turns the frame so its +y points out through the rack", () => {
    expect(frameRotation(-Math.PI / 2)).toBe(180);
    expect(frameRotation(Math.PI / 2)).toBe(0);
    expect(frameRotation(0)).toBe(-90);
    expect(frameRotation(Math.PI)).toBe(90);
  });

  it("snaps a quarter turn to exact, so four players' racks sit square", () => {
    for (let count = 2; count <= 6; count++) {
      places(count, 0).forEach((entry) => {
        if (entry?.angle !== null && entry?.angle !== undefined) {
          const turn = frameRotation(entry.angle);
          expect(turn).toBeGreaterThan(-180);
          expect(turn).toBeLessThanOrEqual(180);
        }
      });
    }
    // A right angle from radians is 89.99999999999999 degrees, not 90.
    expect(frameRotation(Math.PI)).toBe(90);
    expect(frameRotation(0)).toBe(-90);
  });

  it("writes the transform as CSS's column-major matrix3d", () => {
    const text = cssMatrix3d({ m11: 1, m12: 2, m13: 3, m21: 4, m22: 5, m23: 6, m31: 7, m32: 8, m33: 9 });
    expect(text).toBe("matrix3d(1,2,0,3,4,5,0,6,0,0,1,0,7,8,0,9)");
  });
});
