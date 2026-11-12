import { centre, feltRadius, type Point, type Rect } from "../space";
import { MOST_CARDS, cardQuad, railRect } from "./rack";
import { type Place, places as placesOf, rackOrigin, stepsFromBottom } from "./seats";

// Where the name panels stand when each is drawn larger than the table's own size, as a small touch
// screen needs them to be read. A panel grows, then stands where it is nearest its own spot that no
// other panel, corner panel, bid strip or rack is in, and its rack slides along the rim to clear it.

// Table units: the view, which panels stand in; what no panel or rack may stand on; what no panel may
// stand on, the bid strip's place and the hand's, which racks stand under as they do; and the clear
// space left between things.
export interface Room {
  view: Rect;
  keep: readonly Rect[];
  covered: readonly Rect[];
  gap: number;
}

export interface Grown {
  // How many times larger than the table's own size the panels are drawn.
  grow: number;
  places: (Place | null)[];
}

// A convex shape, with the box round it, which is the whole of it for a rect.
export interface Shape {
  points: readonly Point[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  square: boolean;
}

// A rack with all its cards and its rail, in its frame: along the rim, and outward from it.
const RACK = (() => {
  const points = Array.from({ length: MOST_CARDS }, (_, index) => cardQuad(MOST_CARDS, index)).flat();
  const rail = railRect(MOST_CARDS);
  const xs = [...points.map((p) => p.x), ...(rail === null ? [] : [rail.x, rail.x + rail.w])];
  const ys = [...points.map((p) => p.y), ...(rail === null ? [] : [rail.y, rail.y + rail.h])];
  return { half: Math.ceil(Math.max(...xs.map(Math.abs))), out: Math.ceil(Math.max(...ys)), in: Math.ceil(-Math.min(...ys, 0)) };
})();
const RACK_STEP = (2 * Math.PI) / 180;
const RACK_MOST_STEPS = 30;

// The search for a panel's spot: coarse steps outward in squares, then fine steps about the best.
const COARSE_STEP = 48;
const FINE_STEP = 8;
const REACH = 1000;
const HALVINGS = 6;

function shapeOf(points: readonly Point[], square: boolean): Shape {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { points, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), square };
}

export function rectShape(rect: Rect, by = 0): Shape {
  const x = rect.x - by;
  const y = rect.y - by;
  const w = rect.w + 2 * by;
  const h = rect.h + 2 * by;
  return {
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    x0: x,
    y0: y,
    x1: x + w,
    y1: y + h,
    square: true,
  };
}

// Whether two convex shapes overlap: their boxes do, and no line along an edge of either has them
// on its two sides.
export function overlaps(a: Shape, b: Shape): boolean {
  if (a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0) {
    return false;
  }
  if (a.square && b.square) {
    return true;
  }
  for (const shape of [a, b]) {
    const corners = shape.points;
    for (let at = 0; at < corners.length; at++) {
      const from = corners[at];
      const to = corners[(at + 1) % corners.length];
      const axisX = from.y - to.y;
      const axisY = to.x - from.x;
      let lowA = Infinity;
      let highA = -Infinity;
      for (const p of a.points) {
        const along = p.x * axisX + p.y * axisY;
        lowA = Math.min(lowA, along);
        highA = Math.max(highA, along);
      }
      let lowB = Infinity;
      let highB = -Infinity;
      for (const p of b.points) {
        const along = p.x * axisX + p.y * axisY;
        lowB = Math.min(lowB, along);
        highB = Math.max(highB, along);
      }
      if (highA <= lowB || highB <= lowA) {
        return false;
      }
    }
  }
  return true;
}

// The room a rack takes standing on the rim at this angle, with every card it can hold, and `margin`
// more all round.
export function rackFootprint(angle: number, margin = 0): Shape {
  const origin = rackOrigin(angle);
  const outX = Math.cos(angle);
  const outY = Math.sin(angle);
  const half = RACK.half + margin;
  const corners: [number, number][] = [
    [-half, -RACK.in - margin],
    [half, -RACK.in - margin],
    [half, RACK.out + margin],
    [-half, RACK.out + margin],
  ];
  return shapeOf(
    corners.map(([along, out]) => ({ x: origin.x - along * outY + out * outX, y: origin.y + along * outX + out * outY })),
    false,
  );
}

