import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import desktop from "../../src/i18n/ro.desktop.json";
import page from "../../src/i18n/ro.page.json";
import { catalogueOf, keyOf, type Entry } from "../../src/i18n/translations";
import { literalsIn, type Literal } from "./support/literals";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../../src");
const desktopEntries = desktop.entries as Entry[];
const pageEntries = page.entries as Entry[];
const catalogue = catalogueOf({ entries: desktopEntries }, { entries: pageEntries });

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const path = join(directory, item.name);
    if (item.isDirectory()) {
      return sources(path);
    }
    return item.name.endsWith(".ts") && !item.name.endsWith(".d.ts") ? [path] : [];
  });
}

// t.ts holds the definition, and person.ts translates the variants that other modules declare: the
// literals of those are read where they are declared.
const SKIPPED = ["i18n/t.ts", "i18n/person.ts"];

const read = sources(SRC)
  .filter((path) => !SKIPPED.some((skipped) => path.endsWith(`/${skipped}`)))
  .map((path) => literalsIn(readFileSync(path, "utf8"), relative(SRC, path)));
const unreadable = read.flatMap((each) => each.unreadable);
const literals = new Map<string, Literal>();
for (const each of read.flatMap((found) => found.literals)) {
  literals.set(keyOf(each.context, each.source, each.comment), each);
}

const placeholders = (text: string) => [...new Set(text.match(/%[1-9n]/g) ?? [])].sort();

// Sentences the page fills in by name rather than by position, because the bid total is cut out of
// them in bold: a translation may leave the trick count and the difference out, as the desktop's does.
function mayLeaveOut(literal: Literal): boolean {
  return literal.context === "scoreboard" && literal.source.startsWith("Bids total %1 for %2");
}

function texts(entry: Entry): string[] {
  return entry.forms ?? (entry.translation === undefined ? [] : [entry.translation]);
}

describe("the strings the page translates", () => {
  it("are all found: every t() names its context and source with literals", () => {
    expect(unreadable).toEqual([]);
    expect(literals.size).toBeGreaterThan(250);
  });

  it("all have a Romanian translation", () => {
    const missing = [...literals.values()].filter((each) => !catalogue.has(keyOf(each.context, each.source, each.comment)));
    expect(missing.map((each) => `${each.where}  ${each.context}: ${each.source}${each.comment === "" ? "" : ` (${each.comment})`}`)).toEqual([]);
  });

  it("keep their placeholders in Romanian, or leave one out only where the page fills it in by name", () => {
    const wrong: string[] = [];
    for (const each of literals.values()) {
      const entry = catalogue.get(keyOf(each.context, each.source, each.comment));
      for (const text of entry === undefined ? [] : texts(entry)) {
        const have = placeholders(text);
        const want = placeholders(each.source);
        const kept = mayLeaveOut(each) ? have.includes("%1") && have.every((one) => want.includes(one)) : have.join() === want.join();
        if (!kept) {
          wrong.push(`${each.where}  ${each.source}  ->  ${text}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("have three forms in Romanian where they count with %n, and one translation where they do not", () => {
    const wrong: string[] = [];
    for (const each of literals.values()) {
      const entry = catalogue.get(keyOf(each.context, each.source, each.comment));
      if (entry === undefined) {
        continue;
      }
      const counts = each.source.includes("%n");
      if (counts && (entry.forms?.length ?? 0) !== 3) {
        wrong.push(`${each.where}  ${each.source}  has ${entry.forms?.length ?? 0} forms`);
      }
      if (!counts && entry.forms !== undefined) {
        wrong.push(`${each.where}  ${each.source}  has forms and no %n`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("open and close with the whitespace of their source, which a joined list depends on", () => {
    const wrong: string[] = [];
    for (const each of literals.values()) {
      const entry = catalogue.get(keyOf(each.context, each.source, each.comment));
      for (const text of entry === undefined ? [] : texts(entry)) {
        const edge = (value: string) => [/^\s*/.exec(value)?.[0], /\s*$/.exec(value)?.[0]];
        if (edge(text).join("|") !== edge(each.source).join("|")) {
          wrong.push(`${each.where}  "${each.source}"  ->  "${text}"`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("the page's own Romanian strings", () => {
  it("are not the desktop's, so that importing again never needs to choose", () => {
    const desktopKeys = new Set(desktopEntries.map((entry) => keyOf(entry.context, entry.source, entry.comment)));
    expect(pageEntries.filter((entry) => desktopKeys.has(keyOf(entry.context, entry.source, entry.comment))).map((entry) => entry.source)).toEqual([]);
  });

  it("are all used, and none twice", () => {
    const keys = pageEntries.map((entry) => keyOf(entry.context, entry.source, entry.comment));
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
    expect(pageEntries.filter((entry) => !literals.has(keyOf(entry.context, entry.source, entry.comment))).map((entry) => `${entry.context}: ${entry.source}`)).toEqual([]);
  });

  it("are translated, and in letters with a comma below", () => {
    for (const entry of pageEntries) {
      expect(texts(entry).length, entry.source).toBeGreaterThan(0);
      for (const text of texts(entry)) {
        expect(text.trim(), entry.source).not.toBe("");
        expect(text, entry.source).not.toMatch(/[şţŞŢ]/);
      }
    }
  });
});
