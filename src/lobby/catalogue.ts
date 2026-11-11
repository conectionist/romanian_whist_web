import avatarList from "../../public/avatars.json";
import nameList from "../../public/player_names.json";
import { t } from "../i18n/t";
import type { Gender } from "../net/protocol";

// The names and the faces New Game gives the computer players, src/ui/PlayerNames.cpp and
// src/paint/Avatars.cpp: drawn at random by the owner's rules, in the dialog, where they can still be
// changed. The catalogues are the server's, copied to public/.

export type Language = "en" | "ro";

export interface Avatar {
  id: string;
  // Null for a face either gender can wear.
  gender: Gender | null;
  // The level it is kept for, as avatars.json writes it; empty for a face any player can wear.
  strategy: string;
}

export interface NameEntry {
  name: string;
  gender: Gender | null;
  language: Language | null;
  strategy: string;
}

// A random number in [0, 1), so a draw can be made again from a seed.
export type Random = () => number;

// mulberry32: a fixed deal draws the same faces and names every time.
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function gender(text: string | undefined): Gender | null {
  return text === "male" || text === "female" ? text : null;
}

function language(text: string): Language | null {
  return text === "en" || text === "ro" ? text : null;
}

export function avatarCatalogue(): Avatar[] {
  return (avatarList as { id: string; gender: string; strategy?: string }[]).map((entry) => ({
    id: entry.id,
    gender: gender(entry.gender),
    strategy: entry.strategy ?? "",
  }));
}

export function nameCatalogue(): NameEntry[] {
  return (nameList as { name: string; gender: string; language: string; strategy?: string }[]).map((entry) => ({
    name: entry.name,
    gender: gender(entry.gender),
    language: language(entry.language),
    strategy: entry.strategy ?? "",
  }));
}

// Whether somebody of this gender, in this language, can have the name.
export function suits(entry: NameEntry, who: Gender, speaks: Language): boolean {
  return (entry.gender === null || entry.gender === who) && (entry.language === null || entry.language === speaks);
}

export interface Wearer {
  gender: Gender;
  // The level they play at, for a computer player; empty for a person.
  strategy: string;
}

function pick<T>(from: readonly T[], random: Random): T {
  return from[Math.min(from.length - 1, Math.floor(random() * from.length))];
}

function isTaken(name: string, taken: readonly string[]): boolean {
  const wanted = name.toLocaleLowerCase();
  return taken.some((other) => other.toLocaleLowerCase() === wanted);
}

// One name for a computer player, none of `taken` (compared ignoring case):
// 1. one of the names kept for its level that suit its gender and the language, at random, if any is free;
// 2. otherwise one of the names kept for no level that suit them;
// 3. otherwise a placeholder, "Bot 3" from the seat's number up, the first that is free.
export function drawName(
  bot: Wearer,
  speaks: Language,
  names: readonly NameEntry[],
  taken: readonly string[],
  seatNumber: number,
  random: Random,
): string {
  const free = (strategy: string) =>
    names.filter((entry) => entry.strategy === strategy && suits(entry, bot.gender, speaks) && !isTaken(entry.name, taken)).map((entry) => entry.name);

  let candidates = bot.strategy === "" ? [] : free(bot.strategy);
  if (candidates.length === 0) {
    candidates = free("");
  }
  if (candidates.length > 0) {
    return pick(candidates, random);
  }
  for (let number = Math.max(1, seatNumber); ; number++) {
    const placeholder = t("NewGameDialog", "Bot %1", [number]);
    if (!isTaken(placeholder, taken)) {
      return placeholder;
    }
  }
}

function suitsFace(avatar: Avatar, who: Gender): boolean {
  return avatar.gender === null || avatar.gender === who;
}

// A face for each wearer, in order. A level's own faces, if it has any of the wearer's gender, else
// the faces kept for no level; of those, the ones worn least at the table, which are the ones nobody
// wears while there are any, and when all are worn the pick starts over among them. A count and not a
// set, so a face of either gender that one gender has run through is not freed for the other. Empty for
// a wearer no face suits.
export function assignFaces(wearers: readonly Wearer[], catalogue: readonly Avatar[], random: Random): string[] {
  const worn = new Map<string, number>();
  const count = (id: string) => worn.get(id) ?? 0;
  const group = (strategy: string, who: Gender) =>
    catalogue.filter((avatar) => avatar.strategy === strategy && suitsFace(avatar, who)).map((avatar) => avatar.id);

  return wearers.map((wearer) => {
    let theirs = wearer.strategy === "" ? [] : group(wearer.strategy, wearer.gender);
    if (theirs.length === 0) {
      theirs = group("", wearer.gender);
    }
    if (theirs.length === 0) {
      return "";
    }
    const least = Math.min(...theirs.map(count));
    const id = pick(
      theirs.filter((each) => count(each) === least),
      random,
    );
    worn.set(id, count(id) + 1);
    return id;
  });
}

// The faces a person may choose for themselves: those kept for no level, that suit their gender.
export function facesFor(who: Gender, catalogue: readonly Avatar[] = avatarCatalogue()): string[] {
  return catalogue.filter((avatar) => avatar.strategy === "" && suitsFace(avatar, who)).map((avatar) => avatar.id);
}
