export interface TranslateOptions {
  // Tells apart two sentences that read alike in English; a catalogue keys on it, as Qt's does.
  comment?: string;
  // What %n becomes.
  n?: number;
}

// Mirrors Qt's translate() and multi-argument arg(): the source is the text, and the context, which
// files it in a catalogue, is not read. One pass over the source, so an argument that holds "%2" is
// never substituted again; the lowest-numbered placeholder takes the first argument.
export function t(
  _context: string,
  source: string,
  args: readonly (string | number)[] = [],
  options: TranslateOptions = {},
): string {
  const numbers = [...new Set([...source.matchAll(/%([1-9])/g)].map((found) => Number(found[1])))].sort(
    (a, b) => a - b,
  );
  return source.replace(/%([1-9n])/g, (placeholder, which: string) => {
    if (which === "n") {
      return options.n === undefined ? placeholder : String(options.n);
    }
    const argument = args[numbers.indexOf(Number(which))];
    return argument === undefined ? placeholder : String(argument);
  });
}
