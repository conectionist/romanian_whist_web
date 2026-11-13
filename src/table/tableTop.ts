import { cardBackUrl, feltUrl, woodUrl } from "../assets/assets";
import { el, svg } from "../dom/el";
import { t } from "../i18n/t";
import { logoDiameter } from "./space";

// The logo's frame is drawn at 0.9 of its own size, so its side is the diameter over that.
export const LOGO_SCALE = 0.9;
export const LOGO_SIDE = logoDiameter / LOGO_SCALE;

const LOGO_BORDER = 2;
const LOGO_INNER_LINE_INSET = 6;
const LETTER_SIZE = 37;
const LETTER_SPACING = 0.01 * LETTER_SIZE;
const LETTER_SHADOW_DROP = 2;
const ORNAMENT_WIDTH = 120;
const ORNAMENT_HEIGHT = 12;

// The lettering's lines from the phrase the catalogue gives: split at line breaks, one line or two.
export function logoLinesFrom(phrase: string): string[] {
  return phrase
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function logoLines(): string[] {
  return logoLinesFrom(t("TableTopItem", "Romanian\nWhist", [], { comment: "The logo on the table: its lines, split by line breaks. One line or two." }));
}

// How far the lettering is scaled to stay inside the logo's fine line, which the words must not
// crowd: as much as the line is inset again. `widest` is the longest line's width at its size.
export function letteringScale(side: number, widest: number, lineCount: number): number {
  const reach = side / 2 - LOGO_BORDER - 2 * LOGO_INNER_LINE_INSET;
  const lettering = Math.max(1, lineCount) * LETTER_SIZE;
  const stack = lettering + 2 * ORNAMENT_HEIGHT;
  // The corners that stick out furthest from the middle: the lettering's, and the ornaments' at
  // the top and bottom of the stack.
  const furthest = Math.max(
    Math.hypot(widest / 2, lettering / 2 + LETTER_SHADOW_DROP),
    Math.hypot(ORNAMENT_WIDTH / 2, stack / 2),
  );
  return Math.min(1, reach / furthest);
}

// One of the two ornaments: strokes over the lettering, waves under it, and a diamond in both. The
// dots are over the lettering only.
export function ornament(wavy: boolean): SVGSVGElement {
  const stroke = { "stroke-width": "1.2", stroke: "currentColor" };
  const path = (d: string, fill: string) =>
    svg("path", { attrs: { d, fill, ...stroke, "stroke-linejoin": "miter", "stroke-miterlimit": "4" } });
  const parts: SVGElement[] = [
    path(wavy ? "M2 6C20 0 30 12 48 6M72 6C90 0 100 12 118 6" : "M2 6H48M72 6H118", "none"),
    path("M60 1L65 6L60 11L55 6Z", "currentColor"),
  ];
  if (!wavy) {
    for (const cx of ["50", "70"]) {
      parts.push(svg("circle", { attrs: { cx, cy: "6", r: "1.6", fill: "currentColor", ...stroke } }));
    }
  }
  return svg("svg", { attrs: { viewBox: `0 0 ${ORNAMENT_WIDTH} ${ORNAMENT_HEIGHT}`, "aria-hidden": "true" } }, ...parts);
}

// The rectangular plaque the main menu page and the language dialog show: the lettering between its
// two ornaments, and a club at each end. It is the table's logo as a panel, at the size its page sets.
export function plaqueFor(lines: readonly string[]): HTMLElement {
  const letters = el("div", { class: "medal-letters" }, ...lines.map((line) => el("div", { text: line })));
  const stack = el("div", { class: "medal-stack" }, ornament(false), letters, ornament(true));
  return el(
    "div",
    { class: "medal plaque" },
    stack,
    el("span", { class: "club left", attrs: { "aria-hidden": "true" }, text: "♣" }),
    el("span", { class: "club right", attrs: { "aria-hidden": "true" }, text: "♣" }),
  );
}

// The wooden rim, the bead, the felt and the round logo, which are one picture on the table.
export class TableTop {
  readonly element: HTMLElement;
  private readonly letters: HTMLElement;
  private readonly stack: HTMLElement;
  private lines: string[] = [];

  constructor() {
    this.letters = el("div", { class: "medal-letters" });
    this.stack = el("div", { class: "medal-stack" }, ornament(false), this.letters, ornament(true));
    const medal = el("div", { class: "medal" }, this.stack);
    this.element = el(
      "div",
      { class: "table-top" },
      el("div", { class: "wood" }),
      el("div", { class: "felt" }, el("div", { class: "felt-line" })),
      medal,
    );
    this.element.style.setProperty("--wood-texture", `url("${woodUrl}")`);
    this.element.style.setProperty("--felt-texture", `url("${feltUrl}")`);
    this.setLines(logoLines());
  }

  // The logo is drawn this much of its size: 1 on the desktop's table, less on the scaled one, where the
  // played cards need the room.
  setLogoScale(scale: number): void {
    const text = scale === 1 ? "" : String(scale);
    if (this.element.style.getPropertyValue("--logo-k") !== text) {
      if (text === "") {
        this.element.style.removeProperty("--logo-k");
      } else {
        this.element.style.setProperty("--logo-k", text);
      }
    }
  }

  setLines(lines: string[]): void {
    if (lines.join("\n") !== this.lines.join("\n")) {
      this.lines = lines;
      this.letters.replaceChildren(...lines.map((line) => el("div", { text: line })));
    }
    this.fit();
  }

  // Measures the lettering and scales the stack to fit: after the logo's face has loaded, and
  // again if the lines change.
  fit(): void {
    const widest = Math.max(0, ...this.lines.map((line) => measure(line)));
    this.stack.style.setProperty("--fit", String(letteringScale(LOGO_SIDE, widest, this.lines.length)));
  }
}

let context: CanvasRenderingContext2D | null | undefined;

// A line's width in the logo's face, spacing after every letter as the desktop's absolute
// spacing has it.
function measure(line: string): number {
  if (context === undefined) {
    context = document.createElement("canvas").getContext("2d");
  }
  if (context === null) {
    return 0;
  }
  context.font = `700 ${LETTER_SIZE}px "Cinzel Decorative", "Cinzel", Georgia, serif`;
  return context.measureText(line).width + LETTER_SPACING * [...line].length;
}

// The URLs a first paint of the table needs, for a page that waits for them.
export const TABLE_PICTURES: readonly string[] = [woodUrl, feltUrl, cardBackUrl];
