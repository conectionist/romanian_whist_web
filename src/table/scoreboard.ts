import { cardUrl } from "../assets/assets";
import { el, setAttr, setSrc, setText, stamp } from "../dom/el";
import { renderRuns, textOf, type Line } from "../dom/runs";
import { t } from "../i18n/t";
import type { Card } from "../net/protocol";
import type { TableModel } from "../play/model";
import { DASH } from "./hudText";
import { isCalledOut, roundText, roundTypeText } from "./roundText";

// The scoreboard, src/table/ScoreboardItem.cpp: the round, the cards dealt and the round type, how
// the bids stand, a row for each player in bidding order, and the trump.

export interface Header {
  round: string;
  dealt: string;
  roundType: string;
  calledOut: boolean;
}

// "6 cards dealt", or "1 card dealt": two strings, for cardsText()'s reason.
export function dealtText(trickCount: number): string {
  return trickCount === 1 ? t("scoreboard", "1 card dealt") : t("scoreboard", "%1 cards dealt", [trickCount]);
}

export function headerFor(model: TableModel): Header {
  return {
    round: roundText(model.roundNumber, model.roundCount),
    dealt: dealtText(model.trickCount),
    roundType: roundTypeText(model.roundType),
    calledOut: isCalledOut(model.roundType),
  };
}

// The tension's four sentences: while the bids come in, then over, under or even.
export type Tension = "soFar" | "over" | "under" | "even";

// One of them with its numbers in, the bid total bold. `difference` is the "by" of over and under,
// and unused by the others; `oneTrick` picks the singular.
export function tensionText(form: Tension, bids: string, tricks: string, difference: string, oneTrick: boolean): Line {
  let sentence: string;
  switch (form) {
    case "soFar":
      sentence = oneTrick ? t("scoreboard", "Bids so far: %1 of %2 trick") : t("scoreboard", "Bids so far: %1 of %2 tricks");
      break;
    case "over":
      sentence = oneTrick
        ? t("scoreboard", "Bids total %1 for %2 trick: over by %3")
        : t("scoreboard", "Bids total %1 for %2 tricks: over by %3");
      break;
    case "under":
      sentence = oneTrick
        ? t("scoreboard", "Bids total %1 for %2 trick: under by %3")
        : t("scoreboard", "Bids total %1 for %2 tricks: under by %3");
      break;
    case "even":
      sentence = oneTrick ? t("scoreboard", "Bids total %1 for %2 trick") : t("scoreboard", "Bids total %1 for %2 tricks");
      break;
  }
  const by = form === "over" || form === "under";

  // The bid total is the bold part, so it is cut out of the sentence and not substituted into it: %1
  // is swapped for a character no translation holds, the rest filled in whichever side of %1 a
  // translation puts them, and the sentence split where that character is. %2 and %3 by name, because
  // a translation may leave one out.
  const cut = "";
  sentence = sentence.replace("%1", cut).replace("%2", tricks);
  if (by) {
    sentence = sentence.replace("%3", difference);
  }
  const at = sentence.indexOf(cut);
  if (at < 0) {
    return [{ text: sentence }];
  }
  const line: Line = [];
  if (at > 0) {
    line.push({ text: sentence.slice(0, at) });
  }
  line.push({ text: bids, strong: true });
  if (at + 1 < sentence.length) {
    line.push({ text: sentence.slice(at + 1) });
  }
  return line;
}

// How the bids stand: over or under once every bid is in. The forbidden bid means the total never
// equals the tricks once the last bid is made, but the sentence says nothing wrong if it ever does.
export function tensionFor(model: TableModel): Line {
  const tricks = model.trickCount;
  const bids = model.betSum;
  const text = (form: Tension, difference: number) =>
    tensionText(form, String(bids), String(tricks), String(difference), tricks === 1);

  if (model.betsPlaced < model.seats.length) {
    return text("soFar", 0);
  }
  if (bids > tricks) {
    return text("over", bids - tricks);
  }
  if (bids < tricks) {
    return text("under", tricks - bids);
  }
  return text("even", 0);
}

// The four sentences at their widest, with the font's widest digits: what the panel is never
// narrower than, so that it changes neither its height as the bids come in nor its width as they
// change. The numbers are as long as a game can make them: up to six seats bidding up to eight
// each, so a total of two digits and over by as many; at most eight tricks.
export function widestTensions(widestDigit: string, widestBoldDigit: string): string[] {
  const one = widestDigit;
  const two = widestDigit.repeat(2);
  const boldOne = widestBoldDigit;
  const boldTwo = widestBoldDigit.repeat(2);
  return [
    textOf(tensionText("soFar", boldTwo, one, "", false)),
    textOf(tensionText("over", boldTwo, one, two, false)),
    textOf(tensionText("under", boldOne, one, one, false)),
    textOf(tensionText("even", boldOne, one, "", false)),
  ];
}

