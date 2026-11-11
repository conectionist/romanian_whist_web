import { el } from "../dom/el";
import { icon, type IconName } from "../dom/icons";
import { t } from "../i18n/t";

// The two buttons in the bottom-left corner, src/table/TableButtonItem.cpp, drawn as the desktop
// draws them. A click on one asks for its sheet.

function button(label: string, picture: IconName, name: string): HTMLButtonElement {
  return el(
    "button",
    { class: "panel btn", attrs: { type: "button" }, data: { button: name } },
    icon(picture),
    el("span", { text: label }),
  );
}

export class CornerButtons {
  readonly element: HTMLElement;
  readonly history: HTMLButtonElement;
  readonly lastTrick: HTMLButtonElement;

  // Told when either is clicked.
  onHistory(handler: () => void): void {
    this.history.addEventListener("click", handler);
  }

  onLastTrick(handler: () => void): void {
    this.lastTrick.addEventListener("click", handler);
  }

  constructor() {
    this.history = button(t("TableScene", "Round history"), "round-history", "history");
    this.lastTrick = button(t("TableScene", "Last trick"), "last-trick", "last-trick");
    this.element = el("div", { class: "corner-buttons" }, this.history, this.lastTrick);
  }
}
