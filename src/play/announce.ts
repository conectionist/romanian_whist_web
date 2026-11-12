import { winnerAnnouncement } from "../sheets/gameOverSheet";
import { sheetNumber } from "../sheets/parts";
import { cardInSentence } from "../table/cardNames";
import { cardsText, roundText, roundTypeText } from "../table/roundText";
import { yourTurn } from "../table/trickPanel";
import type { TableModel } from "./model";
import { t } from "../i18n/t";
import type { RoundResult, ServerMessage, Snapshot } from "../net/protocol";

// What the polite live region says of a game, one sentence for each thing that happens at the table: a
// bid, a card, a trick taken, a round scored, the game's end. A deal, a sweep and a flight say
// nothing, which a person who cannot see them has no use for.

function nameOf(snapshot: Snapshot, seat: number): string {
  return seat === snapshot.you ? t("trickpanel", "You") : (snapshot.seats[seat]?.name ?? "");
}

// "+6" and "−1": the sign says what a score did.
function signed(points: number): string {
  return points > 0 ? `+${points}` : sheetNumber(points);
}

export function roundAnnouncement(result: RoundResult, snapshot: Snapshot): string {
  const scores = result.seats.map((seat, index) => t("announce", "%1: %2, total %3.", [nameOf(snapshot, index), signed(seat.roundScore), sheetNumber(seat.total)]));
  return [t("announce", "Round %1 is scored.", [result.index + 1]), ...scores].join(" ");
}

// A round begun: which it is, how many cards, what kind if not a plain one, and what is trump.
export function roundStartAnnouncement(snapshot: Snapshot): string {
  const { round } = snapshot;
  const parts = [roundText(round.index + 1, round.count), cardsText(round.tricks)];
  if (round.type !== "normal") {
    parts.push(roundTypeText(round.type));
  }
  parts.push(round.trump === null ? t("roundsheet", "No trump") : t("announce", "Trump: %1", [cardInSentence(round.trump)]));
  return parts.map((part) => `${part}.`).join(" ");
}

// What you are asked, in the trick panel's own sentence: said when the question comes, which the screen
// shows by a strip and a panel and says nowhere.
export function promptAnnouncement(model: TableModel | null): string | null {
  const prompt = model?.prompt ?? null;
  if (model === null || prompt === null) {
    return null;
  }
  return prompt.kind === "bet" ? t("trickpanel", "Your bid. How many tricks?") : yourTurn(prompt.blind, model.hand.entries, model.leadSuit);
}

// The words for a message, or null when it is not worth saying. `model` is the table once the message is
// applied, which a question is read from.
export function announcementFor(message: ServerMessage, model: TableModel | null = null): string | null {
  if (message.type === "prompt") {
    return promptAnnouncement(model);
  }
  if (message.type !== "game" || message.snapshot === null) {
    return null;
  }
  const { event, snapshot } = message;
  switch (event.kind) {
    case "betPlaced":
      return event.seat === snapshot.you ? t("BidBubbleItem", "You bid %1", [event.bet]) : t("announce", "%1 bids %2", [nameOf(snapshot, event.seat), event.bet]);
    case "roundStarted":
      return roundStartAnnouncement(snapshot);
    case "cardPlayed":
      return event.seat === snapshot.you
        ? t("announce", "You play %1", [cardInSentence(event.card)])
        : t("announce", "%1 plays %2", [nameOf(snapshot, event.seat), cardInSentence(event.card)]);
    case "trickWon":
      return event.seat === snapshot.you ? t("trickpanel", "You win the trick.") : t("trickpanel", "%1 wins the trick.", [nameOf(snapshot, event.seat)]);
    case "roundScored":
      return roundAnnouncement(event.result, snapshot);
    case "gameOver":
      return `${t("trickpanel", "Game over")}. ${winnerAnnouncement(event.winners)}`;
    default:
      return null;
  }
}
