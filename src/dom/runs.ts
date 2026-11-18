import { el } from "./el";

// A line of text in more than one voice, as the corner panels write them: "Leader: Bogdan · Led ♥"
// with the name standing out. What a line says and which part stands out are decided by free
// functions and tested without a DOM; renderRuns() sets them.
export interface Run {
  text: string;
  // Stands out: cream against a muted line, or bold.
  strong?: boolean;
  // Gives way when the line is too long: the name, which is player text.
  elide?: boolean;
}

export type Line = Run[];

export function textOf(line: Line): string {
  return line.map((run) => run.text).join("");
}

// A sentence with one part standing out: `sentence` holds %1 where `strong` goes. The sentence is
// the translator's, so %1 may be anywhere in it, or at either end. `strong` false leaves the part
// plain, for a name that gives way and does not stand out.
export function emphasised(sentence: string, parts: Run[], strong = true): Line {
  const at = sentence.indexOf("%1");
  if (at < 0) {
    return [{ text: sentence }];
  }
  const line: Line = [];
  if (at > 0) {
    line.push({ text: sentence.slice(0, at) });
  }
  line.push(...parts.map((run) => (strong ? { ...run, strong: true } : run)));
  if (at + 2 < sentence.length) {
    line.push({ text: sentence.slice(at + 2) });
  }
  return line;
}

const SUITS = /([♥♦♠♣])/;

// Text with each suit glyph in its suit's colour, whatever run it is in: red for hearts and
// diamonds, cream for spades and clubs, which would vanish if they took a dark panel's. Only text
// nodes and spans: nothing in the text is read as markup.
function appendText(parent: HTMLElement, text: string): void {
  for (const piece of text.split(SUITS)) {
    if (piece === "") {
      continue;
    }
    if (piece === "♥" || piece === "♦" || piece === "♠" || piece === "♣") {
      // The variation selector asks for the glyph and not the coloured emoji, which takes no colour.
      parent.append(el("span", { class: piece === "♥" || piece === "♦" ? "red" : "black", text: `${piece}\uFE0E` }));
    } else {
      parent.append(document.createTextNode(piece));
    }
  }
}

// Sets the line into a flex row that keeps to one line: the name gives way with an ellipsis, and
// everything else stays.
export function renderRuns(container: HTMLElement, line: Line): void {
  const spans = line.map((run) => {
    const span = el("span", { class: ["run", run.strong ? "strong" : "", run.elide ? "elide" : ""].filter(Boolean).join(" ") });
    appendText(span, run.text);
    return span;
  });
  container.replaceChildren(...spans);
}

// A line of text with its suits coloured, set into the node as it is: no flex row, no elision.
export function renderSuited(node: HTMLElement, text: string): void {
  node.replaceChildren();
  appendText(node, text);
}
