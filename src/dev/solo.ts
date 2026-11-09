import type { ClientMessage, Settings, SettingsSeat } from "../net/protocol";

// A solo game started from the address: /?solo=4 or /?solo=4&seed=42. The page has no New Game
// until its menus are built; this is how a game is started till then, and how the end-to-end tests
// start one.

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
}

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
  const seed = params.get("seed");
  if (seed === null) {
    return { players };
  }
  return /^\d+$/.test(seed) ? { players, seed: Number(seed) } : { players };
}

export function soloSettings(request: SoloRequest): Settings {
  const settings: Settings = {
    seats: PLAYERS.slice(0, request.players).map((seat) => ({ ...seat })),
    structure: "1-8-1",
    foreheadAndHidden: true,
    allOneCardForehead: false,
    // The top speed.
    botSpeed: 4,
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
