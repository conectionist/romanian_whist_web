import { winnerAnnouncement } from "../sheets/gameOverSheet";
import { sheetNumber } from "../sheets/parts";
import { cardNameFor } from "../table/names";
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

// The words for a message, or null when it is not worth saying.
export function announcementFor(message: ServerMessage): string | null {
  if (message.type !== "game" || message.snapshot === null) {
    return null;
  }
  const { event, snapshot } = message;
  switch (event.kind) {
    case "betPlaced":
      return event.seat === snapshot.you ? t("BidBubbleItem", "You bid %1", [event.bet]) : t("announce", "%1 bids %2", [nameOf(snapshot, event.seat), event.bet]);
    case "cardPlayed":
      return event.seat === snapshot.you
        ? t("announce", "You play %1", [cardNameFor(event.card)])
        : t("announce", "%1 plays %2", [nameOf(snapshot, event.seat), cardNameFor(event.card)]);
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
