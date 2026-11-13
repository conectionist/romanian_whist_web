import { cardBackUrl, cardUrl } from "../assets/assets";
import { el, setSrc, stamp } from "../dom/el";
import type { Card } from "../net/protocol";
import { cardNameFor } from "./cardNames";
import { sizeForHeight } from "./cards";
import type { Placement } from "./space";

// What a card casts: on the felt, plain or the trick's winner; in your hand, at rest or raised
// under the cursor.
export type Look = "played" | "winning" | "held" | "raised";

// A card, drawn the same in the trick and in your hand: an outer element that is placed and turned,
// and a face inside it that casts the shadow and rises.
export class CardView {
  readonly element: HTMLElement;
  readonly face: HTMLElement;
  private readonly picture: HTMLImageElement;
  private card: Card | null | undefined;
  private height = 0;
  private placed: Placement | null = null;

  constructor(look: Look, tag: "div" | "button" = "div") {
    this.picture = el("img", { attrs: { alt: "", draggable: "false" } });
    this.face = el("div", { class: "face" }, this.picture);
    this.element = el(tag, { class: `card ${look}`, attrs: tag === "button" ? { type: "button" } : {} }, this.face);
    stamp(this.element);
  }

  // The card's face, or its back for null.
  setCard(card: Card | null): void {
    if (card === this.card) {
      return;
    }
    this.card = card;
    setSrc(this.picture, card === null ? cardBackUrl : cardUrl(card));
    // A card is named where it lies; a back has nothing to say.
    this.picture.alt = card === null ? "" : cardNameFor(card);
    if (card === null) {
      delete this.element.dataset.card;
    } else {
      this.element.dataset.card = card;
    }
  }

  setLook(look: Look): void {
    for (const name of ["played", "winning", "held", "raised"] as const) {
      this.element.classList.toggle(name, name === look);
    }
  }

  setDimmed(dimmed: boolean): void {
    this.element.classList.toggle("dimmed", dimmed);
  }

  // The card's height in table units; its width follows from the art.
  setHeight(height: number): void {
    if (height === this.height) {
      return;
    }
    this.height = height;
    const size = sizeForHeight(height);
    this.element.style.width = `${size.w}px`;
    this.element.style.height = `${size.h}px`;
    // The place is the card's centre, so it moves with the size.
    if (this.placed !== null) {
      this.placeAt(this.placed, true);
    }
  }

  // Puts the card's centre at the placement, turned.
  placeAt(place: Placement, force = false): void {
    if (!force && this.placed !== null && this.placed.x === place.x && this.placed.y === place.y && this.placed.rotation === place.rotation) {
      return;
    }
    this.placed = place;
    const size = sizeForHeight(this.height);
    const style = this.element.style;
    style.left = `${place.x - size.w / 2}px`;
    style.top = `${place.y - size.h / 2}px`;
    style.transform = place.rotation === 0 ? "" : `rotate(${place.rotation}deg)`;
  }

  get place(): Placement | null {
    return this.placed;
  }

  hide(): void {
    this.element.hidden = true;
  }

  show(): void {
    this.element.hidden = false;
  }
}
