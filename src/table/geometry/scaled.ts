import { centre, woodRadius, type Placement, type Point, type Size } from "../space";
import { panelRect } from "./seats";

// The scaled table's geometry, ported from the Android mock-up's layoutScaled(): the table is drawn
// for a window of at least 640 by 360 and scaled up whole, so every number here is in the window's
// own units once it is divided by the scale. The plates, the hand and the corner controls are placed
// in those units. The wood, the racks and the played cards stay in the table's own 1020 units, drawn
// at `2 * R / BOX`.

// The wood's box in table units, the logo's rim, and where the racks and the lead mark stand on the
// desktop's table.
export const BOX = 1020;
export const BOX_CENTRE = BOX / 2;
export const RIM_RADIUS = 452;
export const LOGO_RADIUS = 107.5;
export const LEAD_RADIUS = 416;

// The two sizes a name panel is drawn at, in the scaled table's units: an opponent's flat plate, and
// your own one-line plate over the foot of your hand.
export const NATIVE = { plate: { w: 128, h: 54 }, mine: { w: 184, h: 38 } } as const;

// The desktop's panels keep their nearest edge 533 units from the centre, just clear of the wood's
// rim at 510, whichever way they face.
export const SEAT_CLEARANCE = 533 / woodRadius;

// The seats come in over the wood, as far as this share of its radius, so that the table can take the
// whole of the window's height. Their racks and played cards move in with them.
export const SEAT_INSET = 0.62;

// How far your played card reaches from the centre, as a share of the seats' circle.
export const CARD_REACH = 0.82;

// The logo is at least this share of a played card's height, near the desktop's proportion.
export const LOGO_SHARE = 0.42;

// The width the round chip takes in the top corner, and the least room between two opponents' plates.
export const CHIP_WIDTH = 172;
export const PLATE_GAP = 4;

// How far each card of your hand turns from the next, in degrees.
export const FAN_TURN = 2.2;

// The side panels' widths. Below the least, a name and its points no longer fit on a line; below the
// next, the run leaves the scores.
export const SIDE_MIN = 116;
export const SIDE_RUN = 132;
export const SIDE_MAX = 168;

// The face of a card is this much taller than it is wide.
const CARD_ASPECT = 726 / 500;

// The round chip is 172 wide, 8 in from the corner, and as tall as its trump card, the word over it and its
// padding.
export const CHIP_HEIGHT = 68;
export const CORNER_INSET = 8;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// A name panel's place and size: its top-left corner, and the scale it is drawn at from its own size.
export interface Plate extends Box {
  kind: "plate" | "mine";
  scale: number;
}

// What the window gives the layout, in its own units: the size, and the bars the page draws under.
export interface ScaledWindow {
  w: number;
  h: number;
  top: number;
  bottom: number;
}

export interface HandFan {
  cx: number;
  top: number;
  cw: number;
  ch: number;
  maxStep: number;
  maxSpan: number;
  arc: number;
  rot: number;
  liftLegal: number;
  liftSel: number;
}

// What the four corners of the window hold, which the seats, the hand and the side panels keep clear of. Each box is
// the room a corner's controls take from the corner, in the window's units, with the least space round them: the
// top ones are measured down from the top bar. `handLeft` and `handRight` are how far from each edge the hand's fan
// stays, and `sideTop` where the side panels start.
export interface Corners {
  topLeft: { w: number; h: number };
  topRight: { w: number; h: number };
  bottomLeft: { w: number; h: number };
  bottomRight: { w: number; h: number };
  handLeft: number;
  handRight: number;
  sideTop: number;
}

// The mock-up's: the pause button top left, the round chip top right and its two round buttons bottom right.
export const MOCKUP_CORNERS: Corners = {
  topLeft: { w: 64, h: 64 },
  topRight: { w: CHIP_WIDTH + 14, h: 82 },
  bottomLeft: { w: 0, h: 0 },
  bottomRight: { w: 124, h: 64 },
  handLeft: 16,
  handRight: 126,
  sideTop: 80,
};