export type Streak = "none" | "winning" | "losing";

export interface Row {
  name: string;
  bid: string;
  taken: string;
  points: string;
  run: string;
  streak: Streak;
  turn: boolean;
}

// A row for each seat in bidding order. An order of 0 is "not known yet", and sorts after the known
// ones in seat order rather than claiming the top row.
export function rowsFor(model: TableModel): Row[] {
  // Nobody has taken a trick while the round is being bid.
  const bidding = model.phase === "betting" || model.phase === "notStarted";

  const order = model.seats.map((_, index) => index);
  order.sort((a, b) => {
    const first = model.seats[a].bidOrder;
    const second = model.seats[b].bidOrder;
    if (first === 0 || second === 0) {
      return first !== 0 && second === 0 ? -1 : first === 0 && second !== 0 ? 1 : a - b;
    }
    return first - second || a - b;
  });

  return order.map((index) => {
    const seat = model.seats[index];
    const row: Row = {
      name: seat.name,
      bid: seat.hasBet ? String(seat.bet) : DASH,
      taken: bidding ? DASH : String(seat.tricksWon),
      points: String(seat.totalScore),
      run: "",
      streak: "none",
      turn: model.activeSeat >= 0 && model.activeSeat === index,
    };
    // A win streak and a loss streak are never both running.
    if (seat.winStreak > 0) {
      row.run = t("scoreboard", "W%1", [seat.winStreak]);
      row.streak = "winning";
    } else if (seat.lossStreak > 0) {
      row.run = t("scoreboard", "L%1", [seat.lossStreak]);
      row.streak = "losing";
    }
    return row;
  });
}

export function headingPlayer(): string {
  return t("scoreboard", "Player");
}

// One letter each, so the panel is no wider than its numbers need.
export function headingBid(): string {
  return t("scoreboard", "B");
}

export function headingTaken(): string {
  return t("scoreboard", "T");
}

export function headingPoints(): string {
  return t("scoreboard", "Pts");
}

export function headingRun(): string {
  return t("scoreboard", "Run");
}

export interface Trump {
  card: Card | null;
  // Said where there is no card to show.
  name: string;
}

// Named rather than left blank: the eight-card round having no trump is a rule of the game, and an
// empty space says the client forgot. With a card there are no words, since its face says the suit.
export function trumpFor(model: TableModel): Trump {
  if (model.trump === null) {
    return { card: null, name: t("scoreboard", "None this round") };
  }
  return { card: model.trump, name: "" };
}

export interface Shown {
  header: Header;
  tension: Line;
  rows: Row[];
  trump: Trump;
}

export function shownFor(model: TableModel): Shown {
  return { header: headerFor(model), tension: tensionFor(model), rows: rowsFor(model), trump: trumpFor(model) };
}

const COLUMNS = 5;

interface RowCells {
  name: HTMLElement;
  marker: HTMLElement;
  ghost: HTMLElement;
  nameText: HTMLElement;
  bid: HTMLElement;
  taken: HTMLElement;
  points: HTMLElement;
  run: HTMLElement;
}

let context: CanvasRenderingContext2D | null | undefined;

// The widest of the ten digits in a face, which the tension's proportional figures are measured in:
// a 0 and a 4 are wider than an 8 in Alegreya Sans.
function widestDigit(font: string): string {
  if (context === undefined) {
    context = document.createElement("canvas").getContext("2d");
  }
  if (context === null) {
    return "8";
  }
  context.font = font;
  let widest = "0";
  for (const digit of "123456789") {
    if (context.measureText(digit).width > context.measureText(widest).width) {
      widest = digit;
    }
  }
  return widest;
}

export class Scoreboard {
  readonly element: HTMLElement;
  private readonly round = el("div", { class: "score-round" });
  private readonly dealt = el("span");
  private readonly type = el("span", { class: "score-type" });
  private readonly tension = el("div", { class: "score-tension" });
  private readonly sizers = el("div", { class: "score-sizers", attrs: { "aria-hidden": "true" } });
  private readonly grid = el("div", { class: "score-grid" });
  private readonly sizerRow: HTMLElement[];
  private readonly rows: RowCells[] = [];
  private readonly trumpLabel = el("div", { class: "score-trump-label" });
  private readonly trumpCard = el("img", { class: "score-trump-card", attrs: { alt: "", draggable: "false" } });
  private readonly trumpNone = el("div", { class: "score-trump-none" });
  private lastTension = "";
  private lastTrump: Card | null | undefined;

