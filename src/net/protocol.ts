// The messages of protocol version 1, as libs/romanian_whist_server/protocol/PROTOCOL.md sets them out.

export const PROTOCOL_VERSION = 1;

export type Suit = "H" | "D" | "S" | "C";
// Two characters: the rank (3-9, T, J, Q, K, A), then the suit.
export type Card = string;
export type Gender = "female" | "male";
export type Level =
  | "random"
  | "first-card"
  | "low-risk"
  | "ducking"
  | "cyborg"
  | "reckoner-alpha"
  | "reckoner-beta"
  | "reckoner-gamma"
  | "reckoner-delta";
export type RoundType = "normal" | "forehead" | "hidden";
export type Presence = "here" | "away" | "replaced";
export type Structure = "1-8-1" | "8-1-8";

export const SUITS: readonly Suit[] = ["H", "D", "S", "C"];
export const LEVELS: readonly Level[] = [
  "random",
  "first-card",
  "low-risk",
  "ducking",
  "cyborg",
  "reckoner-alpha",
  "reckoner-beta",
  "reckoner-gamma",
  "reckoner-delta",
];

export interface Profile {
  name: string;
  gender: Gender;
  avatar: string;
}

export type SettingsSeat =
  | ({ kind: "human" } & Profile)
  | ({ kind: "computer"; level: Level } & Profile)
  | { kind: "open" };

export interface Settings {
  seats: SettingsSeat[];
  structure: Structure;
  foreheadAndHidden: boolean;
  allOneCardForehead: boolean;
  botSpeed: number;
  waitAfterRound: boolean;
  seed?: number;
  replacement?: Level;
  turnTimer?: number;
}

export type TableSeat =
  | ({ kind: "human"; presence: Presence; you: boolean } & Profile)
  | ({ kind: "computer"; level: Level } & Profile)
  | { kind: "open" };

export type TableMode = "solo" | "online";
export type TableStatus = "lobby" | "playing" | "finished" | "closed";

export interface TableState {
  code: string;
  mode: TableMode;
  state: TableStatus;
  host: number | null;
  settings: Settings;
  seats: TableSeat[];
  paused: boolean;
  waitingFor?: { seat: number; deadline: number };
}

export type GameStatus = "notStarted" | "inProgress" | "finished" | "stopped";
export type Phase = "notStarted" | "betting" | "playing" | "roundScored" | "gameOver";

export interface PlayedCard {
  seat: number;
  card: Card;
  winning: boolean;
}

export interface SnapshotSeat {
  name: string;
  bidOrder: number;
  bet: number | null;
  won: number;
  cards: number;
  roundScore: number;
  total: number;
  wins: number;
  losses: number;
  hand?: Card[];
}

export interface Snapshot {
  you: number | null;
  status: GameStatus;
  phase: Phase;
  round: {
    index: number;
    count: number;
    type: RoundType;
    tricks: number;
    trick: number;
    trump: Card | null;
    leader: number | null;
  };
  active: number | null;
  forbiddenBet: number | null;
  bets: { placed: number; sum: number };
  table: { ledBy: number | null; leadSuit: Suit | null; cards: PlayedCard[] };
  seats: SnapshotSeat[];
}

export interface RoundSeatResult {
  bet: number | null;
  won: number;
  roundScore: number;
  total: number;
  wins: number;
  losses: number;
}

export interface RoundResult {
  index: number;
  count: number;
  tricks: number;
  type: RoundType;
  trump: Card | null;
  nextCountsForStreaks: boolean;
  seats: RoundSeatResult[];
}

export interface LastTrick {
  round: number;
  ledBy: number;
  cards: PlayedCard[];
}

export interface Standing {
  seat: number;
  name: string;
  score: number;
  place: number;
}

export type GameEvent =
  | { kind: "gameStarted" | "roundStarted" | "bettingComplete" | "roundComplete" | "gameStopped" }
  | { kind: "betRequested" | "cardRequested"; seat: number }
  | { kind: "betPlaced"; seat: number; bet: number }
  | { kind: "trickStarted"; trick: number; leader: number }
  | { kind: "cardPlayed"; seat: number; card: Card }
  | { kind: "trickWon"; seat: number; trick: number }
  | { kind: "roundScored"; result: RoundResult }
  | { kind: "gameOver"; standings: Standing[]; winners: Standing[] };

export interface BetPrompt {
  id: number;
  kind: "bet";
  deadline: number | null;
  hand?: Card[];
  handSize?: number;
  max: number;
  forbidden: number | null;
  first: boolean;
  roundType: RoundType;
}

export interface PlayPrompt {
  id: number;
  kind: "play";
  deadline: number | null;
  hand?: Card[];
  handSize?: number;
  legal: number[];
  blind: boolean;
}

export type PromptBody = BetPrompt | PlayPrompt;

export interface Hold {
  round: number;
  waitingFor: number[];
  deadline: number | null;
}

export type ErrorCode =
  | "badMessage"
  | "version"
  | "notFound"
  | "tableFull"
  | "nameTaken"
  | "notHost"
  | "notYourTurn"
  | "stalePrompt"
  | "illegal"
  | "rateLimited"
  | "draining"
  | "openElsewhere";

export interface SyncBody {
  table: TableState | null;
  game: number | null;
  snapshot: Snapshot | null;
  history: RoundResult[];
  lastTrick: LastTrick | null;
  prompt: PromptBody | null;
  held: Hold | null;
}

export type ServerMessage =
  | { type: "welcome"; seq: number; token: string; member: number; server: { version: string; commit: string } }
  | ({ type: "tableState"; seq: number } & TableState)
  | { type: "game"; seq: number; game: number; event: GameEvent; snapshot: Snapshot | null }
  | ({ type: "prompt"; seq: number } & PromptBody)
  | { type: "promptClosed"; seq: number; id: number; by: "you" | "computer" }
  | ({ type: "held"; seq: number } & Hold)
  | ({ type: "sync"; seq: number } & SyncBody)
  | { type: "error"; seq: number; code: ErrorCode; detail?: string };

export type ClientMessage =
  | { type: "hello"; protocol: number; token?: string; lang: "en" | "ro" }
  | { type: "createSolo"; settings: Settings }
  | { type: "bet"; prompt: number; value: number }
  | { type: "play"; prompt: number; index: number }
  | { type: "continue"; round: number }
  | { type: "pause" | "resume" | "leaveTable" | "startGame" | "back" };
