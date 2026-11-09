import { el, stamp, setText } from "../dom/el";
import { emphasised, renderRuns, textOf, type Line, type Run } from "../dom/runs";
import { t } from "../i18n/t";
import { translateSentence, type Sentence } from "../i18n/person";
import type { Suit } from "../net/protocol";
import type { PlayedCardView, TableModel } from "../play/model";
import { cardLabel, suitOf, suitSymbol, type HandEntry } from "./cards";
import { leadSeat } from "./geometry/trick";
import { DASH } from "./hudText";

// The trick panel, src/table/TrickPanelItem.cpp: what the trick is, who leads it and who is
// winning, and the one sentence that says what is being asked of you now.

// The two lines that name a seat and agree with it in Romanian: "Ana e prima", "Bogdan e primul",
// "Tu ești primul". One English sentence each, filed four times for the translator.
const LEADER: Sentence = {
  context: "trickpanel",
  others: {
    male: { source: "Leader: %1", comment: "about a man" },
    female: { source: "Leader: %1", comment: "about a woman" },
  },
  yours: {
    male: { source: "Leader: %1", comment: "about you, a man" },
    female: { source: "Leader: %1", comment: "about you, a woman" },
  },
};

const FIRST_TO_BID: Sentence = {
  context: "trickpanel",
  others: {
    male: { source: "First to bid: %1", comment: "about a man" },
    female: { source: "First to bid: %1", comment: "about a woman" },
  },
  yours: {
    male: { source: "First to bid: %1", comment: "about you, a man" },
    female: { source: "First to bid: %1", comment: "about you, a woman" },
  },
};

export interface Fields {
  title: string;
  rows: Line[];
  prompt: Line;
}

// What the trick panel tells you when it is your turn to play.
export function yourTurn(blind: boolean, entries: readonly HandEntry[], leadSuit: Suit | null): string {
  // A blind round has nothing to explain: there is one card, it is face down, and it is forced.
  if (blind) {
    return t("trickpanel", "Your turn.");
  }
  // Nothing played yet, so there is no suit to follow and every card is legal.
  if (leadSuit === null) {
    return t("trickpanel", "Your turn. You lead.");
  }
  // Restricted means an illegal card in the hand, asked of the entries rather than inferred from
  // the lead suit: a player void in it with no trump may play anything.
  if (!entries.some((entry) => !entry.legal)) {
    return t("trickpanel", "Your turn. Any card.");
  }
  const lead = suitSymbol(leadSuit);
  // Restricted to the lead suit, or, void in it, to the trumps. The legal cards say which.
  if (entries.some((entry) => entry.legal && suitOf(entry.card) === leadSuit)) {
    return t("trickpanel", "Your turn. You must follow %1.", [lead]);
  }
  return t("trickpanel", "Your turn. No %1, you must trump.", [lead]);
}

