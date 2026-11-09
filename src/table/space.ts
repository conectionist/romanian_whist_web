// The table's own coordinates, and the only place their numbers are written: a fixed space of CSS
// pixels that the view scales to the window. Ported from the desktop's src/table/TableSpace.h.

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Point, Size {}

// A card's or a mark's place: its centre in table space, and its turn in degrees.
export interface Placement extends Point {
  rotation: number;
}

export const stage: Size = { w: 1536, h: 1024 };
export const centre: Point = { x: 768, y: 512 };

// What is fitted to the window: the stage and the room round it for the name panels, which sit
// outside the table.
export const fitBox: Rect = { x: -172, y: -150, w: 1880, h: 1324 };

// The gap left round the fit box, in pixels of the window: at each side, under the menu bar, and
// at the bottom.
export const marginX = 16;
export const marginTop = 10;
export const marginBottom = 8;

export const minimumScale = 0.36;

export const woodRadius = 510;
export const feltRadius = 440;
export const beadInnerRadius = 449;
export const beadMiddleRadius = 451;
export const beadOuterRadius = 453;
// By its outer edge: the line runs from 414.5 to 416.
export const goldLineRadius = 416;
export const goldLineWidth = 1.5;
export const logoDiameter = 215;
export const tableShadowBlur = 70;

export const handCardHeight = 225;
export const handTop = 850;
// Every played card lies with its inner edge this far from the centre, touching the logo.
export const playedFromCentre = logoDiameter / 2;

// The spot a panel was tuned for, and every panel's size.
export const panelSpot: Size = { w: 280, h: 118 };
export const panelSize: Size = { w: 259, h: 118 };

export const rackRadius = 452;
export const rackCardHeight = 90;

export const bottomPanel: Rect = { x: 768 - panelSize.w / 2, y: 1046, w: panelSize.w, h: panelSize.h };

// The corner panels sit this far in from their corner of the window, and are drawn at the table's
// scale; the trick panel and the scoreboard a fifth larger.
export const hudInset = 8;
export const hudScale = 1.2;
export const buttonGap = 14;

export const bidStripOrigin: Point = { x: 428, y: 486 };
export const bidStripWidth = 680;

// The square a circle of this radius about the centre sits in.
export function squareAround(radius: number): Rect {
  return { x: centre.x - radius, y: centre.y - radius, w: 2 * radius, h: 2 * radius };
}

// The scale that fits the box, margins and all, into a viewport of this size. Zero when the
// viewport has no room left inside its margins.
export function fitScale(viewport: Size): number {
  const width = viewport.w - 2 * marginX;
  const height = viewport.h - marginTop - marginBottom;
  if (width <= 0 || height <= 0) {
    return 0;
  }
  return Math.min(width / fitBox.w, height / fitBox.h);
}

// A played card's height: the larger size up to four seats, the smaller from five, where six cards
// have to share the felt.
export function playedCardHeight(seatCount: number): number {
  return seatCount <= 4 ? 205.2 : 181.2;
}

// The stacking order, bottom to top. The room is the view's background, under all of it.
export const z = {
  table: 0,
  racks: 10,
  playedCards: 20,
  leadMark: 30,
  hand: 40,
  // A card leaving your hand passes over the fan it leaves, and under your panel.
  flyingCard: 45,
  humanPanel: 50,
  panels: 60,
  bubbles: 65,
  hud: 70,
  bidStrip: 80,
} as const;
