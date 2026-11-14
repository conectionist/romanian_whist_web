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

// The scoreboard on a table that has no room for it: the round, the trick's details, and three tabs, the scores
// with the trump, the rounds so far, and the last trick. What each shows is what the desktop's corner panels and
// the last-trick sheet show, from the same fields. The rounds so far need the whole window, so that tab opens the
// history page, and Back from it comes here again.

export type Tab = "scores" | "history" | "last-trick";

export const TABS: readonly Tab[] = ["scores", "history", "last-trick"];

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
  private readonly close = new SheetButton(t("historysheet", "Close"), "primary", "close");
  private selected = 0;

  constructor(handlers: ScoresActions) {
    this.trick.element.classList.add("in-sheet");
    this.board.element.classList.add("in-sheet");
    this.tabs = TABS.map((tab) =>
      el("button", {
        class: "sheet-tab",
        attrs: { type: "button", role: "tab", id: `scores-tab-${tab}`, ...(tab === "history" ? {} : { "aria-controls": `scores-panel-${tab}` }) },
        data: { tab },
        text: tabLabel(tab),
      }),
    );
    this.bar = el("div", { class: "sheet-tabs", attrs: { role: "tablist", "aria-labelledby": "sheet-scores-title" } }, ...this.tabs);
    // The three tabs have two panels: the history is a page of its own.
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
    this.tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => (TABS[index] === "history" ? handlers.history() : this.select(index, false)));
      tab.addEventListener("keydown", (event) => {
        const next = tabAfter(index, this.tabs.length, event.key);
        if (next !== null) {
          event.preventDefault();
          // The arrows go to the history tab and wait there: Enter or a tap opens it.
          if (TABS[next] === "history") {
            this.tabs[next].focus({ preventScroll: true });
          } else {
            this.select(next, true);
          }
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
    });
    // The history has no panel here, and the others are shown by their tab.
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

  focusDefault(): void {
    this.close.focus();
  }
}
