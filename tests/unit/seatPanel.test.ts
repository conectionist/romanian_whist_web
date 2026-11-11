import { describe, expect, it } from "vitest";
import type { SeatView } from "../../src/play/model";
import { countdownFor, nameLineFor, pillFor } from "../../src/table/seatPanel";

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

describe("the ring round your panel for a turn's last seconds", () => {
  it("is nothing with no timer, and nothing until 15 seconds are left", () => {
    expect(countdownFor(null, 0)).toBeNull();
    expect(countdownFor(60000, 44000)).toBeNull();
    expect(countdownFor(60000, 45000)).toEqual({ seconds: 15, fraction: 1, urgent: false });
  });

  it("empties as the seconds go, and counts a part of a second as the whole", () => {
    expect(countdownFor(60000, 52500)).toEqual({ seconds: 8, fraction: 0.5, urgent: false });
    expect(countdownFor(60000, 59001)).toMatchObject({ seconds: 1 });
  });

  it("is urgent for the last five, with the seconds written as well as the colour", () => {
    expect(countdownFor(60000, 55000)).toMatchObject({ seconds: 5, urgent: true });
    expect(countdownFor(60000, 54999)).toMatchObject({ seconds: 6, urgent: false });
  });

  it("is gone once the time is up", () => {
    expect(countdownFor(60000, 60000)).toEqual({ seconds: 0, fraction: 0, urgent: true });
    expect(countdownFor(60000, 60001)).toBeNull();
  });

  it("counts from the time the page was told, which the prompt's deadline already is", () => {
    // A prompt received at 1000 ms with 20 s to go has its deadline at 21000.
    expect(countdownFor(1000 + 20000, 1000 + 4000)).toBeNull();
    expect(countdownFor(1000 + 20000, 1000 + 6000)).toMatchObject({ seconds: 14 });
  });
});
