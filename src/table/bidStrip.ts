import { el, setText, stamp } from "../dom/el";
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

// Whether the strip offers this bid. A forbidden bid of zero is still forbidden, which is why this
// tests that there is one and not its value: zero is a legal bid.
export function offers(fields: Pick<Fields, "highest" | "forbidden">, bet: number): boolean {
  return bet >= 0 && bet <= fields.highest && !(fields.forbidden !== null && fields.forbidden === bet);
}

export class BidStrip {
  readonly element: HTMLElement;
  private readonly question = el("div", { class: "bid-question" });
  private readonly row = el("div", { class: "bid-row" });
  private readonly note = el("div", { class: "bid-note" });
  private readonly buttons: HTMLButtonElement[] = [];
  private onBid: (bet: number) => void = () => undefined;
  private onFocus: (bet: number) => void = () => undefined;
  private fields: Fields | null = null;
  // The bid picked with the keys, which is lit as the one under the cursor is.
  private selected: number | null = null;

  constructor() {
    this.element = el("div", { class: "panel bidstrip" }, this.question, this.row, this.note);
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
    this.buttons.forEach((button, bet) => button.classList.toggle("selected", bet === this.selected && !button.disabled && !button.hidden));
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

  update(model: TableModel | null): void {
    const fields = model === null ? null : fieldsFor(model);
    this.fields = fields;
    this.element.hidden = fields === null;
    if (fields === null) {
      return;
    }
    setText(this.question, fields.question);
    setText(this.note, fields.note);
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