// Whether a rect and the felt's circle, grown by `gap`, overlap.
function onFelt(rect: Rect, gap: number): boolean {
  const dx = Math.max(rect.x - centre.x, 0, centre.x - (rect.x + rect.w));
  const dy = Math.max(rect.y - centre.y, 0, centre.y - (rect.y + rect.h));
  const radius = feltRadius + gap;
  return dx * dx + dy * dy < radius * radius;
}

function within(rect: Rect, outer: Rect): boolean {
  return rect.x >= outer.x && rect.y >= outer.y && rect.x + rect.w <= outer.x + outer.w && rect.y + rect.h <= outer.y + outer.h;
}

// Where a rack stands for a panel: in line with it, or slid along the rim, to either side and as little
// as it can, until it clears everything in `avoid`. None if it does not within a sixth of the rim.
function rackAngleFor(panel: Rect, avoid: readonly Shape[]): number | null {
  const inLine = Math.atan2(panel.y + panel.h / 2 - centre.y, panel.x + panel.w / 2 - centre.x);
  for (let step = 0; step <= RACK_MOST_STEPS; step++) {
    for (const sign of step === 0 ? [0] : [1, -1]) {
      const angle = inLine + sign * step * RACK_STEP;
      const footprint = rackFootprint(angle);
      if (!avoid.some((shape) => overlaps(footprint, shape))) {
        return angle;
      }
    }
  }
  return null;
}

// The nearest spot to `start` that `fits`, or none within reach.
function nearest(start: Point, fits: (spot: Point) => boolean): Point | null {
  if (fits(start)) {
    return start;
  }
  let best: Point | null = null;
  let bestDistance = Infinity;
  const consider = (x: number, y: number): void => {
    const distance = Math.hypot(x - start.x, y - start.y);
    if (distance < bestDistance && fits({ x, y })) {
      best = { x, y };
      bestDistance = distance;
    }
  };
  for (let ring = 1; ring * COARSE_STEP <= REACH && ring * COARSE_STEP <= bestDistance; ring++) {
    const edge = ring * COARSE_STEP;
    for (let along = -ring; along <= ring; along++) {
      const offset = along * COARSE_STEP;
      consider(start.x + offset, start.y - edge);
      consider(start.x + offset, start.y + edge);
      if (Math.abs(along) < ring) {
        consider(start.x - edge, start.y + offset);
        consider(start.x + edge, start.y + offset);
      }
    }
  }
  const coarse = best as Point | null;
  if (coarse === null) {
    return null;
  }
  for (let dx = -COARSE_STEP; dx <= COARSE_STEP; dx += FINE_STEP) {
    for (let dy = -COARSE_STEP; dy <= COARSE_STEP; dy += FINE_STEP) {
      consider(coarse.x + dx, coarse.y + dy);
    }
  }
  return best;
}

// The seats in the order they are put down: clockwise from the bottom, a watcher's own seat last.
function orderOf(seatCount: number, humanSeat: number): number[] {
  const seats = Array.from({ length: seatCount }, (_, seat) => seat);
  const rank = (seat: number) => (stepsFromBottom(seatCount, humanSeat, seat) + seatCount - 1) % seatCount;
  return seats.sort((a, b) => rank(a) - rank(b));
}

// How far clockwise from the bottom of the rim an angle is, 0 to a whole turn.
function turnFromBottom(angle: number): number {
  const turn = (angle - Math.PI / 2) % (2 * Math.PI);
  return turn <= 0 ? turn + 2 * Math.PI : turn;
}

