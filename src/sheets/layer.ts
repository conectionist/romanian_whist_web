import { el } from "../dom/el";
import { icon } from "../dom/icons";
import { t } from "../i18n/t";
import { PAGE_ACTION, placementFor, type SheetKey } from "./placement";

// What the layer shows: a panel of its own, made once, and the button the keyboard starts on.
export interface Sheet {
  readonly element: HTMLElement;
  focusDefault(): void;
}

// A page's bar holds its Back button, its title and its one action, and stays where it is while the rest scrolls
// under it. The title and the action are the sheet's own elements, moved into the bar for the scaled table and put
// back where they were for the desktop's dialog.
const homes = new WeakMap<HTMLElement, { primary: HTMLElement | null; before: Node | null; bar: HTMLElement }>();

function arrangePage(sheet: HTMLElement, scaled: boolean): void {
  const home = homes.get(sheet);
  if (scaled && home === undefined) {
    const back = sheet.querySelector(":scope > .page-back");
    const title = sheet.querySelector(":scope > .sheet-title");
    const action = PAGE_ACTION[sheet.dataset.sheet ?? ""];
    const primary = sheet.querySelector<HTMLElement>(`:scope > .sheet-actions [data-action="${action}"]`);
    const bar = el("div", { class: "page-bar" });
    homes.set(sheet, { primary, before: primary?.nextSibling ?? null, bar });
    bar.append(...[back, title, primary].filter((node): node is Element | HTMLElement => node !== null));
    sheet.prepend(bar);
  } else if (!scaled && home !== undefined) {
    const parent = home.primary === null ? null : sheet.querySelector(":scope > .sheet-actions");
    const [back, title] = [home.bar.querySelector(".page-back"), home.bar.querySelector(".sheet-title")];
    if (home.primary !== null && parent !== null) {
      parent.insertBefore(home.primary, home.before);
    }
    home.bar.remove();
    sheet.prepend(...[back, title].filter((node): node is Element => node !== null));
    homes.delete(sheet);
  }
}

function nameOf(sheet: Sheet): SheetKey {
  return (sheet.element.dataset.sheet ?? "") as SheetKey;
}

const FOCUSABLE = "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])";

// The dim over the page and the one sheet on it, as MainWindow arranges them: one open at a time,
// each made once and hidden when another is shown. Over everything but the menu bar, which stays
// live. A press on the dim goes nowhere: the sheet is modal, and closes through its own buttons.
export class SheetLayer {
  readonly element: HTMLElement;
  private open: Sheet | null = null;
  private returnTo: Element | null = null;
  private scaled = false;
  private readonly watcher: ResizeObserver;

  // `back` is what the Back button of a page does, on the scaled table.
  constructor(
    private readonly sheets: readonly Sheet[],
    back: () => void = () => undefined,
  ) {
    this.element = el("div", { class: "sheet-layer" }, ...sheets.map((sheet) => sheet.element));
    this.element.hidden = true;
    for (const sheet of sheets) {
      sheet.element.hidden = true;
      // A page has its Back button in its bar, which the desktop's dialog does not show.
      if (placementFor(nameOf(sheet), true) === "page") {
        const label = t("sheets", "Back");
        const button = el("button", { class: "page-back", attrs: { type: "button", "aria-label": label, title: label } }, icon("back"));
        button.addEventListener("click", back);
        sheet.element.prepend(button);
      }
    }
    this.placeAll();
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

  // Draws the sheets as the scaled table's side, bottom and page sheets, or as the desktop's centred dialog. The
  // stylesheet places the first by the attribute, and the dialog is placed here.
  setScaled(scaled: boolean): void {
    if (scaled === this.scaled) {
      return;
    }
    this.scaled = scaled;
    for (const sheet of this.sheets) {
      if (placementFor(nameOf(sheet), true) === "page") {
        arrangePage(sheet.element, scaled);
      }
    }
    this.placeAll();
    for (const sheet of this.sheets) {
      sheet.element.style.left = "";
      sheet.element.style.top = "";
    }
    this.place();
  }

  private placeAll(): void {
    for (const sheet of this.sheets) {
      sheet.element.dataset.placement = placementFor(nameOf(sheet), this.scaled);
    }
  }

  // The open sheet in the middle, on whole pixels, as Qt places it: a half pixel would be drawn blurred.
  private place(): void {
    const node = this.open?.element;
    if (node === undefined || this.scaled) {
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
      return true;
    }
    // A scroller keeps its offset while it is not displayed, and a sheet opens at its top.
    sheet.element.scrollTop = 0;
    if (takesKeyboard) {
      sheet.focusDefault();
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
