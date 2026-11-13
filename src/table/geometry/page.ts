import { CHIP_WIDTH, CORNER_INSET, layoutScaled, playedPlace, tableScale, type Box, type Corners, type ScaledLayout, type ScaledWindow } from "./scaled";

// The scaled table as the page draws it. The mock-up keeps its bottom right corner for the two round buttons and
// holds the trump in the round chip. The page has the buttons bottom left, where the desktop has them, and the trump
// bottom right under the scores, drawn as large as a card played on the felt. The corners are what the seats, the hand
// and the side panels keep clear of, so they are inputs of layoutScaled and its own numbers stay the mock-up's.

// A round button, and the gap between the two at the foot of the window.
export const BUTTON = 48;
export const BUTTON_GAP = 10;

// The round chip holds the round and the trick's line, over two lines, and is as wide as the scores panel below it.
export const PAGE_CHIP_HEIGHT = 52;

// The word over the trump, with the gap under it, and the width its box has for the words that stand in the place of
// a card in a round with no trump.
export const TRUMP_LABEL = 14;
export const TRUMP_WIDTH = 72;

// The least room kept round a corner's controls, and the gap the hand keeps from them.
const ROOM = 6;
const HAND_GAP = 2;

// The side panels begin under the controls at the top, and the trump takes its card's height at most this tall.
const SIDE_TOP = CORNER_INSET + PAGE_CHIP_HEIGHT + 8;
const TRUMP_MOST = 140;

const CARD_WIDTH = 500 / 726;

export interface PageLayout extends ScaledLayout {
  // The two round buttons together, bottom left.
  buttons: Box;
  // The trump with its word, bottom right, and the card in it.
  trump: Box;
  trumpCard: { w: number; h: number };
  // The round chip, top right.
  chip: Box;
  // How tall a side panel may be: from where it starts down to what stands under it, the buttons at the left and the
  // trump at the right. Zero where there are no side panels.
  sideRoom: { left: number; right: number };
}

// What the corners hold when the trump's card is `trump` tall.
export function cornersFor(trump: number): Corners {
  const buttons = { w: CORNER_INSET + 2 * BUTTON + BUTTON_GAP + ROOM, h: CORNER_INSET + BUTTON + ROOM };
  const held = { w: CORNER_INSET + Math.max(TRUMP_WIDTH, trump * CARD_WIDTH) + ROOM, h: CORNER_INSET + TRUMP_LABEL + trump + ROOM };
  return {
    topLeft: { w: CORNER_INSET + BUTTON + CORNER_INSET, h: CORNER_INSET + BUTTON + CORNER_INSET },
    topRight: { w: CHIP_WIDTH + CORNER_INSET + ROOM, h: CORNER_INSET + PAGE_CHIP_HEIGHT + ROOM },
    bottomLeft: buttons,
    bottomRight: held,
    handLeft: buttons.w + HAND_GAP,
    handRight: held.w + HAND_GAP,
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
  const width = Math.max(TRUMP_WIDTH, low * CARD_WIDTH);
  const trump = { x: w - CORNER_INSET - width, y: foot - TRUMP_LABEL - low, w: width, h: TRUMP_LABEL + low };
  return {
    ...layout,
    buttons,
    trump,
    trumpCard: { w: low * CARD_WIDTH, h: low },
    chip: { x: w - CORNER_INSET - CHIP_WIDTH, y: CORNER_INSET, w: CHIP_WIDTH, h: PAGE_CHIP_HEIGHT },
    sideRoom: layout.side === null ? { left: 0, right: 0 } : { left: buttons.y - ROOM - layout.side.y, right: trump.y - ROOM - layout.side.y },
  };
}
