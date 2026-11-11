import { el, setText } from "../dom/el";
import { renderSuited } from "../dom/runs";
import { t } from "../i18n/t";

// The parts every sheet is made of, src/ui/Overlay.cpp: lines of a role, buttons, and tables.

// A whole number as a sheet's table writes it: a negative one with U+2212, the minus sign that is as
// wide as a digit in tabular figures. A hyphen is narrower, and one column would carry two kinds.
export function sheetNumber(value: number): string {
  return value < 0 ? `−${-value}` : String(value);
}

// "Ana", "Ana and Bogdan", "Ana, Bogdan and Dan": the last name joined with "and" however many there
// are. The separators are translated too, since a language may not join a list with ", " and " and ".
export function joinNames(names: readonly string[]): string {
  let joined = "";
  names.forEach((name, index) => {
    if (index > 0) {
      joined += index + 1 === names.length ? t("gameover", " and ") : t("gameover", ", ");
    }
    joined += name;
  });
  return joined;
}

export type Kind = "primary" | "quiet";

// A sheet's button: the green one is what the sheet is for, and goes last; a quiet one has no fill.
export class SheetButton {
  readonly element: HTMLButtonElement;

  constructor(label: string, kind: Kind, action: string) {
    this.element = el("button", { class: "sheet-btn", attrs: { type: "button" }, data: { action }, text: label });
    this.setKind(kind);
  }

  setKind(kind: Kind): void {
    this.element.classList.toggle("primary", kind === "primary");
  }

  setLabel(label: string): void {
    setText(this.element, label);
  }

  set disabled(value: boolean) {
    this.element.disabled = value;
  }

  onClick(handler: () => void): void {
    this.element.addEventListener("click", handler);
  }

  // The sheet puts the keyboard on its default button when it opens. The button is lit only when it
  // is under the pointer or reached by Tab, as the desktop's are, so a focus the page moved there
  // itself shows no ring.
  focus(): void {
    this.element.focus({ focusVisible: false } as FocusOptions);
  }
}

export function actions(...buttons: SheetButton[]): HTMLElement {
  return el("div", { class: "sheet-actions" }, ...buttons.map((button) => button.element));
}

// A line with the suits in their colours, for the line under a title.
export function suitedLine(node: HTMLElement, text: string): void {
  renderSuited(node, text);
}

export type Tone = "plain" | "good" | "bad" | "muted";

export interface Column {
  heading: string;
  align: "left" | "right";
  // A heading that gives way, with an ellipsis, to the room the others leave: a player's name over a
  // column of numbers.
  elide?: boolean;
}

export interface Cell {
  text: string;
  tone?: Tone;
  // Bold: your own row, or a winner's.
  strong?: boolean;
  // A second, smaller part after the text, in the muted note type on the text's baseline.
  note?: string;
  // A cell of a row that is taller than one line of figures.
  tall?: boolean;
}

// A row of cells, or one muted line across every column: what a table says when it has nothing in it yet.
export type Row = Cell[] | { note: string };

export function isNote(row: Row): row is { note: string } {
  return !Array.isArray(row);
}

// What a table shows, as plain data: headings and rows.
export interface TableFields {
  columns: Column[];
  rows: Row[];
}

// A table as a grid of labels, filled again when what it shows changes. Text goes in as text only.
export class SheetTable {
  readonly element: HTMLElement;
  private shown = "";

  constructor() {
    this.element = el("div", { class: "sheet-table" });
  }

  update(fields: TableFields): void {
    const key = JSON.stringify(fields);
    if (key === this.shown) {
      return;
    }
    this.shown = key;
    this.element.style.gridTemplateColumns = `repeat(${fields.columns.length}, minmax(auto, 1fr))`;

    const nodes: HTMLElement[] = fields.columns.map((column) =>
      el("div", { class: column.align === "right" ? "th right" : "th", text: column.heading }),
    );
    for (const row of fields.rows) {
      if (isNote(row)) {
        nodes.push(el("div", { class: "td span", text: row.note }));
      } else {
        row.forEach((cell, column) => nodes.push(cellFor(cell, fields.columns[column]?.align ?? "left")));
      }
    }
    this.element.replaceChildren(...nodes);
  }
}

function cellFor(cell: Cell, align: "left" | "right"): HTMLElement {
  const classes = ["td"];
  if (align === "right") {
    classes.push("right");
  }
  if (cell.strong === true) {
    classes.push("strong");
  }
  if (cell.tall === true) {
    classes.push("tall");
  }
  if (cell.tone !== undefined && cell.tone !== "plain") {
    classes.push(cell.tone);
  }
  const node = el("div", { class: classes.join(" "), text: cell.text });
  if (cell.note !== undefined && cell.note !== "") {
    // The gap is a space of the text's own face; the note keeps its colour whatever the tone is.
    node.append(" ", el("span", { class: "side", text: cell.note }));
  }
  return node;
}
