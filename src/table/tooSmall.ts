import { el, setText } from "../dom/el";
import { t } from "../i18n/t";
import { DESIGN, SCALE_FLOOR } from "./layoutChoice";
import type { Size } from "./space";

// What a touch screen too small to draw the table on is told: a cramped table helps nobody, so the page
// asks for more room. It covers the page, which the window's size may bring back.
export class TooSmall {
  readonly element: HTMLElement;
  private readonly sizes = el("p");

  constructor() {
    const least = { w: Math.ceil(DESIGN.w * SCALE_FLOOR), h: Math.ceil(DESIGN.h * SCALE_FLOOR) };
    this.element = el(
      "div",
      { class: "too-small", attrs: { role: "alert" } },
      el(
        "div",
        { class: "panel" },
        el("h2", { text: t("toosmall", "This window is too small for the table") }),
        el("p", { text: t("toosmall", "The game needs a window of at least %1 × %2 pixels to show every card and name.", [least.w, least.h]) }),
        this.sizes,
        el("p", { class: "small", text: t("toosmall", "Make the window bigger.") }),
      ),
    );
    this.element.hidden = true;
  }

  show(shown: boolean, size: Size): void {
    this.element.hidden = !shown;
    setText(this.sizes, t("toosmall", "This window is %1 × %2.", [size.w, size.h]));
  }
}
