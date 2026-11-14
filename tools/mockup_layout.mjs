#!/usr/bin/env node
// Writes what the Android mock-up's own layout code returns, so that the page's port of it can be
// compared with the numbers and not with a copy of them.
//
//     node tools/mockup_layout.mjs [--android DIR] [--out FILE]
//
// --android is the checkout of romanian_whist_android (default ../romanian_whist_android) and --out
// the file written (default tests/unit/fixtures/mockup-layout.json). The functions are cut out of
// docs/android-client-mockup/source/mockup.js by name and run in a vm context, so nothing in the
// mock-up's file is changed or copied by hand. The unit tests read the JSON and never run this.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The top-level declarations the layout needs, by the first name each declares. The order does not
// matter: they are run in the order the file has them.
const NEEDED = [
  "clamp", "rad", "deg",
  "BASE_W", "BIG_W",
  "chooseLayout",
  "BOX", "NATIVE", "CORNERS", "DIRECTIONS", "SEAT_CLEARANCE", "SEAT_INSET", "CARD_REACH", "LOGO_SHARE",
  "reach", "place", "seatRing", "trickScale", "layoutScaled",
  "CHIP_W", "PLATE_GAP", "FAN_TURN", "platesClear", "SIDE_MIN",
  "playedPlace", "handSlots",
];

// The windows the page is tested at, in CSS pixels. top and bottom are the system bars the mock-up
// draws under, which the page has none of except in the one window that checks they are carried.
const WINDOWS = [
  { name: "640x360", width: 640, height: 360 },
  { name: "915x412", width: 915, height: 412 },
  { name: "829x690", width: 829, height: 690 },
  { name: "829x690-with-bars", width: 829, height: 690, top: 24, bottom: 20 },
  { name: "960x600", width: 960, height: 600 },
  { name: "800x360", width: 800, height: 360 },
  { name: "780x360", width: 780, height: 360 },
  { name: "832x384", width: 832, height: 384 },
  // The mock-up would show its too-small page here. The table is drawn all the same, at the scale the
  // window gives, which is what the page does down to its floor.
  { name: "754x247", width: 754, height: 247 },
];

// Windows chooseLayout is asked about, for the thresholds.
const CHOICES = [
  [640, 360], [639, 360], [640, 359], [1100, 740], [1099, 740], [1100, 739], [1280, 800], [412, 915],
  [456, 412], [800, 360], [915, 412], [832, 384], [754, 247], [960, 600], [1366, 650],
];

const PLAYERS = [2, 3, 4, 5, 6];
const HAND_SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

// The text of the top-level declaration that starts with `const name` or `function name`: from its
// first column to its closing brace, or to the semicolon that ends a constant.
export function declaration(source, name) {
  const start = source.search(new RegExp(`^(?:const|function) ${name}\\b`, "m"));
  if (start < 0) {
    throw new Error(`the mock-up has no top-level "${name}"`);
  }
  const isFunction = source.startsWith("function", start);
  let depth = 0;
  let sawBody = false;
  for (let at = start; at < source.length; at++) {
    const c = source[at];
    const next = source[at + 1];
    if (c === "/" && next === "/") {
      at = source.indexOf("\n", at) - 1;
    } else if (c === "/" && next === "*") {
      at = source.indexOf("*/", at) + 1;
    } else if (c === '"' || c === "'" || c === "`") {
      for (at++; source[at] !== c; at++) {
        if (source[at] === "\\") {
          at++;
        }
      }
    } else if (c === "(" || c === "[" || c === "{") {
      depth++;
      sawBody ||= c === "{" && depth === 1;
    } else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (isFunction && sawBody && depth === 0) {
        return source.slice(start, at + 1);
      }
    } else if (c === ";" && depth === 0 && !isFunction) {
      return source.slice(start, at + 1);
    }
  }
  throw new Error(`the declaration of "${name}" does not end`);
}

// The mock-up's layout functions and constants, run.
export function loadMockup(source) {
  const parts = NEEDED.map((name) => ({ name, at: source.search(new RegExp(`^(?:const|function) ${name}\\b`, "m")), text: declaration(source, name) }));
  parts.sort((a, b) => a.at - b.at);
  const script = `${parts.map((part) => part.text).join("\n")}
({ chooseLayout, layoutScaled, playedPlace, handSlots, DIRECTIONS, CORNERS, NATIVE, BASE_W, BASE_H, BIG_W, BIG_H,
   SEAT_CLEARANCE, SEAT_INSET, CARD_REACH, LOGO_SHARE, CHIP_W, PLATE_GAP, FAN_TURN, SIDE_MIN, SIDE_RUN, SIDE_MAX,
   BOX, BOX_C, RIM_R, LOGO_R, LEAD_R })`;
  return vm.runInNewContext(script, {}, { filename: "mockup.js (the layout functions)", timeout: 10000 });
}

