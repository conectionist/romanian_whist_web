import { CHIP_WIDTH, CORNER_INSET, layoutScaled, playedPlace, tableScale, type Box, type Corners, type ScaledLayout, type ScaledWindow } from "./scaled";

// The scaled table as the page draws it. The mock-up keeps its bottom right corner for the two round buttons and
// holds the trump in the round chip. The page has the buttons bottom left, where the desktop has them, and the trump
// in the column at the left under the trick's details, or under the menu button where there is no room for them,
// drawn as large as a card played on the felt. The corners are what the seats, the hand and the side panels keep clear
// of, so they are inputs of layoutScaled and its own numbers stay the mock-up's.

// A round button, and the gap between the two at the foot of the window.
export const BUTTON = 48;
export const BUTTON_GAP = 10;

// The round chip holds the round and the trick's line, over two lines, and is as wide as the scores panel under it where
// there is one, and as wide as its words, and no wider than CHIP_WIDTH, where there is not.
export const PAGE_CHIP_HEIGHT = 52;

// The word over the trump, with the gap under it, and the width its box has for the words that stand in the place of
// a card in a round with no trump.
export const TRUMP_LABEL = 14;
export const TRUMP_WIDTH = 72;

// The gap between the trick's details and the trump under them.
export const COLUMN_GAP = 8;

// The tallest the trick's details are: a title and two lines of what led and what wins, each on several lines in the
// narrowest panel.
export const TRICK_MOST = 120;

// The least room kept round a corner's controls, and the gap the hand keeps from them.
const ROOM = 6;
const HAND_GAP = 2;

// The column at the left begins under the menu button; the side panels begin under the chip, which stands lower.
const MENU_BOTTOM = CORNER_INSET + BUTTON;
const COLUMN_TOP = MENU_BOTTOM + CORNER_INSET;
const SIDE_TOP = CORNER_INSET + PAGE_CHIP_HEIGHT + 8;
const TRUMP_MOST = 140;

const CARD_WIDTH = 500 / 726;

export interface PageLayout extends ScaledLayout {
  // The two round buttons together, bottom left.
  buttons: Box;
  // The trump with its word, which is as wide as `w` and as tall as `h`, and the card in it.
  trump: { w: number; h: number };
  trumpCard: { w: number; h: number };
  // The column at the left, from under the menu button down to the round buttons: the trick's details where there is
  // room for them, and the trump under them or, with no details, alone. `h` is all it may take.
  column: Box;
  // The round chip, top right.
  chip: Box;
  // How tall a side panel may be, where there are side panels: the scores down to the foot of the window, and the
  // trick's details down to where the trump and the round buttons begin. Zero where there are none.
  sideRoom: { left: number; right: number };
}

// What the corners hold when the trump's card is `trump` tall.
export function cornersFor(trump: number): Corners {
  const buttons = { w: CORNER_INSET + 2 * BUTTON + BUTTON_GAP + ROOM, h: CORNER_INSET + BUTTON + ROOM };
  // Where there are no side panels the trump stands under the menu button.
  const held = { w: CORNER_INSET + Math.max(TRUMP_WIDTH, trump * CARD_WIDTH) + ROOM, h: COLUMN_TOP + TRUMP_LABEL + trump + ROOM };
  return {
    topLeft: { w: Math.max(CORNER_INSET + BUTTON + CORNER_INSET, held.w), h: held.h },
    topRight: { w: CHIP_WIDTH + CORNER_INSET + ROOM, h: CORNER_INSET + PAGE_CHIP_HEIGHT + ROOM },
    bottomLeft: buttons,
    bottomRight: { w: 0, h: 0 },
    handLeft: buttons.w + HAND_GAP,
    handRight: 16,
    sideTop: SIDE_TOP,
  };
}

// How tall a card played on the felt is drawn, in the window's units.
export function playedHeight(layout: ScaledLayout, seatCount: number): number {
  return playedPlace(seatCount, Math.PI / 2, layout).h * tableScale(layout);
}

// The table with the page's corners. The trump is as tall as a played card, and a played card is as tall as the room
// the trump leaves allows, so the trump's height is the one at which the two agree: the largest that is no taller than
// the card the layout then plays.
export function pageLayout(window: ScaledWindow, seatCount: number): PageLayout {
  let low = 0;
  let high = TRUMP_MOST;
  for (let step = 0; step < 16 && high - low > 0.1; step++) {
    const middle = (low + high) / 2;
    if (playedHeight(layoutScaled(window, seatCount, cornersFor(middle)), seatCount) >= middle) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const layout = layoutScaled(window, seatCount, cornersFor(low));
  const { w, h, bottom } = window;
  const foot = h - bottom - CORNER_INSET;
  const buttons = { x: CORNER_INSET, y: foot - BUTTON, w: 2 * BUTTON + BUTTON_GAP, h: BUTTON };
  const trump = { w: Math.max(TRUMP_WIDTH, low * CARD_WIDTH), h: TRUMP_LABEL + low };
  const side = layout.side;
  const top = side === null ? COLUMN_TOP : side.y;
  const column = { x: CORNER_INSET, y: top, w: side === null ? trump.w : side.w, h: buttons.y - ROOM - top };
  // With side panels the chip is as wide as the scores under it; without them it is as wide as its words, which
  // CHIP_WIDTH is the most of.
  const chip = side === null ? { x: w - CORNER_INSET - CHIP_WIDTH, y: CORNER_INSET, w: CHIP_WIDTH, h: PAGE_CHIP_HEIGHT } : { x: w - CORNER_INSET - side.w, y: CORNER_INSET, w: side.w, h: PAGE_CHIP_HEIGHT };
  return {
    ...layout,
    buttons,
    trump,
    trumpCard: { w: low * CARD_WIDTH, h: low },
    column,
    chip,
    sideRoom: side === null ? { left: 0, right: 0 } : { left: column.h, right: foot - side.y },
  };
}

// The bid strip is as wide as the band across the table, which leaves the trump alone under the menu button no room
// where the two meet: the strip keeps to the right of the trump then, and as far from the other edge, so that it is
// still in the middle. With side panels the trump is in their column, which the band is clear of.
export function stripBeside(layout: PageLayout, area: { x: number; w: number; mid: number }, height: number): { x: number; w: number } {
  if (layout.side !== null) {
    return { x: area.x, w: area.w };
  }
  const meets = area.mid - height / 2 < layout.column.y + layout.trump.h + ROOM && area.mid + height / 2 > layout.column.y - ROOM;
  const limit = layout.column.x + layout.trump.w + ROOM;
  if (!meets || area.x >= limit) {
    return { x: area.x, w: area.w };
  }
  const half = layout.table.cx - limit;
  return { x: layout.table.cx - half, w: 2 * half };
}
