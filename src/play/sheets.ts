import type { StoreState } from "./store";

// Which sheet is up, as MainWindow arranges them: the pause menu, the round sheet that waits for you
// and the end of the game stand over the table, and the sheets the menu bar and the corner buttons
// open stand over those. One at a time, and decided here from what the store holds and what the
// player has asked for, so a sync can be shown the same way as any message.

export type MenuSheet = "history" | "last-trick" | "rules" | "settings";
export type SheetName = MenuSheet | "round" | "game-over" | "pause";

// What the player has asked for.
export interface UiState {
  // A sheet from the menu bar or a corner button, over everything.
  menu: MenuSheet | null;
  // The pause menu, which Esc and Exit raise.
  pauseMenu: boolean;
}

export const NOTHING_ASKED: UiState = { menu: null, pauseMenu: false };

export function atTable(state: Pick<StoreState, "table">): boolean {
  return state.table !== null;
}

export function isSolo(state: Pick<StoreState, "table">): boolean {
  return state.table?.mode === "solo";
}

// Whether the game at the table has ended, by what the server said or what the snapshot shows. A
// table's state turns to finished only after the game's own end, so both are asked.
export function gameFinished(state: Pick<StoreState, "table" | "snapshot" | "result" | "stopped">): boolean {
  if (state.result !== null || state.stopped || state.table?.state === "finished") {
    return true;
  }
  const status = state.snapshot?.status;
  return status === "finished" || status === "stopped";
}

// Whether a game is being played: the pause has something to hold and something to raise over.
export function gameOn(state: Pick<StoreState, "table" | "snapshot" | "result" | "stopped">): boolean {
  return state.table?.state === "playing" && state.snapshot !== null && !gameFinished(state);
}

// The pause menu opens over a game being played, but not over a round sheet that holds the game: that
// sheet has its own way on and its own hold, and a pause over it would be a second sheet on the
// first.
export function canPause(state: Pick<StoreState, "table" | "snapshot" | "result" | "stopped" | "held">): boolean {
  return gameOn(state) && state.held === null;
}

export function sheetFor(state: StoreState, ui: UiState): SheetName | null {
  if (ui.menu !== null) {
    return ui.menu;
  }
  if (!atTable(state)) {
    return null;
  }
  if (ui.pauseMenu && canPause(state)) {
    return "pause";
  }
  if (gameFinished(state)) {
    return "game-over";
  }
  return state.held !== null && gameOn(state) ? "round" : null;
}

// Whether the game should be held by the server for the sheet that is up: only a solo game can be
// paused, and a round hold is already a wait of its own. Rules and Settings, the history and the last
// trick all hold a game in play, as the desktop's do.
export function wantsPause(state: StoreState, ui: UiState): boolean {
  return isSolo(state) && canPause(state) && (ui.pauseMenu || ui.menu !== null);
}
