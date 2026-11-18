import { rackCardHeight, type Point, type Rect, type Size } from "../space";

// What goes where in a rack, from the desktop's src/table/RackItem.cpp. The frame has its origin on
// the rim, +x along it and +y outward, and frameRotation() turns it into place. A card stands tilted
// 50 degrees out of the table, seen through a perspective, so it is a flat picture drawn through a quad.

export const MOST_CARDS = 8;

const CARD_SPACING = 26;
const FAN_STEP = (-2 * Math.PI) / 180;
const CARD_TOP = 4;
const TILT = (50 * Math.PI) / 180;
const PERSPECTIVE = 300;
const PERSPECTIVE_ORIGIN_Y = 40;

export const CARD_RADIUS = 4;
export const CARD_EDGE = 1;

export const RAIL_OVERHANG = 16;
const RAIL_TOP = -9;
const RAIL_HEIGHT = 16;
export const RAIL_RADIUS = 3;
const RAIL_RAISE = 8;
export const RAIL_EDGE = 1;

export function cardSize(): Size {
  return { w: 62, h: rackCardHeight };
}

// A point in the rack's own 3D space, through its perspective. z is toward the viewer, so a point
// raised off the table is magnified about the perspective's origin.
function project(x: number, y: number, z: number): Point {
  const k = PERSPECTIVE / (PERSPECTIVE - z);
  return { x: x * k, y: PERSPECTIVE_ORIGIN_Y + (y - PERSPECTIVE_ORIGIN_Y) * k };
}

// The four corners card `index` of `count` projects to, in the rack's frame: top-left, top-right,
// bottom-right, bottom-left of the flat card. The card is tilted, then turned, then moved along the
// row, and only then projected. Empty for an index the rack has no card at.
export function cardQuad(count: number, index: number): Point[] {
  if (index < 0 || index >= count) {
    return [];
  }
  const along = index - (count - 1) / 2;
  const shift = along * CARD_SPACING;
  const turn = along * FAN_STEP;

  const size = cardSize();
  const half = size.w / 2;
  const flat: Point[] = [
    { x: -half, y: 0 },
    { x: half, y: 0 },
    { x: half, y: size.h },
    { x: -half, y: size.h },
  ];

  return flat.map((corner) => {
    const down = corner.y * Math.cos(TILT);
    const up = corner.y * Math.sin(TILT);
    const x = corner.x * Math.cos(turn) - down * Math.sin(turn);
    const y = corner.x * Math.sin(turn) + down * Math.cos(turn);
    return project(x + shift, y + CARD_TOP, up);
  });
}

// Qt's row-vector transform: a point (x, y) goes to
// ((m11 x + m21 y + m31) / w, (m12 x + m22 y + m32) / w), with w = m13 x + m23 y + m33.
export interface Transform {
  m11: number;
  m12: number;
  m13: number;
  m21: number;
  m22: number;
  m23: number;
  m31: number;
  m32: number;
  m33: number;
}

export const IDENTITY: Transform = { m11: 1, m12: 0, m13: 0, m21: 0, m22: 1, m23: 0, m31: 0, m32: 0, m33: 1 };

export function mapPoint(m: Transform, p: Point): Point {
  const w = m.m13 * p.x + m.m23 * p.y + m.m33;
  return { x: (m.m11 * p.x + m.m21 * p.y + m.m31) / w, y: (m.m12 * p.x + m.m22 * p.y + m.m32) / w };
}

// QTransform::squareToQuad: the unit square onto a quad, projectively unless the quad is a
// parallelogram.
function squareToQuad(quad: readonly Point[]): Transform | null {
  const [p0, p1, p2, p3] = quad;
  const ax = p0.x - p1.x + p2.x - p3.x;
  const ay = p0.y - p1.y + p2.y - p3.y;
  if (ax === 0 && ay === 0) {
    return { m11: p1.x - p0.x, m12: p1.y - p0.y, m13: 0, m21: p2.x - p1.x, m22: p2.y - p1.y, m23: 0, m31: p0.x, m32: p0.y, m33: 1 };
  }
  const ax1 = p1.x - p2.x;
  const ax2 = p3.x - p2.x;
  const ay1 = p1.y - p2.y;
  const ay2 = p3.y - p2.y;
  const gTop = ax * ay2 - ax2 * ay;
  const hTop = ax1 * ay - ax * ay1;
  const bottom = ax1 * ay2 - ax2 * ay1;
  if (bottom === 0) {
    return null;
  }
  const g = gTop / bottom;
  const h = hTop / bottom;
  return {
    m11: p1.x - p0.x + g * p1.x,
    m12: p1.y - p0.y + g * p1.y,
    m13: g,
    m21: p3.x - p0.x + h * p3.x,
    m22: p3.y - p0.y + h * p3.y,
    m23: h,
    m31: p0.x,
    m32: p0.y,
    m33: 1,
  };
}

