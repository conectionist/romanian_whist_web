import { el } from "../dom/el";
import { icon, type IconName } from "../dom/icons";
import { t } from "../i18n/t";
import { canExit } from "../play/sheets";
import type { MenuShortcut } from "../play/keys";
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

// What the bar offers. Exit is greyed where what it raises would refuse to open, rather than live and
// doing nothing; New Game only where this page cannot start a game.
export function menuStateFor(state: StoreState, canStart: boolean): MenuState {
  return { newGame: canStart, settings: true, rules: true, exit: canExit(state) };
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

function itemFor(name: keyof MenuState, label: string, picture: IconName, action: string, shortcut: string): Item {
  const node = el(
    "button",
    { class: "menu-item", attrs: { type: "button", "aria-keyshortcuts": shortcut }, data: { menu: action } },
    icon(picture),
    el("span", { text: label }),
  );
  return { node, name };
}

export class MenuBar {
  readonly element: HTMLElement;
  private readonly items: Item[];

  constructor(actions: MenuActions) {
    const newGame = itemFor("newGame", t("MainWindow", "New Game"), "new-game", "new-game", "Alt+N");
    const settings = itemFor("settings", t("MainWindow", "Settings"), "settings", "settings", "Alt+S");
    const rules = itemFor("rules", t("MainWindow", "Rules"), "rules", "rules", "Alt+R");
    const exit = itemFor("exit", t("MainWindow", "Exit"), "exit", "exit", "Alt+X");
    exit.node.classList.add("far");
    newGame.node.addEventListener("click", () => actions.newGame());
    settings.node.addEventListener("click", () => actions.settings());
    rules.node.addEventListener("click", () => actions.rules());
    exit.node.addEventListener("click", () => actions.exit());
    this.items = [newGame, settings, rules, exit];
    this.element = el("nav", { class: "menu-band", attrs: { "aria-label": t("MainWindow", "Romanian Whist") } }, ...this.items.map((item) => item.node));
  }

  // The item's own click, for its shortcut: nothing for one that is greyed.
  press(which: MenuShortcut): void {
    const item = this.items.find((each) => each.node.dataset.menu === which);
    if (item !== undefined && !item.node.disabled) {
      item.node.click();
    }
  }

  update(state: MenuState): void {
    for (const item of this.items) {
      item.node.disabled = !state[item.name];
    }
  }
}
