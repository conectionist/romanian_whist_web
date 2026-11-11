import { t } from "../i18n/t";
import type { Gender, Level, Profile, Settings, SettingsSeat } from "../net/protocol";
import { assignFaces, avatarCatalogue, drawName, nameCatalogue, type Random } from "./catalogue";
import type { Options } from "./options";
import { LANGUAGE, MAX_SEATS, MIN_SEATS, defaultLevel, nameError, type Opponent } from "./setup";

// Create a table: New Game's settings without watching and without a fixed deal, since a seed is the
// whole deal and an online table refuses one, and with the replacement player and the turn timer.
// You are the first seat, and take it when the table is made; every other seat is open or a computer
// player.

// How long a person's turn may take: the server's range is 10 to 3600 seconds, or no timer.
export const TURN_TIMERS: readonly number[] = [0, 10000, 30000, 60000, 120000, 300000];
export const DEFAULT_TURN_TIMER = 60000;
export const DEFAULT_REPLACEMENT: Level = "reckoner-beta";

export type OtherSeat = { kind: "open" } | ({ kind: "computer" } & Opponent);

export interface TableSetup extends Options {
  // Seats at the table, yours included.
  seats: number;
  // Every seat but yours.
  others: OtherSeat[];
  replacement: Level;
  turnTimer: number;
}

// The seconds a timer is shown as: "10 seconds", "1 minute", "5 minutes", or none.
export function timerLabel(ms: number): string {
  if (ms === 0) {
    return t("lobby", "No timer");
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return t("lobby", "%1 seconds", [seconds]);
  }
  const minutes = seconds / 60;
  return minutes === 1 ? t("lobby", "1 minute") : t("lobby", "%1 minutes", [minutes]);
}

function computerAt(index: number, taken: string[], random: Random): OtherSeat {
  const gender: Gender = random() < 0.5 ? "female" : "male";
  const level = defaultLevel(index);
  const name = drawName({ gender, strategy: level }, LANGUAGE, nameCatalogue(), taken, index + 2, random);
  taken.push(name);
  return { kind: "computer", name, gender, level };
}

// A table of four: you and a computer player, two seats open for people.
export function defaultTable(host: Profile, random: Random = Math.random): TableSetup {
  const taken = [host.name];
  return {
    seats: 4,
    others: [computerAt(0, taken, random), { kind: "open" }, { kind: "open" }],
    structure: "1-8-1",
    foreheadAndHidden: true,
    allOneCardForehead: false,
    botSpeed: 2,
    waitAfterRound: false,
    replacement: DEFAULT_REPLACEMENT,
    turnTimer: DEFAULT_TURN_TIMER,
  };
}

// The same table with this many seats: those that were there are kept, and new ones are open.
export function withSeats(setup: TableSetup, seats: number): TableSetup {
  const count = Math.min(Math.max(Math.trunc(seats), MIN_SEATS), MAX_SEATS);
  const others = setup.others.slice(0, count - 1);
  while (others.length < count - 1) {
    others.push({ kind: "open" });
  }
  return { ...setup, seats: count, others };
}

// What is wrong with a table, or nothing: your name and the computer players' names, which are typed
// over, must be something and different from one another.
export function tableError(setup: TableSetup, host: Profile): string | null {
  return nameError([host.name, ...setup.others.flatMap((seat) => (seat.kind === "computer" ? [seat.name] : []))]);
}

// The settings createTable takes: you in the first seat, open, and the rest as asked. A computer
// player's face is chosen now, among those that suit it, as in New Game.
export function tableSettingsFor(setup: TableSetup, host: Profile, random: Random = Math.random): Settings {
  const computers = setup.others.flatMap((seat) => (seat.kind === "computer" ? [seat] : []));
  const faces = assignFaces(
    [{ gender: host.gender, strategy: "" }, ...computers.map((seat) => ({ gender: seat.gender, strategy: seat.level }))],
    avatarCatalogue(),
    random,
  ).slice(1);
  let next = 0;
  const seats: SettingsSeat[] = [{ kind: "open" }];
  for (const seat of setup.others) {
    seats.push(seat.kind === "open" ? { kind: "open" } : { kind: "computer", level: seat.level, name: seat.name, gender: seat.gender, avatar: faces[next++] });
  }
  const settings: Settings = {
    seats,
    structure: setup.structure,
    foreheadAndHidden: setup.foreheadAndHidden,
    allOneCardForehead: setup.allOneCardForehead,
    botSpeed: setup.botSpeed,
    waitAfterRound: setup.waitAfterRound,
    replacement: setup.replacement,
  };
  // No timer is a zero, which the table keeps as it is told; absent, it would be the default.
  settings.turnTimer = setup.turnTimer;
  return settings;
}
