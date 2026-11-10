import type { ClientMessage, Settings, SettingsSeat } from "../net/protocol";

// A solo game started from the address: /?solo=4, with &seed=42, &speed=4 or &forehead=all as well.
// The page has no menu to start one, and the end-to-end tests start theirs this way.

// The players the desktop's screenshot tool plays with: "Player", a man, and Ana, Bogdan, Cristina,
// Dan and Elena, Low risk and Ducking by turns, wearing the faces the look fixtures give them.
const PLAYERS: readonly SettingsSeat[] = [
  { kind: "human", name: "Player", gender: "male", avatar: "man-white-hair-hat" },
  { kind: "computer", level: "low-risk", name: "Ana", gender: "female", avatar: "woman-shoulder-hair" },
  { kind: "computer", level: "ducking", name: "Bogdan", gender: "male", avatar: "man-black-tee" },
  { kind: "computer", level: "low-risk", name: "Cristina", gender: "female", avatar: "woman-long-brown-hair" },
  { kind: "computer", level: "ducking", name: "Dan", gender: "male", avatar: "man-stubble" },
  { kind: "computer", level: "low-risk", name: "Elena", gender: "female", avatar: "woman-wavy-black-hair" },
];

export interface SoloRequest {
  players: number;
  seed?: number;
  // How fast the computer players move, 0 (slow) to 4 (instant).
  speed?: number;
  // Every one-card round is a Forehead round, blind from the first deal.
  foreheadAll?: boolean;
}

// The desktop's default. At the top speed the messages come faster than the table plays them, so it
// never moves the computer players' cards.
export const DEFAULT_SPEED = 2;

// What the address asks for, or null when it asks for no game, or a game the table cannot seat.
export function soloRequestFrom(search: string): SoloRequest | null {
  const params = new URLSearchParams(search);
  const asked = params.get("solo");
  if (asked === null || !/^\d+$/.test(asked)) {
    return null;
  }
  const players = Number(asked);
  if (players < 2 || players > PLAYERS.length) {
    return null;
  }
  const request: SoloRequest = { players };
  const seed = params.get("seed");
  if (seed !== null && /^\d+$/.test(seed)) {
    request.seed = Number(seed);
  }
  const speed = params.get("speed");
  if (speed !== null && /^[0-4]$/.test(speed)) {
    request.speed = Number(speed);
  }
  if (params.get("forehead") === "all") {
    request.foreheadAll = true;
  }
  return request;
}

export function soloSettings(request: SoloRequest): Settings {
  const settings: Settings = {
    seats: PLAYERS.slice(0, request.players).map((seat) => ({ ...seat })),
    structure: "1-8-1",
    foreheadAndHidden: true,
    allOneCardForehead: request.foreheadAll === true,
    botSpeed: request.speed ?? DEFAULT_SPEED,
    waitAfterRound: false,
  };
  if (request.seed !== undefined) {
    settings.seed = request.seed;
  }
  return settings;
}

export function createSolo(request: SoloRequest): ClientMessage {
  return { type: "createSolo", settings: soloSettings(request) };
}
