import type { RoundResult } from "../net/protocol";
import type { StoreState } from "./store";

// Which sheet is up, one at a time, as MainWindow arranges them. Decided from the store and what the
// player asked for alone, so a sync is shown the same way as any message.

export type MenuSheet = "history" | "last-trick" | "rules" | "settings" | "new-game" | "online" | "create-table";
// The pause menu is a solo game's; "leave" is its online counterpart, which the game goes on behind;
// the lobby is an online table between games.
export type SheetName = MenuSheet | "round" | "game-over" | "pause" | "leave" | "lobby";

// What the player has asked for.
export interface UiState {
  // A sheet from the menu bar, a corner button or the main menu, over everything.
  menu: MenuSheet | null;
  // The pause menu, which Esc and Exit raise; at an online table, the one that offers to leave.
  pauseMenu: boolean;
  // The table the address names, which the person has not yet joined.
  joinCode: string | null;
  // Whether the person has gone back to an online table from its game's results.
  backAtTable: boolean;
  // A round sheet the person closed while the game rested on it, with nothing to wait for.
  dismissedRound: number | null;
}

export const NOTHING_ASKED: UiState = { menu: null, pauseMenu: false, joinCode: null, backAtTable: false, dismissedRound: null };

export function atTable(state: Pick<StoreState, "table">): boolean {
  return state.table !== null;
}

export function isSolo(state: Pick<StoreState, "table">): boolean {
  return state.table?.mode === "solo";
}

export function isOnline(state: Pick<StoreState, "table">): boolean {
  return state.table?.mode === "online";
}

// An online table between games: before its first, and again once one is over.
export function inLobby(state: Pick<StoreState, "table">): boolean {
  return isOnline(state) && (state.table?.state === "lobby" || state.table?.state === "finished");
}

// Whether the lobby is what a table between games shows. After a game its results come first, for
// those who have them: someone who sat down since was sent no game.
function lobbyShown(state: StoreState, ui: UiState): boolean {
  if (state.table?.state === "lobby" || ui.backAtTable) {
    return true;
  }
  return state.snapshot === null && state.result === null && !state.stopped;
}

// Whether the game at the table has ended, by what the server said or what the snapshot shows. A
// table's state turns to finished only after the game's own end, so both are asked.
export function gameFinished(state: Pick<StoreState, "table" | "snapshot" | "result" | "stopped">): boolean {
  if (state.result !== null || state.stopped || state.table?.state === "finished") {
    return true;
  }
  // The server calls a table finished as soon as its game is, so a finished snapshot at a table that is
  // playing is the last game's, until the next one's first message.
  const status = state.snapshot?.status;
  return status === "stopped" || (status === "finished" && state.table?.state !== "playing");
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
  if (inLobby(state) && (ui.pauseMenu || lobbyShown(state, ui))) {
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
  const round = scoredRound(state);
  const closed = state.held === null && round !== null && ui.dismissedRound === round.index;
  return round !== null && gameOn(state) && !closed ? "round" : null;
}

// The round the round sheet shows: the one the game waits on, or the one it rests on after it was
// scored. The last round of a game that does not wait has none: the final results follow at once.
export function scoredRound(state: Pick<StoreState, "held" | "scored" | "history">): RoundResult | null {
  if (state.held !== null) {
    const held = state.held.round;
    return state.history.find((round) => round.index === held) ?? null;
  }
  if (state.scored === null) {
    return null;
  }
  const scored = state.scored;
  const round = state.history.find((each) => each.index === scored) ?? null;
  return round === null || round.index + 1 >= round.count ? null : round;
}

// Whether the game should be held by the server for the sheet that is up: only a solo game can be
// paused, and a round hold is already a wait of its own. Rules and Settings, the history and the last
// trick all hold a game in play, as the desktop's do.
export function wantsPause(state: StoreState, ui: UiState): boolean {
  return isSolo(state) && canPause(state) && (ui.pauseMenu || ui.menu !== null);
}
