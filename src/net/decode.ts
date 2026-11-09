import {
  LEVELS,
  SUITS,
  type BetPrompt,
  type Card,
  type ErrorCode,
  type GameEvent,
  type Gender,
  type Hold,
  type LastTrick,
  type Level,
  type PlayedCard,
  type PlayPrompt,
  type Presence,
  type Profile,
  type PromptBody,
  type RoundResult,
  type RoundSeatResult,
  type RoundType,
  type ServerMessage,
  type Settings,
  type SettingsSeat,
  type Snapshot,
  type SnapshotSeat,
  type Standing,
  type Suit,
  type SyncBody,
  type TableSeat,
  type TableState,
} from "./protocol";

// Names the field at fault, as a path from the message: "snapshot.round.index".
export class DecodeError extends Error {
  readonly field: string;

  constructor(field: string, problem: string) {
    super(`${field === "" ? "message" : field}: ${problem}`);
    this.name = "DecodeError";
    this.field = field;
  }
}

type Reader<T> = (value: unknown, path: string) => T;

class Fields {
  private readonly seen = new Set<string>();

  constructor(
    private readonly raw: Record<string, unknown>,
    private readonly path: string,
  ) {}

  private pathOf(key: string): string {
    return this.path === "" ? key : `${this.path}.${key}`;
  }

  get<T>(key: string, read: Reader<T>): T {
    if (!Object.hasOwn(this.raw, key)) {
      throw new DecodeError(this.pathOf(key), "is missing");
    }
    this.seen.add(key);
    return read(this.raw[key], this.pathOf(key));
  }

  // A field that may be absent, or null.
  optional<T>(key: string, read: Reader<T>): T | undefined {
    if (!Object.hasOwn(this.raw, key)) {
      return undefined;
    }
    this.seen.add(key);
    const value = this.raw[key];
    return value === null ? undefined : read(value, this.pathOf(key));
  }

  has(key: string): boolean {
    return Object.hasOwn(this.raw, key);
  }

  finish(): void {
    for (const key of Object.keys(this.raw)) {
      if (!this.seen.has(key)) {
        throw new DecodeError(this.pathOf(key), "is not a field of this message");
      }
    }
  }
}

function describe(value: unknown): string {
  if (value === null) {
    return "null";
  }
  return Array.isArray(value) ? "an array" : typeof value;
}

const int: Reader<number> = (value, path) => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new DecodeError(path, `must be a whole number, not ${describe(value)}`);
  }
  return value;
};

const count: Reader<number> = (value, path) => {
  const number = int(value, path);
  if (number < 0) {
    throw new DecodeError(path, "must not be negative");
  }
  return number;
};

const str: Reader<string> = (value, path) => {
  if (typeof value !== "string") {
    throw new DecodeError(path, `must be a string, not ${describe(value)}`);
  }
  return value;
};

const bool: Reader<boolean> = (value, path) => {
  if (typeof value !== "boolean") {
    throw new DecodeError(path, `must be true or false, not ${describe(value)}`);
  }
  return value;
};

const CARD = /^[2-9TJQKA][HDSC]$/;

const card: Reader<Card> = (value, path) => {
  const text = str(value, path);
  if (!CARD.test(text)) {
    throw new DecodeError(path, `is not a card: "${text}"`);
  }
  return text;
};

function choice<T extends string>(values: readonly T[]): Reader<T> {
  return (value, path) => {
    const text = str(value, path);
    if (!(values as readonly string[]).includes(text)) {
      throw new DecodeError(path, `must be one of ${values.join(", ")}, not "${text}"`);
    }
    return text as T;
  };
}

function nullable<T>(read: Reader<T>): Reader<T | null> {
  return (value, path) => (value === null ? null : read(value, path));
}

function list<T>(read: Reader<T>): Reader<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) {
      throw new DecodeError(path, `must be an array, not ${describe(value)}`);
    }
    return value.map((item, index) => read(item, `${path}[${index}]`));
  };
}

function record<T>(read: (fields: Fields) => T): Reader<T> {
  return (value, path) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new DecodeError(path, `must be an object, not ${describe(value)}`);
    }
    const fields = new Fields(value as Record<string, unknown>, path);
    const result = read(fields);
    fields.finish();
    return result;
  };
}

const gender = choice<Gender>(["female", "male"]);
const level = choice<Level>(LEVELS);
const suit = choice<Suit>(SUITS);
const roundType = choice<RoundType>(["normal", "forehead", "hidden"]);
const presence = choice<Presence>(["here", "away", "replaced"]);
const cards = list(card);
const ints = list(count);

function profileOf(fields: Fields): Profile {
  return {
    name: fields.get("name", str),
    gender: fields.get("gender", gender),
    avatar: fields.get("avatar", str),
  };
}

const settingsSeat = record<SettingsSeat>((fields) => {
  const kind = fields.get("kind", choice(["human", "computer", "open"] as const));
  if (kind === "open") {
    return { kind };
  }
  const profile = profileOf(fields);
  return kind === "human" ? { kind, ...profile } : { kind, level: fields.get("level", level), ...profile };
});

