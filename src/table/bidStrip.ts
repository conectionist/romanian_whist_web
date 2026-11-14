import { el, setAttr, setText, stamp } from "../dom/el";
import { t } from "../i18n/t";
import { translateGendered, yourGender, type Gendered } from "../i18n/person";
import type { TableModel } from "../play/model";

// The bid strip, src/table/BidStripItem.cpp: a panel on the felt, over the logo, while you bid. It
// asks the question, offers every bid from 0 to the most the hand allows, and says how the bids
// stand, or, if you bid last, which bid you may not make.

// "You bid last", which Romanian says as a man or as a woman: "Licitezi ultimul", "Licitezi ultima".
const YOU_BID_LAST: Gendered = {
  male: {
    source: "You bid last. %1 would make the bids add up to %2, and somebody has to be wrong.",
    comment: "about you, a man",
  },
  female: {
    source: "You bid last. %1 would make the bids add up to %2, and somebody has to be wrong.",
    comment: "about you, a woman",
  },
};

export interface Fields {
  question: string;
  note: string;
  // The most you may bid: the number of tricks, which is the number of cards in the hand.
  highest: number;
  // The one bid you may not make, when you bid last: a forbidden bid of 0 is still forbidden.
  forbidden: number | null;
}

// What the strip says, or null when there is no bid to ask for.
export function fieldsFor(model: TableModel): Fields | null {
  const prompt = model.prompt;
  if (prompt === null || prompt.kind !== "bet") {
    return null;
  }
  const highest = prompt.max;
  const fields: Fields = {
    question: t("bidstrip", "How many tricks will you take?"),
    note: "",
    highest,
    forbidden: prompt.forbidden,
  };

  // The forbidden bid is only ever sent to the seat that closes the bidding, so its presence is the
  // fact, and the sentence can say so outright.
  if (prompt.forbidden !== null) {
    fields.note = translateGendered("bidstrip", YOU_BID_LAST, yourGender(model), [prompt.forbidden, highest]);
    return fields;
  }

  // Otherwise how the bids stand: the bids already in and what they add up to, against this round's
  // tricks, singular or plural on the trick count.
  const bids = [model.betsPlaced, model.betSum, highest];
  fields.note =
    highest === 1
      ? t("bidstrip", "%1 bid so far, totalling %2 of %3 trick.", bids)
      : t("bidstrip", "%1 bid so far, totalling %2 of %3 tricks.", bids);
  return fields;
}

// The short reason for the one bid you may not make, or how the bids stand, which the scaled table gives on
// the line above your hand when the strip has no room for its note. Null when there is no strip.
export function shortNoteFor(model: TableModel): string | null {
  const prompt = model.prompt;
  if (prompt === null || prompt.kind !== "bet") {
    return null;
  }
  if (prompt.forbidden !== null) {
    return t("bidstrip", "Not %1: the bids would add up to %2.", [prompt.forbidden, prompt.max]);
  }
  const bids = [model.betSum, prompt.max];
  return prompt.max === 1 ? t("scoreboard", "Bids so far: %1 of %2 trick", bids) : t("scoreboard", "Bids so far: %1 of %2 tricks", bids);
}

// The band the scaled table gives the strip, in its units: the strip is `w` wide from `x`, with its middle at
// `y`.
export interface Band {
  x: number;
  y: number;
  w: number;
}

// Each bid is 48 wide with 8 between, the label beside them takes 108 and its gap and padding 24 more.
const BID_PITCH = 56;
const LABEL_ROOM = 108;
const STRIP_PADDING = 24;

// Whether "Your bid" stands beside the bids or leads the note, and how many bids make a row when they must
// wrap: evenly, so a second row is not left with one.
export function stripFlowFor(count: number, width: number): { inline: boolean; columns: number } {
  const inline = width - STRIP_PADDING - LABEL_ROOM >= count * BID_PITCH - 8;
  const fit = Math.max(1, Math.floor((width - (inline ? STRIP_PADDING + LABEL_ROOM : STRIP_PADDING) + 8) / BID_PITCH));
  return { inline, columns: Math.ceil(count / Math.ceil(count / fit)) };
}

// Whether the strip offers this bid. A forbidden bid of zero is still forbidden, which is why this
// tests that there is one and not its value: zero is a legal bid.
export function offers(fields: Pick<Fields, "highest" | "forbidden">, bet: number): boolean {
  return bet >= 0 && bet <= fields.highest && !(fields.forbidden !== null && fields.forbidden === bet);
}