// Whether the racks stand round the rim in the order of the seats, clockwise from the bottom. A seat at
// the bottom itself comes last, a whole turn on.
function inOrder(seatCount: number, humanSeat: number, places: readonly (Place | null)[]): boolean {
  let last = 0;
  for (const seat of orderOf(seatCount, humanSeat)) {
    const angle = places[seat]?.angle;
    if (angle === null || angle === undefined) {
      continue;
    }
    let turn = turnFromBottom(angle);
    if (stepsFromBottom(seatCount, humanSeat, seat) === 0 && turn < Math.PI) {
      turn += 2 * Math.PI;
    }
    if (turn <= last) {
      return false;
    }
    last = turn;
  }
  return true;
}

function attempt(
  seatCount: number,
  humanSeat: number,
  grow: number,
  room: Room,
  natural: (Place | null)[],
  order: readonly number[],
): (Place | null)[] | null {
  const result: (Place | null)[] = [...natural];
  // What nothing stands on, each with the clear space round it: the corner panels, your own panel at the
  // bottom, and as they are put down the other panels and racks.
  const stands: Shape[] = room.keep.map((rect) => rectShape(rect, room.gap));
  const covered = room.covered.map((rect) => rectShape(rect, room.gap));
  for (const place of natural) {
    if (place !== null && place.human) {
      stands.push(rectShape(place.panel, room.gap));
    }
  }

  for (const seat of order) {
    const was = natural[seat];
    if (was === null || was.human) {
      continue;
    }
    const size = { w: was.panel.w * grow, h: was.panel.h * grow };
    const start = { x: was.panel.x + was.panel.w / 2, y: was.panel.y + was.panel.h / 2 };
    let chosen: Place | null = null;
    nearest(start, (spot) => {
      const panel: Rect = { x: spot.x - size.w / 2, y: spot.y - size.h / 2, ...size };
      if (!within(panel, room.view) || onFelt(panel, room.gap)) {
        return false;
      }
      const shape = rectShape(panel);
      if (covered.some((stand) => overlaps(shape, stand)) || stands.some((stand) => overlaps(shape, stand))) {
        return false;
      }
      const angle = rackAngleFor(panel, [...stands, rectShape(panel, room.gap)]);
      if (angle === null) {
        return false;
      }
      chosen = { panel, human: false, angle };
      return true;
    });
    const place = chosen as Place | null;
    if (place === null || place.angle === null) {
      return null;
    }
    result[seat] = place;
    stands.push(rectShape(place.panel, room.gap), rackFootprint(place.angle, room.gap));
  }
  return inOrder(seatCount, humanSeat, result) ? result : null;
}

// The seats put down clockwise from the bottom, or else anticlockwise: which one finds room first
// depends on which of two neighbours gets the room they both want.
function placeSeats(seatCount: number, humanSeat: number, grow: number, room: Room, natural: (Place | null)[]): (Place | null)[] | null {
  const clockwise = orderOf(seatCount, humanSeat);
  return attempt(seatCount, humanSeat, grow, room, natural, clockwise) ?? attempt(seatCount, humanSeat, grow, room, natural, [...clockwise].reverse());
}

// The panels drawn up to `wanted` times larger than the table's own size: the largest size, between
// that and none, that every seat has a place for. A table with no room to grow is as the table has it.
export function grownPlaces(seatCount: number, humanSeat: number, wanted: number, room: Room): Grown {
  const natural = placesOf(seatCount, humanSeat);
  const asIs: Grown = { grow: 1, places: natural };
  if (wanted <= 1 || natural.some((place) => place === null)) {
    return asIs;
  }
  const full = placeSeats(seatCount, humanSeat, wanted, room, natural);
  if (full !== null) {
    return { grow: wanted, places: full };
  }
  let fits: Grown = asIs;
  let low = 1;
  let high = wanted;
  for (let halving = 0; halving < HALVINGS; halving++) {
    const middle = (low + high) / 2;
    const tried = placeSeats(seatCount, humanSeat, middle, room, natural);
    if (tried === null) {
      high = middle;
    } else {
      low = middle;
      fits = { grow: middle, places: tried };
    }
  }
  return fits;
}
