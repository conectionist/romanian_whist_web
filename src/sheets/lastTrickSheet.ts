import { cardUrl } from "../assets/assets";
import { el, setSrc, setText } from "../dom/el";
import { t } from "../i18n/t";
import type { Card, LastTrick } from "../net/protocol";
import { cardNameFor } from "../table/cardNames";
import { sizeForHeight } from "../table/cards";
import type { Sheet } from "./layer";
import { SheetButton, actions } from "./parts";
import { nameOf, type Seating } from "./seating";

// The last trick, src/ui/LastTrickSheet.cpp and LastTrick.cpp: the trick most recently won in the
// game, its cards in the order they were played, each over its player's name and the winner's
// ringed in gold.

// The line under the title: who won it, and for a trick from a round before the one on the table,
// which. Your own seat is "You", as in every sentence on the table; a game you watch has no "You".
// Whole sentences, so a translator can agree the verb.
export function metaFor(trick: LastTrick | null, seating: Seating, currentRound: number): string {
  if (trick === null || trick.cards.length === 0) {
    return t("lasttrick", "No trick has finished yet.");
  }
  const winner = trick.cards.find((played) => played.winning);
  // The engine names a winner for every finished trick; one with none says nothing rather than guess.
  if (winner === undefined) {
    return "";
  }
  const yours = seating.you !== null && seating.you === winner.seat;
  const round = trick.round + 1;
  // At the start of a round the last trick is the last round's, and the cards alone do not say so.
  if (round !== currentRound) {
    return yours
      ? t("lasttrick", "You won it · round %1", [round])
      : t("lasttrick", "%1 won it · round %2", [nameOf(seating, winner.seat), round]);
  }
  return yours ? t("lasttrick", "You won it") : t("lasttrick", "%1 won it", [nameOf(seating, winner.seat)]);
}

// Each card 88 wide at the art's own shape, 12 apart, and its player's name under it in the note
// type. The winner is ringed 2 wide in gold-bright and glows 16 round it.
export const CARD_WIDTH = 88;
export const CARD_GAP = 12;

export function cardHeight(): number {
  const probe = sizeForHeight(1000);
  return (CARD_WIDTH * probe.h) / probe.w;
}

export interface MiniCard {
  card: Card;
  name: string;
  winning: boolean;
}

export interface LastTrickFields {
  title: string;
  meta: string;
  cards: MiniCard[];
}

export function fieldsFor(trick: LastTrick | null, seating: Seating, currentRound: number): LastTrickFields {
  return {
    title: t("lasttrick", "Last trick"),
    meta: metaFor(trick, seating, currentRound),
    cards: (trick?.cards ?? []).map((played) => ({ card: played.card, name: nameOf(seating, played.seat), winning: played.winning })),
  };
}

export interface LastTrickActions {
  close(): void;
}

class Mini {
  readonly element: HTMLElement;
  private readonly picture = el("img", { class: "mini-face", attrs: { alt: "", draggable: "false" } });
  private readonly name = el("figcaption", { class: "sheet-note mini-name" });

  constructor() {
    this.element = el("figure", { class: "mini" }, this.picture, this.name);
    this.picture.style.height = `${cardHeight()}px`;
  }

  update(card: MiniCard): void {
    setSrc(this.picture, cardUrl(card.card));
    this.picture.alt = cardNameFor(card.card);
    setText(this.name, card.name);
    this.element.classList.toggle("win", card.winning);
  }
}

export class LastTrickSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly title = el("h2", { class: "sheet-title sheet-center", attrs: { id: "sheet-last-trick-title" } });
  private readonly meta = el("div", { class: "sheet-meta sheet-center" });
  private readonly row = el("div", { class: "mini-row" });
  private readonly close = new SheetButton(t("lasttrick", "Close"), "primary", "close");
  private readonly minis: Mini[] = [];

  constructor(handlers: LastTrickActions) {
    const buttons = actions(this.close);
    buttons.classList.add("center");
    this.element = el(
      "section",
      { class: "sheet fit", data: { sheet: "last-trick" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-last-trick-title" } },
      this.title,
      this.meta,
      this.row,
      buttons,
    );
    this.close.onClick(handlers.close);
  }

  update(fields: LastTrickFields): void {
    setText(this.title, fields.title);
    setText(this.meta, fields.meta);
    while (this.minis.length < fields.cards.length) {
      const mini = new Mini();
      this.minis.push(mini);
      this.row.append(mini.element);
    }
    this.minis.forEach((mini, index) => {
      const card = fields.cards[index];
      mini.element.hidden = card === undefined;
      if (card !== undefined) {
        mini.update(card);
      }
    });
    this.row.hidden = fields.cards.length === 0;
  }

  focusDefault(): void {
    this.close.focus();
  }
}
