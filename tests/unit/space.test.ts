import { describe, expect, it } from "vitest";
import {
  bottomPanel,
  centre,
  fitBox,
  fitScale,
  marginBottom,
  marginTop,
  marginX,
  minimumScale,
  playedCardHeight,
  playedFromCentre,
  squareAround,
  z,
} from "../../src/table/space";

describe("the table's space", () => {
  it("fits the box into the window under the menu bar", () => {
    // 1920 x 1080 less the 46 px menu bar.
    const scale = fitScale({ w: 1920, h: 1034 });
    expect(scale).toBeCloseTo(Math.min((1920 - 2 * marginX) / fitBox.w, (1034 - marginTop - marginBottom) / fitBox.h), 12);
    expect(scale).toBeCloseTo(0.7674, 3);
  });

  it("leaves the transform alone when the window has no room inside its margins", () => {
    expect(fitScale({ w: 30, h: 800 })).toBe(0);
    expect(fitScale({ w: 800, h: 15 })).toBe(0);
  });

  it("keeps the smallest window's scale where names stay readable", () => {
    // The panel's name is 25 px: below 0.36 it falls under nine.
    expect(25 * minimumScale).toBeGreaterThanOrEqual(9);
  });

  it("puts the fit box round the table, symmetric about its centre", () => {
    expect(fitBox.x + fitBox.w / 2).toBe(centre.x);
    expect(fitBox.y + fitBox.h / 2).toBe(centre.y);
  });

  it("measures a circle's square from the centre", () => {
    expect(squareAround(440)).toEqual({ x: 328, y: 72, w: 880, h: 880 });
  });

  it("makes played cards smaller from five seats", () => {
    expect(playedCardHeight(2)).toBe(205.2);
    expect(playedCardHeight(4)).toBe(205.2);
    expect(playedCardHeight(5)).toBe(181.2);
    expect(playedCardHeight(6)).toBe(181.2);
  });

  it("lays played cards against the round logo", () => {
    expect(playedFromCentre).toBe(107.5);
  });

  it("centres the bottom panel on the table", () => {
    expect(bottomPanel.x + bottomPanel.w / 2).toBe(centre.x);
    expect(bottomPanel.y).toBe(1046);
  });

  it("stacks the rungs bottom to top", () => {
    const rungs = Object.values(z);
    expect([...rungs].sort((a, b) => a - b)).toEqual(rungs);
    expect(z.flyingCard).toBeGreaterThan(z.hand);
    expect(z.flyingCard).toBeLessThan(z.humanPanel);
    expect(z.bidStrip).toBeGreaterThan(z.hud);
  });
});
