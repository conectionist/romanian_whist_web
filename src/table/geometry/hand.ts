import { centre, handTop, type Placement, type Point, type Rect, type Size } from "../space";

// The fan's shape, ported from the desktop's src/table/HandItem.cpp. The cards step this far apart,
// and the fan is never wider than the second number: a hand of eight 155-wide cards would be 743
// at the full step, so it closes up.
const WIDEST_STEP = 84;
const WIDEST_FAN = 720;

// Each card drops this much times the square of how many steps it is from the middle.
const ARC = 1.6;

// Each is turned this many degrees per step from the middle, about a hinge this many of its own
// heights below its top.
const TURN_STEP = 1.9;
const HINGE_DEPTH = 1.3;

// Where card `slot` of a hand of `count` goes: its centre, and its turn in degrees. The card is
// turned about its hinge, which sits below it, so the centre goes where that carries it.
export function cardPlacement(count: number, slot: number, card: Size): Placement {
  const gaps = count > 1 ? count - 1 : 0;

  // Never below zero: a card wider than the whole fan would lay each card left of the one before
  // it while still drawing it on top.
  const step = count > 1 ? Math.max(0, Math.min(WIDEST_STEP, (WIDEST_FAN - card.w) / gaps)) : 0;
  const span = gaps * step + card.w;

  const fromMiddle = slot - gaps / 2;
  const left = centre.x - span / 2 + slot * step;
  const top = handTop + ARC * fromMiddle * fromMiddle;
  const degrees = TURN_STEP * fromMiddle;

  const radians = (degrees * Math.PI) / 180;
  const arm = (HINGE_DEPTH - 0.5) * card.h;
  const hinge = { x: left + card.w / 2, y: top + HINGE_DEPTH * card.h };

  return { x: hinge.x + arm * Math.sin(radians), y: hinge.y - arm * Math.cos(radians), rotation: degrees };
}

// The most cards a hand holds.
export const MOST_IN_HAND = 8;

// The room the fan takes with all the cards a hand holds, drawn scaled about a point: the box round
// every card, turned as it is.
export function fanBounds(card: Size, scale: number, origin: Point): Rect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let slot = 0; slot < MOST_IN_HAND; slot++) {
    const place = scaledAbout(cardPlacement(MOST_IN_HAND, slot, card), scale, origin);
    const turn = (place.rotation * Math.PI) / 180;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = (sx * card.w * scale) / 2;
      const y = (sy * card.h * scale) / 2;
      xs.push(place.x + x * Math.cos(turn) - y * Math.sin(turn));
      ys.push(place.y + x * Math.sin(turn) + y * Math.cos(turn));
    }
  }
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top };
}

// Where a card rests when the whole fan is drawn scaled about a point, as the stylesheet does on a touch
// screen: the card's centre goes along the line from that point, and its turn is its own.
export function scaledAbout(place: Placement, scale: number, origin: Point): Placement {
  return { x: origin.x + (place.x - origin.x) * scale, y: origin.y + (place.y - origin.y) * scale, rotation: place.rotation };
}
