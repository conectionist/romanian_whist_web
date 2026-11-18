import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DESIGN, DESKTOP_FROM, SCALE_FLOOR, SIDE_FROM, isShrunk, layoutChoiceFor, sameChoice } from "../../src/table/layoutChoice";

interface Verdict {
  mode: "portrait" | "desk" | "tiny" | "scaled";
  scale: number;
}

const mockup = JSON.parse(readFileSync(new URL("./fixtures/mockup-layout.json", import.meta.url), "utf8")) as {
  choices: { width: number; height: number; verdict: Verdict }[];
};

const touch = (w: number, h: number) => layoutChoiceFor({ w, h }, true);
const mouse = (w: number, h: number) => layoutChoiceFor({ w, h }, false);

describe("which table a window gets", () => {
  it("gives a mouse the desktop's table at every size", () => {
    for (const [w, h] of [
      [1920, 1080],
      [1366, 650],
      [832, 384],
      [640, 360],
      [300, 200],
      [390, 844],
    ]) {
      expect(mouse(w, h)).toEqual({ kind: "desktop" });
    }
  });

  it("gives a touch screen of 1100 by 740 or more the desktop's table", () => {
    expect(touch(DESKTOP_FROM.w, DESKTOP_FROM.h)).toEqual({ kind: "desktop" });
    expect(touch(1280, 800)).toEqual({ kind: "desktop" });
    expect(touch(2400, 1080)).toEqual({ kind: "desktop" });
  });

  it("gives a touch screen one pixel short of that in either direction the scaled table", () => {
    const wide = touch(DESKTOP_FROM.w - 1, DESKTOP_FROM.h);
    const tall = touch(DESKTOP_FROM.w, DESKTOP_FROM.h - 1);
    expect(wide.kind).toBe("scaled");
    expect(tall.kind).toBe("scaled");
    expect(tall).toEqual({ kind: "scaled", scale: DESKTOP_FROM.w / SIDE_FROM });
    expect(wide).toEqual({ kind: "scaled", scale: (DESKTOP_FROM.w - 1) / SIDE_FROM });
  });

  it("scales the design by the smaller of the window's two ratios, and no more than leaves the window SIDE_FROM wide in its units", () => {
    expect(touch(640, 360)).toEqual({ kind: "scaled", scale: 1 });
    expect(touch(915, 412)).toEqual({ kind: "scaled", scale: 412 / 360 });
    expect(touch(829, 690)).toEqual({ kind: "scaled", scale: 829 / SIDE_FROM });
    expect(touch(960, 600)).toEqual({ kind: "scaled", scale: 960 / SIDE_FROM });
    expect(touch(832, 384)).toEqual({ kind: "scaled", scale: 384 / 360 });
    // Narrower than SIDE_FROM, a window taller than the design is drawn at the design's size, and has the room.
    expect(touch(700, 400)).toEqual({ kind: "scaled", scale: 1 });
    expect(touch(700, 340)).toEqual({ kind: "scaled", scale: 340 / 360 });
  });

  it("never makes a window narrower in the design's units as it grows, from the design's size up", () => {
    const units = (w: number, h: number) => {
      const choice = touch(w, h);
      return choice.kind === "scaled" ? { w: w / choice.scale, h: h / choice.scale } : null;
    };
    for (let w = 640; w < DESKTOP_FROM.w; w += 10) {
      for (let h = 360; h < Math.min(w, DESKTOP_FROM.h); h += 10) {
        const here = units(w, h)!;
        for (const [wider, taller] of [
          [w + 10, h],
          [w, h + 10],
        ]) {
          const next = units(wider, taller);
          if (next !== null && taller <= wider) {
            expect(next.w, `${w} by ${h} to ${wider} by ${taller}`).toBeGreaterThanOrEqual(Math.min(here.w, SIDE_FROM) - 1e-9);
          }
        }
      }
    }
  });

  it("draws a phone inside a browser's bars smaller than designed, and still draws it", () => {
    const choice = touch(754, 247);
    expect(choice.kind).toBe("scaled");
    expect(choice.kind === "scaled" ? choice.scale : 0).toBeCloseTo(0.686, 3);
    expect(isShrunk(choice)).toBe(true);
    expect(isShrunk(touch(832, 384))).toBe(false);
    expect(isShrunk(touch(640, 360))).toBe(false);
    expect(isShrunk(touch(1280, 800))).toBe(false);
  });

  it("draws down to the floor and no further", () => {
    expect(SCALE_FLOOR).toBe(0.6);
    const floor = { w: DESIGN.w * SCALE_FLOOR, h: DESIGN.h * SCALE_FLOOR };
    expect(touch(floor.w, floor.h).kind).toBe("scaled");
    expect(touch(floor.w - 1, floor.h).kind).toBe("tooSmall");
    expect(touch(floor.w, floor.h - 1).kind).toBe("tooSmall");
    expect(touch(1000, 200).kind).toBe("tooSmall");
    expect(touch(300, 200).kind).toBe("tooSmall");
  });

  it("leaves a window taller than wide to the desktop's table and the hint to turn the phone", () => {
    for (const [w, h] of [
      [390, 844],
      [412, 915],
      [820, 1180],
      [300, 400],
    ]) {
      expect(touch(w, h)).toEqual({ kind: "desktop" });
    }
    // A square window is not upright.
    expect(touch(500, 500).kind).toBe("scaled");
  });

  it("compares choices by what they draw", () => {
    expect(sameChoice({ kind: "desktop" }, { kind: "desktop" })).toBe(true);
    expect(sameChoice(touch(832, 384), touch(832, 384))).toBe(true);
    expect(sameChoice(touch(832, 384), touch(832, 385))).toBe(false);
    expect(sameChoice(touch(832, 384), { kind: "desktop" })).toBe(false);
    expect(sameChoice({ kind: "desktop" }, touch(832, 384))).toBe(false);
    expect(sameChoice(touch(300, 200), touch(832, 384))).toBe(false);
  });
});

describe("the mock-up's own verdicts", () => {
  // Where the mock-up chooses the scaled table, a touch screen gets it at the same scale; where it
  // chooses the desktop's, a touch screen gets that. Its too-small verdict below the design size is
  // the page's scaled table down to the floor.
  it("agree with the page's, at the thresholds the mock-up has", () => {
    expect(mockup.choices.length).toBeGreaterThan(10);
    for (const { width, height, verdict } of mockup.choices) {
      const mine = touch(width, height);
      const where = `${width} by ${height}`;
      switch (verdict.mode) {
        case "desk":
          expect(mine, where).toEqual({ kind: "desktop" });
          break;
        case "portrait":
          expect(mine, where).toEqual({ kind: "desktop" });
          break;
        case "scaled":
          // The page draws no larger than leaves the window SIDE_FROM wide in the design's units.
          expect(mine, where).toEqual({ kind: "scaled", scale: Math.min(verdict.scale, Math.max(1, width / SIDE_FROM)) });
          break;
        case "tiny":
          expect(["scaled", "tooSmall"], where).toContain(mine.kind);
          expect(mine.kind === "scaled", where).toBe(Math.min(width / DESIGN.w, height / DESIGN.h) >= SCALE_FLOOR);
          break;
      }
    }
  });
});
