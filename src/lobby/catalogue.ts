import avatarList from "../../public/avatars.json";
import nameList from "../../public/player_names.json";
import type { Language } from "../i18n/language";
import { t } from "../i18n/t";
import type { Gender } from "../net/protocol";

// The names and the faces New Game gives the computer players, src/ui/PlayerNames.cpp and
// src/paint/Avatars.cpp: drawn at random by the owner's rules, in the dialog, where they can still be
// changed. The catalogues are the server's, copied to public/.

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

// A free name for a computer player, ignoring case: one kept for its level, else one kept for no
// level, each suiting its gender and the language, else "Bot 3" from the seat's number up.
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

// What a portrait shows, in words, for the ones a person may choose among; any other is its id.
export function faceName(id: string): string {
  switch (id) {
    case "man-black-hair-beard":
      return t("lobby", "Man with black hair and a beard");
    case "man-black-tee":
      return t("lobby", "Man in a black T-shirt");
    case "man-dark-hair-beard":
      return t("lobby", "Man with dark hair and a beard");
    case "man-hat-mustache":
      return t("lobby", "Man in a hat, with a mustache");
    case "man-short-hair":
      return t("lobby", "Man with short hair");
    case "man-stubble":
      return t("lobby", "Man with stubble");
    case "man-white-hair-hat":
      return t("lobby", "Man with white hair and a hat");
    case "woman-long-brown-hair":
      return t("lobby", "Woman with long brown hair");
    case "woman-long-dark-hair":
      return t("lobby", "Woman with long dark hair");
    case "woman-long-red-hair":
      return t("lobby", "Woman with long red hair");
    case "woman-shoulder-hair":
      return t("lobby", "Woman with shoulder-length hair");
    case "woman-wavy-black-hair":
      return t("lobby", "Woman with wavy black hair");
    default:
      return id.replace(/-/g, " ");
  }
}

function suitsFace(avatar: Avatar, who: Gender): boolean {
  return avatar.gender === null || avatar.gender === who;
}

// A face for each wearer: its level's own, else one kept for no level, the least worn at the table.
// Counted rather than marked, so a face of either gender one gender has used up is not freed for the
// other. Empty for a wearer no face suits.
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