// The flat card, (0, 0) to its size, onto cardQuad(): what a card in the rack is drawn through.
// QTransform::quadToQuad, for a rectangle, is a scale to the unit square and then squareToQuad.
export function cardTransform(count: number, index: number): Transform {
  const quad = cardQuad(count, index);
  const mapped = quad.length === 4 ? squareToQuad(quad) : null;
  if (mapped === null) {
    return IDENTITY;
  }
  const size = cardSize();
  return {
    m11: mapped.m11 / size.w,
    m12: mapped.m12 / size.w,
    m13: mapped.m13 / size.w,
    m21: mapped.m21 / size.h,
    m22: mapped.m22 / size.h,
    m23: mapped.m23 / size.h,
    m31: mapped.m31,
    m32: mapped.m32,
    m33: mapped.m33,
  };
}

// The same card drawn on a flat picture `scale` times as large in each direction: the picture's
// own pixels go through it, so the art can be sampled at the far end's magnification.
export function scaledSource(m: Transform, scale: number): Transform {
  return {
    ...m,
    m11: m.m11 / scale,
    m12: m.m12 / scale,
    m13: m.m13 / scale,
    m21: m.m21 / scale,
    m22: m.m22 / scale,
    m23: m.m23 / scale,
  };
}

// The transform as CSS's matrix3d writes it, column by column.
export function cssMatrix3d(m: Transform): string {
  const numbers = [m.m11, m.m12, 0, m.m13, m.m21, m.m22, 0, m.m23, 0, 0, 1, 0, m.m31, m.m32, 0, m.m33];
  return `matrix3d(${numbers.map((value) => (Math.abs(value) < 1e-12 ? 0 : value)).join(",")})`;
}

// How a card's art is laid on the flat card: scaled to fill it and, for a face, turned half round,
// since a card worn on the forehead hangs from the rail and reads from its top at the raised end.
// As a CSS matrix(a, b, c, d, e, f).
export function artTransform(art: Size, face: boolean): [number, number, number, number, number, number] {
  const size = cardSize();
  const sx = size.w / art.w;
  const sy = size.h / art.h;
  return face ? [-sx, 0, 0, -sy, size.w, size.h] : [sx, 0, 0, sy, 0, 0];
}

// How much a card's far edge is magnified by the perspective.
export function farMagnification(): number {
  return PERSPECTIVE / (PERSPECTIVE - cardSize().h * Math.sin(TILT));
}

// The rail the cards stand in, lying on the rim across their near edges: the row's width plus 16,
// from 9 toward the table to 7 past the cards' top edge, and raised 8 toward the viewer. Null with
// no cards.
export function railRect(count: number): Rect | null {
  if (count === 0) {
    return null;
  }
  const width = (count - 1) * CARD_SPACING + cardSize().w + RAIL_OVERHANG;
  const topLeft = project(-width / 2, RAIL_TOP, RAIL_RAISE);
  const bottomRight = project(width / 2, RAIL_TOP + RAIL_HEIGHT, RAIL_RAISE);
  return { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y };
}

// How much the perspective magnifies the rail, which is raised.
export function railScale(): number {
  return PERSPECTIVE / (PERSPECTIVE - RAIL_RAISE);
}

function united(a: Rect, b: Rect): Rect {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function boundingRect(points: readonly Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top };
}

// Everything a rack of `count` draws, shadows aside: the cards and the rail. Null with no cards.
export function extent(count: number): Rect | null {
  let all = railRect(count);
  if (all === null) {
    return null;
  }
  for (let index = 0; index < count; index++) {
    all = united(all, boundingRect(cardQuad(count, index)));
  }
  return all;
}

// IEEE remainder: x less the nearest multiple of y, ties to the even one.
function remainder(x: number, y: number): number {
  const quotient = x / y;
  let nearest = Math.round(quotient);
  if (Math.abs(quotient - Math.trunc(quotient)) === 0.5 && nearest % 2 !== 0) {
    nearest -= 1;
  }
  return x - nearest * y;
}

// The rack's turn in degrees, for a rack at `angle` (radians, y down): the frame turned so that
// its +y points from the table's centre out through the rack. In (-180, 180], and a quarter turn
// exactly when it is one.
export function frameRotation(angle: number): number {
  let turn = remainder((angle * 180) / Math.PI - 90, 360);
  const quarters = Math.round(turn / 90) * 90;
  if (Math.abs(turn - quarters) < 1e-9) {
    turn = quarters;
  }
  if (turn <= -180) {
    turn += 360;
  }
  return turn;
}
