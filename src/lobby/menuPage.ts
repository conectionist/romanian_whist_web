import { el } from "../dom/el";
import { icon, type IconName } from "../dom/icons";
import { currentLanguage } from "../i18n/language";
import { t } from "../i18n/t";
import { fullscreenButton } from "../table/fullscreen";
import { logoLines, plaqueFor } from "../table/tableTop";
import { flagFor } from "./flags";
import { languageButtonName } from "./languageDialog";
import { pageSourceUrl, serverSourceUrl, type Versions } from "../about/links";

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
  // The About sheet, which the foot of the page opens beside the links to the source.
  about(): void;
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

  // The links to the source of the server and of the page, at the commits that run: set when the page learns them.
  readonly serverLink = el("a", { attrs: { href: "", target: "_blank", rel: "noopener noreferrer" }, data: { menuPage: "server-source" }, text: t("footer", "server") });
  readonly pageLink = el("a", { attrs: { href: "", target: "_blank", rel: "noopener noreferrer" }, data: { menuPage: "page-source" }, text: t("footer", "page") });
  readonly about = el("button", { class: "menu-source-btn", attrs: { type: "button" }, data: { menuPage: "about" }, text: t("footer", "About") });

  constructor(actions: MenuPageActions) {
    const lines = logoLines();
    const plaque = plaqueFor(lines);
    const settings = el("button", { class: "menu-foot-btn", attrs: { type: "button" }, data: { menuPage: "settings" } }, icon("settings"), el("span", { text: t("MainWindow", "Settings") }));
    const rules = el("button", { class: "menu-foot-btn", attrs: { type: "button" }, data: { menuPage: "rules" } }, icon("rules"), el("span", { text: t("MainWindow", "Rules") }));
    const full = fullscreenButton("menu-foot-btn", true);
    full.prepend(icon("fullscreen"));
    settings.addEventListener("click", () => actions.settings());
    rules.addEventListener("click", () => actions.rules());
    const separator = () => el("span", { class: "menu-source-dot", attrs: { "aria-hidden": "true" }, text: "·" });
    const source = el(
      "nav",
      { class: "menu-source", attrs: { "aria-label": t("footer", "Source code and about") } },
      el("span", { text: t("footer", "Source:") }),
      this.serverLink,
      separator(),
      this.pageLink,
      separator(),
      this.about,
    );
    this.element = el(
      "div",
      { class: "menu-page" },
      el(
        "div",
        { class: "menu-column" },
        el("div", { class: "menu-logo", attrs: { role: "img", "aria-label": lines.join(" ") } }, plaque),
        el("div", { class: "menu-actions" }, el("div", { class: "menu-buttons" }, this.newGame, this.online), el("div", { class: "menu-foot" }, settings, rules, full), source),
      ),
      this.language,
    );
    this.element.hidden = true;
    this.newGame.addEventListener("click", () => actions.newGame());
    this.online.addEventListener("click", () => actions.playOnline());
    this.language.addEventListener("click", () => actions.language());
    this.about.addEventListener("click", () => actions.about());
  }

  // The links to the source as the commits that run say.
  setSource(versions: Versions): void {
    this.serverLink.href = serverSourceUrl(versions);
    this.pageLink.href = pageSourceUrl(versions);
  }

  show(shown: boolean): void {
    this.element.hidden = !shown;
  }
}
