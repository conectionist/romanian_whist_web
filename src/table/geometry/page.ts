import { DESIGN } from "../layoutChoice";
import { CHIP_WIDTH, CORNER_INSET, FAN_TURN, SIDE_MIN, layoutScaled, playedPlace, tableScale, type Box, type Corners, type Room, type ScaledLayout, type ScaledWindow } from "./scaled";

// The scaled table as the page draws it: the round buttons bottom left, where the desktop has them, and the trump in the column
// at the left under the trick's details, or under the menu button with no room for them, as large as a played card. The corners
// are inputs of layoutScaled, whose own numbers stay the mock-up's.

// A round button, and the gap between the two at the foot of the window.
export const BUTTON = 48;
export const BUTTON_GAP = 10;

// The round chip holds the round and the trick's line, over two lines, and is as wide as the scores panel under it where
// there is one, and as wide as its words, and no wider than CHIP_WIDTH, where there is not.
export const PAGE_CHIP_HEIGHT = 52;

// The trump is in a panel like the trick's details, its word over its card in the middle. TRUMP_LABEL is the word with the gap
// under it, TRUMP_WIDTH the room for the card or for the words of a round with no trump, PANEL_X and PANEL_Y the panel's
// border and padding.
export const TRUMP_LABEL = 14;
export const TRUMP_WIDTH = 58;
export const PANEL_X = 11;
export const PANEL_Y = 19;

// The gap between the trick's details and the trump under them, and the least tall the trump's card is drawn.
export const COLUMN_GAP = 8;
export const TRUMP_LEAST = 28;

// The tallest the trick's details are: a title and two lines of what led and what wins, each on several lines in the
// narrowest panel.
export const TRICK_MOST = 100;

// The least room kept round a corner's controls, and the gap the hand keeps from them.
const ROOM = 6;
const HAND_GAP = 2;

// The column at the left begins under the menu button, and the side panels under the chip, which stands lower.
const MENU_BOTTOM = CORNER_INSET + BUTTON;
const COLUMN_TOP = MENU_BOTTOM + CORNER_INSET;
const SIDE_TOP = CORNER_INSET + PAGE_CHIP_HEIGHT + 8;
const TRUMP_MOST = 140;

const CARD_WIDTH = 500 / 726;

