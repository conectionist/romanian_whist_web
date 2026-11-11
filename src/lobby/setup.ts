import { t } from "../i18n/t";
import type { Gender, Level, Settings, SettingsSeat, Structure } from "../net/protocol";
import { LEVELS } from "../net/protocol";
import { roundCount as roundsFor } from "../sheets/rulesSheet";
import { DEFAULT_BOT_SPEED, FASTEST_SPEED } from "../sheets/settingsSheet";
import { assignFaces, avatarCatalogue, drawName, nameCatalogue, seededRandom, type Language, type Random } from "./catalogue";

// New Game's settings, src/ui/NewGameDialog.cpp: what a game is dealt from, and the rules about it.
// The functions here work without a DOM, as the dialog's do without a window.

export const MIN_SEATS = 2;
export const MAX_SEATS = 6;
// Long enough for any name a player would choose, and short enough that the panels, which are fixed
// widths, show it whole.
export const MAX_NAME_LENGTH = 20;
export const MAX_SEED = 999999;
export const DEFAULT_SEED = 42;

export interface Opponent {
  name: string;
  gender: Gender;
  level: Level;
}

export interface Setup {
  // Watching, with no seat of your own.
  spectator: boolean;
  // Kept while watching, so flipping to watching and back finds the name as it was left.
  human: { name: string; gender: Gender };
  bots: Opponent[];
  structure: Structure;
  foreheadAndHidden: boolean;
  allOneCardForehead: boolean;
  botSpeed: number;
  waitAfterRound: boolean;
  // A fixed deal's seed, or none.
  seed: number | null;
}

// The language the names are drawn in: the page's, which is English until it has Romanian.
export const LANGUAGE: Language = "en";

// The order of the combo, which is the protocol's.
export const LEVEL_ORDER: readonly Level[] = LEVELS;

export function levelName(level: Level): string {
  switch (level) {
    case "random":
      return t("newgame", "Random");
    case "first-card":
      return t("newgame", "First card");
    case "low-risk":
      return t("newgame", "Low risk");
    case "ducking":
      return t("newgame", "Ducking");
    case "cyborg":
      return t("newgame", "Cyborg");
    case "reckoner-alpha":
      return t("newgame", "Reckoner (Alpha)");
    case "reckoner-beta":
      return t("newgame", "Reckoner (Beta)");
    case "reckoner-gamma":
      return t("newgame", "Reckoner (Gamma)");
    case "reckoner-delta":
      return t("newgame", "Reckoner (Delta)");
  }
}

// What each level does, as the engine's strategy notes say it: the numbers of the four Reckoner
// presets are theirs.
export function levelTooltip(level: Level): string {
  switch (level) {
    case "random":
      return t("newgame", "Bids a random legal number and plays a random legal card.");
    case "first-card":
      return t("newgame", "Bids 0, or 1 when 0 is barred, and plays the first legal card in its hand.");
    case "low-risk":
      return t("newgame", "Bids the tricks its hand will take anyway, then wins cheaply while it owes them.");
    case "ducking":
      return t("newgame", "Bids 0 come what may, and sheds its highest cards whenever they cannot win.");
    case "cyborg":
      return t(
        "newgame",
        "Bids the count with the best expected score, from exact odds on every card, and re-plans every trick which cards win and which go.",
      );
    case "reckoner-alpha":
      return t("newgame", "Imagines no deals and plays by rule, but plays a random legal card %1% of the time.", [15]);
    case "reckoner-beta":
      return t(
        "newgame",
        "Weighs %1 imagined deals before each card and counts %2% of every point an opponent scores against its own, but plays a random legal card %3% of the time and nudges its bid by up to one %4% of the time.",
        [60, 15, 5, 5],
      );
    case "reckoner-gamma":
      return t(
        "newgame",
        "Weighs %1 imagined deals before each card, never plays at random, and counts %2% of every point an opponent scores against its own, %3% of the leader's.",
        [200, 25, 50],
      );
    case "reckoner-delta":
      return t(
        "newgame",
        "Weighs %1 imagined deals before each card, never plays at random, and counts %2% of every point an opponent scores against its own, %3% of the leader's.",
        [400, 40, 60],
      );
  }
}

// The default level for the nth opponent: the terminal's quick game, a Reckoner (Beta), then the
// Cyborg, then Low risk, and a fourth Reckoner (Gamma); past four they go round again.
export function defaultLevel(index: number): Level {
  const levels: readonly Level[] = ["reckoner-beta", "cyborg", "low-risk", "reckoner-gamma"];
  return levels[index % levels.length];
}

export function seatCount(setup: Pick<Setup, "spectator" | "bots">): number {
  return setup.bots.length + (setup.spectator ? 0 : 1);
}

