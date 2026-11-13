import { el, setText } from "../dom/el";
import { icon, type IconName } from "../dom/icons";
import { t } from "../i18n/t";
import { fullscreenButton } from "../table/fullscreen";
import type { MenuSheet } from "../play/sheets";
import type { Sheet } from "./layer";
import { SheetButton, actions } from "./parts";

// The menu on a table that has no menu bar: a list that reaches the round history, the last trick, the settings and
// the rules, and the way out, with the way back to the game as its action. A solo game waits while it is open, and
// an online one goes on.

export type MenuKind = "solo" | "online";

export interface MenuListActions {
  open(sheet: MenuSheet): void;
  resume(): void;
  leave(): void;
}

export interface MenuListFields {
  title: string;
  meta: string;
  leave: string;
  back: string;
}

export function fieldsFor(kind: MenuKind, round: { index: number; count: number } | null): MenuListFields {
  if (kind === "online") {
    return {
      title: t("TableScene", "Menu"),
      meta: t("menulist", "Online games do not pause: the table plays on while this is open."),
      leave: t("online", "Leave table"),
      back: t("online", "Back to the table"),
    };
  }
  return {
    title: t("PauseOverlay", "Paused"),
    meta: round === null ? "" : t("menulist", "Round %1 of %2. The game waits until you come back.", [round.index, round.count]),
    leave: t("PauseOverlay", "Main menu"),
    back: t("PauseOverlay", "Resume"),
  };
}

interface Row {
  element: HTMLButtonElement;
  label: HTMLElement;
}

function row(picture: IconName, label: string, item: string): Row {
  const text = el("span", { class: "menu-row-text", text: label });
  const element = el("button", { class: "menu-row", attrs: { type: "button" }, data: { menuItem: item } }, icon(picture), text, icon("chevron"));
  return { element, label: text };
}

export class MenuListSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly title = el("h2", { class: "sheet-title", attrs: { id: "sheet-menu-title" } });
  private readonly meta = el("div", { class: "sheet-meta" });
  private readonly leave = row("exit", "", "leave");
  private readonly back = new SheetButton("", "primary", "resume");

  constructor(handlers: MenuListActions) {
    const history = row("round-history", t("TableScene", "Round history"), "history");
    const last = row("last-trick", t("TableScene", "Last trick"), "last-trick");
    const settings = row("settings", t("MainWindow", "Settings"), "settings");
    const rules = row("rules", t("MainWindow", "Rules"), "rules");
    history.element.addEventListener("click", () => handlers.open("history"));
    last.element.addEventListener("click", () => handlers.open("last-trick"));
    settings.element.addEventListener("click", () => handlers.open("settings"));
    rules.element.addEventListener("click", () => handlers.open("rules"));
    this.leave.element.addEventListener("click", () => handlers.leave());
    // Full screen is offered here, in the list, where the table is drawn at its size or larger.
    const full = fullscreenButton("menu-row");
    full.prepend(icon("fullscreen"));
    this.element = el(
      "section",
      { class: "sheet menu-sheet", data: { sheet: "menu" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-menu-title" } },
      this.title,
      this.meta,
      el("div", { class: "menu-list" }, history.element, last.element, settings.element, rules.element, full, this.leave.element),
      actions(this.back),
    );
    this.back.onClick(handlers.resume);
  }

  update(kind: MenuKind, fields: MenuListFields): void {
    setText(this.title, fields.title);
    setText(this.meta, fields.meta);
    this.meta.hidden = fields.meta === "";
    setText(this.leave.label, fields.leave);
    this.back.setLabel(fields.back);
    this.back.element.dataset.action = kind === "online" ? "stay" : "resume";
    this.element.dataset.kind = kind;
  }

  // Enter takes the way back, as the pause menu's and the offer to leave's do.
  focusDefault(): void {
    this.back.focus();
  }
}
