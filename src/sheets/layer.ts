import { el } from "../dom/el";

// What the layer shows: a panel of its own, made once, and the button the keyboard starts on.
export interface Sheet {
  readonly element: HTMLElement;
  focusDefault(): void;
}

const FOCUSABLE = "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])";

// The dim over the page and the one sheet on it, as MainWindow arranges them: one open at a time,
// each made once and hidden when another is shown. Over everything but the menu bar, which stays
// live. A press on the dim goes nowhere: the sheet is modal, and closes through its own buttons.
export class SheetLayer {
  readonly element: HTMLElement;
  private open: Sheet | null = null;
  private returnTo: Element | null = null;
  private readonly watcher: ResizeObserver;

  constructor(private readonly sheets: readonly Sheet[]) {
    this.element = el("div", { class: "sheet-layer" }, ...sheets.map((sheet) => sheet.element));
    this.element.hidden = true;
    for (const sheet of sheets) {
      sheet.element.hidden = true;
    }
    this.element.addEventListener("pointerdown", (event) => {
      if (event.target === this.element) {
        event.preventDefault();
      }
    });
    this.element.addEventListener("keydown", (event) => this.keep(event));
    // The sheet follows the page and its own words, as the desktop's overlay follows its parent.
    this.watcher = new ResizeObserver(() => this.place());
    this.watcher.observe(this.element);
    for (const sheet of sheets) {
      this.watcher.observe(sheet.element);
    }
  }

  // The open sheet in the middle, on whole pixels, as Qt places it: a half pixel would be drawn blurred.
  private place(): void {
    const node = this.open?.element;
    if (node === undefined) {
      return;
    }
    node.style.left = `${Math.max(0, Math.floor((this.element.clientWidth - node.offsetWidth) / 2))}px`;
    node.style.top = `${Math.max(0, Math.floor((this.element.clientHeight - node.offsetHeight) / 2))}px`;
  }

  get current(): Sheet | null {
    return this.open;
  }

  // Shows this sheet, or none. Says whether another is up now than was: a sheet put up again with new
  // words keeps the keyboard where it is, and one that waits for nothing does not take it.
  show(sheet: Sheet | null, takesKeyboard = true): boolean {
    if (sheet === this.open) {
      return false;
    }
    if (sheet !== null && !this.sheets.includes(sheet)) {
      throw new Error("That sheet is not one of this layer's");
    }
    const hadOne = this.open !== null;
    if (!hadOne && sheet !== null) {
      this.returnTo = document.activeElement;
    }
    this.open = sheet;
    for (const each of this.sheets) {
      each.element.hidden = each !== sheet;
    }
    this.element.hidden = sheet === null;
    this.place();
    if (sheet === null) {
      this.giveBack();
    } else if (takesKeyboard) {
      sheet.focusDefault();
      // On a touch screen a sheet taller than the window opens at its top, not where its first control is.
      if (window.matchMedia("(pointer: coarse)").matches) {
        sheet.element.scrollTop = 0;
      }
    }
    return true;
  }

  // The keyboard goes back to where it was before the first sheet came up, if that is still there.
  private giveBack(): void {
    const target = this.returnTo;
    this.returnTo = null;
    if (target instanceof HTMLElement && target.isConnected && !target.closest("[inert]")) {
      target.focus();
    } else if (document.activeElement instanceof HTMLElement && this.element.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  // Tab stays inside the sheet, as the desktop's does: walking out would reach the table under the dim.
  private keep(event: KeyboardEvent): void {
    if (event.key !== "Tab" || this.open === null) {
      return;
    }
    const stops = Array.from(this.open.element.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (node) => node.offsetParent !== null,
    );
    if (stops.length === 0) {
      event.preventDefault();
      return;
    }
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const next = at < 0 ? (event.shiftKey ? stops.length - 1 : 0) : (at + (event.shiftKey ? stops.length - 1 : 1)) % stops.length;
    event.preventDefault();
    stops[next].focus();
  }
}