// The panel's text for the table as it stands. A line with a name in it is kept to one line, the
// name giving way.
export function fieldsFor(model: TableModel): Fields {
  const seatName = (seat: number): string => {
    if (seat === model.humanSeat) {
      return t("trickpanel", "You");
    }
    return model.seats[seat]?.name ?? "";
  };
  const name = (seat: number): Run => ({ text: seatName(seat), elide: true });

  const yoursActive = model.humanSeat >= 0 && model.activeSeat === model.humanSeat;
  const anotherActive = model.activeSeat >= 0 && !yoursActive;
  const thinking = (): Line =>
    emphasised(t("trickpanel", "%1 is thinking…"), [{ text: seatName(model.activeSeat), elide: true }], false);

  if (model.phase === "roundScored") {
    return { title: t("trickpanel", "Round over"), rows: [], prompt: [{ text: t("trickpanel", "Scores are in.") }] };
  }
  if (model.phase === "gameOver") {
    return { title: t("trickpanel", "Game over"), rows: [], prompt: [{ text: t("trickpanel", "Final scores are in.") }] };
  }

  if (model.phase !== "playing") {
    const fields: Fields = { title: t("trickpanel", "Bidding"), rows: [], prompt: [] };
    const first = model.seats.findIndex((seat) => seat.bidOrder === 1);
    if (first >= 0) {
      fields.rows.push(emphasised(translateSentence(FIRST_TO_BID, model, first), [name(first)]));
    }
    if (yoursActive) {
      fields.prompt = [{ text: t("trickpanel", "Your bid. How many tricks?") }];
    } else if (anotherActive) {
      fields.prompt = thinking();
    }
    return fields;
  }

  // The play. Trick 0 is "dealt and bid, nothing played yet", which the server reports between the
  // last bid and the first trick: that trick is the first.
  const trick = Math.min(Math.max(model.trickNumber, 1), Math.max(model.trickCount, 1));
  const fields: Fields = {
    title: t("trickpanel", "Trick %1 of %2", [trick, model.trickCount]),
    rows: [],
    prompt: [],
  };

  // Who leads, by the lead mark's own rule.
  const leader = leadSeat(model.phase, model.seats.length, model.table, model.leadSeat);
  if (leader !== null) {
    const row = emphasised(translateSentence(LEADER, model, leader), [name(leader)]);
    if (model.leadSuit !== null) {
      row.push({ text: ` · ${t("trickpanel", "Led %1", [suitSymbol(model.leadSuit)])}` });
    }
    fields.rows.push(row);
  }

  // Who is winning: the server's ranking, from the first card on, though the felt rings the winner
  // only from the second.
  const winning: PlayedCardView | undefined = model.table.find((played) => played.winning);
  if (winning === undefined) {
    fields.rows.push(emphasised(t("trickpanel", "Winning: %1"), [{ text: DASH }]));
  } else {
    fields.rows.push(
      emphasised(t("trickpanel", "Winning: %1"), [name(winning.seat), { text: `, ${cardLabel(winning.card)}` }]),
    );
  }

  const trickFull = model.seats.length > 0 && model.table.length >= model.seats.length;
  const yourPrompt = model.prompt?.kind === "play" ? model.prompt : null;

  if (trickFull && winning !== undefined) {
    if (winning.seat === model.humanSeat) {
      fields.prompt = [{ text: t("trickpanel", "You win the trick.") }];
    } else {
      fields.prompt = emphasised(t("trickpanel", "%1 wins the trick."), [name(winning.seat)], false);
    }
  } else if (yourPrompt !== null) {
    fields.prompt = [{ text: yourTurn(yourPrompt.blind, model.hand.entries, model.leadSuit) }];
  } else if (yoursActive) {
    // Asked, and the prompt not here yet: it arrives a moment after the message that names your seat.
    fields.prompt = [{ text: t("trickpanel", "Your turn.") }];
  } else if (anotherActive) {
    fields.prompt = thinking();
  }
  return fields;
}

export class TrickPanel {
  readonly element: HTMLElement;
  private readonly title = el("div", { class: "tp-title" });
  private readonly rows = el("div", { class: "tp-rows" });
  private readonly prompt = el("div", { class: "tp-prompt" });
  private last = "";

  constructor() {
    this.element = el("div", { class: "panel trickpanel" }, this.title, this.rows, this.prompt);
    stamp(this.element);
  }

  update(model: TableModel): void {
    const fields = fieldsFor(model);
    setText(this.title, fields.title);
    const now = JSON.stringify(fields.rows) + JSON.stringify(fields.prompt);
    if (now === this.last) {
      return;
    }
    this.last = now;
    this.rows.replaceChildren(
      ...fields.rows.map((row) => {
        const line = el("div", { class: "tp-row" });
        renderRuns(line, row);
        return line;
      }),
    );
    renderRuns(this.prompt, fields.prompt);
  }
}

// What the panel says, as the plain text of each line: for tests.
export function plainFields(fields: Fields): { title: string; rows: string[]; prompt: string } {
  return { title: fields.title, rows: fields.rows.map(textOf), prompt: textOf(fields.prompt) };
}
