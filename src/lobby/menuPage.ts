import { el } from "../dom/el";
import { icon, type IconName } from "../dom/icons";
import { currentLanguage } from "../i18n/language";
import { t } from "../i18n/t";
import { fullscreenButton } from "../table/fullscreen";
import { logoLines, plaqueFor } from "../table/tableTop";
import { flagFor } from "./flags";
import { languageButtonName } from "./languageDialog";

// The page the client opens on, src/ui/MainMenuPage.cpp. Its second button is Play online where the
// desktop's is Quit, which a page cannot do.

export interface MenuPageActions {
  newGame(): void;
  playOnline(): void;
  // Opens the language dialog again.
  language(): void;
  // The settings and the rules, which the scaled table's main menu has at its foot in place of the menu bar.
  settings(): void;
  rules(): void;
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
    {
      class: "panel menu-lang",
      attrs: { type: "button", "aria-label": languageButtonName(currentLanguage()), title: languageButtonName(currentLanguage()) },
      data: { menuPage: "language" },
    },
    flagFor(currentLanguage()),
  );

  constructor(actions: MenuPageActions) {
    const lines = logoLines();
    const plaque = plaqueFor(lines);
    const settings = el("button", { class: "menu-foot-btn", attrs: { type: "button" }, data: { menuPage: "settings" } }, icon("settings"), el("span", { text: t("MainWindow", "Settings") }));
    const rules = el("button", { class: "menu-foot-btn", attrs: { type: "button" }, data: { menuPage: "rules" } }, icon("rules"), el("span", { text: t("MainWindow", "Rules") }));
    const full = fullscreenButton("menu-foot-btn", true);
    full.prepend(icon("fullscreen"));
    settings.addEventListener("click", () => actions.settings());
    rules.addEventListener("click", () => actions.rules());
    this.element = el(
      "div",
      { class: "menu-page" },
      el(
        "div",
        { class: "menu-column" },
        el("div", { class: "menu-logo", attrs: { role: "img", "aria-label": lines.join(" ") } }, plaque),
        el("div", { class: "menu-actions" }, el("div", { class: "menu-buttons" }, this.newGame, this.online), el("div", { class: "menu-foot" }, settings, rules, full)),
      ),
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