function plain(value) {
  // A copy with only what JSON holds, and nothing lost to it: a number that is not finite would be written as null.
  return JSON.parse(
    JSON.stringify(value, (key, each) => {
      if (typeof each === "number" && !Number.isFinite(each)) {
        throw new Error(`${key} is ${each}`);
      }
      return each;
    }),
  );
}

export function fixtureFrom(mockup, source) {
  const { chooseLayout, layoutScaled, playedPlace, handSlots } = mockup;
  const windows = WINDOWS.map(({ name, width, height, top = 0, bottom = 0 }) => {
    const scale = Math.min(width / mockup.BASE_W, height / mockup.BASE_H);
    const ctx = { w: width / scale, h: height / scale, top: top / scale, bottom: bottom / scale, mode: "scaled" };
    const tables = {};
    for (const n of PLAYERS) {
      const layout = layoutScaled(ctx, n);
      tables[n] = {
        layout,
        played: layout.angles.map((angle) => playedPlace(n, angle, layout)),
        hands: Object.fromEntries(HAND_SIZES.map((count) => [count, handSlots(layout.hand, count)])),
      };
    }
    return {
      name,
      width,
      height,
      top,
      bottom,
      scale,
      design: { w: ctx.w, h: ctx.h, top: ctx.top, bottom: ctx.bottom },
      verdict: chooseLayout(width, height, 1, false),
      tables,
    };
  });
  return plain({
    note: "What the Android mock-up's own layout functions return. Written by tools/mockup_layout.mjs; never edit it by hand.",
    mockup: { ...source },
    constants: {
      directions: mockup.DIRECTIONS,
      corners: mockup.CORNERS,
      native: mockup.NATIVE,
      design: { w: mockup.BASE_W, h: mockup.BASE_H },
      desktop: { w: mockup.BIG_W, h: mockup.BIG_H },
      seatClearance: mockup.SEAT_CLEARANCE,
      seatInset: mockup.SEAT_INSET,
      cardReach: mockup.CARD_REACH,
      logoShare: mockup.LOGO_SHARE,
      chipWidth: mockup.CHIP_W,
      plateGap: mockup.PLATE_GAP,
      fanTurn: mockup.FAN_TURN,
      side: { min: mockup.SIDE_MIN, run: mockup.SIDE_RUN, max: mockup.SIDE_MAX },
      box: { size: mockup.BOX, centre: mockup.BOX_C, rim: mockup.RIM_R, logo: mockup.LOGO_R, lead: mockup.LEAD_R },
    },
    choices: CHOICES.map(([width, height]) => ({ width, height, verdict: chooseLayout(width, height, 1, false) })),
    windows,
  });
}

function main() {
  const { values } = parseArgs({ options: { android: { type: "string" }, out: { type: "string" } } });
  const android = resolve(ROOT, values.android ?? "../romanian_whist_android");
  const out = resolve(ROOT, values.out ?? "tests/unit/fixtures/mockup-layout.json");
  const file = `${android}/docs/android-client-mockup/source/mockup.js`;
  const source = readFileSync(file, "utf8");
  const git = (...args) => execFileSync("git", ["-C", android, ...args], { encoding: "utf8" }).trim();
  const commit = git("rev-parse", "HEAD");
  const dirty = git("status", "--porcelain", "--", "docs/android-client-mockup/source/mockup.js") !== "";
  if (dirty) {
    throw new Error("the mock-up's file has changes that no commit holds: the fixture would record a commit it was not made from");
  }
  const fixture = fixtureFrom(loadMockup(source), {
    repository: "romanian_whist_android",
    commit,
    short: commit.slice(0, 7),
    file: "docs/android-client-mockup/source/mockup.js",
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(fixture, null, 1)}\n`);
  console.log(`wrote ${out} from the mock-up at ${commit.slice(0, 7)}: ${fixture.windows.length} windows, ${PLAYERS.length} table sizes each`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
