// The language the page runs in. It is chosen once, before the page is built, so that every string
// is made in it from the start and nothing has to be translated again while the page runs.

export type Language = "en" | "ro";

// The order the language dialog offers them in: Romanian first, which is the one lit to start.
export const LANGUAGES: readonly Language[] = ["ro", "en"];

// A language's name in itself, which is how the dialog names it.
export const NATIVE_NAMES: Record<Language, string> = { ro: "Română", en: "English" };

export const LANGUAGE_KEY = "whist.language";

// A code as the address gives it: "en" or "ro", in any case, with or without a country ("ro_RO",
// "en-GB"). Anything else is none.
export function languageFromCode(code: string | null | undefined): Language | null {
  const found = /^(en|ro)(?:[-_][a-z0-9]+)*$/.exec((code ?? "").trim().toLowerCase());
  return found === null ? null : (found[1] as Language);
}

// What ?lang= asks for.
export function languageFromSearch(search: string): Language | null {
  return languageFromCode(new URLSearchParams(search).get("lang"));
}

function safe(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// The choice kept in the browser, or none. Wrapped: storage can be refused or come back empty.
export function storedLanguage(storage: Pick<Storage, "getItem"> | null = safe()): Language | null {
  try {
    return languageFromCode(storage?.getItem(LANGUAGE_KEY));
  } catch {
    return null;
  }
}

export function storeLanguage(language: Language, storage: Pick<Storage, "setItem"> | null = safe()): void {
  try {
    storage?.setItem(LANGUAGE_KEY, language);
  } catch {
    // The choice lasts until the page is closed.
  }
}

// The language the page was told to run in, English until it is told.
let running: Language = "en";

export function currentLanguage(): Language {
  return running;
}

export function setLanguage(language: Language): void {
  running = language;
}

// The address without ?lang=, so a page reloaded for a new choice reads the choice and not the old ask.
export function withoutLanguage(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("lang");
  return url.toString();
}
