import type { SheetName } from "../play/sheets";

// Where a sheet is placed on the scaled table, as the Android plan sets out: a side sheet for a quick look at
// the table's records, a bottom sheet for what ends or pauses the game and for settings, a page of its own with
// its action in a bar for what is filled in before a table. The desktop's table has the centred dialog for all.
export type Placement = "dialog" | "side" | "bottom" | "page";

// What the layer calls a sheet: the sheets the flow names, and the menu list that replaces the pause and the
// offer to leave where the menu bar is gone.
export type SheetKey = SheetName | "menu";

const SIDE: readonly SheetKey[] = ["history", "last-trick", "scores"];
const PAGE: readonly SheetKey[] = ["new-game", "online", "create-table", "lobby"];

export function placementFor(name: SheetKey, scaled: boolean): Placement {
  if (!scaled) {
    return "dialog";
  }
  if (SIDE.includes(name)) {
    return "side";
  }
  return PAGE.includes(name) ? "page" : "bottom";
}

// A side sheet is as wide as this much of the window, up to the most, so the table stays in view beside it.
export const SIDE_SHARE = 0.46;
export const SIDE_MOST = 420;

export function sideWidthFor(windowWidth: number): number {
  return Math.min(SIDE_MOST, Math.round(windowWidth * SIDE_SHARE));
}

// The action a page holds in its bar: the one that does what the page is for.
export const PAGE_ACTION: Readonly<Record<string, string>> = {
  "new-game": "deal",
  online: "join",
  "create-table": "create",
  lobby: "start",
};
