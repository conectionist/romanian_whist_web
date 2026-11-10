import { el } from "../dom/el";
import type { Card } from "../net/protocol";
import type { HandView as HandModel } from "../play/model";
import { CardView } from "./card";
import { sizeForHeight } from "./cards";
import { cardPlacement } from "./geometry/hand";
import { handCardHeight, type Placement } from "./space";

// Whether a click on this slot plays its card: the one rule for the mouse and for the keys, which
// share it. Only on your turn, from the prompt, and a back is always playable: both blind rounds
// are one-trick rounds with one card and no decision, and the back is still a button.
export function isPlayable(hand: HandModel, slot: number): boolean {
  if (!hand.playable) {
    return false;
  }
  if (hand.backs > 0) {
    return slot >= 0 && slot < hand.backs;
  }
  return slot >= 0 && slot < hand.entries.length && hand.entries[slot].legal;
}

// What a slot holds: a card, or a back in a blind round. The key a slot's element is kept under.
export function slotKey(hand: HandModel, slot: number): string {
  return hand.backs > 0 ? `back:${slot}` : hand.entries[slot].card;
}

export function slotCount(hand: HandModel): number {
  return hand.backs > 0 ? hand.backs : hand.entries.length;
}

// The slot a card rests in, which it leaves for the felt. In a blind round there is no card to name,
// and the fan's middle back is the one that goes.
export function restingSlot(hand: HandModel, card: Card): number | null {
  if (hand.backs > 0) {
    return (hand.backs - 1) >> 1;
  }
  const at = hand.entries.findIndex((entry) => entry.card === card);
  return at < 0 ? null : at;
}

interface Slot {
  view: CardView;
  slot: number;
  playable: boolean;
}

// Your hand: a fan of cards at the bottom of the table, each a button resting in place. The card
// under the cursor rises when it can be played, and a card that cannot is darkened and dulled and
// still shown.
export class HandView {
  readonly element: HTMLElement;
  private readonly slots = new Map<string, Slot>();
  private onPlay: (slot: number) => void = () => undefined;
  private count = 0;
  private shown: HandModel = { entries: [], backs: 0, positions: [], playable: false };

  constructor() {
    this.element = el("div", { class: "hand" });
  }

  // Told which slot was clicked, if it can be played.
  setHandler(onPlay: (slot: number) => void): void {
    this.onPlay = onPlay;
  }

  private slotFor(key: string): Slot {
    let entry = this.slots.get(key);
    if (entry === undefined) {
      const view = new CardView("held", "button");
      view.element.classList.add("hcard");
      const made: Slot = { view, slot: 0, playable: false };
      view.element.addEventListener("click", () => {
        if (made.playable) {
          this.onPlay(made.slot);
        }
      });
      this.slots.set(key, made);
      this.element.append(view.element);
      entry = made;
    }
    return entry;
  }

  update(hand: HandModel, visible: boolean): void {
    this.element.hidden = !visible;
    const count = slotCount(hand);
    this.count = count;
    this.shown = hand;
    const size = sizeForHeight(handCardHeight);
    const used = new Set<string>();

    for (let slot = 0; slot < count; slot++) {
      const key = slotKey(hand, slot);
      used.add(key);
      const entry = this.slotFor(key);
      const playable = isPlayable(hand, slot);
      entry.slot = slot;
      entry.playable = playable;

      const view = entry.view;
      view.setCard(hand.backs > 0 ? null : hand.entries[slot].card);
      view.setHeight(handCardHeight);
      view.placeAt(cardPlacement(count, slot, size));
      view.element.style.zIndex = String(slot);
      view.element.dataset.slot = String(slot);
      view.setDimmed(hand.backs === 0 && !hand.entries[slot].legal);
      view.element.classList.toggle("playable", playable);
      view.element.classList.toggle("illegal", hand.playable && !playable);
      view.element.setAttribute("aria-disabled", playable ? "false" : "true");
      view.show();
    }

    for (const [key, entry] of this.slots) {
      if (!used.has(key)) {
        entry.view.hide();
      }
    }
  }

  // Takes a card out of the fan the moment it is played, before the server has said so. The next
  // update puts it back if it is still in the hand.
  hideCard(card: Card): void {
    this.slots.get(card)?.view.hide();
  }

  // Where this card rests in the fan, for a card that leaves it for the felt.
  restingPlacement(card: Card): Placement | null {
    const slot = restingSlot(this.shown, card);
    const entry = slot === null ? undefined : this.slots.get(slotKey(this.shown, slot));
    if (entry === undefined || entry.view.element.hidden) {
      return null;
    }
    return cardPlacement(this.count, entry.slot, sizeForHeight(handCardHeight));
  }

  // The element for a card, for the page's tests and captures.
  elementOf(card: Card): HTMLElement | null {
    return this.slots.get(card)?.view.element ?? null;
  }
}
