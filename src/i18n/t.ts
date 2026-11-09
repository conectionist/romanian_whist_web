export interface TranslateOptions {
  // Tells apart two sentences that read alike in English; a catalogue keys on it, as Qt's does.
  comment?: string;
  // What %n becomes.
  n?: number;
}

// Mirrors QCoreApplication::translate(context, source, comment, n) followed by arg(...): English
// only, so the source is the text, and the context, which files it in a catalogue, is not read.
// The arguments go in with one pass over the source, as Qt's
// multi-argument arg() does, so an argument that contains "%2" is never substituted again. The
// lowest-numbered placeholder takes the first argument, the next the second, and so on.
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
