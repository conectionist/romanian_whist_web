import { el, svg } from "../dom/el";
import { t } from "../i18n/t";

// The two buttons in the bottom-left corner, src/table/TableButtonItem.cpp and paint/Icons.cpp. They
// are drawn as the desktop draws them; a click does nothing, since there is no sheet for it to open.

function icon(paths: string[], extra: SVGElement[] = []): SVGSVGElement {
  return svg(
    "svg",
    { attrs: { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "aria-hidden": "true" } },
    ...paths.map((d) => svg("path", { attrs: { d } })),
    ...extra,
  );
}

function roundHistoryIcon(): SVGSVGElement {
  return icon(["M4 4h16v16H4z", "M4 9h16M4 14h16M10 4v16"]);
}

function lastTrickIcon(): SVGSVGElement {
  return icon(
    ["M9 6V4.5A1.5 1.5 0 0 1 10.5 3h8A1.5 1.5 0 0 1 20 4.5v11a1.5 1.5 0 0 1-1.5 1.5H13"],
    [svg("rect", { attrs: { x: "3", y: "6", width: "10", height: "14", rx: "1.5" } })],
  );
}

function button(label: string, picture: SVGSVGElement, name: string): HTMLButtonElement {
  return el(
    "button",
    { class: "panel btn", attrs: { type: "button" }, data: { button: name } },
    picture,
    el("span", { text: label }),
  );
}

export class CornerButtons {
  readonly element: HTMLElement;
  readonly history: HTMLButtonElement;
  readonly lastTrick: HTMLButtonElement;

  constructor() {
    this.history = button(t("TableScene", "Round history"), roundHistoryIcon(), "history");
    this.lastTrick = button(t("TableScene", "Last trick"), lastTrickIcon(), "last-trick");
    this.element = el("div", { class: "corner-buttons" }, this.history, this.lastTrick);
  }
}
