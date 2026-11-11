import { el, setText } from "../dom/el";
import { t } from "../i18n/t";
import type { RoundResult, RoundSeatResult } from "../net/protocol";
import { cardLabel } from "../table/cards";
import { DASH } from "../table/hudText";
import { cardsText, roundTypeText } from "../table/roundText";
import type { Sheet } from "./layer";
import { SheetButton, SheetTable, actions, joinNames, sheetNumber, suitedLine, type Tone, type TableFields } from "./parts";
import { nameOf, type Seating } from "./seating";

// The round sheet, src/ui/RoundSheet.cpp: what the round just scored was worth, per seat.

// "Round 7 · 6 cards · Normal": the three facts that identify a round, as the scoreboard says them.
export function titleFor(result: RoundResult): string {
  return t("roundsheet", "Round %1 · %2 · %3", [result.index + 1, cardsText(result.tricks), roundTypeText(result.type)]);
}

// The line under the title: the trump the round was played to, or none in an eight-card round, and
// how a round is scored.
export function metaFor(result: RoundResult): string {
  const trump =
    result.trump === null ? t("roundsheet", "No trump") : t("roundsheet", "Trump %1", [cardLabel(result.trump)]);
  return t("roundsheet", "%1 · exact bid scores 5 + bid, a miss loses the difference", [trump]);
}

// "34 → 41": the total before this round and after it, two numbers that mean different things
// either side of the scoring, so both are shown.
export function arrowFor(seat: RoundSeatResult): string {
  return t("roundsheet", "%1 → %2", [sheetNumber(seat.total), sheetNumber(seat.total + seat.roundScore)]);
}

// The round score with its sign, which is what carries the meaning: the colour only makes it quick.
export function roundScoreFor(seat: RoundSeatResult): string {
  if (seat.roundScore > 0) {
    return `+${seat.roundScore}`;
  }
  return seat.roundScore < 0 ? sheetNumber(seat.roundScore) : "0";
}

export function toneFor(seat: RoundSeatResult): Tone {
  if (seat.roundScore > 0) {
    return "good";
  }
  return seat.roundScore < 0 ? "bad" : "plain";
}

// The engine pays 10 on the fifth exact bid or miss in a row, and a player cannot see it coming
// without counting rounds, so a seat on four is told.
const PAYOUT = 10;
const WARN_AT = 4;

// One line for each seat on four, in table order. Silent when the next round deals one card, which
// neither adds to a run nor breaks one, so there is no fifth to reach.
export function streakWarnings(result: RoundResult, seating: Seating): string[] {
  if (!result.nextCountsForStreaks) {
    return [];
  }
  const lines: string[] = [];
  result.seats.forEach((seat, index) => {
    const name = nameOf(seating, index);
    if (seat.losses === WARN_AT) {
      lines.push(t("roundsheet", "%1 has missed four in a row - a fifth costs %2.", [name, PAYOUT]));
    }
    if (seat.wins === WARN_AT) {
      lines.push(t("roundsheet", "%1 has hit four in a row - a fifth is worth %2.", [name, PAYOUT]));
    }
  });
  return lines;
}

export interface RoundFields {
  title: string;
  meta: string;
  table: TableFields;
  warnings: string[];
}

export function fieldsFor(result: RoundResult, seating: Seating): RoundFields {
  return {
    title: titleFor(result),
    meta: metaFor(result),
    table: {
      columns: [
        { heading: t("roundsheet", "Player"), align: "left" },
        { heading: t("roundsheet", "Bid"), align: "right" },
        { heading: t("roundsheet", "Taken"), align: "right" },
        { heading: t("roundsheet", "Round"), align: "right" },
        { heading: t("roundsheet", "Total"), align: "right" },
      ],
      // Your own name in bold: a table of names is read by finding your own first. A dash for a seat
      // that never bid.
      rows: result.seats.map((seat, index) => [
        { text: nameOf(seating, index), strong: seating.you === index },
        { text: seat.bet === null ? DASH : String(seat.bet) },
        { text: String(seat.won) },
        { text: roundScoreFor(seat), tone: toneFor(seat) },
        { text: arrowFor(seat) },
      ]),
    },
    warnings: streakWarnings(result, seating),
  };
}

// Who the round hold waits for, and for how long, as the sheet says it: "Waiting for Ana and Bogdan: 23
// s". Nothing when it waits for nobody in particular, as in a watched solo game, or has no deadline.
export function holdNote(waitingFor: readonly number[], seating: Seating, secondsLeft: number | null): string {
  if (waitingFor.length === 0) {
    return "";
  }
  const names = waitingFor.map((seat) => nameOf(seating, seat));
  const who = joinNames(names);
  return secondsLeft === null
    ? t("online", "Waiting for %1.", [who])
    : t("online", "Waiting for %1: %2 s", [who, Math.max(0, Math.ceil(secondsLeft))]);
}

export interface RoundActions {
  history(): void;
  continueRound(): void;
}

export class RoundSheet implements Sheet {
  readonly element: HTMLElement;
  private readonly title = el("h2", { class: "sheet-title" });
  private readonly meta = el("div", { class: "sheet-meta" });
  private readonly table = new SheetTable();
  private readonly warning = el("div", { class: "sheet-note streak", attrs: { role: "status" } });
  private readonly history = new SheetButton(t("roundsheet", "Round history"), "quiet", "history");
  private readonly continueButton = new SheetButton(t("roundsheet", "Continue"), "primary", "continue");
  private readonly hold = el("div", { class: "sheet-note hold", attrs: { role: "status" } });
  private shownMeta = "";

  constructor(handlers: RoundActions) {
    this.table.element.classList.add("sheet-after-head");
    this.element = el(
      "section",
      { class: "sheet", data: { sheet: "round" }, attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-round-title" } },
      this.title,
      this.meta,
      this.table.element,
      this.warning,
      this.hold,
      actions(this.history, this.continueButton),
    );
    this.title.id = "sheet-round-title";
    this.history.onClick(handlers.history);
    this.continueButton.onClick(handlers.continueRound);
  }

  // `waiting` says who the game waits for at an online table and for how long: nothing in a solo game.
  update(fields: RoundFields, options: { continueDisabled: boolean; waiting?: string }): void {
    setText(this.hold, options.waiting ?? "");
    this.hold.hidden = (options.waiting ?? "") === "";
    setText(this.title, fields.title);
    if (fields.meta !== this.shownMeta) {
      this.shownMeta = fields.meta;
      suitedLine(this.meta, fields.meta);
    }
    this.table.update(fields.table);
    setText(this.warning, fields.warnings.join("\n"));
    this.warning.hidden = fields.warnings.length === 0;
    this.continueButton.disabled = options.continueDisabled;
  }

  focusDefault(): void {
    this.continueButton.focus();
  }
}