export class BidStrip {
  readonly element: HTMLElement;
  private readonly question = el("div", { class: "bid-question" });
  // "Your bid", which stands in the scaled table where the question does on the desktop's.
  private readonly label = el("div", { class: "bid-label", attrs: { "aria-hidden": "true" }, text: t("bidstrip", "Your bid") });
  private readonly row = el("div", { class: "bid-row" });
  private readonly lead = el("span", { class: "bid-lead", attrs: { "aria-hidden": "true" } });
  private readonly words = el("span");
  private readonly note = el("div", { class: "bid-note" }, this.lead, this.words);
  private band: Band | null = null;
  private readonly buttons: HTMLButtonElement[] = [];
  private onBid: (bet: number) => void = () => undefined;
  private onFocus: (bet: number) => void = () => undefined;
  private fields: Fields | null = null;
  // The bid picked with the keys, which is lit as the one under the cursor is.
  private selected: number | null = null;

  constructor() {
    this.question.id = "bid-question";
    this.element = el("div", { class: "panel bidstrip", attrs: { role: "group", "aria-labelledby": "bid-question" } }, this.question, this.label, this.row, this.note);
    this.element.hidden = true;
    stamp(this.element);
  }

  // Told which bid was chosen.
  setHandler(onBid: (bet: number) => void): void {
    this.onBid = onBid;
  }

  // Told which bid took the keyboard, if it is offered, so that Tab picks as an arrow does.
  setFocusHandler(onFocus: (bet: number) => void): void {
    this.onFocus = onFocus;
  }

  // Lights the picked bid, and puts the keyboard on it when asked.
  select(bet: number | null, focus = false): void {
    this.selected = bet;
    this.paintSelection();
    if (focus && bet !== null) {
      this.buttons[bet]?.focus({ preventScroll: true });
    }
  }

  private paintSelection(): void {
    this.buttons.forEach((button, bet) => {
      const offered = !button.disabled && !button.hidden;
      button.classList.toggle("selected", bet === this.selected && offered);
      // A bid that is offered is a button that is pressed when it is the pick, which a screen reader says.
      if (offered) {
        button.setAttribute("aria-pressed", String(bet === this.selected));
      } else {
        button.removeAttribute("aria-pressed");
      }
    });
  }

  private button(bet: number): HTMLButtonElement {
    while (this.buttons.length <= bet) {
      const number = this.buttons.length;
      const button = el("button", { class: "opt", attrs: { type: "button" }, data: { bid: String(number) }, text: String(number) });
      button.addEventListener("click", () => {
        if (this.fields !== null && offers(this.fields, number)) {
          this.onBid(number);
        }
      });
      button.addEventListener("focus", () => {
        if (this.fields !== null && offers(this.fields, number)) {
          this.onFocus(number);
        }
      });
      this.buttons.push(button);
      this.row.append(button);
    }
    return this.buttons[bet];
  }

  // Draws the strip in the scaled table's band, or on the desktop's felt, as the stylesheet puts it, for none.
  place(band: Band | null): void {
    this.band = band;
    const style = this.element.style;
    if (band === null) {
      for (const name of ["left", "top", "width", "transform"] as const) {
        style[name] = "";
      }
      this.row.style.maxWidth = "";
      this.element.removeAttribute("data-label");
      this.note.hidden = false;
      setText(this.lead, "");
      return;
    }
    style.left = `${band.x}px`;
    style.top = `${band.y}px`;
    style.width = `${band.w}px`;
    style.transform = "translateY(-50%)";
    this.flow();
  }

  // Where the label stands, and how the bids wrap, for the band's width and the bids offered.
  private flow(): void {
    if (this.band === null || this.fields === null) {
      return;
    }
    const { inline, columns } = stripFlowFor(this.fields.highest + 1, this.band.w);
    this.row.style.maxWidth = `${columns * BID_PITCH - 8}px`;
    setAttr(this.element, "data-label", inline ? "inline" : "note");
    setText(this.lead, inline ? "" : `${t("bidstrip", "Your bid")}. `);
  }

  // How tall the strip is as it stands, in the units of the page it is placed in.
  height(): number {
    return this.element.hidden ? 0 : this.element.offsetHeight;
  }

  // Whether the strip, with its note, is taller than the room the band leaves it.
  crowded(room: number): boolean {
    return !this.element.hidden && this.band !== null && this.element.offsetHeight > room;
  }

  // The note goes when the strip has no room for it.
  showNote(shown: boolean): void {
    this.note.hidden = !shown;
  }

  // Whether "Your bid" leads the note, and so leads the short reason too.
  get leadsNote(): boolean {
    return this.band !== null && this.element.getAttribute("data-label") === "note";
  }

  update(model: TableModel | null): void {
    const fields = model === null ? null : fieldsFor(model);
    this.fields = fields;
    this.element.hidden = fields === null;
    if (fields === null) {
      return;
    }
    setText(this.question, fields.question);
    setText(this.words, fields.note);
    this.flow();
    for (let bet = 0; bet <= fields.highest; bet++) {
      const button = this.button(bet);
      button.hidden = false;
      button.disabled = !offers(fields, bet);
    }
    for (let bet = fields.highest + 1; bet < this.buttons.length; bet++) {
      this.buttons[bet].hidden = true;
    }
    this.paintSelection();
  }
}
