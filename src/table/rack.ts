import { cardBackUrl, cardUrl } from "../assets/assets";
import { el, setSrc, stamp } from "../dom/el";
import type { Card } from "../net/protocol";
import type { SeatView } from "../play/model";
import {
  MOST_CARDS,
  RAIL_RADIUS,
  cardQuad,
  cardTransform,
  cssMatrix3d,
  frameRotation,
  railRect,
  railScale,
  scaledSource,
} from "./geometry/rack";
import { rackOrigin } from "./geometry/seats";

// How many times larger than the flat card each card's element is made: its picture is sampled at
// the far end's magnification, so the far end stays sharp. The matrix takes the size back out.
const SOURCE_SCALE = 2;

// What a rack shows.
export interface Shown {
  // How many cards stand in the rack. None draws nothing, not even the rail.
  count: number;
  // The cards face up, left to right in the rack's frame, where the seat's hand can be seen: a
  // Forehead round. Empty otherwise, and every card is a back.
  faces: Card[];
}

// A seat's rack. The snapshot fills a seat's hand only where the viewer may see it, so a non-empty
// hand is the permission; a watcher's game fills none and shows backs throughout. Otherwise one
// back per card left.
export function shownFor(seat: SeatView): Shown {
  if (seat.hand.length > 0) {
    const faces = seat.hand.map((entry) => entry.card);
    return { count: faces.length, faces };
  }
  return { count: Math.min(seat.cardsLeft, MOST_CARDS), faces: [] };
}

export function sameShown(a: Shown, b: Shown): boolean {
  return a.count === b.count && a.faces.length === b.faces.length && a.faces.every((card, index) => card === b.faces[index]);
}

// One opponent's hand, standing in a wooden rack on the rim. The frame has its origin on the rim,
// +x along it and +y outward, and is turned into place; each card is a flat picture drawn through
// the projective transform of the quad it stands in.
export class RackView {
  readonly element: HTMLElement;
  private readonly row: HTMLElement;
  private readonly rail: HTMLElement;
  private readonly cards: { element: HTMLElement; picture: HTMLImageElement }[] = [];
  private shown: Shown = { count: 0, faces: [] };
  private angle: number | null = null;

  constructor() {
    this.rail = el("div", { class: "rail" });
    this.row = el("div", { class: "rack-row" }, this.rail);
    this.element = el("div", { class: "rack" }, this.row);
    stamp(this.element);
  }

  // Stands the rack on the rim at `angle` and shows what it holds.
  update(shown: Shown, angle: number): void {
    if (angle !== this.angle) {
      this.angle = angle;
      const origin = rackOrigin(angle);
      this.element.style.left = `${origin.x}px`;
      this.element.style.top = `${origin.y}px`;
      this.element.style.transform = `rotate(${frameRotation(angle)}deg)`;
    }

    const changed = !sameShown(shown, this.shown);
    this.shown = shown;
    this.element.hidden = shown.count === 0;
    if (!changed && this.cards.length > 0) {
      return;
    }

    while (this.cards.length < shown.count) {
      const picture = el("img", { attrs: { alt: "", draggable: "false" } });
      const element = el("div", { class: "rack-card" }, picture);
      this.row.insertBefore(element, this.rail);
      this.cards.push({ element, picture });
    }

    this.cards.forEach((card, index) => {
      const present = index < shown.count;
      card.element.hidden = !present;
      if (!present) {
        return;
      }
      const face = shown.faces[index];
      setSrc(card.picture, face === undefined ? cardBackUrl : cardUrl(face));
      card.element.classList.toggle("face", face !== undefined);
      const matrix = cssMatrix3d(scaledSource(cardTransform(shown.count, index), SOURCE_SCALE));
      card.element.style.transform = matrix;
    });

    const rail = railRect(shown.count);
    this.rail.hidden = rail === null;
    if (rail !== null) {
      const style = this.rail.style;
      style.left = `${rail.x}px`;
      style.top = `${rail.y}px`;
      style.width = `${rail.w}px`;
      style.height = `${rail.h}px`;
      style.borderRadius = `${RAIL_RADIUS * railScale()}px`;
    }
  }

  // The corners the card at this index is drawn through, for tests and captures.
  quad(index: number) {
    return cardQuad(this.shown.count, index);
  }

  hide(): void {
    this.element.hidden = true;
  }
}