// The opponents you may have: a watched game has no seat of yours, so it needs two and may have six;
// a played one already has you, so one is enough and five the most. A control that cannot reach an
// illegal count beats a message that explains one.
export function opponentRange(playing: boolean): { min: number; max: number } {
  return { min: playing ? 1 : MIN_SEATS, max: MAX_SEATS - (playing ? 1 : 0) };
}

function randomGender(random: Random): Gender {
  return random() < 0.5 ? "female" : "male";
}

// A new setup: you, "Player", a man, three opponents each a man or a woman at random and named to
// match, on 1-8-1 with the two last rounds.
export function defaults(random: Random, speaks: Language = LANGUAGE): Setup {
  const human = { name: t("newgame", "Player"), gender: "male" as Gender };
  const taken = [human.name];
  const bots: Opponent[] = [];
  for (let index = 0; index < 3; index++) {
    const gender = randomGender(random);
    const level = defaultLevel(index);
    const name = drawName({ gender, strategy: level }, speaks, nameCatalogue(), taken, index + 1, random);
    taken.push(name);
    bots.push({ name, gender, level });
  }
  return {
    spectator: false,
    human,
    bots,
    structure: "1-8-1",
    foreheadAndHidden: true,
    allOneCardForehead: false,
    botSpeed: DEFAULT_BOT_SPEED,
    waitAfterRound: false,
    seed: null,
  };
}

// How the game's pace is set: multiples of the default beats, so the middle stop is the one the game
// was tuned at. In milliseconds.
export interface Pacing {
  beat: number;
  spectatorBeat: number;
  trickDwell: number;
}

export function pacingFor(botSpeed: number): Pacing {
  const factors = [2.0, 1.5, 1.0, 0.5, 0.0];
  const factor = factors[Math.min(Math.max(Math.trunc(botSpeed), 0), FASTEST_SPEED)];
  return { beat: Math.trunc(700 * factor), spectatorBeat: Math.trunc(250 * factor), trickDwell: Math.trunc(1200 * factor) };
}

// Every trick the game deals, from the schedule: N rounds of one card, 2 to 7, N of eight, 7 to 2 and N
// of one, 10N + 54 whichever end it starts from, and the appended Forehead and Hidden rounds, one each.
function trickCount(seats: number, appended: boolean): number {
  return 10 * seats + 54 + (appended ? 2 : 0);
}

// What the computer players' pace makes a game wait on them for, with a person at the table: a beat
// after each bid and one as the bidding ends, a beat before each card, and the dwell after each trick
// and each round. Your own turns are not in it, nor the dwell after a round that waits for you.
function botWaiting(setup: Setup, pacing: Pacing): number {
  const bots = setup.bots.length;
  const rounds = roundsFor({ seats: seatCount(setup), foreheadAndHidden: setup.foreheadAndHidden });
  const tricks = trickCount(seatCount(setup), setup.foreheadAndHidden);
  const beats = rounds * (bots + 1) + tricks * bots;
  const dwells = tricks + (setup.waitAfterRound ? 0 : rounds);
  return pacing.beat * beats + pacing.trickDwell * dwells;
}

// How long a game takes, in whole minutes, as a rule of thumb. With you playing, your own pace is most
// of it: about 30 minutes for two players and 5 more for each player added, with the bots at the
// default speed, and another speed adds or takes off what the bots then wait more or less. A watched
// game goes at the bots' pace, off the slider, and takes nothing at its instant end.
export const PLAYING_MINUTES_FOR_TWO = 30;
export const PLAYING_MINUTES_PER_SEAT = 5;

export function estimatedMinutes(setup: Setup): number {
  if (!setup.spectator) {
    const seats = seatCount(setup);
    const measured = (PLAYING_MINUTES_FOR_TWO + PLAYING_MINUTES_PER_SEAT * Math.max(seats - 2, 0)) * 60000;
    const total = measured + botWaiting(setup, pacingFor(setup.botSpeed)) - botWaiting(setup, pacingFor(DEFAULT_BOT_SPEED));
    return Math.round(total / 60000);
  }
  const pacing = pacingFor(setup.botSpeed);
  const averageTricksPerRound = 4;
  const rounds = roundsFor({ seats: seatCount(setup), foreheadAndHidden: setup.foreheadAndHidden });
  const perTrick = pacing.spectatorBeat * seatCount(setup) + pacing.trickDwell;
  return Math.trunc((perTrick * averageTricksPerRound * rounds) / 60000);
}

// "26 rounds - about 20 minutes": the count is exact arithmetic over the schedule and the time is a
// guess, which is the honest division. Two sentences when the estimate rounds to nothing, which a
// watched game at the instant end of the slider does.
export function summaryText(setup: Setup): string {
  const rounds = roundsFor({ seats: seatCount(setup), foreheadAndHidden: setup.foreheadAndHidden });
  const minutes = estimatedMinutes(setup);
  const count = t("newgame", "%n rounds", [], { n: rounds });
  if (minutes < 1) {
    return count;
  }
  if (minutes === 1) {
    return t("newgame", "%1 - about a minute", [count]);
  }
  return t("newgame", "%1 - about %n minutes", [count], { n: minutes });
}

