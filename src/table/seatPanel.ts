import { portraitUrl } from "../assets/assets";
import { el, setAttr, setSrc, setText, stamp, svg } from "../dom/el";
import { icon } from "../dom/icons";
import { t } from "../i18n/t";
import { presenceText } from "../lobby/lobby";
import { seatLabelFor } from "./names";
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

// What a flat plate says in place of the pill: the taken and the bid and no words, and a short form of
// the two that have words. The seat's label, which a screen reader is given, keeps the whole pill.
export function shortPillFor(seat: SeatView, active: boolean, biddingOpen: boolean): string {
  if (!seat.hasBet) {
    return active && biddingOpen ? t("SeatItem", "Bidding…") : t("SeatItem", "No bid");
  }
  return `${seat.tricksWon}/${seat.bet}`;
}

// A prompt's last seconds, as a ring round your name panel: it is full when 15 seconds are left and
// empties as they go, in the warning colour and then the bad one, and the seconds are written too, so
// the colour is never the only cue.
export const COUNTDOWN_MS = 15000;
const URGENT_MS = 5000;

export interface Countdown {
  seconds: number;
  // How much of the ring is left, 1 to 0.
  fraction: number;
  urgent: boolean;
}

export function countdownFor(deadlineAt: number | null, now: number): Countdown | null {
  if (deadlineAt === null) {
    return null;
  }
  const left = deadlineAt - now;
  if (left > COUNTDOWN_MS || left < 0) {
    return null;
  }
  return { seconds: Math.ceil(left / 1000), fraction: left / COUNTDOWN_MS, urgent: left <= URGENT_MS };
}

export interface NameLine {
  // "▸" in front of the name of the seat to move, a shape cue beside the ring.
  marker: string;
  name: string;
}

export function nameLineFor(seat: SeatView, active: boolean): NameLine {
  return { marker: active ? "▸" : "", name: seat.name };
}

// How a panel is drawn: the desktop's plaque, an opponent's flat plate on the scaled table, or your own
// one-line plate there.
export type Look = "plaque" | "plate" | "mine";

// The ring round a panel, in the panel's own units: the panel's size and a rounding 1.5 past its corner.
const RING: Record<Look, { w: number; h: number }> = {
  plaque: { w: 259, h: 118 },
  plate: { w: 128, h: 54 },
  mine: { w: 184, h: 38 },
};

// A seat's name panel: its portrait, its name and its Taken/Bid pill.
export class SeatPanel {
  readonly element: HTMLElement;
  private readonly picture: HTMLImageElement;
  private readonly marker: HTMLElement;
  private readonly name: HTMLElement;
  private readonly pill: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly ring: SVGRectElement;
  private readonly ringBox: SVGSVGElement;
  private readonly badge: HTMLElement;
  private look: Look = "plaque";
  private presence: SeatView["presence"] = null;
  private gender: SeatView["gender"] = "male";
  private counting = false;

  constructor() {
    this.picture = el("img", { attrs: { alt: "", draggable: "false" } });
    this.marker = el("span", { class: "marker", attrs: { "aria-hidden": "true" } });
    this.name = el("span", { class: "name-text" });
    this.pill = el("div", { class: "pill" });
    this.chip = el("span", { class: "presence" });
    this.chip.hidden = true;
    this.ring = svg("rect", { attrs: { x: "-1.5", y: "-1.5", width: "262", height: "121", rx: "10.5", pathLength: "100", "stroke-dasharray": "100" } });
    const ring = svg("svg", { class: "ring", attrs: { viewBox: "0 0 259 118", "aria-hidden": "true" } }, this.ring);
    ring.style.display = "none";
    this.ringBox = ring;
    // A flat plate is too small for the presence chip: a computer player that holds the seat is a badge on the
    // portrait, and three dots show whose turn it is.
    this.badge = el("span", { class: "badge", attrs: { "aria-hidden": "true" } }, icon("chip"));
    this.badge.hidden = true;
    this.element = el(
      "div",
      { class: "panel seat", attrs: { role: "group" } },
      el("div", { class: "portrait" }, this.picture),
      el("div", { class: "who" }, el("div", { class: "name" }, this.marker, this.name), this.pill),
      this.badge,
      el("span", { class: "turn-dots", attrs: { "aria-hidden": "true" } }, el("i"), el("i"), el("i")),
      this.chip,
      ring,
    );
    stamp(this.element);
  }

