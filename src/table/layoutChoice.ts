import type { Size } from "./space";

// Which table a window gets: the desktop's, scaled to fit, or none because the window is too small.
// A mouse has the desktop's at every size. A touch screen has it from 1100 by 740, and below that the
// scaled table, which is drawn for the design size and scaled up whole to the window.

// The size the scaled table is drawn for: the least that shows every card and name readably.
export const DESIGN: Size = { w: 640, h: 360 };

// From this size up a touch screen has room for the desktop's own table.
export const DESKTOP_FROM: Size = { w: 1100, h: 740 };

// The smallest scale the table is drawn at. Below it a card is too small to read, and the page asks
// for more room instead. Between this and 1 the table is drawn small and the page may offer full
// screen.
export const SCALE_FLOOR = 0.6;

export type LayoutChoice = { kind: "desktop" } | { kind: "scaled"; scale: number } | { kind: "tooSmall"; scale: number };

// The least width, at the design's height, that has the side panels with any number of players.
export const SIDE_FROM = 720;

// The scale a window gives the design: the largest that keeps the whole of it in view and leaves the window at least
// SIDE_FROM wide in the design's units, or 1 where it is narrower than that. Drawn larger, a taller window would be
// narrower in those units and could lose the side panels that a shorter one has.
export function scaleOf(size: Size): number {
  return Math.min(size.w / DESIGN.w, size.h / DESIGN.h, Math.max(1, size.w / SIDE_FROM));
}

// The width the side panels go by, as wide as the window is in the design's units, which from the design's scale up never
// falls as the window grows. Drawn smaller than designed, a taller window is narrower in those units, so there the panels
// go by the window's own width, which never falls either.
export function sideWidthOf(size: Size, scale: number): number {
  return scale < 1 ? Math.max(DESIGN.w, size.w) : size.w / scale;
}

// A window taller than wide keeps the desktop's table, with the hint to turn the phone over it.
export function layoutChoiceFor(size: Size, coarse: boolean): LayoutChoice {
  if (!coarse || size.h > size.w) {
    return { kind: "desktop" };
  }
  if (size.w >= DESKTOP_FROM.w && size.h >= DESKTOP_FROM.h) {
    return { kind: "desktop" };
  }
  const scale = scaleOf(size);
  return scale < SCALE_FLOOR ? { kind: "tooSmall", scale } : { kind: "scaled", scale };
}

export function sameChoice(a: LayoutChoice, b: LayoutChoice): boolean {
  return a.kind === b.kind && (a.kind === "desktop" || (b.kind !== "desktop" && a.scale === b.scale));
}

// Whether the table is drawn smaller than it was designed, which is where the page offers full screen.
export function isShrunk(choice: LayoutChoice): boolean {
  return choice.kind === "scaled" && choice.scale < 1;
}