  constructor() {
    const heads = [headingPlayer(), headingBid(), headingTaken(), headingPoints(), headingRun()].map((text, column) =>
      el("div", { class: column === 0 ? "th player" : "th", text }),
    );
    this.grid.append(...heads);
    // One row no height, which holds the widest of each number column so the columns keep still as
    // the numbers change.
    this.sizerRow = ["", "8", "8", "-000", "W88"].map((text, column) =>
      el("div", { class: column === 0 ? "cell player sizer" : "cell sizer", text, attrs: { "aria-hidden": "true" } }),
    );
    this.grid.append(...this.sizerRow);

    this.element = el(
      "div",
      { class: "panel score" },
      this.round,
      el("div", { class: "score-sub" }, this.dealt, " · ", this.type),
      this.tension,
      this.sizers,
      this.grid,
      el("div", { class: "score-divider" }),
      this.trumpLabel,
      this.trumpCard,
      this.trumpNone,
    );
    stamp(this.element);
    this.trumpLabel.textContent = t("scoreboard", "Trump");
    this.measureSizers();
  }

  // The tension's widest sentences, in the digits this face has the widest of. Measured again once
  // the face has loaded.
  measureSizers(): void {
    const plain = widestDigit('400 14.5px "Alegreya Sans", "Gill Sans", "Segoe UI", sans-serif');
    const bold = widestDigit('700 14.5px "Alegreya Sans", "Gill Sans", "Segoe UI", sans-serif');
    this.sizers.replaceChildren(...widestTensions(plain, bold).map((text) => el("div", { text })));
  }

  private rowAt(index: number): RowCells {
    while (this.rows.length <= index) {
      const marker = el("span", { class: "marker", text: "▸", attrs: { "aria-hidden": "true" } });
      // The marker is shown on the row to move only, but every row's column is as wide as with it: a
      // ghost the width of the marker stands after the name of every other row.
      const ghost = el("span", { class: "marker ghost", text: "▸", attrs: { "aria-hidden": "true" } });
      const nameText = el("span", { class: "name-text" });
      const cells: RowCells = {
        name: el("div", { class: "cell player" }, marker, nameText, ghost),
        marker,
        ghost,
        nameText,
        bid: el("div", { class: "cell number" }),
        taken: el("div", { class: "cell number" }),
        points: el("div", { class: "cell number" }),
        run: el("div", { class: "cell number run" }),
      };
      this.grid.insertBefore(cells.name, this.sizerRow[0]);
      for (const cell of [cells.bid, cells.taken, cells.points, cells.run]) {
        this.grid.insertBefore(cell, this.sizerRow[0]);
      }
      this.rows.push(cells);
    }
    return this.rows[index];
  }

  update(model: TableModel): void {
    const shown = shownFor(model);

    setText(this.round, shown.header.round);
    setText(this.dealt, shown.header.dealt);
    setText(this.type, shown.header.roundType);
    this.type.classList.toggle("called", shown.header.calledOut);

    const tension = JSON.stringify(shown.tension);
    if (tension !== this.lastTension) {
      this.lastTension = tension;
      renderRuns(this.tension, shown.tension);
    }

    shown.rows.forEach((row, index) => {
      const cells = this.rowAt(index);
      setText(cells.nameText, row.name);
      cells.marker.hidden = !row.turn;
      cells.ghost.hidden = row.turn;
      setText(cells.bid, row.bid);
      setText(cells.taken, row.taken);
      setText(cells.points, row.points);
      setText(cells.run, row.run);
      setAttr(cells.run, "data-streak", row.streak);
      for (const cell of [cells.name, cells.bid, cells.taken, cells.points, cells.run]) {
        cell.hidden = false;
        cell.classList.toggle("turn", row.turn);
      }
    });
    for (let index = shown.rows.length; index < this.rows.length; index++) {
      const cells = this.rows[index];
      for (const cell of [cells.name, cells.bid, cells.taken, cells.points, cells.run]) {
        cell.hidden = true;
      }
    }

    if (shown.trump.card !== this.lastTrump) {
      this.lastTrump = shown.trump.card;
      this.trumpCard.hidden = shown.trump.card === null;
      this.trumpNone.hidden = shown.trump.card !== null;
      setSrc(this.trumpCard, shown.trump.card === null ? null : cardUrl(shown.trump.card));
    }
    setText(this.trumpNone, shown.trump.name);
  }
}

// The grid has this many columns: the player, then bid, taken, points and run.
export const SCORE_COLUMNS = COLUMNS;