const settings = record<Settings>((fields) => {
  const result: Settings = {
    seats: fields.get("seats", list(settingsSeat)),
    structure: fields.get("structure", choice(["1-8-1", "8-1-8"] as const)),
    foreheadAndHidden: fields.get("foreheadAndHidden", bool),
    allOneCardForehead: fields.get("allOneCardForehead", bool),
    botSpeed: fields.get("botSpeed", count),
    waitAfterRound: fields.get("waitAfterRound", bool),
  };
  const seed = fields.optional("seed", int);
  if (seed !== undefined) {
    result.seed = seed;
  }
  const replacement = fields.optional("replacement", level);
  if (replacement !== undefined) {
    result.replacement = replacement;
  }
  const turnTimer = fields.optional("turnTimer", count);
  if (turnTimer !== undefined) {
    result.turnTimer = turnTimer;
  }
  return result;
});

const tableSeat = record<TableSeat>((fields) => {
  const kind = fields.get("kind", choice(["human", "computer", "open"] as const));
  if (kind === "open") {
    return { kind };
  }
  const profile = profileOf(fields);
  if (kind === "computer") {
    return { kind, level: fields.get("level", level), ...profile };
  }
  return { kind, presence: fields.get("presence", presence), you: fields.get("you", bool), ...profile };
});

function tableStateOf(fields: Fields): TableState {
  const result: TableState = {
    code: fields.get("code", str),
    mode: fields.get("mode", choice(["solo", "online"] as const)),
    state: fields.get("state", choice(["lobby", "playing", "finished", "closed"] as const)),
    host: fields.get("host", nullable(count)),
    settings: fields.get("settings", settings),
    seats: fields.get("seats", list(tableSeat)),
    paused: fields.get("paused", bool),
  };
  const waiting = fields.optional(
    "waitingFor",
    record((inner) => ({ seat: inner.get("seat", count), deadline: inner.get("deadline", count) })),
  );
  if (waiting !== undefined) {
    result.waitingFor = waiting;
  }
  return result;
}

const tableState = record(tableStateOf);

const playedCard = record<PlayedCard>((fields) => ({
  seat: fields.get("seat", count),
  card: fields.get("card", card),
  winning: fields.get("winning", bool),
}));

const snapshotSeat = record<SnapshotSeat>((fields) => {
  const result: SnapshotSeat = {
    name: fields.get("name", str),
    bidOrder: fields.get("bidOrder", count),
    bet: fields.get("bet", nullable(count)),
    won: fields.get("won", count),
    cards: fields.get("cards", count),
    roundScore: fields.get("roundScore", int),
    total: fields.get("total", int),
    wins: fields.get("wins", count),
    losses: fields.get("losses", count),
  };
  if (fields.has("hand")) {
    result.hand = fields.get("hand", cards);
  }
  return result;
});

const snapshot = record<Snapshot>((fields) => ({
  you: fields.get("you", nullable(count)),
  status: fields.get("status", choice(["notStarted", "inProgress", "finished", "stopped"] as const)),
  phase: fields.get("phase", choice(["notStarted", "betting", "playing", "roundScored", "gameOver"] as const)),
  round: fields.get(
    "round",
    record((inner) => ({
      index: inner.get("index", count),
      count: inner.get("count", count),
      type: inner.get("type", roundType),
      tricks: inner.get("tricks", count),
      trick: inner.get("trick", count),
      trump: inner.get("trump", nullable(card)),
      leader: inner.get("leader", nullable(count)),
    })),
  ),
  active: fields.get("active", nullable(count)),
  forbiddenBet: fields.get("forbiddenBet", nullable(count)),
  bets: fields.get(
    "bets",
    record((inner) => ({ placed: inner.get("placed", count), sum: inner.get("sum", count) })),
  ),
  table: fields.get(
    "table",
    record((inner) => ({
      ledBy: inner.get("ledBy", nullable(count)),
      leadSuit: inner.get("leadSuit", nullable(suit)),
      cards: inner.get("cards", list(playedCard)),
    })),
  ),
  seats: fields.get("seats", list(snapshotSeat)),
}));

const roundSeatResult = record<RoundSeatResult>((fields) => ({
  bet: fields.get("bet", nullable(count)),
  won: fields.get("won", count),
  roundScore: fields.get("roundScore", int),
  total: fields.get("total", int),
  wins: fields.get("wins", count),
  losses: fields.get("losses", count),
}));

const roundResult = record<RoundResult>((fields) => ({
  index: fields.get("index", count),
  count: fields.get("count", count),
  tricks: fields.get("tricks", count),
  type: fields.get("type", roundType),
  trump: fields.get("trump", nullable(card)),
  nextCountsForStreaks: fields.get("nextCountsForStreaks", bool),
  seats: fields.get("seats", list(roundSeatResult)),
}));

const lastTrick = record<LastTrick>((fields) => ({
  round: fields.get("round", count),
  ledBy: fields.get("ledBy", count),
  cards: fields.get("cards", list(playedCard)),
}));

const standing = record<Standing>((fields) => ({
  seat: fields.get("seat", count),
  name: fields.get("name", str),
  score: fields.get("score", int),
  place: fields.get("place", count),
}));

