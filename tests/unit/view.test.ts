import { describe, expect, it } from "vitest";
import { fitFor, spaceTransform } from "../../src/table/view";
import { LOGO_SIDE, letteringScale, logoLinesFrom } from "../../src/table/tableTop";
import { fitBox, marginBottom, marginTop, marginX } from "../../src/table/space";

describe("fitting the table to the view", () => {
  it("centres the fit box in what the margins leave", () => {
    const fit = fitFor({ w: 1920, h: 1034 });
    expect(fit).not.toBeNull();
    const scale = fit?.scale ?? 0;
    // The height decides on a wide view, so the box is as tall as the margins leave.
    expect(fitBox.h * scale).toBeCloseTo(1034 - marginTop - marginBottom, 9);
    expect(fit?.y).toBeCloseTo(marginTop, 9);
    expect((fit?.x ?? 0) + (fitBox.w * scale) / 2).toBeCloseTo(960, 9);
  });

  it("fits a tall view by its width", () => {
    const fit = fitFor({ w: 940, h: 1700 });
    expect(fit?.x).toBeCloseTo(marginX, 9);
    expect((fit?.scale ?? 0) * fitBox.w).toBeCloseTo(940 - 2 * marginX, 9);
  });

  it("has no fit for a view with no room inside its margins", () => {
    expect(fitFor({ w: 20, h: 500 })).toBeNull();
    expect(fitFor({ w: 500, h: 10 })).toBeNull();
  });

  it("writes the transform that puts the fit box's corner at the fit's", () => {
    const text = spaceTransform({ scale: 0.5, x: 30, y: 12 });
    expect(text).toBe("translate(30px, 12px) scale(0.5) translate(172px, 150px)");
  });
});

describe("the logo", () => {
  it("is a frame 215 over 0.9 across", () => {
    expect(LOGO_SIDE).toBeCloseTo(238.889, 3);
  });

  it("splits the phrase at line breaks and drops empty lines", () => {
    expect(logoLinesFrom("Romanian\nWhist")).toEqual(["Romanian", "Whist"]);
    expect(logoLinesFrom("  One line  ")).toEqual(["One line"]);
    expect(logoLinesFrom("A\n\n B \n")).toEqual(["A", "B"]);
  });

  it("leaves words that fit at their size, and scales down the ones that do not", () => {
    expect(letteringScale(LOGO_SIDE, 60, 2)).toBe(1);
    const wide = letteringScale(LOGO_SIDE, 400, 2);
    expect(wide).toBeLessThan(1);
    expect(wide).toBeGreaterThan(0);
  });

  it("keeps the ornaments inside too, however short the words", () => {
    expect(letteringScale(LOGO_SIDE, 10, 2)).toBeLessThanOrEqual(1);
    expect(letteringScale(60, 10, 2)).toBeLessThan(1);
  });
});
