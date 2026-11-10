import { el } from "../dom/el";
import { easeOut } from "../play/bezier";
import { BUBBLE_MS, BUBBLE_STILL_MS } from "../play/motion";
import { t } from "../i18n/t";
import type { Rect } from "./space";

// A bid said out loud: a small gold pill that floats over a seat's panel for a moment as the bid is
// made, "Bids 2" for another seat and "You bid 2" for you. The bid is on the scoreboard and on the
// seat's pill as well; this is only the moment it is made, src/table/BidBubbleItem.cpp.

export function textFor(yours: boolean, bet: number): string {
  return yours ? t("BidBubbleItem", "You bid %1", [bet]) : t("BidBubbleItem", "Bids %1", [bet]);
}

// The pill rises 6 and fades in over the first 12% of its time, holds to 80%, then fades out.
const IN_ENDS = 0.12;
const OUT_STARTS = 0.8;
const RISE_FROM = 6;

// A bubble's opacity, and how far below its place it still is, `progress` of the way through.
// Each stretch eases out.
export interface Frame {
  opacity: number;
  rise: number;
}

export function frameAt(progress: number): Frame {
  if (progress <= IN_ENDS) {
    const eased = easeOut(progress / IN_ENDS);
    return { opacity: eased, rise: RISE_FROM * (1 - eased) };
  }
  if (progress <= OUT_STARTS) {
    return { opacity: 1, rise: 0 };
  }
  return { opacity: 1 - easeOut((progress - OUT_STARTS) / (1 - OUT_STARTS)), rise: 0 };
}

// The same, as keyframes for the Web Animations API, which eases each stretch as CSS does.
export function keyframes(): Keyframe[] {
  return [
    { offset: 0, opacity: 0, transform: `translateY(${RISE_FROM}px)`, easing: "ease-out" },
    { offset: IN_ENDS, opacity: 1, transform: "translateY(0)", easing: "linear" },
    { offset: OUT_STARTS, opacity: 1, transform: "translateY(0)", easing: "ease-out" },
    { offset: 1, opacity: 0, transform: "translateY(0)" },
  ];
}

// The pill is centred over its panel, its top this far above the panel's padding box: `top: -18px`
// inside a 1 px border.
export const ABOVE = 18;
const PANEL_BORDER = 1;

// Where the pill's top-centre goes over a panel, in table space.
export function anchorOver(panel: Rect): { x: number; y: number } {
  return { x: panel.x + panel.w / 2, y: panel.y + PANEL_BORDER - ABOVE };
}

export class BidBubble {
  readonly element: HTMLElement;
  private readonly pill: HTMLElement;
  private animation: Animation | null = null;

  constructor() {
    this.pill = el("div", { class: "bubble-pill" });
    this.element = el("div", { class: "bubble", attrs: { "aria-hidden": "true" } }, this.pill);
    this.element.hidden = true;
  }

  get text(): string {
    return this.pill.textContent ?? "";
  }

  // Shows `text` over the panel and lets it go by itself. A new bid replaces the one showing, from
  // the start. `animate` false holds it still, there from the first moment to the last.
  say(text: string, panel: Rect, animate: boolean): void {
    this.animation?.cancel();
    this.pill.textContent = text;
    const at = anchorOver(panel);
    this.element.style.left = `${at.x}px`;
    this.element.style.top = `${at.y}px`;
    this.element.hidden = false;

    const frames: Keyframe[] = animate ? keyframes() : [{ opacity: 1 }, { opacity: 1 }];
    const animation = this.pill.animate(frames, { duration: animate ? BUBBLE_MS : BUBBLE_STILL_MS, fill: "backwards" });
    this.animation = animation;
    animation.onfinish = () => {
      if (this.animation === animation) {
        this.element.hidden = true;
      }
    };
  }

  // Gone now: a new game, or a table with fewer seats.
  dismiss(): void {
    this.animation?.cancel();
    this.animation = null;
    this.element.hidden = true;
  }
}
