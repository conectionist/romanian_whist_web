import { afterEach, describe, expect, it } from "vitest";
import {
  LANGUAGE_KEY,
  LANGUAGES,
  NATIVE_NAMES,
  addressForLanguage,
  currentLanguage,
  keepLanguage,
  languageFromCode,
  languageFromSearch,
  setLanguage,
  storeLanguage,
  storedLanguage,
} from "../../src/i18n/language";

afterEach(() => setLanguage("en"));

describe("the language a code names", () => {
  it("reads en and ro, in any case, with or without a country", () => {
    for (const code of ["ro", "RO", "ro_RO", "ro-RO", " ro ", "Ro-md"]) {
      expect(languageFromCode(code), code).toBe("ro");
    }
    for (const code of ["en", "EN", "en-GB", "en_US"]) {
      expect(languageFromCode(code), code).toBe("en");
    }
  });

  it("takes anything else for none", () => {
    for (const code of ["", "  ", "fr", "rom", "ron", "english", "r", "ro,en", "en;ro", "xx-ro", null, undefined]) {
      expect(languageFromCode(code), String(code)).toBeNull();
    }
  });

  it("reads ?lang= from an address", () => {
    expect(languageFromSearch("?lang=ro")).toBe("ro");
    expect(languageFromSearch("?solo=4&lang=en&seed=1")).toBe("en");
    expect(languageFromSearch("?lang=fr")).toBeNull();
    expect(languageFromSearch("?solo=4")).toBeNull();
    expect(languageFromSearch("")).toBeNull();
  });

  it("offers Romanian first, each named in itself", () => {
    expect(LANGUAGES).toEqual(["ro", "en"]);
    expect(NATIVE_NAMES).toEqual({ ro: "Română", en: "English" });
  });
});

describe("the language the page runs in", () => {
  it("is English until it is set", () => {
    expect(currentLanguage()).toBe("en");
    setLanguage("ro");
    expect(currentLanguage()).toBe("ro");
  });

  it("is removed from an address the page reloads at when the choice was kept, and the rest of it stays", () => {
    expect(addressForLanguage("https://example.org/?lang=ro", "en", true)).toBe("https://example.org/");
    expect(addressForLanguage("https://example.org/t/K7QM4P?lang=en&x=1", "ro", true)).toBe("https://example.org/t/K7QM4P?x=1");
    expect(addressForLanguage("https://example.org/t/K7QM4P", "ro", true)).toBe("https://example.org/t/K7QM4P");
  });

  it("is the choice in the address the page reloads at when the browser did not keep it, and the rest of it stays", () => {
    expect(addressForLanguage("https://example.org/", "en", false)).toBe("https://example.org/?lang=en");
    expect(addressForLanguage("https://example.org/t/K7QM4P?lang=ro&x=1", "en", false)).toBe("https://example.org/t/K7QM4P?lang=en&x=1");
  });
});

describe("what of a query follows the page to a table's address", () => {
  it("is the language and nothing else", () => {
    expect(keepLanguage("?lang=ro&solo=4&seed=7&speed=4")).toBe("?lang=ro");
    expect(keepLanguage("?solo=4&lang=EN")).toBe("?lang=en");
    expect(keepLanguage("?lang=ro_RO")).toBe("?lang=ro");
  });

  it("is nothing when there is no language to ask for, or it is not one the page has", () => {
    expect(keepLanguage("")).toBe("");
    expect(keepLanguage("?solo=4&seed=7")).toBe("");
    expect(keepLanguage("?lang=fr")).toBe("");
  });
});

describe("the choice kept in the browser", () => {
  function memory(initial: Record<string, string> = {}) {
    const kept = new Map(Object.entries(initial));
    return { kept, getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) };
  }

  it("is read back as it was stored", () => {
    const storage = memory();
    expect(storedLanguage(storage)).toBeNull();
    storeLanguage("ro", storage);
    expect(storage.kept.get(LANGUAGE_KEY)).toBe("ro");
    expect(storedLanguage(storage)).toBe("ro");
    storeLanguage("en", storage);
    expect(storedLanguage(storage)).toBe("en");
  });

  it("is none when what was stored is not a language", () => {
    expect(storedLanguage(memory({ [LANGUAGE_KEY]: "klingon" }))).toBeNull();
    expect(storedLanguage(memory({ [LANGUAGE_KEY]: "" }))).toBeNull();
  });

  it("is none, and storing it changes nothing, where storage is refused or missing", () => {
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(storedLanguage(refusing)).toBeNull();
    expect(() => storeLanguage("ro", refusing)).not.toThrow();
    expect(storedLanguage(null)).toBeNull();
    expect(() => storeLanguage("ro", null)).not.toThrow();
  });
});