const EVENT_KINDS = [
  "gameStarted",
  "roundStarted",
  "betRequested",
  "betPlaced",
  "bettingComplete",
  "trickStarted",
  "cardRequested",
  "cardPlayed",
  "trickWon",
  "roundScored",
  "roundComplete",
  "gameOver",
  "gameStopped",
] as const;

const gameEvent = record<GameEvent>((fields) => {
  const kind = fields.get("kind", choice(EVENT_KINDS));
  switch (kind) {
    case "betRequested":
    case "cardRequested":
      return { kind, seat: fields.get("seat", count) };
    case "betPlaced":
      return { kind, seat: fields.get("seat", count), bet: fields.get("bet", count) };
    case "trickStarted":
      return { kind, trick: fields.get("trick", count), leader: fields.get("leader", count) };
    case "cardPlayed":
      return { kind, seat: fields.get("seat", count), card: fields.get("card", card) };
    case "trickWon":
      return { kind, seat: fields.get("seat", count), trick: fields.get("trick", count) };
    case "roundScored":
      return { kind, result: fields.get("result", roundResult) };
    case "gameOver":
      return {
        kind,
        standings: fields.get("standings", list(standing)),
        winners: fields.get("winners", list(standing)),
      };
    default:
      return { kind };
  }
});

function promptOf(fields: Fields): PromptBody {
  const id = fields.get("id", count);
  const kind = fields.get("kind", choice(["bet", "play"] as const));
  const deadline = fields.get("deadline", nullable(count));
  const shown: { hand?: Card[]; handSize?: number } = {};
  if (fields.has("hand")) {
    shown.hand = fields.get("hand", cards);
  } else {
    shown.handSize = fields.get("handSize", count);
  }
  if (kind === "bet") {
    const bet: BetPrompt = {
      id,
      kind,
      deadline,
      ...shown,
      max: fields.get("max", count),
      forbidden: fields.get("forbidden", nullable(count)),
      first: fields.get("first", bool),
      roundType: fields.get("roundType", roundType),
    };
    return bet;
  }
  const play: PlayPrompt = {
    id,
    kind,
    deadline,
    ...shown,
    legal: fields.get("legal", ints),
    blind: fields.get("blind", bool),
  };
  return play;
}

const prompt = record(promptOf);

function holdOf(fields: Fields): Hold {
  return {
    round: fields.get("round", count),
    waitingFor: fields.get("waitingFor", ints),
    deadline: fields.get("deadline", nullable(count)),
  };
}

const hold = record(holdOf);

const ERROR_CODES: readonly ErrorCode[] = [
  "badMessage",
  "version",
  "notFound",
  "tableFull",
  "nameTaken",
  "notHost",
  "notYourTurn",
  "stalePrompt",
  "illegal",
  "rateLimited",
  "draining",
  "openElsewhere",
];

function syncBodyOf(fields: Fields): SyncBody {
  return {
    table: fields.get("table", nullable(tableState)),
    game: fields.get("game", nullable(count)),
    snapshot: fields.get("snapshot", nullable(snapshot)),
    history: fields.get("history", list(roundResult)),
    lastTrick: fields.get("lastTrick", nullable(lastTrick)),
    prompt: fields.get("prompt", nullable(prompt)),
    held: fields.get("held", nullable(hold)),
  };
}

const MESSAGE_TYPES = ["welcome", "tableState", "game", "prompt", "promptClosed", "held", "sync", "error"] as const;

const message = record<ServerMessage>((fields) => {
  const type = fields.get("type", choice(MESSAGE_TYPES));
  const seq = fields.get("seq", count);
  switch (type) {
    case "welcome":
      return {
        type,
        seq,
        token: fields.get("token", str),
        member: fields.get("member", count),
        server: fields.get(
          "server",
          record((inner) => ({ version: inner.get("version", str), commit: inner.get("commit", str) })),
        ),
      };
    case "tableState":
      return { type, seq, ...tableStateOf(fields) };
    case "game":
      return {
        type,
        seq,
        game: fields.get("game", count),
        event: fields.get("event", gameEvent),
        snapshot: fields.get("snapshot", nullable(snapshot)),
      };
    case "prompt":
      return { type, seq, ...promptOf(fields) };
    case "promptClosed":
      return {
        type,
        seq,
        id: fields.get("id", count),
        by: fields.get("by", choice(["you", "computer"] as const)),
      };
    case "held":
      return { type, seq, ...holdOf(fields) };
    case "sync":
      return { type, seq, ...syncBodyOf(fields) };
    case "error": {
      const code = fields.get("code", choice(ERROR_CODES));
      const detail = fields.optional("detail", str);
      return detail === undefined ? { type, seq, code } : { type, seq, code, detail };
    }
  }
});

export function decode(text: string): ServerMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DecodeError("", "is not JSON");
  }
  return message(parsed, "");
}

// The look fixtures hold a sync's fields without its envelope.
export function decodeSyncBody(value: unknown): SyncBody {
  return record(syncBodyOf)(value, "");
}
