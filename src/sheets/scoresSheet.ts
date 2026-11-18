import { el, setText } from "../dom/el";
import { t } from "../i18n/t";
import type { LastTrick } from "../net/protocol";
import type { TableModel } from "../play/model";
import { dealtText } from "../table/scoreboard";
import { Scoreboard } from "../table/scoreboard";
import { roundText, roundTypeText } from "../table/roundText";
import { TrickPanel } from "../table/trickPanel";
import type { Sheet } from "./layer";
import { LastTrickCards, fieldsFor as lastTrickFields, type MiniCard } from "./lastTrickSheet";
import { SheetButton, actions } from "./parts";
import type { Seating } from "./seating";

// The scoreboard on a table that has no room for it: the round, the trick's details, and two tabs, the scores with the
// trump and the last trick, with a button between them for the rounds so far, which need the whole window: it opens the
// history page, and Back from it comes here again.

export type Tab = "scores" | "last-trick";

export const TABS: readonly Tab[] = ["scores", "last-trick"];

export interface ScoresFields {
  title: string;
  meta: string;
  lastTrick: { meta: string; cards: MiniCard[] };
}

export function fieldsFor(model: TableModel, trick: LastTrick | null, seating: Seating): ScoresFields {
  const last = lastTrickFields(trick, seating, model.roundNumber);
  return {
    title: roundText(model.roundNumber, model.roundCount),
    meta: `${dealtText(model.trickCount)} · ${roundTypeText(model.roundType)}`,
    lastTrick: { meta: last.meta, cards: last.cards },
  };
}

export function tabLabel(tab: Tab | "history"): string {
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
  history(): void;
}

export class ScoresSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly title = el("h2", { class: "sheet-title", attrs: { id: "sheet-scores-title" } });
  private readonly meta = el("div", { class: "sheet-meta" });
  private readonly trick = new TrickPanel();
  private readonly board = new Scoreboard();
  private readonly cards = new LastTrickCards();
  private readonly lastMeta = el("div", { class: "sheet-meta" });
  private readonly tabs: HTMLButtonElement[];
  private readonly panels: HTMLElement[];
  // Where the trick's details go, which is before the tabs.
  private readonly bar: HTMLElement;
  private readonly historyButton: HTMLButtonElement;
  private readonly close = new SheetButton(t("historysheet", "Close"), "primary", "close");
  private selected = 0;
  // Set when the sheet comes up again from the history it opened, which has the keyboard put back on its button.
  private fromHistory = false;

  constructor(handlers: ScoresActions) {
    this.trick.element.classList.add("in-sheet");
    this.board.element.classList.add("in-sheet");
    this.tabs = TABS.map((tab) =>
      el("button", {
        class: "sheet-tab",
        attrs: { type: "button", role: "tab", id: `scores-tab-${tab}`, "aria-controls": `scores-panel-${tab}` },
        data: { tab },
        text: tabLabel(tab),
      }),
    );
    // A tab is of a tablist, and the history is not a tab: it is a button, drawn between the two and like them.
    this.historyButton = el("button", { class: "sheet-tab", attrs: { type: "button" }, data: { tab: "history" }, text: tabLabel("history") });
    const tablist = el("div", { class: "sheet-tablist", attrs: { role: "tablist", "aria-labelledby": "sheet-scores-title" } }, ...this.tabs);
    this.bar = el("div", { class: "sheet-tabs" }, tablist, this.historyButton);
    this.panels = [
      el("div", { class: "sheet-panel", attrs: { role: "tabpanel", id: "scores-panel-scores", "aria-labelledby": "scores-tab-scores" } }),
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
      this.bar,
      ...this.panels,
      actions(this.close),
    );
    this.close.onClick(handlers.close);
    this.historyButton.addEventListener("click", () => handlers.history());
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
  // arrows move between the two.
  select(index: number, focus: boolean): void {
    this.selected = index;
    this.tabs.forEach((tab, at) => {
      tab.setAttribute("aria-selected", String(at === index));
      tab.tabIndex = at === index ? 0 : -1;
    });
    this.panels.forEach((panel) => (panel.hidden = panel.id !== `scores-panel-${TABS[index]}`));
    if (focus) {
      this.tabs[index].focus({ preventScroll: true });
    }
  }

  get shownTab(): Tab {
    return TABS[this.selected];
  }

  // The trick's details and the scores are the table's own panels, which stand in the sheet only while it is up, so
  // that the page has each of them once.
  update(model: TableModel, fields: ScoresFields): void {
    if (!this.trick.element.isConnected) {
      this.element.insertBefore(this.trick.element, this.bar);
      this.panels[0].replaceChildren(this.board.element);
    }
    setText(this.title, fields.title);
    setText(this.meta, fields.meta);
    this.trick.update(model);
    this.board.update(model);
    setText(this.lastMeta, fields.lastTrick.meta);
    this.cards.update(fields.lastTrick.cards);
  }

  release(): void {
    this.trick.element.remove();
    this.board.element.remove();
  }

  // Coming back from the history, the keyboard is on the button that opened it.
  returning(fromHistory: boolean): void {
    this.fromHistory = fromHistory;
  }

  focusDefault(): void {
    if (this.fromHistory) {
      this.historyButton.focus();
    } else {
      this.close.focus();
    }
  }
}
