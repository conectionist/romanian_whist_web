// How much the table moves, src/table/Motion.cpp: the one setting that decides it, and the numbers
// the animations read. Only numbers and curves, so a test can say what each pace means without a
// page.

// Four stops, as the desktop's slider has them, left to right.
export const PACES = ["off", "quick", "normal", "slow"] as const;
export type Pace = (typeof PACES)[number];

export const DEFAULT_PACE: Pace = "normal";

// The pace at a slider position: a value out of range is the nearest stop.
export function paceAt(stop: number): Pace {
  return PACES[Math.min(Math.max(Math.trunc(stop), 0), PACES.length - 1)];
}

export function stopOf(pace: Pace): number {
  return PACES.indexOf(pace);
}

// What a card's flight onto the felt and the trick's sweep to its winner take at Normal.
export const FLIGHT_MS = 360;
export const SWEEP_MS = 480;

// A bid bubble's 1.6 s does not scale with the pace: it is reading time, not motion. Off shows it
// still for 1.5 s.
export const BUBBLE_MS = 1600;
export const BUBBLE_STILL_MS = 1500;

// Normal's length times this. At Quick the lengths are 180 and 240 ms.
export function factorFor(pace: Pace): number {
  switch (pace) {
    case "off":
      return 0;
    case "quick":
      return 0.5;
    case "normal":
      return 1;
    case "slow":
      return 1.6;
  }
}

// In milliseconds, and zero at Off: nothing flies and nothing sweeps.
export function flightDuration(pace: Pace): number {
  return Math.round(FLIGHT_MS * factorFor(pace));
}

export function sweepDuration(pace: Pace): number {
  return Math.round(SWEEP_MS * factorFor(pace));
}

export function animates(pace: Pace): boolean {
  return pace !== "off";
}

// A card landing eases out; the trick clearing eases in.
export const FLIGHT_CURVE = "cubic-bezier(0.2, 0.75, 0.25, 1)";
export const SWEEP_CURVE = "cubic-bezier(0.5, 0, 0.75, 0)";

// A bot's card leaves its owner's panel small and faint; yours leaves the fan at the fan's size.
export const BOT_FLIGHT_SCALE = 0.55;
export const BOT_FLIGHT_OPACITY = 0.3;
// Each swept card ends at the winner's panel at a third of its size, gone.
export const SWEEP_SCALE = 0.35;

const STORAGE_KEY = "whist.pace";

// The pace the viewer has chosen; Normal until they choose. Wrapped, because storage can be
// refused or empty.
export function storedPace(): Pace {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return (PACES as readonly string[]).includes(stored ?? "") ? (stored as Pace) : DEFAULT_PACE;
  } catch {
    return DEFAULT_PACE;
  }
}

// Keeps the viewer's choice. Wrapped, like the read: without storage the choice lasts until the page
// is closed.
export function storePace(pace: Pace): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, pace);
  } catch {
    // Nothing to keep it in.
  }
}

// A viewer who asks their system for reduced motion gets none: the desktop's Off.
export function effectivePace(chosen: Pace, prefersReducedMotion: boolean): Pace {
  return prefersReducedMotion ? "off" : chosen;
}

export function currentPace(): Pace {
  let reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    reduced = false;
  }
  return effectivePace(storedPace(), reduced);
}
