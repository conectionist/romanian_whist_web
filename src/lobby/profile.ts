import { t } from "../i18n/t";
import type { Gender, Profile } from "../net/protocol";
import { MAX_NAME_LENGTH } from "./setup";
import { avatarCatalogue, facesFor } from "./catalogue";

// Who you are at an online table: a name, a gender and a portrait, kept in the browser so the next
// table finds them as they were left. The server cleans the name and refuses what it cannot show.

const STORAGE_KEY = "whist.profile";

export function defaultProfile(random: () => number = Math.random): Profile {
  const faces = facesFor("male");
  return { name: "", gender: "male", avatar: faces[Math.min(faces.length - 1, Math.floor(random() * faces.length))] ?? "" };
}

// A portrait that suits the gender: the one chosen if it does, else the first that does.
export function faceFor(gender: Gender, chosen: string): string {
  const faces = facesFor(gender);
  return faces.includes(chosen) ? chosen : (faces[0] ?? "");
}

function isProfile(value: unknown): value is Profile {
  const found = value as Partial<Profile> | null;
  return (
    typeof found === "object" &&
    found !== null &&
    typeof found.name === "string" &&
    (found.gender === "male" || found.gender === "female") &&
    typeof found.avatar === "string" &&
    avatarCatalogue().some((avatar) => avatar.id === found.avatar)
  );
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadProfile(from: Pick<Storage, "getItem"> | null = storage()): Profile | null {
  try {
    const text = from?.getItem(STORAGE_KEY);
    const parsed: unknown = text === null || text === undefined ? null : JSON.parse(text);
    return isProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile, into: Pick<Storage, "setItem"> | null = storage()): void {
  try {
    into?.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // The profile lasts until the page is closed.
  }
}

// What is wrong with a profile, or nothing: the same rules as a name in New Game, which the server
// checks again and may refuse for more.
export function profileError(profile: Profile): string | null {
  if (profile.name.trim() === "") {
    return t("lobby", "Choose a name.");
  }
  if ([...profile.name].length > MAX_NAME_LENGTH) {
    return t("newgame", "Names are at most %1 characters.", [MAX_NAME_LENGTH]);
  }
  return null;
}

// The six characters of a table's code, A to Z and 0 to 9, as a person may have typed or pasted them:
// in either case, with spaces, or as the whole link.
export function normalizeCode(text: string): string {
  const link = /\/t\/([A-Za-z0-9]{6})(?![A-Za-z0-9])/.exec(text);
  const source = link === null ? text : link[1];
  return source.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function codeError(code: string): string | null {
  return /^[A-Z0-9]{6}$/.test(code) ? null : t("lobby", "A table's code is six letters and digits.");
}
