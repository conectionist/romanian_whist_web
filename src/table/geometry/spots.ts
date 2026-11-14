import { centre, playedCardHeight, rackRadius, type Placement, type Point, type Rect } from "../space";
import {
  BOX_CENTRE,
  LOGO_RADIUS,
  handPlacement,
  playedPlace,
  tableScale,
  toTable,
  type HandFan,
  type ScaledLayout,
} from "./scaled";
import type { Look } from "../seatPanel";
import { frameRotation } from "./rack";
import { humanSeated, places as placesOf, stepsFromBottom } from "./seats";
import { cardPlacement, leadMarkPlacement } from "./trick";

// Where one seat is drawn, whichever table the window has. The name panel is in the space the panel
// is mounted in (the table's own units on the desktop, the window's on the scaled table); everything
// else is in the table's units, since the racks, the played cards and the lead mark are drawn there.
export interface Spot {
  panel: Rect;
  // How the panel is drawn there.
  look: Look;
  human: boolean;
  // Where the seat's rack stands: its direction from the centre, and the circle it stands on. None for
  // yours, which is the fan.
  rack: { angle: number; radius: number } | null;
  played: Placement;
  leadMark: Placement;
  // The panel's middle: where a computer player's card starts and a trick is swept to.
  centre: Point;
}

// What a table of this many seats is drawn from.
export interface Arrangement {
  spots: (Spot | null)[];
  // A played card's height, in table units.
  playedHeight: number;
}

// The desktop's table: the panels at the corners the desktop puts them at, the racks on the rim.
export function desktopArrangement(seatCount: number, humanSeat: number): Arrangement {
  const spots = placesOf(seatCount, humanSeat).map((place): Spot | null => {
    if (place === null) {
      return null;
    }
    const { panel } = place;
    return {
      panel,
      look: "plaque",
      human: place.human,
      rack: place.human || place.angle === null ? null : { angle: place.angle, radius: rackRadius },
      played: cardPlacement(seatCount, place),
      leadMark: leadMarkPlacement(seatCount, place),
      centre: { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 },
    };
  });
  return { spots, playedHeight: playedCardHeight(seatCount) };
}

// The scaled table: each seat on the line from the centre that the desktop seats it on, its plate in
// over the wood, its rack, card and lead mark on that line, nearer the centre.
export function scaledArrangement(layout: ScaledLayout, seatCount: number, humanSeat: number): Arrangement {
  const woodLeft = centre.x - BOX_CENTRE;
  const woodTop = centre.y - BOX_CENTRE;
  const spots: (Spot | null)[] = [];
  for (let seat = 0; seat < seatCount; seat++) {
    const step = stepsFromBottom(seatCount, humanSeat, seat);
    const plate = layout.seats[step];
    const angle = layout.angles[step];
    if (plate === undefined || angle === undefined) {
      spots.push(null);
      continue;
    }
    const human = humanSeated(seatCount, humanSeat) && humanSeat === seat;
    const card = playedPlace(seatCount, angle, layout);
    const played = { x: woodLeft + card.x + card.w / 2, y: woodTop + card.y + card.h / 2, rotation: frameRotation(angle) };

    // Yours sits between your card and your hand, as the desktop puts it; the others on the circle
    // that leaves their cards and their racks room.
    let radius = layout.pipR;
    if (step === 0) {
      const handTop = toTable(layout, { x: layout.table.cx, y: layout.hand.top });
      radius = Math.min(layout.pipR, (LOGO_RADIUS * layout.logoK + card.h + (handTop.y - centre.y)) / 2);
    }
    const leadMark = {
      x: woodLeft + BOX_CENTRE + Math.cos(angle) * radius,
      y: woodTop + BOX_CENTRE + Math.sin(angle) * radius,
      rotation: frameRotation(angle),
    };
    spots.push({
      panel: { x: plate.x, y: plate.y, w: plate.w, h: plate.h },
      look: plate.kind,
      human,
      rack: human ? null : { angle, radius: layout.rackR },
      played,
      leadMark,
      centre: toTable(layout, { x: plate.x + plate.w / 2, y: plate.y + plate.h / 2 }),
    });
  }
  const height = (seatCount <= 4 ? 205.2 : 181.2) * layout.boost;
  return { spots, playedHeight: height };
}

// The fan the scaled table draws, and where a card of it is, in the window's own units and in the
// table's.
export interface ScaledFan {
  fan: HandFan;
  place(count: number, slot: number): Placement;
  // A point of the window in the table's units, which a card leaving the hand starts its flight from.
  toTable(point: Point): Point;
  // How far a table unit reaches, in the window's units.
  scale: number;
}

export function scaledFan(layout: ScaledLayout): ScaledFan {
  return {
    fan: layout.hand,
    place: (count, slot) => handPlacement(layout.hand, count, slot),
    toTable: (point) => toTable(layout, point),
    scale: tableScale(layout),
  };
}
