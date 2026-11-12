import desktop from "./ro.desktop.json";
import page from "./ro.page.json";
import type { Language } from "./language";

// One translated string, as Qt files it: by the context it is in, its source text and the comment
// that tells two sources apart. A string with a count has its forms, in Qt's order, and no translation.
export interface Entry {
  context: string;
  source: string;
  comment?: string;
  translation?: string;
  forms?: string[];
}

export type Catalogue = ReadonlyMap<string, Entry>;

export function keyOf(context: string, source: string, comment = ""): string {
  return JSON.stringify([context, source, comment]);
}

export function catalogueOf(...files: readonly { entries: readonly Entry[] }[]): Catalogue {
  const catalogue = new Map<string, Entry>();
  for (const file of files) {
    for (const entry of file.entries) {
      catalogue.set(keyOf(entry.context, entry.source, entry.comment), entry);
    }
  }
  return catalogue;
}

// Qt's rule for Romanian: the first form for exactly one, the second for none and for a count that
// ends in 1 to 19, the third otherwise ("20 de puncte"). It is the rule the translation was written against.
export function romanianForm(n: number): 0 | 1 | 2 {
  const last = n % 100;
  if (n === 1) {
    return 0;
  }
  return n === 0 || (last >= 1 && last <= 19) ? 1 : 2;
}

// The catalogue of a language, or none for English, whose strings are the sources themselves.
let romanian: Catalogue | undefined;

export function catalogueFor(language: Language): Catalogue | null {
  if (language !== "ro") {
    return null;
  }
  romanian ??= catalogueOf(desktop as { entries: Entry[] }, page as { entries: Entry[] });
  return romanian;
}
