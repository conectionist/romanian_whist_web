import type {
  ErrorCode,
  GameEvent,
  Hold,
  LastTrick,
  PromptBody,
  RoundResult,
  ServerMessage,
  Snapshot,
  Standing,
  TableState,
} from "../net/protocol";

// A prompt the page holds, with when it counts down from: the page's clock when the prompt was
// received, not when it was reached in the queue.
export interface LivePrompt {
  body: PromptBody;
  receivedAt: number;
  deadlineAt: number | null;
}

export interface LiveHold extends Hold {
  receivedAt: number;
  deadlineAt: number | null;
}

// How a game ended, from its gameOver event: the final standings and who won.
export interface Result {
  standings: Standing[];
  winners: Standing[];
}

// What the page knows of the game, as the server last said it.
export interface StoreState {
  table: TableState | null;
  game: number | null;
  snapshot: Snapshot | null;
  history: RoundResult[];
  lastTrick: LastTrick | null;
  prompt: LivePrompt | null;
  held: LiveHold | null;
  // The page's clock when the table's state last arrived: a waitingFor deadline counts down from then.
  tableAt: number;
  // Prompts that were closed: an id that is closed stays closed.
  closedPrompts: number[];
  lastError: { code: ErrorCode; detail?: string } | null;
  // The final standings, from the gameOver event of this game; a sync does not carry them.
  result: Result | null;
  // Whether this game ended with gameStopped: the server could not go on with it.
  stopped: boolean;
  // The round just scored, while the game rests on it: the next game message moves on from it.
  scored: number | null;
}

// What a message changed, for the table to animate: the event of a game message, and whether the
// message replaced everything, so there is no last frame to move from.
export interface Change {
  kind: ServerMessage["type"];
  event: GameEvent | null;
  fresh: boolean;
}

export const NO_CHANGE: Change = { kind: "error", event: null, fresh: false };

export function emptyStore(): StoreState {
  return {
    table: null,
    game: null,
    snapshot: null,
    history: [],
    lastTrick: null,
    prompt: null,
    held: null,
    tableAt: 0,
    closedPrompts: [],
    lastError: null,
    result: null,
    stopped: false,
    scored: null,
  };
}

function livePrompt(body: PromptBody, receivedAt: number): LivePrompt {
  return { body, receivedAt, deadlineAt: body.deadline === null ? null : receivedAt + body.deadline };
}

function liveHold(hold: Hold, receivedAt: number): LiveHold {
  return { ...hold, receivedAt, deadlineAt: hold.deadline === null ? null : receivedAt + hold.deadline };
}

// A sync replaces everything.
export function applySync(message: Extract<ServerMessage, { type: "sync" }>, receivedAt: number): StoreState {
  return {
    table: message.table,
    game: message.game,
    snapshot: message.snapshot,
    history: message.history,
    lastTrick: message.lastTrick,
    prompt: message.prompt === null ? null : livePrompt(message.prompt, receivedAt),
    held: message.held === null ? null : liveHold(message.held, receivedAt),
    tableAt: receivedAt,
    closedPrompts: [],
    lastError: null,
    result: null,
    stopped: false,
    scored: null,
  };
}

// A game message carries the whole state after its event, as this viewer may see it; a stopped
// game may carry none, and then the last one stands.
export function applyGame(state: StoreState, message: Extract<ServerMessage, { type: "game" }>): StoreState {
  const { event } = message;
  const snapshot = message.snapshot ?? state.snapshot;
  const next: StoreState = { ...state, game: message.game, snapshot, scored: event.kind === "roundScored" ? event.result.index : null };

  switch (event.kind) {
    case "gameStarted":
      next.history = [];
      next.lastTrick = null;
      next.held = null;
      next.prompt = null;
      next.closedPrompts = [];
      next.result = null;
      next.stopped = false;
      break;
    case "roundScored":
      next.history = [...state.history, event.result];
      break;
    case "trickWon":
      if (message.snapshot !== null) {
        next.lastTrick = {
          round: message.snapshot.round.index,
          ledBy: message.snapshot.table.ledBy ?? event.seat,
          cards: message.snapshot.table.cards,
        };
      }
      break;
    case "roundComplete":
      next.held = null;
      break;
    case "gameOver":
      next.result = { standings: event.standings, winners: event.winners };
      next.held = null;
      next.prompt = null;
      break;
    case "gameStopped":
      next.stopped = true;
      next.held = null;
      next.prompt = null;
      break;
    default:
      break;
  }
  return next;
}

export function applyPrompt(state: StoreState, body: PromptBody, receivedAt: number): StoreState {
  if (state.closedPrompts.includes(body.id)) {
    return state;
  }
  return { ...state, prompt: livePrompt(body, receivedAt) };
}

// A close for a prompt the page does not hold is ignored.
export function applyPromptClosed(state: StoreState, id: number): StoreState {
  if (state.prompt === null || state.prompt.body.id !== id) {
    return state;
  }
  return { ...state, prompt: null, closedPrompts: [...state.closedPrompts, id] };
}

// A closed table's state is the last message from it: nothing of its game is kept.
export function applyTableState(state: StoreState, table: TableState, receivedAt = 0): StoreState {
  if (table.state === "closed") {
    return { ...emptyStore(), lastError: state.lastError };
  }
  return { ...state, table, tableAt: receivedAt };
}

export function applyHeld(state: StoreState, hold: Hold, receivedAt: number): StoreState {
  return { ...state, held: liveHold(hold, receivedAt) };
}

export function applyError(state: StoreState, code: ErrorCode, detail?: string): StoreState {
  return { ...state, lastError: detail === undefined ? { code } : { code, detail } };
}

// Applies one server message, and says what it changed.
export function apply(state: StoreState, message: ServerMessage, receivedAt: number): { state: StoreState; change: Change } {
  switch (message.type) {
    case "sync":
      return { state: applySync(message, receivedAt), change: { kind: "sync", event: null, fresh: true } };
    case "game":
      return { state: applyGame(state, message), change: { kind: "game", event: message.event, fresh: false } };
    case "prompt":
      return { state: applyPrompt(state, message, receivedAt), change: { kind: "prompt", event: null, fresh: false } };
    case "promptClosed":
      return { state: applyPromptClosed(state, message.id), change: { kind: "promptClosed", event: null, fresh: false } };
    case "tableState": {
      const { type: _type, seq: _seq, ...table } = message;
      return { state: applyTableState(state, table, receivedAt), change: { kind: "tableState", event: null, fresh: false } };
    }
    case "held":
      return { state: applyHeld(state, message, receivedAt), change: { kind: "held", event: null, fresh: false } };
    case "error":
      return { state: applyError(state, message.code, message.detail), change: { kind: "error", event: null, fresh: false } };
    case "welcome":
      return { state, change: { kind: "welcome", event: null, fresh: false } };
  }
}

// The store the page holds: the state, and the one place a message is applied.
export class Store {
  state: StoreState = emptyStore();

  apply(message: ServerMessage, receivedAt: number): Change {
    const result = apply(this.state, message, receivedAt);
    this.state = result.state;
    return result.change;
  }
}
