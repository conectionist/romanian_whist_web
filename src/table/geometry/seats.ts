import { bottomPanel, centre, panelSize, panelSpot, rackRadius, type Point, type Rect } from "../space";

// The top-left corner of each panel, by player count, from the first seat clockwise of the bottom
// one. Hand-tuned, so copied rather than derived. Two players take the four- and six-player
// rows' top spot.
const PANEL_CORNERS: readonly (readonly Point[])[] = [
  [{ x: 628, y: -140 }],
  [
    { x: 96, y: 49 },
    { x: 1160, y: 49 },
  ],
  [
    { x: -34, y: 453 },
    { x: 628, y: -140 },
    { x: 1290, y: 453 },
  ],
  [
    { x: -24, y: 611 },
    { x: 96, y: 49 },
    { x: 1160, y: 49 },
    { x: 1280, y: 611 },
  ],
  [
    { x: 1, y: 700 },
    { x: 96, y: 49 },
    { x: 628, y: -140 },
    { x: 1160, y: 49 },
    { x: 1255, y: 700 },
  ],
];

export const FEWEST_SEATS = 2;
export const MOST_SEATS = FEWEST_SEATS + PANEL_CORNERS.length - 1;

// How far a rack keeps clear of its own panel, the step it slides by, how far it may slide, and
// the extra it takes once clear.
const RACK_CLEARANCE = 10;
const RACK_SLIDE_STEP = Math.PI / 180;
const RACK_MOST_STEPS = 90;
const RACK_SLIDE_EXTRA = (9 * Math.PI) / 180;

// Whether somebody sits at the table: `humanSeat` is an index, or -1 for a watcher. An index past
// the table is read as -1.
export function humanSeated(seatCount: number, humanSeat: number): boolean {
  return humanSeat >= 0 && humanSeat < seatCount;
}

// How many seats clockwise this seat is from the one at the bottom: yours, or seat 0 for a
// watcher.
export function stepsFromBottom(seatCount: number, humanSeat: number, seat: number): number {
  if (seatCount === 0) {
    return 0;
  }
  const bottomSeat = humanSeated(seatCount, humanSeat) ? humanSeat : 0;
  return (seat + seatCount - bottomSeat) % seatCount;
}

// A seat's name panel in table space; null for a table the layout has no row for, or a seat that
// is not at it.
export function panelRect(seatCount: number, humanSeat: number, seat: number): Rect | null {
  if (seatCount < FEWEST_SEATS || seatCount > MOST_SEATS || seat < 0 || seat >= seatCount) {
    return null;
  }
  const steps = stepsFromBottom(seatCount, humanSeat, seat);
  if (steps === 0) {
    return { ...bottomPanel };
  }
  const corner = PANEL_CORNERS[seatCount - FEWEST_SEATS][steps - 1];
  const spotCentre = { x: corner.x + panelSpot.w / 2, y: corner.y + panelSpot.h / 2 };
  return {
    x: spotCentre.x - panelSize.w / 2,
    y: spotCentre.y - panelSize.h / 2,
    w: panelSize.w,
    h: panelSize.h,
  };
}

// The point `radius` from the table's centre at `angle`, in radians with y down.
export function onCircle(angle: number, radius: number): Point {
  return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
}

// The point on the rim a rack stands at.
export function rackOrigin(angle: number): Point {
  return onCircle(angle, rackRadius);
}

// Where a seat's rack stands on the rim, as an angle in radians with y down: in line with the
// panel's centre, unless the rim there is under the panel itself, and then slid clockwise until it
// is clear of the panel grown by 10, and 9 degrees more.
export function rackAngle(panel: Rect): number {
  const middle = { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 };
  const left = panel.x - RACK_CLEARANCE;
  const right = panel.x + panel.w + RACK_CLEARANCE;
  const top = panel.y - RACK_CLEARANCE;
  const bottom = panel.y + panel.h + RACK_CLEARANCE;

  // Strictly inside: a rim point on the grown panel's very edge is clear.
  const covered = (angle: number): boolean => {
    const at = rackOrigin(angle);
    return at.x > left && at.x < right && at.y > top && at.y < bottom;
  };

  let angle = Math.atan2(middle.y - centre.y, middle.x - centre.x);
  if (covered(angle)) {
    for (let step = 0; step < RACK_MOST_STEPS && covered(angle); step++) {
      angle += RACK_SLIDE_STEP;
    }
    angle += RACK_SLIDE_EXTRA;
  }
  return angle;
}

// Where a seat is, worked out once: its panel, whether it is yours (drawn at the bottom above your
// hand, with no rack) and otherwise its rack's angle, which its rack, its played card and the lead
// mark line up with.
export interface Place {
  panel: Rect;
  human: boolean;
  angle: number | null;
}

export function place(seatCount: number, humanSeat: number, seat: number): Place | null {
  const panel = panelRect(seatCount, humanSeat, seat);
  if (panel === null) {
    return null;
  }
  const human = humanSeated(seatCount, humanSeat) && humanSeat === seat;
  return { panel, human, angle: human ? null : rackAngle(panel) };
}

export function places(seatCount: number, humanSeat: number): (Place | null)[] {
  return Array.from({ length: seatCount }, (_, seat) => place(seatCount, humanSeat, seat));
}
