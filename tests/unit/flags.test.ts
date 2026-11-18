import { describe, expect, it } from "vitest";
import { redSaltirePieces, type Point } from "../../src/lobby/flags";
import { DIALOG_HEIGHT, DIALOG_WIDTH, fitFor } from "../../src/lobby/languageDialog";

function area(points: readonly Point[]): number {
  let twice = 0;
  points.forEach(([x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    twice += x * nextY - nextX * y;
  });
  return Math.abs(twice) / 2;
}

describe("the Union Flag's red saltire", () => {
  // The desktop's definition, as a test of points: the 4-wide stroke of the two diagonals of the 60 by
  // 30 grid, kept where it is inside the four triangles round the centre that hold the red's half of
  // each arm. The pieces are written as polygons, so their area is checked against that.
  const triangles: Point[][] = [
    [[30, 15], [60, 15], [60, 30]],
    [[30, 15], [30, 30], [0, 30]],
    [[30, 15], [0, 15], [0, 0]],
    [[30, 15], [30, 0], [60, 0]],
  ];
  const inside = (x: number, y: number, triangle: readonly Point[]) => {
    const sign = (a: Point, b: Point) => (x - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]);
    const signs = [sign(triangle[0], triangle[1]), sign(triangle[1], triangle[2]), sign(triangle[2], triangle[0])];
    return signs.every((each) => each >= 0) || signs.every((each) => each <= 0);
  };
  // Distance from (x, y) to the diagonal through (0, 0) and (60, 30), and to the one through (60, 0) and (0, 30).
  const nearest = (x: number, y: number) => Math.min(Math.abs(x - 2 * y), Math.abs(x + 2 * y - 60)) / Math.sqrt(5);

  it("has the area of the stroke inside the triangles, counted point by point", () => {
    const step = 0.02;
    let counted = 0;
    for (let x = step / 2; x < 60; x += step) {
      for (let y = step / 2; y < 30; y += step) {
        if (nearest(x, y) <= 2 && triangles.some((triangle) => inside(x, y, triangle))) {
          counted += step * step;
        }
      }
    }
    const pieces = redSaltirePieces();
    expect(pieces).toHaveLength(4);
    const total = pieces.reduce((sum, piece) => sum + area(piece), 0);
    // Counted by points, so as close as a fine grid gets: a half a percent.
    expect(Math.abs(total - counted) / total).toBeLessThan(0.005);
    // Each of the four is the same size, as the flag turns half way round about its middle.
    for (const piece of pieces) {
      expect(area(piece)).toBeCloseTo(area(pieces[0]), 6);
    }
  });

  it("lies inside the flag, and each piece is on the centre's side of its own corner", () => {
    for (const piece of redSaltirePieces()) {
      for (const [x, y] of piece) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(60);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(30);
      }
      expect(piece[0]).toEqual([30, 15]);
    }
  });
});

describe("the size the language dialog is shown at", () => {
  it("is its own where the window holds it, and smaller where it does not", () => {
    expect(fitFor(DIALOG_WIDTH, DIALOG_HEIGHT)).toBe(1);
    expect(fitFor(1920, 1080)).toBe(1);
    expect(fitFor(280, 1000)).toBe(0.5);
    expect(fitFor(1000, 210)).toBe(0.5);
    expect(fitFor(390, 844)).toBeCloseTo(390 / 560, 6);
    expect(fitFor(844, 390)).toBeCloseTo(390 / 420, 6);
  });
});
