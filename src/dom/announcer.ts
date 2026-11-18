import { el } from "../dom/el";

// How many of the last things said are kept in the region: a screen reader reads what is added, and
// what has been read need not stay, though a person who goes back over it finds the last round. A round
// says at most about 75 lines, with six players holding eight cards, so a hundred keeps one whole.
export const KEPT = 100;

// A live region a screen reader reads out politely, one sentence for each thing added, and which
// nothing on the screen shows.
export class Announcer {
  readonly element: HTMLElement;

  constructor() {
    this.element = el("div", { class: "sr-only", attrs: { role: "log", "aria-live": "polite", "aria-relevant": "additions" } });
  }

  say(text: string): void {
    this.element.append(el("div", { text }));
    while (this.element.childElementCount > KEPT) {
      this.element.firstElementChild?.remove();
    }
  }
}