  // Draws the seat at its panel. Yours is under the others, and over your hand.
  update(seat: SeatView, panel: Rect, state: { active: boolean; biddingOpen: boolean; human: boolean; look?: Look }): void {
    const style = this.element.style;
    style.left = `${panel.x}px`;
    style.top = `${panel.y}px`;
    style.zIndex = String(state.human ? z.humanPanel : z.panels);
    this.setLook(state.look ?? "plaque");
    const compact = this.look !== "plaque";
    // Where the scaled table's plates are crowded they are drawn a little smaller, all alike.
    const scale = panel.w / RING[this.look].w;
    style.transform = scale === 1 ? "" : `scale(${scale})`;

    const line = nameLineFor(seat, state.active);
    setText(this.marker, line.marker);
    this.marker.hidden = line.marker === "";
    setText(this.name, line.name);

    const url = portraitUrl(seat.avatar) ?? null;
    setSrc(this.picture, url);

    const pill = pillFor(seat, state.active, state.biddingOpen);
    this.presence = seat.presence;
    this.gender = seat.gender;
    // A plate has room for one short line: a person who is away takes the pill's place.
    const away = compact && seat.presence === "away";
    setText(this.pill, away ? presenceText(seat.presence, seat.gender) : compact ? shortPillFor(seat, state.active, state.biddingOpen) : pill.text);
    setAttr(this.pill, "data-state", away ? "away" : pill.state);
    this.badge.hidden = !(compact && seat.presence === "replaced");
    this.badge.title = this.badge.hidden ? "" : presenceText(seat.presence, seat.gender);
    this.paintPresence();

    setAttr(this.element, "aria-label", seatLabelFor(seat, { active: state.active, human: state.human, pill: pill.text }));
    this.element.classList.toggle("active", state.active);
    this.element.dataset.seat = String(seat.seat);
    this.element.hidden = false;
  }

  // Draws the panel as a plaque, a plate or your own plate: the look decides its size, and the ring round
  // it follows.
  private setLook(look: Look): void {
    if (look === this.look) {
      return;
    }
    this.look = look;
    this.element.classList.toggle("plate", look === "plate");
    this.element.classList.toggle("mine", look === "mine");
    const box = RING[look];
    this.ringBox.setAttribute("viewBox", `0 0 ${box.w} ${box.h}`);
    this.ring.setAttribute("width", String(box.w + 3));
    this.ring.setAttribute("height", String(box.h + 3));
  }

  // Who is here, at an online table: a person who has gone away, or whose seat a computer player holds.
  private paintPresence(): void {
    // While your turn is counted down the chip holds the seconds, and a new snapshot leaves it so.
    if (this.counting) {
      return;
    }
    const presence = presenceText(this.presence, this.gender);
    this.chip.hidden = presence === "";
    setText(this.chip, presence);
    setAttr(this.chip, "data-state", this.presence);
  }

  // Draws the ring for your turn's last seconds, or takes it away. The seconds go in the chip's place.
  countdown(count: Countdown | null): void {
    const ring = this.ring.parentElement as unknown as HTMLElement;
    ring.style.display = count === null ? "none" : "block";
    this.counting = count !== null;
    this.element.classList.toggle("counting", count !== null);
    if (count === null) {
      this.paintPresence();
      return;
    }
    this.ring.style.strokeDashoffset = String(100 - count.fraction * 100);
    setAttr(this.ring, "data-urgent", count.urgent ? "true" : null);
    this.chip.hidden = false;
    setText(this.chip, t("online", "%1 s", [count.seconds]));
    setAttr(this.chip, "data-state", "timer");
  }

  hide(): void {
    this.element.hidden = true;
  }
}
