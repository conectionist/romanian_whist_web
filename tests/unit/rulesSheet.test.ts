import { describe, expect, it } from "vitest";
import { configOf, linesFor, lowestRank, rankName, roundCount, type RulesConfig } from "../../src/sheets/rulesSheet";
import { storeFor } from "./support/sheetState";

const base: RulesConfig = { seats: 4, structure: "1-8-1", foreheadAndHidden: false, allOneCardForehead: false };

describe("the deck", () => {
  it("is two ranks per player down from the Ace", () => {
    expect([2, 3, 4, 5, 6].map(lowestRank).map(rankName)).toEqual(["Jack", "9", "7", "5", "3"]);
  });

  it("names the court ranks and numbers the others", () => {
    expect([9, 10, 11, 12].map(rankName)).toEqual(["Jack", "Queen", "King", "Ace"]);
    expect([1, 5].map(rankName)).toEqual(["3", "7"]);
  });

  it("is named for every table size in the first line", () => {
    const lines = (seats: number) => linesFor({ ...base, seats })[0];
    expect(lines(2)).toBe("2 players use Ace down to Jack: eight cards each, 16 in all.");
    expect(lines(4)).toBe("4 players use Ace down to 7: eight cards each, 32 in all.");
    expect(lines(6)).toBe("6 players use Ace down to 3: eight cards each, 48 in all.");
  });
});

describe("the schedule", () => {
  it("is 3N + 12 rounds, and two more with the Forehead and the Hidden round", () => {
    expect(roundCount({ seats: 4, foreheadAndHidden: false })).toBe(24);
    expect(roundCount({ seats: 4, foreheadAndHidden: true })).toBe(26);
    expect(roundCount({ seats: 6, foreheadAndHidden: true })).toBe(32);
  });

  it("is given in the game's own order", () => {
    expect(linesFor(base)[1]).toBe("Rounds go 1 (×4), 2, 3 … 7, 8 (×4), 7 … 3, 2, 1 (×4): 24 rounds.");
    expect(linesFor({ ...base, structure: "8-1-8" })[1]).toBe("Rounds go 8 (×4), 7 … 3, 2, 1 (×4), 2, 3 … 7, 8 (×4): 24 rounds.");
    expect(linesFor({ ...base, foreheadAndHidden: true })[1]).toBe(
      "Rounds go 1 (×4), 2, 3 … 7, 8 (×4), 7 … 3, 2, 1 (×4), then a Forehead and a Hidden round: 26 rounds.",
    );
  });
});

describe("the special rounds", () => {
  const has = (lines: string[], text: string) => lines.some((line) => line.includes(text));

  it("are named only when the game deals them", () => {
    const plain = linesFor(base);
    expect(has(plain, "Forehead")).toBe(false);
    expect(has(plain, "Hidden")).toBe(false);
  });

  it("are the appended pair, and say the Hidden round at the end is not a Forehead one", () => {
    const lines = linesFor({ ...base, foreheadAndHidden: true });
    expect(lines).toContain("In a Forehead round you see everyone's card but your own while you bid.");
    expect(lines).toContain("In a Hidden round nobody sees their card until the bidding is done.");
    expect(lines).not.toContain("Every 1-card round is a Forehead round.");
    const all = linesFor({ ...base, foreheadAndHidden: true, allOneCardForehead: true });
    expect(all).toContain("Every 1-card round is a Forehead round, except the Hidden round at the end.");
  });

  it("make every one-card round Forehead, with no Hidden round, on request", () => {
    const lines = linesFor({ ...base, allOneCardForehead: true });
    expect(lines).toContain("Every 1-card round is a Forehead round.");
    expect(lines).toContain("In a Forehead round you see everyone's card but your own while you bid.");
    expect(has(lines, "Hidden")).toBe(false);
  });
});

describe("the rest of the rules", () => {
  it("end on trump, bidding, play and scoring", () => {
    const [trump, bidding, play, scoring] = linesFor(base).slice(-4);
    expect(trump.startsWith("Below 8 cards, the next card is turned as trump.")).toBe(true);
    expect(bidding).toContain("The last bidder may not make the bids add up");
    expect(play).toContain("You never have to overtrump.");
    expect(scoring).toContain("1-card rounds neither add to a run nor break one");
  });
});

describe("the rules for the table's own settings", () => {
  it("count its seats, and read its shape and options", () => {
    const settings = storeFor("sheet-rules").state.table!.settings;
    expect(configOf(settings)).toEqual({ seats: 6, structure: "1-8-1", foreheadAndHidden: true, allOneCardForehead: false });
    // The screenshot tool's picture: six players, the appended pair, 32 rounds.
    const lines = linesFor(configOf(settings));
    expect(lines[0]).toBe("6 players use Ace down to 3: eight cards each, 48 in all.");
    expect(lines[1]).toBe("Rounds go 1 (×6), 2, 3 … 7, 8 (×6), 7 … 3, 2, 1 (×6), then a Forehead and a Hidden round: 32 rounds.");
    expect(lines).toHaveLength(8);
  });
});