export interface ScaledLayout {
  table: { cx: number; cy: number; R: number };
  // Yours first, then the others clockwise.
  seats: Plate[];
  // Where each seat faces from the centre, yours straight down.
  angles: number[];
  rackR: number;
  pipR: number;
  logoK: number;
  boost: number;
  hand: HandFan;
  lineBottom: number;
  lineW: number;
  band: { top: number; bottom: number; mid: number; w: number };
  side: { w: number; y: number } | null;
  bid: { x: number; y: number; w: number; centred: true };
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

// The directions the desktop seats its players in, from the table's centre to the middle of each name
// panel, clockwise from the seat after yours. Every layout seats its players in these directions, so
// that each name, its rack and its played card share one line from the centre.
const directions = new Map<number, number[]>();

export function directionsFor(seatCount: number): number[] {
  let found = directions.get(seatCount);
  if (found === undefined) {
    found = [];
    for (let step = 1; step < seatCount; step++) {
      const panel = panelRect(seatCount, 0, step);
      if (panel === null) {
        return [];
      }
      found.push(Math.atan2(panel.y + panel.h / 2 - centre.y, panel.x + panel.w / 2 - centre.x));
    }
    directions.set(seatCount, found);
  }
  return found;
}

// How far a box reaches from its centre in the direction `angle`.
function reach(angle: number, w: number, h: number): number {
  return (Math.abs(Math.cos(angle)) * w) / 2 + (Math.abs(Math.sin(angle)) * h) / 2;
}

function plateAt(kind: Plate["kind"], x: number, y: number, scale: number): Plate {
  const native = NATIVE[kind];
  return { kind, x, y, scale, w: native.w * scale, h: native.h * scale };
}

export interface RingArea {
  x0: number;
  x1: number;
  y0: number;
  seatCount: number;
  bw: number;
  bh: number;
  woodTop: number;
  woodMaxR: number;
  woodBelow: number;
  cardMax: number;
  seatMax: number;
  // The corner controls: a seat under one of the top ones sits below it, a seat over one of the
  // bottom ones sits above it.
  avoid: readonly Box[];
}

export interface Ring {
  cx: number;
  cy: number;
  R: number;
  rIn: number;
  seats: Point[];
  angles: number[];
}

// The seats in the desktop's directions, each one's nearest edge on one circle round the table's
// centre, that circle as large as the area allows. The wood is then drawn as large as fits, from the
// desktop's clearance (seats outside it) to SEAT_INSET (seats over it). cardMax is the lowest your
// played card may reach, seatMax the lowest any seat may, woodBelow the lowest the wood may run.
export function seatRing(area: RingArea): Ring {
  const { x0, x1, y0, bw, bh, woodTop, woodMaxR, woodBelow, cardMax, seatMax, avoid } = area;
  const cx = (x0 + x1) / 2;
  const halfW = (x1 - x0) / 2;
  const dirs = directionsFor(area.seatCount);

  // The range the circle's centre may be at, for a circle whose seats' nearest edges are `rIn` from it.
  const span = (rIn: number): [number, number] | null => {
    const least = rIn / SEAT_CLEARANCE;
    if (least > woodMaxR) {
      return null;
    }
    let lo = woodTop + least;
    let hi = Math.min(cardMax - CARD_REACH * rIn, woodBelow - least);
    for (const a of dirs) {
      const d = rIn + reach(a, bw, bh);
      if (Math.abs(Math.cos(a)) * d + bw / 2 > halfW) {
        return null;
      }
      const dy = Math.sin(a) * d;
      lo = Math.max(lo, y0 + bh / 2 - dy);
      hi = Math.min(hi, seatMax - bh / 2 - dy);
      const x = cx + Math.cos(a) * d - bw / 2;
      for (const box of avoid) {
        if (x >= box.x + box.w || x + bw <= box.x) {
          continue;
        }
        if (box.y <= y0) {
          lo = Math.max(lo, box.y + box.h + bh / 2 - dy);
        } else {
          hi = Math.min(hi, box.y - bh / 2 - dy);
        }
      }
    }
    return lo <= hi ? [lo, hi] : null;
  };

  let small = 30;
  let big = 2000;
  for (let step = 0; step < 50 && big - small > 0.25; step++) {
    const middle = (small + big) / 2;
    if (span(middle) !== null) {
      small = middle;
    } else {
      big = middle;
    }
  }
  const rIn = small;
  const [lo, hi] = span(rIn) ?? [y0 + rIn, y0 + rIn];
  const cy = (lo + hi) / 2;
  const R = Math.max(rIn / SEAT_CLEARANCE, Math.min(rIn / SEAT_INSET, woodMaxR, cy - woodTop, woodBelow - cy));
  const seats = dirs.map((a) => {
    const d = rIn + reach(a, bw, bh);
    return { x: cx + Math.cos(a) * d - bw / 2, y: cy + Math.sin(a) * d - bh / 2 };
  });
  return { cx, cy, R, rIn, seats, angles: [Math.PI / 2, ...dirs] };
}

export interface TrickScale {
  rackR: number;
  pipR: number;
  logoK: number;
  boost: number;
}

// Where the racks stand, how large the played cards are and how large the logo, in the wood's 1020
// units. A rack keeps 30 units under its seat. The cards stop short of the lead mark and are never
// taller than `capPx`, the hand's cards. The logo they touch stays at least LOGO_SHARE of their
// height, near the desktop's proportion, so they gather round it instead of crowding into a cross.
export function trickScale(R: number, rIn: number, angles: readonly number[], seatCount: number, capPx: number): TrickScale {
  const s = (2 * R) / BOX;
  const rackR = Math.min(RIM_RADIUS, rIn / s - 30);
  const extent = Math.min(395, rackR - 45);
  const turns = angles.map((a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((p, q) => p - q);
  const gap = Math.min(...turns.map((a, i) => (i + 1 < turns.length ? turns[i + 1] : turns[0] + 2 * Math.PI) - a));
  // Neighbouring cards a gap apart clear each other only if the logo is at least c times their height.
  const c = Math.max(LOGO_SHARE, 0.689 / (2 * Math.sin(Math.min(gap, Math.PI) / 2)) - 0.5);
  const logoMin = 22 / s;
  const base = seatCount <= 4 ? 205.2 : 181.2;
  const height = Math.min(extent - logoMin, extent / (1 + c), capPx / s);
  const logo = clamp(extent - height, Math.max(logoMin, c * height), LOGO_RADIUS);
  return { rackR, pipR: (logo + height + rackR - 9) / 2, logoK: logo / LOGO_RADIUS, boost: height / base };
}

// Whether every pair of plates is at least PLATE_GAP apart.
export function platesClear(seats: readonly Point[], w: number, h: number): boolean {
  return seats.every((a, i) =>
    seats
      .slice(i + 1)
      .every((o) => a.x + w + PLATE_GAP <= o.x || o.x + w + PLATE_GAP <= a.x || a.y + h + PLATE_GAP <= o.y || o.y + h + PLATE_GAP <= a.y),
  );
}

// The table, in the window's own units: at least 640 by 360, with the table across the whole height.
// The round table leaves the four corners free, and they hold the few controls, so the seats keep out
// of them.
export function layoutScaled(window: ScaledWindow, seatCount: number, corners: Corners = MOCKUP_CORNERS): ScaledLayout {
  const { w, h, top, bottom } = window;
  const bw = NATIVE.plate.w;
  const bh = NATIVE.plate.h;
  const cw = Math.round(clamp(h * 0.2, 62, 92));
  const ch = cw * CARD_ASPECT;
  // Your plate sits over the foot of your hand, as on the desktop; the hand rises just enough that the
  // top 31% of each card, its index, shows above the plate.
  const mw = NATIVE.mine.w;
  const mh = NATIVE.mine.h;
  const mineY = h - bottom - 4 - mh;
  const handTop = Math.min(h - bottom - ch * 0.64, mineY - ch * 0.31);
  const liftSel = Math.round(ch * 0.28);
  // The line above your hand grows upwards from just over a lifted card.
  const lineBottom = handTop - liftSel - 6;
  const avoid: Box[] = [
    { x: 0, y: 0, w: corners.topLeft.w, h: top + corners.topLeft.h },
    { x: w - corners.topRight.w, y: 0, w: corners.topRight.w, h: top + corners.topRight.h },
    { x: w - corners.bottomRight.w, y: h - bottom - corners.bottomRight.h, w: corners.bottomRight.w, h: bottom + corners.bottomRight.h },
    { x: 0, y: h - bottom - corners.bottomLeft.h, w: corners.bottomLeft.w, h: bottom + corners.bottomLeft.h },
  ].filter((box) => box.w > 0 && box.h > 0);
  // The hand may cover the wood's near edge, as on the desktop, but never your played card. Where the
  // seats would crowd into each other, as six players do on the smallest windows, the plates shrink a
  // little, all alike, until neighbours keep PLATE_GAP apart.
  let k = 1;
  let ring: Ring;
  for (;;) {
    ring = seatRing({
      x0: 8,
      x1: w - 8,
      y0: top + 4,
      seatCount,
      bw: bw * k,
      bh: bh * k,
      woodTop: top,
      woodMaxR: h,
      woodBelow: h + 40,
      cardMax: handTop - 6,
      seatMax: handTop - 2,
      avoid,
    });
    if (k <= 0.8 || platesClear(ring.seats, bw * k, bh * k)) {
      break;
    }
    k -= 0.02;
  }
  const pw = bw * k;
  const ph = bh * k;
  const { cx, cy, R } = ring;
  const seats = [plateAt("mine", cx - mw / 2, mineY, 1), ...ring.seats.map((p) => plateAt("plate", p.x, p.y, k))];

  // A window wider than the table needs keeps the trick's details and the scores in view, in the gaps
  // beside the table, once those gaps are wide enough for readable text.
  let gap = cx - R;
  for (const seat of ring.seats) {
    gap = Math.min(gap, seat.x, w - seat.x - pw);
  }
  const sideW = Math.min(gap - 16, SIDE_MAX);
  const side = sideW >= SIDE_MIN ? { w: sideW, y: top + corners.sideTop } : null;

  // The band across the table between the players above it and those beside or below: nothing is
  // played there while you bid or wait for a connection, so the bid buttons and the banner go there,
  // as wide as the window allows.
  let bandTop = top + 4;
  let bandBottom = handTop - 4;
  for (const seat of ring.seats) {
    if (seat.y + ph / 2 < cy) {
      bandTop = Math.max(bandTop, seat.y + ph + 4);
    } else {
      bandBottom = Math.min(bandBottom, seat.y - 4);
    }
  }
  const band = {
    top: bandTop,
    bottom: bandBottom,
    mid: (bandTop + bandBottom) / 2,
    w: Math.min(side === null ? w - 48 : w - 2 * (side.w + 16), 600),
  };

  // The hand spreads as far as the corner buttons and the seats beside it let it, a lifted card
  // included, so a wide window shows more of each card; it never closes up beyond 240, which still
  // shows a third of each of eight cards. The outer cards lean by up to 3.5 turns of the fan, and their
  // corners swing out with it.
  const lean = (ch / 2) * Math.sin((3.5 * FAN_TURN * Math.PI) / 180);
  let handHalf = Math.min(cx - corners.handLeft, w - corners.handRight - cx);
  for (const seat of ring.seats) {
    if (seat.y + ph > handTop - liftSel - 2) {
      handHalf = Math.min(handHalf, seat.x > cx ? seat.x - cx - 4 : cx - (seat.x + pw) - 4);
    }
  }
  handHalf -= lean;

  // The line above your hand fits between the seats beside it, on more lines if it must.
  let half = w / 2 - 190;
  for (const seat of ring.seats) {
    if (seat.y < lineBottom && seat.y + ph > lineBottom - 76) {
      half = Math.min(half, seat.x > cx ? seat.x - cx - 6 : cx - (seat.x + pw) - 6);
    }
  }

  return {
    table: { cx, cy, R },
    seats,
    angles: ring.angles,
    ...trickScale(R, ring.rIn, ring.angles, seatCount, ch * 1.1),
    hand: {
      cx,
      top: handTop,
      cw,
      ch,
      maxStep: cw * 0.84,
      maxSpan: Math.max(240, Math.min(2 * handHalf, 560)),
      arc: 0.7,
      rot: FAN_TURN,
      liftLegal: Math.round(ch * 0.12),
      liftSel,
    },
    lineBottom,
    lineW: Math.max(170, 2 * half),
    band,
    side,
    bid: { x: cx - band.w / 2, y: band.mid, w: band.w, centred: true },
  };
}

// Where a played card lies, in the wood's own units from its top-left corner: touching the logo,
// turned to its owner.
export interface PlayedPlace extends Box {
  rot: number;
  r: number;
}

export function playedPlace(seatCount: number, angle: number, layout: Pick<ScaledLayout, "boost" | "logoK">): PlayedPlace {
  const height = (seatCount <= 4 ? 205.2 : 181.2) * layout.boost;
  const w = (height * 500) / 726;
  const r = LOGO_RADIUS * layout.logoK + height / 2;
  const x = BOX_CENTRE + r * Math.cos(angle);
  const y = BOX_CENTRE + r * Math.sin(angle);
  return { x: x - w / 2, y: y - height / 2, w, h: height, rot: (angle * 180) / Math.PI - 90, r };
}

// The desktop's fan, with the step, arc and turn the scaled table gives it: each card's top-left
// corner before it is turned, and its turn in degrees about a point 1.3 card heights below its top.
export function handSlots(fan: HandFan, count: number): { x: number; y: number; rot: number }[] {
  const gaps = Math.max(count - 1, 0);
  const step = count > 1 ? Math.max(0, Math.min(fan.maxStep, (fan.maxSpan - fan.cw) / gaps)) : 0;
  const span = gaps * step + fan.cw;
  return Array.from({ length: count }, (_, i) => {
    const d = i - gaps / 2;
    return { x: fan.cx - span / 2 + i * step, y: fan.top + fan.arc * d * d, rot: fan.rot * d };
  });
}

const HINGE_DEPTH = 1.3;

// A card of the hand as the page places its cards: by its centre, after the turn about its hinge.
export function handPlacement(fan: HandFan, count: number, slot: number): Placement {
  const slots = handSlots(fan, count);
  const at = slots[slot];
  const radians = (at.rot * Math.PI) / 180;
  const arm = (HINGE_DEPTH - 0.5) * fan.ch;
  const hinge = { x: at.x + fan.cw / 2, y: at.y + HINGE_DEPTH * fan.ch };
  return { x: hinge.x + arm * Math.sin(radians), y: hinge.y - arm * Math.cos(radians), rotation: at.rot };
}

export function cardSize(fan: HandFan): Size {
  return { w: fan.cw, h: fan.ch };
}

// A table unit's place in the window's own units: the table is drawn `2 * R / BOX` times its size
// with its centre at the circle's.
export function tableScale(layout: Pick<ScaledLayout, "table">): number {
  return (2 * layout.table.R) / BOX;
}

export function toWindow(layout: Pick<ScaledLayout, "table">, point: Point): Point {
  const k = tableScale(layout);
  return { x: layout.table.cx + (point.x - centre.x) * k, y: layout.table.cy + (point.y - centre.y) * k };
}

export function toTable(layout: Pick<ScaledLayout, "table">, point: Point): Point {
  const k = tableScale(layout);
  return { x: centre.x + (point.x - layout.table.cx) / k, y: centre.y + (point.y - layout.table.cy) / k };
}

// The room the bid strip has: the band across the table, less what the round chip takes of its top where
// the two meet. The strip is as wide as the band, centred on the table.
export function stripArea(layout: ScaledLayout, windowWidth: number, chipHeight: number = CHIP_HEIGHT): { x: number; w: number; top: number; bottom: number; mid: number } {
  const { band, bid } = layout;
  const chipLeft = windowWidth - CORNER_INSET - CHIP_WIDTH;
  const meets = bid.x + bid.w > chipLeft;
  const top = meets ? Math.max(band.top, CORNER_INSET + chipHeight + PLATE_GAP) : band.top;
  return { x: bid.x, w: bid.w, top, bottom: band.bottom, mid: (top + band.bottom) / 2 };
}