function length(name: string): number {
  return [...name].length;
}

// What is wrong with these names, or nothing: each is something, no longer than a panel shows, and no
// two are alike. Stricter than the engine, which takes two names equal byte for byte: "Ana" and "ana"
// share nothing there and everything on a scoreboard.
export function nameError(names: readonly string[]): string | null {
  for (const name of names) {
    // A name of spaces is empty to a reader, and the engine would put a blank on the panel.
    if (name.trim() === "") {
      return t("newgame", "Every player needs a name.");
    }
    if (length(name) > MAX_NAME_LENGTH) {
      return t("newgame", "Names are at most %1 characters.", [MAX_NAME_LENGTH]);
    }
  }
  for (let first = 0; first < names.length; first++) {
    for (let second = first + 1; second < names.length; second++) {
      if (names[first].toLocaleLowerCase() === names[second].toLocaleLowerCase()) {
        return t("newgame", "Two players cannot both be called %1.", [names[second]]);
      }
    }
  }
  return null;
}

// What is wrong with this setup, or nothing. Deal is disabled on it.
export function firstError(setup: Setup): string | null {
  const seats = seatCount(setup);
  if (seats < MIN_SEATS || seats > MAX_SEATS) {
    return t("newgame", "A game needs between %1 and %2 players.", [MIN_SEATS, MAX_SEATS]);
  }
  return nameError([...(setup.spectator ? [] : [setup.human.name]), ...setup.bots.map((bot) => bot.name)]);
}

// The people and computer players of a setup, in seat order, each with the level they play at.
export function wearersOf(setup: Setup): { gender: Gender; strategy: string }[] {
  return [
    ...(setup.spectator ? [] : [{ gender: setup.human.gender, strategy: "" }]),
    ...setup.bots.map((bot) => ({ gender: bot.gender, strategy: bot.level })),
  ];
}

// The settings createSolo takes. Every seat's face is chosen now, so each game, Play again included,
// gets new ones: a fixed deal's are drawn from its seed, so the same deal shows the same faces.
export function settingsFor(setup: Setup, random: Random = Math.random): Settings {
  const faces = assignFaces(wearersOf(setup), avatarCatalogue(), setup.seed === null ? random : seededRandom(setup.seed));
  let next = 0;
  const seats: SettingsSeat[] = [];
  if (!setup.spectator) {
    seats.push({ kind: "human", name: setup.human.name, gender: setup.human.gender, avatar: faces[next++] });
  }
  for (const bot of setup.bots) {
    seats.push({ kind: "computer", level: bot.level, name: bot.name, gender: bot.gender, avatar: faces[next++] });
  }
  const settings: Settings = {
    seats,
    structure: setup.structure,
    foreheadAndHidden: setup.foreheadAndHidden,
    allOneCardForehead: setup.allOneCardForehead,
    botSpeed: setup.botSpeed,
    waitAfterRound: setup.waitAfterRound,
  };
  if (setup.seed !== null) {
    settings.seed = setup.seed;
  }
  return settings;
}

const STORAGE_KEY = "whist.setup";

function isSetup(value: unknown): value is Setup {
  const found = value as Partial<Setup> | null;
  return (
    typeof found === "object" &&
    found !== null &&
    typeof found.spectator === "boolean" &&
    typeof found.human?.name === "string" &&
    (found.human.gender === "male" || found.human.gender === "female") &&
    Array.isArray(found.bots) &&
    found.bots.every(
      (bot) => typeof bot?.name === "string" && (bot.gender === "male" || bot.gender === "female") && LEVEL_ORDER.includes(bot.level),
    ) &&
    (found.structure === "1-8-1" || found.structure === "8-1-8") &&
    typeof found.foreheadAndHidden === "boolean" &&
    typeof found.allOneCardForehead === "boolean" &&
    Number.isInteger(found.botSpeed) &&
    typeof found.waitAfterRound === "boolean" &&
    (found.seed === null || Number.isInteger(found.seed))
  );
}

// The last New Game, which the next one opens on. Wrapped: storage can be refused or come back empty.
export function loadSetup(storage: Pick<Storage, "getItem"> | null = safe()): Setup | null {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    const parsed: unknown = text === null || text === undefined ? null : JSON.parse(text);
    return isSetup(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSetup(setup: Setup, storage: Pick<Storage, "setItem"> | null = safe()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // The setup lasts until the page is closed.
  }
}

function safe(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// What a game of this setup deals, for the rules sheet and the lobby's summary.
export function rulesOf(setup: Setup): { seats: number; structure: Structure; foreheadAndHidden: boolean; allOneCardForehead: boolean } {
  return {
    seats: seatCount(setup),
    structure: setup.structure,
    foreheadAndHidden: setup.foreheadAndHidden,
    allOneCardForehead: setup.allOneCardForehead,
  };
}
