import type { Card, Suit } from "../net/protocol";
import { t } from "../i18n/t";
import type { Size } from "./space";

// The art's aspect, from the card SVG's own viewBox: width over height.
const CARD_ASPECT = 167.0869141 / 242.6669922;

// The size a card of this height is drawn at, the one place the aspect is known: 225 comes back
// 155 wide, a played card's 205.2 comes back 141 by 205 and 181.2 comes back 125 by 181.
export function sizeForHeight(height: number): Size {
  if (height <= 0) {
    return { w: 0, h: 0 };
  }
  return { w: Math.max(1, Math.round(height * CARD_ASPECT)), h: Math.max(1, Math.round(height)) };
}

export function rankOf(card: Card): string {
  return card[0];
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

// The ranks, low to high, as the protocol writes them.
const RANKS = "23456789TJQKA";

function rankValue(card: Card): number {
  return RANKS.indexOf(card[0]);
}

// Where a suit sorts: 0 for the trump suit, then a fixed alternating red and black order so
// neighbouring groups do not blur together. Ported from the engine's CardOrder.
const SUIT_ORDER: readonly Suit[] = ["S", "H", "C", "D"];

export function suitPosition(suit: Suit, trump: Card | null): number {
  if (trump !== null && suit === suitOf(trump)) {
    return 0;
  }
  const at = SUIT_ORDER.indexOf(suit);
  return at < 0 ? 5 : at + 1;
}

// A strict weak ordering over cards: the trump suit first, then the fixed suit order, and high
// rank before low inside a suit.
export function inDisplayOrder(left: Card, right: Card, trump: Card | null): boolean {
  const leftSuit = suitPosition(suitOf(left), trump);
  const rightSuit = suitPosition(suitOf(right), trump);
  if (leftSuit !== rightSuit) {
    return leftSuit < rightSuit;
  }
  return rankValue(left) > rankValue(right);
}

export function sortForDisplay(cards: readonly Card[], trump: Card | null): Card[] {
  return [...cards].sort((left, right) => {
    if (left === right) {
      return 0;
    }
    return inDisplayOrder(left, right, trump) ? -1 : 1;
  });
}

export interface HandEntry {
  card: Card;
  legal: boolean;
}

export interface HandLayout {
  // Every card in the hand in display order, playable or not.
  entries: HandEntry[];
  // positions[i] is the index in the server's hand of the card at display slot i.
  positions: number[];
}

// A hand in display order, and the way back from a slot to the server's index. `legalCards`
// empty means nothing is being chosen, so every card reads as legal.
export function layOutHand(hand: readonly Card[], legalCards: readonly Card[], trump: Card | null): HandLayout {
  const positions = hand.map((_, index) => index);
  positions.sort((left, right) => {
    if (left === right) {
      return 0;
    }
    return inDisplayOrder(hand[left], hand[right], trump) ? -1 : 1;
  });
  const choosing = legalCards.length > 0;
  const entries = positions.map((position) => ({
    card: hand[position],
    legal: !choosing || legalCards.includes(hand[position]),
  }));
  return { entries, positions };
}

const SUIT_SYMBOLS: Record<Suit, string> = { H: "♥", D: "♦", S: "♠", C: "♣" };

// ♥ ♦ ♠ ♣, which are not translated.
export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit];
}

// A card as a player reads it in a sentence: "K♥", "10♠". The court cards' letters are
// translated, since a Romanian deck's king is an R.
export function cardLabel(card: Card): string {
  const rank = rankOf(card);
  let text: string;
  switch (rank) {
    case "T":
      text = "10";
      break;
    case "J":
      text = t("cardtext", "J");
      break;
    case "Q":
      text = t("cardtext", "Q");
      break;
    case "K":
      text = t("cardtext", "K");
      break;
    case "A":
      text = t("cardtext", "A");
      break;
    default:
      text = rank;
  }
  return text + suitSymbol(suitOf(card));
}
