import { t } from "../i18n/t";
import type { RoundType } from "../net/protocol";

// The round, the cards dealt, the round type and the trump: the words of the strip that once ran
// across the top of the window, which the scoreboard now says.

// "6 cards", or "1 card": two strings, and not a plural form, so that each is a line of a
// catalogue. A hand is never more than 8 cards.
export function cardsText(trickCount: number): string {
  return trickCount === 1 ? t("infostrip", "1 card") : t("infostrip", "%1 cards", [trickCount]);
}

// The round type as a player reads it.
export function roundTypeText(type: RoundType): string {
  switch (type) {
    case "normal":
      return t("infostrip", "Normal");
    case "forehead":
      return t("infostrip", "Forehead");
    case "hidden":
      return t("infostrip", "Hidden");
  }
}

// Whether the round type is called out in an accent colour, so the round is known before the cards
// are dealt. Never the only cue: the word is on screen as well.
export function isCalledOut(type: RoundType): boolean {
  return type !== "normal";
}

export function roundText(roundNumber: number, roundCount: number): string {
  return t("infostrip", "Round %1 of %2", [roundNumber, roundCount]);
}
