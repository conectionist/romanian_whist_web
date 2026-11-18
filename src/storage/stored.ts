import { t } from "../i18n/t";
import { DISMISSED_KEY, FORGET_SIGNAL, LANGUAGE_KEY, PACE_KEY, PROFILE_KEY, RELOADED_KEY, SETUP_KEY, TOKEN_KEY, setupKeyFor } from "./keys";

// What the page keeps in the browser, as About lists it and Forget clears it. Both read this one list.

export type StorageArea = "local" | "session";

export interface StoredItem {
  area: StorageArea;
  // The names it is kept under: more than one where each language has its own.
  keys: readonly string[];
  // What it is for, in words.
  what: string;
}

export function storedItems(languages: readonly string[]): StoredItem[] {
  return [
    { area: "local", keys: [TOKEN_KEY], what: t("about", "Who you are to the server, so that you can come back to a game you are at.") },
    { area: "local", keys: [PROFILE_KEY], what: t("about", "Your name, gender and portrait for online tables.") },
    { area: "local", keys: languages.map(setupKeyFor), what: t("about", "The last New Game you set up, once for each language.") },
    { area: "local", keys: [PACE_KEY], what: t("about", "How fast the table moves.") },
    { area: "local", keys: [LANGUAGE_KEY], what: t("about", "The language you chose.") },
    { area: "session", keys: [RELOADED_KEY], what: t("about", "That the page reloaded for a new version, until the tab is closed.") },
    { area: "session", keys: [DISMISSED_KEY], what: t("about", "That you put away the note about a small table, until the tab is closed.") },
  ];
}

// Every name the page keeps something under in an area, and the name of the last New Game without a language, which is
// still cleared. Exactly these, and nothing else a site's storage might hold.
export function keysToForget(area: StorageArea, languages: readonly string[]): string[] {
  const listed = storedItems(languages)
    .filter((item) => item.area === area)
    .flatMap((item) => item.keys);
  return area === "local" ? [...listed, SETUP_KEY, FORGET_SIGNAL] : listed;
}

// Removes them from the two storages given, each key on its own: one that cannot be removed does not stop the rest.
// The other tabs are told first, by a key that is set and then removed with the rest.
export function forgetBrowser(
  storages: { local: Pick<Storage, "setItem" | "removeItem"> | null; session: Pick<Storage, "removeItem"> | null },
  languages: readonly string[],
): void {
  try {
    storages.local?.setItem(FORGET_SIGNAL, String(Date.now()));
  } catch {
    // Without room to write, the other tabs are not told, and the rest is forgotten all the same.
  }
  for (const area of ["local", "session"] as const) {
    for (const key of keysToForget(area, languages)) {
      try {
        storages[area]?.removeItem(key);
      } catch {
        // Nothing more can be done for a key the browser will not let go of.
      }
    }
  }
}
