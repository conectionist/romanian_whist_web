import { el } from "../dom/el";
import { t } from "../i18n/t";
import type { Sheet } from "./layer";
import { SheetButton, actions } from "./parts";

// What the menu bar's Exit raises, and Esc, src/ui/PauseOverlay.cpp: a way back into the game and a
// way out of it, the way back the green one, where the eye ends.

export interface PauseActions {
  resume(): void;
  mainMenu(): void;
}

export class PauseSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly mainMenu = new SheetButton(t("PauseOverlay", "Main menu"), "quiet", "main-menu");
  private readonly resume = new SheetButton(t("PauseOverlay", "Resume"), "primary", "resume");

  constructor(handlers: PauseActions) {
    this.element = el(
      "section",
      { class: "sheet", data: { sheet: "pause" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-pause-title" } },
      el("h2", { class: "sheet-title", attrs: { id: "sheet-pause-title" }, text: t("PauseOverlay", "Paused") }),
      actions(this.mainMenu, this.resume),
    );
    this.mainMenu.onClick(handlers.mainMenu);
    this.resume.onClick(handlers.resume);
  }

  // Enter resumes, so every quick way out of this sheet puts the player back in the game.
  focusDefault(): void {
    this.resume.focus();
  }
}