export interface PageLayout extends ScaledLayout {
  // The two round buttons together, bottom left.
  buttons: Box;
  // The trump's panel, which is as wide as `w` and as tall as `h`, and the card in it.
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
  const held = { w: CORNER_INSET + Math.max(TRUMP_WIDTH, trump * CARD_WIDTH) + 2 * PANEL_X + ROOM, h: COLUMN_TOP + TRUMP_LABEL + trump + PANEL_Y + ROOM };
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
function fitted(window: ScaledWindow, seatCount: number, room: Room): { layout: ScaledLayout; low: number } {
  let low = 0;
  let high = TRUMP_MOST;
  for (let step = 0; step < 16 && high - low > 0.1; step++) {
    const middle = (low + high) / 2;
    if (playedHeight(layoutScaled(window, seatCount, cornersFor(middle), room), seatCount) >= middle) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return { layout: layoutScaled(window, seatCount, cornersFor(low), room), low };
}

// The side panels matter during play, so where the table leaves them no room it gives way to them, down to this share of
// its wood and its played cards.
export const SIDE_SHRINK = 0.8;

// A side panel stands 16 from the table.
const BESIDE = SIDE_MIN + 16;

// Whether a window `w` wide and as tall as the design has the side panels: the table leaves them room, or does once it is
// drawn smaller, by no more than SIDE_SHRINK and with its plates no smaller. A wider window has more room, so a window has
// them from some width up.
export function hasSides(w: number, seatCount: number): boolean {
  const window = { w, h: DESIGN.h, top: 0, bottom: 0 };
  const full = fitted(window, seatCount, {}).layout;
  if (full.side !== null) {
    return true;
  }
  const smaller = fitted(window, seatCount, { beside: BESIDE }).layout;
  return (
    smaller.side !== null &&
    smaller.table.R >= SIDE_SHRINK * full.table.R &&
    playedHeight(smaller, seatCount) >= SIDE_SHRINK * playedHeight(full, seatCount) &&
    smaller.seats[1].scale >= full.seats[1].scale
  );
}

// The table with the page's corners, and the side panels where a window `across` wide and as tall as the design has
// them, drawing the table smaller for them where it must.
export function pageLayout(window: ScaledWindow, seatCount: number, across = window.w): PageLayout {
  const sides = hasSides(across, seatCount);
  let { layout, low } = fitted(window, seatCount, { sides });
  if (sides && layout.side === null) {
    ({ layout, low } = fitted(window, seatCount, { beside: BESIDE }));
  }
  const { w, h, bottom } = window;
  const foot = h - bottom - CORNER_INSET;
  const buttons = { x: CORNER_INSET, y: foot - BUTTON, w: 2 * BUTTON + BUTTON_GAP, h: BUTTON };
  const side = layout.side;
  const top = side === null ? COLUMN_TOP : side.y;
  // The column goes down to the round buttons, or, where it is wide enough to be over the left of the fan of the hand, to
  // the top of the hand. The width of the trump's panel is the trick's details' where there are some, so it does not
  // depend on the card.
  const lean = (layout.hand.ch / 2) * Math.sin((3.5 * FAN_TURN * Math.PI) / 180);
  const handLeft = layout.hand.cx - layout.hand.maxSpan / 2 - lean;
  const reach = (width: number) => (CORNER_INSET + width + ROOM > handLeft ? Math.min(buttons.y, layout.hand.top) : buttons.y) - ROOM - top;
  // The card is as tall as a played card, or as tall as the column leaves room for under the trick's details at their
  // tallest, which is less on a window as short as the design and with few players, whose played cards are large.
  const room = side === null ? Infinity : reach(side.w) - TRICK_MOST - COLUMN_GAP - TRUMP_LABEL - PANEL_Y;
  const card = Math.min(low, Math.max(24, room));
  // As wide as the trick's details above it, or, with none, as wide as its card and its word need.
  const trump = { w: side === null ? Math.max(TRUMP_WIDTH, card * CARD_WIDTH) + 2 * PANEL_X : side.w, h: TRUMP_LABEL + card + PANEL_Y };
  const width = side === null ? trump.w : side.w;
  const column = { x: CORNER_INSET, y: top, w: width, h: reach(width) };
  // With side panels the chip is as wide as the scores under it; without them it is as wide as its words, which
  // CHIP_WIDTH is the most of.
  const chip = side === null ? { x: w - CORNER_INSET - CHIP_WIDTH, y: CORNER_INSET, w: CHIP_WIDTH, h: PAGE_CHIP_HEIGHT } : { x: w - CORNER_INSET - side.w, y: CORNER_INSET, w: side.w, h: PAGE_CHIP_HEIGHT };
  return {
    ...layout,
    buttons,
    trump,
    trumpCard: { w: card * CARD_WIDTH, h: card },
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

// The short reason for a refused bid, or the bids so far, which the strip has no room for inside it, is in a panel of its
// own directly under the strip, so that the two read as one: NOTE_GAP under it, in its middle, and no wider than it. Its
// words are in two lines at most, NOTE_MOST tall; the panel is no narrower than NOTE_LEAST, or the words would take more.
export const NOTE_GAP = 4;
export const NOTE_MOST = 43;
export const NOTE_LEAST = 140;

export interface Note {
  cx: number;
  top: number;
  w: number;
}

// Where that panel goes: as wide as the strip, or as wide as the room between the plates beside the table that the panel
// is as low as, and clear of the top of the hand and so of your plate. Null where there is not room for that, and then the
// words stand above the hand.
export function noteBeside(layout: PageLayout, strip: { cx: number; w: number; bottom: number }): Note | null {
  const top = strip.bottom + NOTE_GAP;
  // It may touch the top of the hand's cards, and covers none of them.
  if (top + NOTE_MOST > layout.hand.top - HAND_GAP) {
    return null;
  }
  let half = strip.w / 2;
  for (const seat of layout.seats.slice(1)) {
    if (seat.y + seat.h + ROOM <= top || seat.y >= top + NOTE_MOST + ROOM) {
      continue;
    }
    half = Math.min(half, seat.x + seat.w / 2 > strip.cx ? seat.x - ROOM - strip.cx : strip.cx - (seat.x + seat.w + ROOM));
  }
  return 2 * half >= NOTE_LEAST ? { cx: strip.cx, top, w: 2 * half } : null;
}
