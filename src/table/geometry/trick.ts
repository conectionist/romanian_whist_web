import type { Phase } from "../../net/protocol";
import { centre, goldLineRadius, handTop, playedCardHeight, playedFromCentre, type Placement } from "../space";
import { frameRotation } from "./rack";
import { onCircle, place as seatPlace, type Place } from "./seats";

// Where a seat's played card lies: touching the logo, so the trick sits on one circle about it.
// Yours straight down and unturned; the others on their rack's angle, turned as their rack is.
export function cardPlacement(seatCount: number, place: Place): Placement {
  const radius = playedFromCentre + playedCardHeight(seatCount) / 2;
  if (place.human || place.angle === null) {
    return { x: centre.x, y: centre.y + radius, rotation: 0 };
  }
  const at = onCircle(place.angle, radius);
  return { ...at, rotation: frameRotation(place.angle) };
}

export function cardPlacementOf(seatCount: number, humanSeat: number, seat: number): Placement | null {
  const place = seatPlace(seatCount, humanSeat, seat);
  return place === null ? null : cardPlacement(seatCount, place);
}

// The lead mark's place: yours half way between your card's bottom edge and your hand's top, the
// others on the gold line at their rack's angle.
export function leadMarkPlacement(seatCount: number, place: Place): Placement {
  if (place.human || place.angle === null) {
    const cardBottom = centre.y + playedFromCentre + playedCardHeight(seatCount);
    return { x: centre.x, y: (cardBottom + handTop) / 2, rotation: 0 };
  }
  return { ...onCircle(place.angle, goldLineRadius), rotation: frameRotation(place.angle) };
}

export function leadMarkPlacementOf(seatCount: number, humanSeat: number, seat: number): Placement | null {
  const place = seatPlace(seatCount, humanSeat, seat);
  return place === null ? null : leadMarkPlacement(seatCount, place);
}

// Who the lead mark is on: in the play phase only, the first card's seat, which is still so while
// a full trick waits to be cleared, and with nothing down yet the seat that leads the trick about
// to start.
export function leadSeat(
  phase: Phase,
  seatCount: number,
  table: readonly { seat: number }[],
  ledBy: number | null,
): number | null {
  if (seatCount === 0 || phase !== "playing") {
    return null;
  }
  return table.length > 0 ? table[0].seat : ledBy;
}
