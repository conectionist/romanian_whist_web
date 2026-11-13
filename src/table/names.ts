import type { Card } from "../net/protocol";
import { t } from "../i18n/t";
import type { SeatView } from "../play/model";
import { presenceText } from "../lobby/lobby";
import { cardNameFor } from "./cardNames";

// What a screen reader is told of the table: a card, and a name panel, in words. A card is a picture
// of ink, and a name panel a row of small parts, neither of which reads as a sentence.

// A card of the hand: its name, and on your turn whether it can be played, so the one to play is
// not found by trying each. A card face down has no name to give.
export function handLabelFor(card: Card | null, yourTurn: boolean, playable: boolean): string {
  if (card === null) {
    return t("cardname", "Your card, face down");
  }
  const name = cardNameFor(card);
  if (!yourTurn) {
    return name;
  }
  return playable ? t("cardname", "%1, playable", [name]) : t("cardname", "%1, not playable", [name]);
}

// A name panel: who it is, what they have bid and taken (the pill's words), whether they are away, and
// whose turn it is. "You" is said of your own, since the name alone does not say which panel is yours.
export function seatLabelFor(seat: SeatView, state: { active: boolean; human: boolean; pill: string }): string {
  const parts = [state.human ? t("seat", "%1 (you)", [seat.name]) : seat.name, state.pill];
  const presence = presenceText(seat.presence, seat.gender);
  if (presence !== "") {
    parts.push(presence);
  }
  if (state.active) {
    parts.push(t("seat", "to move"));
  }
  return parts.join(", ");
}
