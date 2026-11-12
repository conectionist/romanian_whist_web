import { el, setText } from "../dom/el";
import { t } from "../i18n/t";
import type { RoundResult, RoundSeatResult } from "../net/protocol";
import { DASH } from "../table/hudText";
import type { Sheet } from "./layer";
import { roundScoreFor, toneFor } from "./roundSheet";
import { SheetButton, SheetTable, actions, sheetNumber, type Cell, type Row, type TableFields } from "./parts";
import { nameOf, type Seating } from "./seating";

// The round history, src/ui/HistorySheet.cpp: every round of the game so far, one row each, and what
// it was worth to every seat.

// The small muted part of a cell, after the round's score: tricks taken, then the bid, "1/2". Taken
// first, as a seat's pill reads "Taken/Bid". A dash for a seat that never bid.
export function noteFor(seat: RoundSeatResult): string {
  return `${seat.won}/${seat.bet === null ? DASH : seat.bet}`;
}

// Every seat's total after the last round scored, in seat order: that round's committed total plus
// what it was worth. Zeros before any round is scored.
export function totalsFor(rounds: readonly RoundResult[], seats: number): number[] {
  const last = rounds[rounds.length - 1];
  return Array.from({ length: seats }, (_, seat) => {
    const result = last?.seats[seat];
    return result === undefined ? 0 : result.total + result.roundScore;
  });
}

export interface HistoryFields {
  title: string;
  meta: string;
  table: TableFields;
}

export function fieldsFor(rounds: readonly RoundResult[], seating: Seating): HistoryFields {
  const seats = seating.names.length > 0 ? seating.names.length : (rounds[0]?.seats.length ?? 0);
  const columns: TableFields["columns"] = [
    { heading: t("historysheet", "Round"), align: "left" },
    { heading: t("historysheet", "Cards"), align: "right" },
    ...Array.from({ length: seats }, (_, seat) => ({ heading: nameOf(seating, seat), align: "right" as const, elide: true })),
  ];

  const rows: Row[] = rounds.map((round) => {
    const cells: Cell[] = [{ text: String(round.index + 1) }, { text: String(round.tricks) }];
    for (let seat = 0; seat < seats; seat++) {
      const result = round.seats[seat];
      cells.push(
        result === undefined ? { text: DASH } : { text: roundScoreFor(result), tone: toneFor(result), note: noteFor(result) },
      );
    }
    return cells;
  });

  // The empty table: its headings, a line across them, and totals of nothing.
  if (rounds.length === 0) {
    rows.push({ note: t("historysheet", "No rounds finished yet.") });
  }
  rows.push([
    { text: t("historysheet", "Total"), strong: true, tall: true },
    { text: "", tall: true },
    ...totalsFor(rounds, seats).map((total) => ({ text: sheetNumber(total), strong: true, tall: true })),
  ]);

  return {
    title: t("historysheet", "Round history"),
    meta: t("historysheet", "Score per round, then taken/bid"),
    table: { columns, rows },
  };
}

export interface HistoryActions {
  close(): void;
}

export class HistorySheet implements Sheet {
  readonly element: HTMLElement;
  private readonly title = el("h2", { class: "sheet-title", attrs: { id: "sheet-history-title" } });
  private readonly meta = el("div", { class: "sheet-meta" });
  private readonly table = new SheetTable();
  private readonly close = new SheetButton(t("historysheet", "Close"), "primary", "close");

  constructor(handlers: HistoryActions) {
    this.table.element.classList.add("sheet-after-head");
    this.element = el(
      "section",
      { class: "sheet", data: { sheet: "history" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-history-title" } },
      this.title,
      this.meta,
      this.table.element,
      actions(this.close),
    );
    this.close.onClick(handlers.close);
  }

  update(fields: HistoryFields): void {
    // A round scored while the sheet is open keeps a reader who is at its foot at the foot, and one
    // who has scrolled up where they are.
    const sheet = this.element;
    const atFoot = sheet.scrollTop + sheet.clientHeight >= sheet.scrollHeight - 2;
    setText(this.title, fields.title);
    setText(this.meta, fields.meta);
    this.table.update(fields.table);
    if (atFoot) {
      sheet.scrollTop = sheet.scrollHeight;
    }
  }

  // The foot of a long history is what is read: the latest round, the totals and Close.
  focusDefault(): void {
    this.close.focus();
  }
}
