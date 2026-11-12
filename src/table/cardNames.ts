import type { Card, Suit } from "../net/protocol";
import { rankName } from "../sheets/rulesSheet";
import { t } from "../i18n/t";
import { rankOf, suitOf } from "./cards";

// A card in words, in the two forms a sentence and a label need: "Queen of spades" names a card where
// it is shown, and "the queen of spades" is what a sentence says of it. Romanian puts its article on
// the rank ("dama de pică"), so the two are not one with a lower case.

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

// "Queen of spades", "10 of hearts".
export function cardNameFor(card: Card): string {
  return t("cardname", "%1 of %2", [rankName(RANKS.indexOf(rankOf(card))), suitName(suitOf(card))]);
}

function rankInSentence(rank: number): string {
  switch (rank) {
    case 0:
      return t("cardname", "the 2");
    case 1:
      return t("cardname", "the 3");
    case 2:
      return t("cardname", "the 4");
    case 3:
      return t("cardname", "the 5");
    case 4:
      return t("cardname", "the 6");
    case 5:
      return t("cardname", "the 7");
    case 6:
      return t("cardname", "the 8");
    case 7:
      return t("cardname", "the 9");
    case 8:
      return t("cardname", "the 10");
    case 9:
      return t("cardname", "the jack");
    case 10:
      return t("cardname", "the queen");
    case 11:
      return t("cardname", "the king");
    default:
      return t("cardname", "the ace");
  }
}

// "the queen of spades", "the 10 of hearts".
export function cardInSentence(card: Card): string {
  return t("cardname", "%1 of %2", [rankInSentence(RANKS.indexOf(rankOf(card))), suitName(suitOf(card))]);
}
