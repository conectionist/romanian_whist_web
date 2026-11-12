import { el } from "../dom/el";
import { LANGUAGES, NATIVE_NAMES, storeLanguage, type Language } from "../i18n/language";
import { plaqueFor } from "../table/tableTop";
import { flagFor } from "./flags";

// The language dialog, src/ui/LanguageDialog.cpp: the room, the plaque with the one word, which is
// the game's name in both languages, and a flag for each language with its name under it. There are
// no words to translate: the flags and the names are the question.

export const DIALOG_WIDTH = 560;
export const DIALOG_HEIGHT = 420;

// Both languages' words, since whoever opens this may not read the one the page is in.
export const LANGUAGE_BUTTON_NAME = "Limba / Language";

export interface LanguageDialogActions {
  choose(language: Language): void;
  // Esc, or a click on the room. A first visit has nothing to go back to, so it gives none.
  cancel?(): void;
}

// The size the dialog is shown at: its own, or smaller where the window is.
export function fitFor(width: number, height: number): number {
  return Math.min(1, width / DIALOG_WIDTH, height / DIALOG_HEIGHT);
}

export class LanguageDialog {
  readonly element: HTMLElement;
  private readonly dialog: HTMLElement;
  private readonly buttons: HTMLButtonElement[];
  private readonly refit = () => this.fit();
  private readonly onKey = (event: KeyboardEvent) => this.keydown(event);

  // `lit` is the language that has the keyboard: Romanian on a first visit, as the desktop's, and the
  // page's own when the dialog is opened again.
  constructor(
    private readonly actions: LanguageDialogActions,
    private readonly lit: Language = "ro",
  ) {
    this.buttons = LANGUAGES.map((language) => {
      const button = el(
        "button",
        { class: "lang-choice", attrs: { type: "button", lang: language }, data: { language } },
        el("span", { class: "panel flag-box" }, flagFor(language)),
        el("span", { class: "lang-name", text: NATIVE_NAMES[language] }),
      );
      button.addEventListener("click", () => this.actions.choose(language));
      return button;
    });
    this.dialog = el(
      "div",
      { class: "lang-dialog" },
      el("div", { class: "lang-logo" }, plaqueFor(["Whist"])),
      ...this.buttons,
    );
    this.element = el(
      "div",
      { class: "lang-page", attrs: { role: "dialog", "aria-modal": "true", "aria-label": LANGUAGE_BUTTON_NAME } },
      this.dialog,
    );
    // Heard before the page's own, wherever the keyboard is, so Esc closes this and nothing under it.
    document.addEventListener("keydown", this.onKey, true);
    this.element.addEventListener("pointerdown", (event) => {
      if (event.target === this.element) {
        this.actions.cancel?.();
      }
    });
    window.addEventListener("resize", this.refit);
    this.fit();
  }

  private fit(): void {
    this.element.style.setProperty("--lang-fit", String(fitFor(window.innerWidth, window.innerHeight)));
  }

  // Gives the keyboard to the language that starts with it.
  focus(): void {
    this.buttons[LANGUAGES.indexOf(this.lit)].focus();
  }

  // Takes the dialog off the page.
  close(): void {
    window.removeEventListener("resize", this.refit);
    document.removeEventListener("keydown", this.onKey, true);
    this.element.remove();
  }

  // The arrows and Tab move between the flags, and keep the keyboard in the dialog; Enter and Space
  // press the one that has it, as any button.
  private keydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && this.actions.cancel !== undefined) {
      event.stopPropagation();
      this.actions.cancel();
      return;
    }
    const at = this.buttons.findIndex((button) => button === document.activeElement);
    const step = event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey) ? 1 : event.key === "ArrowLeft" || event.key === "Tab" ? -1 : 0;
    if (step === 0 || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    const next = at < 0 ? (step > 0 ? 0 : this.buttons.length - 1) : (at + step + this.buttons.length) % this.buttons.length;
    this.buttons[next].focus();
  }
}

// A first visit: the dialog over the page until a language is chosen, which the browser then keeps.
export function askLanguage(page: HTMLElement = document.body): Promise<Language> {
  return new Promise((resolve) => {
    const dialog = new LanguageDialog({
      choose: (language) => {
        storeLanguage(language);
        dialog.close();
        resolve(language);
      },
    });
    page.append(dialog.element);
    dialog.focus();
  });
}
