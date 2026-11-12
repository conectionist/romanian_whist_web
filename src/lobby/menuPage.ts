import { el } from "../dom/el";
import { icon, type IconName } from "../dom/icons";
import { currentLanguage } from "../i18n/language";
import { t } from "../i18n/t";
import { logoLines, plaqueFor } from "../table/tableTop";
import { flagFor } from "./flags";
import { LANGUAGE_BUTTON_NAME } from "./languageDialog";

// The page the client opens on, src/ui/MainMenuPage.cpp. Its second button is Play online where the
// desktop's is Quit, which a page cannot do.

export interface MenuPageActions {
  newGame(): void;
  playOnline(): void;
  // Opens the language dialog again.
  language(): void;
}

function button(label: string, picture: IconName, action: string): HTMLButtonElement {
  return el(
    "button",
    { class: "panel btn menu-btn", attrs: { type: "button" }, data: { menuPage: action } },
    icon(picture),
    el("span", { text: label }),
  );
}

export class MenuPage {
  readonly element: HTMLElement;
  readonly newGame = button(t("MainMenuPage", "New Game"), "new-game", "new-game");
  readonly online = button(t("lobby", "Play online"), "online", "online");
  // The flag of the language the page is in, which opens the dialog again.
  readonly language = el(
    "button",
    { class: "panel menu-lang", attrs: { type: "button", "aria-label": LANGUAGE_BUTTON_NAME, title: LANGUAGE_BUTTON_NAME }, data: { menuPage: "language" } },
    flagFor(currentLanguage()),
  );

  constructor(actions: MenuPageActions) {
    const lines = logoLines();
    const plaque = plaqueFor(lines);
    this.element = el(
      "div",
      { class: "menu-page" },
      el("div", { class: "menu-column" }, el("div", { class: "menu-logo", attrs: { role: "img", "aria-label": lines.join(" ") } }, plaque), el("div", { class: "menu-buttons" }, this.newGame, this.online)),
      this.language,
    );
    this.element.hidden = true;
    this.newGame.addEventListener("click", () => actions.newGame());
    this.online.addEventListener("click", () => actions.playOnline());
    this.language.addEventListener("click", () => actions.language());
  }

  show(shown: boolean): void {
    this.element.hidden = !shown;
  }
}
