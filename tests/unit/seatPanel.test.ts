import { describe, expect, it } from "vitest";
import type { SeatView } from "../../src/play/model";
import { nameLineFor, pillFor } from "../../src/table/seatPanel";

function seat(overrides: Partial<SeatView> = {}): SeatView {
  return {
    seat: 1,
    name: "Ana",
    gender: "female",
    avatar: "woman-shoulder-hair",
    kind: "computer",
    level: "low-risk",
    presence: null,
    bidOrder: 1,
    isHuman: false,
    hasBet: false,
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

describe("the pill", () => {
  it("says no bid yet for a seat that has not bid", () => {
    expect(pillFor(seat(), false, true)).toEqual({ text: "No bid yet", state: "neutral" });
  });

  it("says Bidding… only for the seat to bid while bids are still coming in", () => {
    expect(pillFor(seat(), true, true)).toEqual({ text: "Bidding…", state: "neutral" });
    expect(pillFor(seat(), true, false)).toEqual({ text: "No bid yet", state: "neutral" });
  });

  it("shows tricks taken first, then the bid, and judges nothing while bids are coming in", () => {
    expect(pillFor(seat({ hasBet: true, bet: 2, tricksWon: 0 }), false, true)).toEqual({
      text: "Taken/Bid: 0/2",
      state: "neutral",
    });
  });

  it("colours a pill once every seat has bid: on target, owing, over", () => {
    expect(pillFor(seat({ hasBet: true, bet: 1, tricksWon: 1 }), false, false)).toEqual({
      text: "Taken/Bid: 1/1",
      state: "good",
    });
    expect(pillFor(seat({ hasBet: true, bet: 2, tricksWon: 1 }), false, false).state).toBe("warn");
    expect(pillFor(seat({ hasBet: true, bet: 0, tricksWon: 1 }), false, false).state).toBe("bad");
  });

  it("tells a bid of zero from no bid", () => {
    expect(pillFor(seat({ hasBet: true, bet: 0 }), false, false).text).toBe("Taken/Bid: 0/0");
  });
});

describe("the name line", () => {
  it("puts a marker before the name of the seat to move", () => {
    expect(nameLineFor(seat(), true)).toEqual({ marker: "▸", name: "Ana" });
    expect(nameLineFor(seat(), false)).toEqual({ marker: "", name: "Ana" });
  });

  it("keeps a name exactly as the server cleaned it", () => {
    const name = "Ștefan <b>&amp;</b> %1";
    expect(nameLineFor(seat({ name }), false).name).toBe(name);
  });
});
