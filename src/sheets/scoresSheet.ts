import { el, setText } from "../dom/el";
import { t } from "../i18n/t";
import type { LastTrick, RoundResult } from "../net/protocol";
import type { TableModel } from "../play/model";
import { dealtText } from "../table/scoreboard";
import { Scoreboard } from "../table/scoreboard";
import { roundText, roundTypeText } from "../table/roundText";
import { TrickPanel } from "../table/trickPanel";
import { fieldsFor as historyFields } from "./historySheet";
import type { Sheet } from "./layer";
import { LastTrickCards, fieldsFor as lastTrickFields, type MiniCard } from "./lastTrickSheet";
import { SheetButton, SheetTable, actions, type TableFields } from "./parts";
import type { Seating } from "./seating";

// The scoreboard on a table that has no room for it: the round, the trick's details, and three tabs, the scores
// with the trump, the rounds so far, and the last trick. What each shows is what the desktop's corner panels and
// the history and last-trick sheets show, from the same fields.

export type Tab = "scores" | "history" | "last-trick";

export const TABS: readonly Tab[] = ["scores", "history", "last-trick"];

export interface ScoresFields {
  title: string;
  meta: string;
  history: { meta: string; table: TableFields };
  lastTrick: { meta: string; cards: MiniCard[] };
}

export function fieldsFor(model: TableModel, rounds: readonly RoundResult[], trick: LastTrick | null, seating: Seating): ScoresFields {
  const history = historyFields(rounds, seating);
  const last = lastTrickFields(trick, seating, model.roundNumber);
  return {
    title: roundText(model.roundNumber, model.roundCount),
    meta: `${dealtText(model.trickCount)} · ${roundTypeText(model.roundType)}`,
    history: { meta: history.meta, table: history.table },
    lastTrick: { meta: last.meta, cards: last.cards },
  };
}

export function tabLabel(tab: Tab): string {
  switch (tab) {
    case "scores":
      return t("scoreboard", "Scores");
    case "history":
      return t("scoresheet", "History");
    case "last-trick":
      return t("TableScene", "Last trick");
  }
}

// The tab a key moves to from this one: Left and Right a step, and not past the ends, Home and End to the first
// and the last. Null for a key that moves nothing.
export function tabAfter(current: number, count: number, key: string): number | null {
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, current - 1);
    case "ArrowRight":
      return Math.min(count - 1, current + 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export interface ScoresActions {
  close(): void;
}

export class ScoresSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly title = el("h2", { class: "sheet-title", attrs: { id: "sheet-scores-title" } });
  private readonly meta = el("div", { class: "sheet-meta" });
  private readonly trick = new TrickPanel();
  private readonly board = new Scoreboard();
  private readonly table = new SheetTable();
  private readonly cards = new LastTrickCards();
  private readonly historyMeta = el("div", { class: "sheet-meta" });
  private readonly lastMeta = el("div", { class: "sheet-meta" });
  private readonly tabs: HTMLButtonElement[];
  private readonly panels: HTMLElement[];
  private readonly close = new SheetButton(t("historysheet", "Close"), "primary", "close");
  private selected = 0;

  constructor(handlers: ScoresActions) {
    this.trick.element.classList.add("in-sheet");
    this.board.element.classList.add("in-sheet");
    this.table.element.classList.add("sheet-after-head");
    this.tabs = TABS.map((tab) =>
      el("button", {
        class: "sheet-tab",
        attrs: { type: "button", role: "tab", id: `scores-tab-${tab}`, "aria-controls": `scores-panel-${tab}` },
        data: { tab },
        text: tabLabel(tab),
      }),
    );
    const bar = el("div", { class: "sheet-tabs", attrs: { role: "tablist", "aria-labelledby": "sheet-scores-title" } }, ...this.tabs);
    this.panels = [
      el("div", { class: "sheet-panel", attrs: { role: "tabpanel", id: "scores-panel-scores", "aria-labelledby": "scores-tab-scores" } }, this.board.element),
      el("div", { class: "sheet-panel", attrs: { role: "tabpanel", id: "scores-panel-history", "aria-labelledby": "scores-tab-history" } }, this.historyMeta, this.table.element),
      el(
        "div",
        { class: "sheet-panel", attrs: { role: "tabpanel", id: "scores-panel-last-trick", "aria-labelledby": "scores-tab-last-trick" } },
        this.lastMeta,
        this.cards.element,
      ),
    ];
    this.element = el(
      "section",
      { class: "sheet scores", data: { sheet: "scores" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-scores-title" } },
      this.title,
      this.meta,
      this.trick.element,
      bar,
      ...this.panels,
      actions(this.close),
    );
    this.close.onClick(handlers.close);
    this.tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => this.select(index, false));
      tab.addEventListener("keydown", (event) => {
        const next = tabAfter(index, this.tabs.length, event.key);
        if (next !== null) {
          event.preventDefault();
          this.select(next, true);
        }
      });
    });
    this.select(0, false);
  }

  // Shows this tab's panel, and puts the keyboard on its tab when asked. Only the shown tab is a stop of Tab: the
  // arrows move between the three.
  select(index: number, focus: boolean): void {
    this.selected = index;
    this.tabs.forEach((tab, at) => {
      tab.setAttribute("aria-selected", String(at === index));
      tab.tabIndex = at === index ? 0 : -1;
      this.panels[at].hidden = at !== index;
    });
    if (focus) {
      this.tabs[index].focus({ preventScroll: true });
    }
  }

  get shownTab(): Tab {
    return TABS[this.selected];
  }

  update(model: TableModel, fields: ScoresFields): void {
    setText(this.title, fields.title);
    setText(this.meta, fields.meta);
    this.trick.update(model);
    this.board.update(model);
    setText(this.historyMeta, fields.history.meta);
    this.table.update(fields.history.table);
    setText(this.lastMeta, fields.lastTrick.meta);
    this.cards.update(fields.lastTrick.cards);
  }

  focusDefault(): void {
    this.close.focus();
  }
}
