import type { StoreState } from "./store";

// Which sheet is up, as MainWindow arranges them: the pause menu, the round sheet that waits for you
// and the end of the game stand over the table, and the sheets the menu bar and the corner buttons
// open stand over those. One at a time, and decided here from what the store holds and what the
// player has asked for, so a sync can be shown the same way as any message.

export type MenuSheet = "history" | "last-trick" | "rules" | "settings" | "new-game" | "online" | "create-table";
// The pause menu is a solo game's; "leave" is its online counterpart, which the game goes on behind;
// the lobby is an online table before its game starts.
export type SheetName = MenuSheet | "round" | "game-over" | "pause" | "leave" | "lobby";

// What the player has asked for.
export interface UiState {
  // A sheet from the menu bar, a corner button or the main menu, over everything.
  menu: MenuSheet | null;
  // The pause menu, which Esc and Exit raise; at an online table, the one that offers to leave.
  pauseMenu: boolean;
  // The table the address names, which the person has not yet joined.
  joinCode: string | null;
}

export const NOTHING_ASKED: UiState = { menu: null, pauseMenu: false, joinCode: null };

export function atTable(state: Pick<StoreState, "table">): boolean {
  return state.table !== null;
}

export function isSolo(state: Pick<StoreState, "table">): boolean {
  return state.table?.mode === "solo";
}

export function isOnline(state: Pick<StoreState, "table">): boolean {
  return state.table?.mode === "online";
}

// An online table before its game starts.
export function inLobby(state: Pick<StoreState, "table">): boolean {
  return isOnline(state) && state.table?.state === "lobby";
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

// Whether Exit and Esc offer the way out: a solo game's pause menu, or an online table's choice to
// leave, in its lobby or while its game is played.
export function canLeave(state: Pick<StoreState, "table" | "snapshot" | "result" | "stopped">): boolean {
  return inLobby(state) || (isOnline(state) && gameOn(state));
}

export function canExit(state: Pick<StoreState, "table" | "snapshot" | "result" | "stopped" | "held">): boolean {
  return canPause(state) || canLeave(state);
}

// Whether the round hold waits for this viewer's Continue. A solo game's waits for whoever is at it,
// a watcher included; an online table's names the seats it still waits for.
export function holdAwaitsYou(state: Pick<StoreState, "table" | "snapshot" | "held">): boolean {
  if (state.held === null) {
    return false;
  }
  const you = state.snapshot?.you ?? null;
  return isSolo(state) || (you !== null && state.held.waitingFor.includes(you));
}

export function sheetFor(state: StoreState, ui: UiState): SheetName | null {
  if (ui.menu !== null) {
    return ui.menu;
  }
  if (!atTable(state)) {
    return ui.joinCode === null ? null : "online";
  }
  if (inLobby(state)) {
    return ui.pauseMenu ? "leave" : "lobby";
  }
  if (ui.pauseMenu && isOnline(state) && canLeave(state)) {
    return "leave";
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
