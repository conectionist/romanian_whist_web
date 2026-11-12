// Finds the strings the page translates, by reading its source: every t() call whose context and
// source are literals, and the sources inside the gendered variants that translateGendered and
// translateSentence take. A call whose context or source is not a literal is reported, so none
// escapes the check.

export interface Literal {
  context: string;
  source: string;
  comment: string;
  where: string;
}

export interface Found {
  literals: Literal[];
  // Calls that name their context or source with something that is not a literal.
  unreadable: string[];
}

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" };

interface Read {
  value: string;
  end: number;
}

// The string literal that starts at `at`, or null. A template literal with a substitution is not one.
export function readString(text: string, at: number): Read | null {
  const quote = text[at];
  if (quote !== '"' && quote !== "'" && quote !== "`") {
    return null;
  }
  let value = "";
  for (let index = at + 1; index < text.length; index++) {
    const char = text[index];
    if (char === quote) {
      return { value, end: index + 1 };
    }
    if (quote === "`" && char === "$" && text[index + 1] === "{") {
      return null;
    }
    if (char !== "\\") {
      value += char;
      continue;
    }
    const next = text[index + 1];
    if (next === "u" && text[index + 2] === "{") {
      const close = text.indexOf("}", index);
      value += String.fromCodePoint(parseInt(text.slice(index + 3, close), 16));
      index = close;
    } else if (next === "u") {
      value += String.fromCharCode(parseInt(text.slice(index + 2, index + 6), 16));
      index += 5;
    } else if (next === "x") {
      value += String.fromCharCode(parseInt(text.slice(index + 2, index + 4), 16));
      index += 3;
    } else {
      value += ESCAPES[next] ?? next;
      index += 1;
    }
  }
  return null;
}

function skipSpace(text: string, at: number): number {
  let index = at;
  for (;;) {
    while (index < text.length && /\s/.test(text[index])) {
      index++;
    }
    if (text.startsWith("//", index)) {
      index = text.indexOf("\n", index);
      index = index < 0 ? text.length : index;
    } else if (text.startsWith("/*", index)) {
      index = text.indexOf("*/", index) + 2;
    } else {
      return index;
    }
  }
}

// The index just past the bracket that closes the one `at` opens, skipping strings.
function closing(text: string, at: number): number {
  let depth = 0;
  for (let index = at; index < text.length; index++) {
    const char = text[index];
    const string = readString(text, index);
    if (string !== null) {
      index = string.end - 1;
    } else if ("([{".includes(char)) {
      depth++;
    } else if (")]}".includes(char)) {
      depth--;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return text.length;
}

function lineOf(text: string, at: number): number {
  return text.slice(0, at).split("\n").length;
}

// A comment key in an options object or a variant: comment: "...".
function commentIn(text: string): string {
  const found = /\bcomment\s*:\s*/.exec(text);
  return found === null ? "" : (readString(text, found.index + found[0].length)?.value ?? "");
}

function calls(text: string, file: string, into: Found): void {
  for (const match of text.matchAll(/(?<![\w.$])t\(/g)) {
    if (/function\s+$/.test(text.slice(0, match.index))) {
      continue;
    }
    const open = match.index + match[0].length - 1;
    const where = `${file}:${lineOf(text, open)}`;
    const context = readString(text, skipSpace(text, open + 1));
    const comma = context === null ? -1 : skipSpace(text, context.end);
    const source = comma >= 0 && text[comma] === "," ? readString(text, skipSpace(text, comma + 1)) : null;
    if (context === null || source === null) {
      into.unreadable.push(where);
      continue;
    }
    const rest = text.slice(source.end, closing(text, open));
    into.literals.push({ context: context.value, source: source.value, comment: commentIn(rest), where });
  }
}

// The variants a declaration of Gendered or Sentence holds, filed in the context of the sentence:
// the one the declaration names, or else the one the code that translates it passes.
function variants(text: string, file: string, into: Found): void {
  for (const declaration of text.matchAll(/\bconst\s+(\w+)\s*:\s*(?:Gendered|Sentence)\s*=\s*\{/g)) {
    const open = declaration.index + declaration[0].length - 1;
    const body = text.slice(open, closing(text, open));
    let context = /\bcontext\s*:\s*("[^"]*")/.exec(body)?.[1];
    context ??= new RegExp(`translate(?:Gendered|Sentence)\\(\\s*("[^"]*")\\s*,\\s*${declaration[1]}\\b`).exec(text)?.[1];
    for (const variant of body.matchAll(/\{\s*source\s*:\s*/g)) {
      const at = variant.index + variant[0].length;
      const source = readString(body, at);
      const where = `${file}:${lineOf(text, open + variant.index)}`;
      const named = context === undefined ? null : readString(context, 0);
      if (source === null || named === null) {
        into.unreadable.push(where);
        continue;
      }
      const end = closing(body, variant.index);
      into.literals.push({ context: named.value, source: source.value, comment: commentIn(body.slice(source.end, end)), where });
    }
  }
}

export function literalsIn(text: string, file: string): Found {
  const found: Found = { literals: [], unreadable: [] };
  calls(text, file, found);
  variants(text, file, found);
  return found;
}
