import { el } from "../dom/el";
import type { Card } from "../net/protocol";
import type { TableModel } from "../play/model";
import { CardView } from "./card";
import { cardPlacement } from "./geometry/trick";
import type { Place } from "./geometry/seats";
import { playedCardHeight } from "./space";

// Which cards the trick shows, and whether the winner is lit: a winner once there is something to
// beat. The server ranks a lone first card as winning, which it is, but until a second card is down
// the highlight says nothing the card does not.
export function isLit(table: readonly { winning: boolean }[], index: number): boolean {
  return table.length >= 2 && table[index].winning;
}

// The played cards round the logo, one element for each card that has been played, keyed by card
// code and kept for the next time it is: a deck holds no duplicates.
export class TrickView {
  readonly element: HTMLElement;
  private readonly cards = new Map<Card, CardView>();

  constructor() {
    this.element = el("div", { class: "trick" });
  }

  cardFor(card: Card): CardView {
    let view = this.cards.get(card);
    if (view === undefined) {
      view = new CardView("played");
      view.hide();
      this.cards.set(card, view);
      this.element.append(view.element);
    }
    return view;
  }

  clear(): void {
    for (const view of this.cards.values()) {
      view.hide();
    }
  }

  // Places every card of the table where it lies, and hides the rest.
  update(model: TableModel, places: readonly (Place | null)[]): void {
    const seatCount = model.seats.length;
    const height = playedCardHeight(seatCount);
    const onTable = new Set<Card>();

    model.table.forEach((played, index) => {
      const place = places[played.seat] ?? null;
      const view = this.cardFor(played.card);
      // A seat this table cannot place is a snapshot it cannot draw; leaving the card off is
      // better than inventing a place for it.
      if (place === null) {
        view.hide();
        return;
      }
      onTable.add(played.card);
      view.setCard(played.card);
      view.setHeight(height);
      view.placeAt(cardPlacement(seatCount, place));
      view.setLook(isLit(model.table, index) ? "winning" : "played");
      view.element.style.zIndex = String(index);
      view.show();
    });

    for (const [card, view] of this.cards) {
      if (!onTable.has(card)) {
        view.hide();
      }
    }
  }
}
