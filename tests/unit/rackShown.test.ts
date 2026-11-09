import { describe, expect, it } from "vitest";
import type { SeatView } from "../../src/play/model";
import { sameShown, shownFor } from "../../src/table/rack";

function seat(overrides: Partial<SeatView>): SeatView {
  return {
    seat: 1,
    name: "Ana",
    gender: "female",
    avatar: "",
    kind: "computer",
    level: null,
    presence: null,
    bidOrder: 1,
    isHuman: false,
    hasBet: true,
    bet: 0,
    tricksWon: 0,
    cardsLeft: 3,
    roundScore: 0,
    totalScore: 0,
    winStreak: 0,
    lossStreak: 0,
    hand: [],
    ...overrides,
  };
}

describe("what a rack shows", () => {
  it("is one back per card left when the hand cannot be seen", () => {
    expect(shownFor(seat({ cardsLeft: 5 }))).toEqual({ count: 5, faces: [] });
  });

  it("is faces, in the order given, where the hand can be seen", () => {
    const hand = [
      { card: "AS", legal: true },
      { card: "7D", legal: true },
    ];
    expect(shownFor(seat({ cardsLeft: 2, hand }))).toEqual({ count: 2, faces: ["AS", "7D"] });
  });

  it("is nothing for a seat with no cards", () => {
    expect(shownFor(seat({ cardsLeft: 0 })).count).toBe(0);
  });

  it("never shows more than a full rack", () => {
    expect(shownFor(seat({ cardsLeft: 11 })).count).toBe(8);
  });

  it("tells a change in the cards from none", () => {
    expect(sameShown({ count: 2, faces: [] }, { count: 2, faces: [] })).toBe(true);
    expect(sameShown({ count: 2, faces: [] }, { count: 3, faces: [] })).toBe(false);
    expect(sameShown({ count: 1, faces: ["AS"] }, { count: 1, faces: ["KS"] })).toBe(false);
  });
});
