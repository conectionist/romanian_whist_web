import { el } from "../dom/el";
import type { Card } from "../net/protocol";
import type { HandView as HandModel } from "../play/model";
import { CardView } from "./card";
import { handLabelFor } from "./names";
import { sizeForHeight } from "./cards";
import { cardPlacement, fanBounds as fanBoundsOf, scaledAbout } from "./geometry/hand";
import { touched } from "./pointer";
import { handCardHeight, type Placement, type Point, type Rect } from "./space";

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

// How a card was pressed: by the pointer that pressed it, or "keyboard" for Enter and Space.
export type Pointer = "mouse" | "pen" | "touch" | "keyboard";

// Your hand: a fan of cards at the bottom of the table, each a button resting in place. The card
// under the cursor rises when it can be played, and so does the one picked with the keys or a finger;
// a card that cannot be played is darkened and dulled and still shown.
export class HandView {
  readonly element: HTMLElement;
  private readonly slots = new Map<string, Slot>();
  private onPress: (slot: number, pointer: Pointer) => void = () => undefined;
  private onFocus: (slot: number) => void = () => undefined;
  private count = 0;
  // The slot picked, which rises as the one under the cursor does.
  private selected: number | null = null;
  private shown: HandModel = { entries: [], backs: 0, positions: [], playable: false };

  constructor() {
    this.element = el("div", { class: "hand" });
  }

  // Told which slot was pressed, and how, if it can be played.
  setHandler(onPress: (slot: number, pointer: Pointer) => void): void {
    this.onPress = onPress;
  }

  // Told which slot took the keyboard, if it can be played, so that Tab picks as an arrow does.
  setFocusHandler(onFocus: (slot: number) => void): void {
    this.onFocus = onFocus;
  }

  // Raises the picked slot, and puts the keyboard on it when asked, so a screen reader reads it.
  select(slot: number | null, focus = false): void {
    this.selected = slot;
    for (const entry of this.slots.values()) {
      this.paintSelection(entry);
    }
    if (focus && slot !== null) {
      const picked = Array.from(this.slots.values()).find((entry) => entry.slot === slot && entry.playable);
      picked?.view.element.focus({ preventScroll: true });
    }
  }

  // Only a card of the hand that can be played is picked; and one card is where Tab stops, the picked one
  // or else the first that can be played, so the fan is a single stop and not eight.
  private paintSelection(entry: Slot): void {
    const element = entry.view.element;
    element.classList.toggle("selected", entry.playable && entry.slot === this.selected);
    element.tabIndex = entry.playable && entry.slot === (this.selected ?? this.firstPlayable()) ? 0 : -1;
  }

  private firstPlayable(): number | null {
    let first: number | null = null;
    for (const entry of this.slots.values()) {
      if (entry.playable && !entry.view.element.hidden && (first === null || entry.slot < first)) {
        first = entry.slot;
      }
    }
    return first;
  }

  private slotFor(key: string): Slot {
    let entry = this.slots.get(key);
    if (entry === undefined) {
      const view = new CardView("held", "button");
      view.element.classList.add("hcard");
      const made: Slot = { view, slot: 0, playable: false };
      // The pointer that pressed it, which the click that follows does not say in every browser.
      let pointer: Pointer = "keyboard";
      // A press takes the focus before its click, which must not make the card the pick: on a touch
      // screen the first tap picks it, and a pick already made would play it.
      let pressing = false;
      view.element.addEventListener("pointerdown", (event) => {
        pressing = true;
        pointer = event.pointerType === "touch" || event.pointerType === "pen" ? event.pointerType : "mouse";
      });
      view.element.addEventListener("click", () => {
        const how = pointer;
        pointer = "keyboard";
        pressing = false;
        if (made.playable) {
          this.onPress(made.slot, how);
        } else {
          // The press took the focus; a card that cannot be played has no pick to hold it.
          view.element.blur();
        }
      });
      view.element.addEventListener("pointercancel", () => {
        pressing = false;
      });
      view.element.addEventListener("blur", () => {
        pressing = false;
      });
      view.element.addEventListener("focus", () => {
        if (made.playable && !pressing) {
          this.onFocus(made.slot);
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
      view.element.setAttribute("aria-label", handLabelFor(hand.backs > 0 ? null : hand.entries[slot].card, hand.playable, playable));
      view.show();
    }

    for (const [key, entry] of this.slots) {
      if (!used.has(key)) {
        this.retire(entry);
      }
    }
    for (const entry of this.slots.values()) {
      this.paintSelection(entry);
    }
  }

  // A slot that leaves the fan is hidden, and no longer a card that can be played.
  private retire(entry: Slot): void {
    entry.playable = false;
    entry.view.hide();
    entry.view.element.classList.remove("playable", "illegal", "selected");
    entry.view.element.setAttribute("aria-disabled", "true");
    entry.view.element.tabIndex = -1;
  }

  // Takes a card out of the fan the moment it is played, before the server has said so. The next
  // update puts it back if it is still in the hand.
  hideCard(card: Card): void {
    const entry = this.slots.get(card);
    if (entry !== undefined) {
      this.retire(entry);
    }
  }

  // The room the fan takes with all the cards a hand holds, as it is drawn now.
  fanBounds(): Rect {
    const { scale, origin } = this.drawnScale();
    return fanBoundsOf(sizeForHeight(handCardHeight), scale, origin);
  }

  // The fan's scale and the point it is scaled about, as the stylesheet draws it: 1 under a mouse, and on a
  // touch screen larger, which a card that leaves it has to start from.
  drawnScale(): { scale: number; origin: Point } {
    const style = getComputedStyle(this.element);
    const scale = style.scale === "none" ? 1 : parseFloat(style.scale);
    const [x, y] = style.transformOrigin.split(" ").map(parseFloat);
    return { scale: Number.isFinite(scale) ? scale : 1, origin: { x: x ?? 0, y: y ?? 0 } };
  }

  // Where this card is drawn in the fan, for a card that leaves it for the felt: a blind round's back
  // too, which is the fan's middle one.
  restingPlacement(card: Card): Placement | null {
    const slot = restingSlot(this.shown, card);
    const entry = slot === null ? undefined : this.slots.get(slotKey(this.shown, slot));
    if (entry === undefined || entry.view.element.hidden) {
      return null;
    }
    const { scale, origin } = this.drawnScale();
    const rest = scaledAbout(cardPlacement(this.count, entry.slot, sizeForHeight(handCardHeight)), scale, origin);
    return touched() ? this.raisedBy(entry.view.element, rest, scale) : rest;
  }

  // Under a finger a card is played from the place it is drawn at, which is raised if it is picked; a
  // mouse's flight starts at the rest, as the desktop's does. The raise is turned with the card and
  // scaled with the fan.
  private raisedBy(card: HTMLElement, rest: Placement, scale: number): Placement {
    const face = card.querySelector(".face");
    const lift = face === null ? 0 : new DOMMatrixReadOnly(getComputedStyle(face).transform).f;
    const turn = (rest.rotation * Math.PI) / 180;
    return { ...rest, x: rest.x - lift * Math.sin(turn) * scale, y: rest.y + lift * Math.cos(turn) * scale };
  }
}
