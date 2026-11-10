import { portraitUrl } from "../assets/assets";
import { el, setAttr, setSrc, setText, stamp } from "../dom/el";
import { t } from "../i18n/t";
import type { SeatView } from "../play/model";
import type { Rect } from "./space";
import { z } from "./space";

// How a seat's pill reads: nothing judged while bids are still coming in, then on target, owing
// tricks or over.
export type PillState = "neutral" | "good" | "warn" | "bad";

export interface Pill {
  text: string;
  state: PillState;
}

// What a seat's pill says. While anyone has still to bid, a bid is shown and not judged: nobody
// has taken a trick, so "on target" would be a claim about nothing.
export function pillFor(seat: SeatView, active: boolean, biddingOpen: boolean): Pill {
  if (!seat.hasBet) {
    return {
      text: active && biddingOpen ? t("SeatItem", "Bidding…") : t("SeatItem", "No bid yet"),
      state: "neutral",
    };
  }
  // Tricks taken first, then the bid, as the label says.
  const text = t("SeatItem", "Taken/Bid: %1/%2", [seat.tricksWon, seat.bet]);
  if (biddingOpen) {
    return { text, state: "neutral" };
  }
  if (seat.tricksWon === seat.bet) {
    return { text, state: "good" };
  }
  return { text, state: seat.tricksWon < seat.bet ? "warn" : "bad" };
}

export interface NameLine {
  // "▸" in front of the name of the seat to move, a shape cue beside the ring.
  marker: string;
  name: string;
}

export function nameLineFor(seat: SeatView, active: boolean): NameLine {
  return { marker: active ? "▸" : "", name: seat.name };
}

// A seat's name panel: its portrait, its name and its Taken/Bid pill.
export class SeatPanel {
  readonly element: HTMLElement;
  private readonly picture: HTMLImageElement;
  private readonly marker: HTMLElement;
  private readonly name: HTMLElement;
  private readonly pill: HTMLElement;

  constructor() {
    this.picture = el("img", { attrs: { alt: "", draggable: "false" } });
    this.marker = el("span", { class: "marker", attrs: { "aria-hidden": "true" } });
    this.name = el("span", { class: "name-text" });
    this.pill = el("div", { class: "pill" });
    this.element = el(
      "div",
      { class: "panel seat" },
      el("div", { class: "portrait" }, this.picture),
      el("div", { class: "who" }, el("div", { class: "name" }, this.marker, this.name), this.pill),
    );
    stamp(this.element);
  }

  // Draws the seat at its panel. Yours is under the others, and over your hand.
  update(seat: SeatView, panel: Rect, state: { active: boolean; biddingOpen: boolean; human: boolean }): void {
    const style = this.element.style;
    style.left = `${panel.x}px`;
    style.top = `${panel.y}px`;
    style.zIndex = String(state.human ? z.humanPanel : z.panels);

    const line = nameLineFor(seat, state.active);
    setText(this.marker, line.marker);
    this.marker.hidden = line.marker === "";
    setText(this.name, line.name);

    const url = portraitUrl(seat.avatar) ?? null;
    setSrc(this.picture, url);

    const pill = pillFor(seat, state.active, state.biddingOpen);
    setText(this.pill, pill.text);
    setAttr(this.pill, "data-state", pill.state);

    this.element.classList.toggle("active", state.active);
    this.element.dataset.seat = String(seat.seat);
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }
}
