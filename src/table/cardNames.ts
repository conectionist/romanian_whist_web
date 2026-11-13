import type { Card, Suit } from "../net/protocol";
import { currentLanguage } from "../i18n/language";
import { t } from "../i18n/t";
import { rankOf, suitOf } from "./cards";

// A card in words, in the two forms a sentence and a label need: "Queen of spades" names a card where it
// is shown, and "the queen of spades" is what a sentence says of it. A rank is a word of its own and in
// lower case, so a label capitalises the first letter of what it says and a sentence leaves it.

const RANKS = "23456789TJQKA";

export function suitName(suit: Suit): string {
  switch (suit) {
    case "S":
      return t("cardname", "spades");
    case "H":
      return t("cardname", "hearts");
    case "D":
      return t("cardname", "diamonds");
    case "C":
      return t("cardname", "clubs");
  }
}

// What starts a phrase begins with a capital.
function capital(text: string): string {
  return text.charAt(0).toLocaleUpperCase(currentLanguage()) + text.slice(1);
}

// A rank as a card's name says it: "queen", "10".
function rankWord(rank: number): string {
  switch (rank) {
    case 0:
      return t("cardname", "2", [], { comment: "a rank, in a card's name" });
    case 1:
      return t("cardname", "3", [], { comment: "a rank, in a card's name" });
    case 2:
      return t("cardname", "4", [], { comment: "a rank, in a card's name" });
    case 3:
      return t("cardname", "5", [], { comment: "a rank, in a card's name" });
    case 4:
      return t("cardname", "6", [], { comment: "a rank, in a card's name" });
    case 5:
      return t("cardname", "7", [], { comment: "a rank, in a card's name" });
    case 6:
      return t("cardname", "8", [], { comment: "a rank, in a card's name" });
    case 7:
      return t("cardname", "9", [], { comment: "a rank, in a card's name" });
    case 8:
      return t("cardname", "10", [], { comment: "a rank, in a card's name" });
    case 9:
      return t("cardname", "jack", [], { comment: "a rank, in a card's name" });
    case 10:
      return t("cardname", "queen", [], { comment: "a rank, in a card's name" });
    case 11:
      return t("cardname", "king", [], { comment: "a rank, in a card's name" });
    default:
      return t("cardname", "ace", [], { comment: "a rank, in a card's name" });
  }
}

// "Queen of spades", "10 of hearts": a card where it is shown, or after a colon.
export function cardNameFor(card: Card): string {
  return capital(t("cardname", "%1 of %2", [rankWord(RANKS.indexOf(rankOf(card))), suitName(suitOf(card))]));
}

// "the queen of spades", "the 10 of hearts": a card in a sentence.
export function cardInSentence(card: Card): string {
  return t("cardname", "the %1 of %2", [rankWord(RANKS.indexOf(rankOf(card))), suitName(suitOf(card))]);
}
