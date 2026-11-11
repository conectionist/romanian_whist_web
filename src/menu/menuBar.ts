import { el } from "../dom/el";
import { icon, type IconName } from "../dom/icons";
import { t } from "../i18n/t";
import { canPause } from "../play/sheets";
import type { StoreState } from "../play/store";

// The menu bar, src/ui/MenuBar.cpp: New Game, Settings and Rules at the left and Exit at the right,
// 46 pixels high in screen pixels, never scaled with the table. The desktop's View menu, which holds
// its log and its card art, is the developer's, and a page has none.

export interface MenuState {
  newGame: boolean;
  settings: boolean;
  rules: boolean;
  exit: boolean;
}

// What the bar offers: Exit is greyed wherever the pause menu would refuse to open, which is on the
// main menu, over the end of a game and over a round sheet that holds the game, rather than live and
// doing nothing. New Game is greyed only where this page cannot start a game.
export function menuStateFor(state: StoreState, canStart: boolean): MenuState {
  return { newGame: canStart, settings: true, rules: true, exit: canPause(state) };
}

export interface MenuActions {
  newGame(): void;
  settings(): void;
  rules(): void;
  exit(): void;
}

interface Item {
  node: HTMLButtonElement;
  name: keyof MenuState;
}

function itemFor(name: keyof MenuState, label: string, picture: IconName, action: string): Item {
  const node = el(
    "button",
    { class: "menu-item", attrs: { type: "button" }, data: { menu: action } },
    icon(picture),
    el("span", { text: label }),
  );
  return { node, name };
}

export class MenuBar {
  readonly element: HTMLElement;
  private readonly items: Item[];

  constructor(actions: MenuActions) {
    const newGame = itemFor("newGame", t("MainWindow", "New Game"), "new-game", "new-game");
    const settings = itemFor("settings", t("MainWindow", "Settings"), "settings", "settings");
    const rules = itemFor("rules", t("MainWindow", "Rules"), "rules", "rules");
    const exit = itemFor("exit", t("MainWindow", "Exit"), "exit", "exit");
    exit.node.classList.add("far");
    newGame.node.addEventListener("click", () => actions.newGame());
    settings.node.addEventListener("click", () => actions.settings());
    rules.node.addEventListener("click", () => actions.rules());
    exit.node.addEventListener("click", () => actions.exit());
    this.items = [newGame, settings, rules, exit];
    this.element = el("nav", { class: "menu-band", attrs: { "aria-label": t("MainWindow", "Romanian Whist") } }, ...this.items.map((item) => item.node));
  }

  update(state: MenuState): void {
    for (const item of this.items) {
      item.node.disabled = !state[item.name];
    }
  }
}
