import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANGUAGES, setLanguage } from "../../src/i18n/language";
import * as keys from "../../src/storage/keys";
import { forgetBrowser, keysToForget, storedItems } from "../../src/storage/stored";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../../src");

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const path = join(directory, item.name);
    return item.isDirectory() ? sources(path) : item.name.endsWith(".ts") ? [path] : [];
  });
}

function memory(initial: Record<string, string>, refuses: readonly string[] = []) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    removeItem: (key: string) => {
      if (refuses.includes(key)) {
        throw new Error("refused");
      }
      values.delete(key);
    },
  };
}

describe("what the page keeps in the browser", () => {
  it("is named in one file, and nowhere else in the source", () => {
    const elsewhere = sources(SRC)
      .filter((path) => !path.endsWith("/storage/keys.ts"))
      .filter((path) => /["'`]whist\./.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path));
    expect(elsewhere).toEqual([]);
  });

  it("is listed for About with every name the registry has, so the list cannot fall behind the code", () => {
    const listed = new Set(storedItems(LANGUAGES).flatMap((item) => item.keys));
    const named = Object.entries(keys)
      .filter(([name, value]) => name.endsWith("_KEY") && typeof value === "string")
      .map(([, value]) => value as string);
    expect(named.length).toBeGreaterThanOrEqual(7);
    for (const name of named) {
      // The name an older page kept the last New Game under is not kept now, and the language's names are.
      if (name === keys.SETUP_KEY) {
        expect(listed.has(name), name).toBe(false);
        expect([...listed].filter((each) => each.startsWith(`${name}.`)).sort()).toEqual(LANGUAGES.map(keys.setupKeyFor).sort());
      } else {
        expect(listed.has(name), name).toBe(true);
      }
    }
  });

  it("says in words what each is for, in both languages, and which storage holds it", () => {
    for (const language of ["en", "ro"] as const) {
      setLanguage(language);
      for (const item of storedItems(LANGUAGES)) {
        expect(item.what.length).toBeGreaterThan(10);
        expect(["local", "session"]).toContain(item.area);
      }
    }
    setLanguage("en");
    const english = storedItems(LANGUAGES).map((item) => item.what);
    setLanguage("ro");
    const romanian = storedItems(LANGUAGES).map((item) => item.what);
    setLanguage("en");
    expect(romanian.every((text, index) => text !== english[index])).toBe(true);
  });

  it("is what Forget clears, with the older name of the last New Game too", () => {
    expect(keysToForget("local", LANGUAGES).sort()).toEqual(
      ["whist.token", "whist.profile", "whist.pace", "whist.language", "whist.setup", "whist.setup.en", "whist.setup.ro"].sort(),
    );
    expect(keysToForget("session", LANGUAGES).sort()).toEqual(["whist.fullscreenNoticeDismissed", "whist.reloaded"]);
  });
});

describe("forgetting the browser", () => {
  const ours = { "whist.token": "t", "whist.profile": "{}", "whist.setup.en": "{}", "whist.setup.ro": "{}", "whist.setup": "{}", "whist.pace": "slow", "whist.language": "ro" };

  it("removes what the page keeps, in both storages, and nothing that is another's", () => {
    const local = memory({ ...ours, "other.key": "kept", "whist": "kept", "whist.setup.fr": "kept", token: "kept" });
    const session = memory({ "whist.reloaded": "1", "whist.fullscreenNoticeDismissed": "1", "other.session": "kept" });
    forgetBrowser({ local, session }, LANGUAGES);
    expect([...local.values.keys()].sort()).toEqual(["other.key", "token", "whist", "whist.setup.fr"].sort());
    expect([...session.values.keys()]).toEqual(["other.session"]);
  });

  it("goes on past a key the browser will not let go of", () => {
    const local = memory(ours, ["whist.token"]);
    forgetBrowser({ local, session: null }, LANGUAGES);
    expect([...local.values.keys()]).toEqual(["whist.token"]);
  });

  it("does nothing, and does not fail, where there is no storage", () => {
    expect(() => forgetBrowser({ local: null, session: null }, LANGUAGES)).not.toThrow();
  });
});
