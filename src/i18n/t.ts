import { currentLanguage } from "./language";
import { catalogueFor, keyOf, romanianForm } from "./translations";

export interface TranslateOptions {
  // Tells apart two sentences that read alike in English; a catalogue keys on it, as Qt's does.
  comment?: string;
  // What %n becomes, and which of a translation's forms is used.
  n?: number;
  // English's singular, used when n is 1 and the page has no translation: the source is the plural,
  // and English has no catalogue to hold the other form.
  one?: string;
}

// Mirrors Qt's translate() and multi-argument arg(): the language's catalogue is asked for the
// source in its context, and a source it has no entry for is shown as it is. One pass over the
// text, so an argument that holds "%2" is never substituted again. The arguments go to the
// placeholders of the source, lowest-numbered first, so a translation may reorder them or leave one
// out.
export function t(
  context: string,
  source: string,
  args: readonly (string | number)[] = [],
  options: TranslateOptions = {},
): string {
  const entry = catalogueFor(currentLanguage())?.get(keyOf(context, source, options.comment));
  let text: string;
  if (entry?.forms !== undefined) {
    text = entry.forms[Math.min(romanianForm(options.n ?? 1), entry.forms.length - 1)];
  } else if (entry?.translation !== undefined) {
    text = entry.translation;
  } else {
    text = options.n === 1 && options.one !== undefined ? options.one : source;
  }

  const numbers = [...new Set([...source.matchAll(/%([1-9])/g)].map((found) => Number(found[1])))].sort(
    (a, b) => a - b,
  );
  return text.replace(/%([1-9n])/g, (placeholder, which: string) => {
    if (which === "n") {
      return options.n === undefined ? placeholder : String(options.n);
    }
    const argument = args[numbers.indexOf(Number(which))];
    return argument === undefined ? placeholder : String(argument);
  });
}
