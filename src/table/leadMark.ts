import { el } from "../dom/el";
import type { Placement } from "./space";

// The lead mark: a small gold rhombus on the felt, in line with whoever leads the trick.
export class LeadMark {
  readonly element: HTMLElement;

  constructor() {
    this.element = el("div", { class: "lead-mark", attrs: { "aria-hidden": "true" } });
    this.element.hidden = true;
  }

  set(place: Placement | null): void {
    if (place === null) {
      this.element.hidden = true;
      return;
    }
    const style = this.element.style;
    style.left = `${place.x}px`;
    style.top = `${place.y}px`;
    style.transform = `rotate(${place.rotation}deg) scaleY(1.45) rotate(45deg)`;
    this.element.hidden = false;
  }
}
