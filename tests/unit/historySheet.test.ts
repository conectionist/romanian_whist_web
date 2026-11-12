import { describe, expect, it } from "vitest";
import type { RoundSeatResult } from "../../src/net/protocol";
import { fieldsFor, noteFor, totalsFor } from "../../src/sheets/historySheet";
import { isNote, type Cell } from "../../src/sheets/parts";
import { seatingOf } from "../../src/sheets/seating";
import { storeFor } from "./support/sheetState";

const store = storeFor("sheet-history");
const rounds = store.state.history;
const seating = seatingOf(store.state);

function seat(bet: number | null, won: number): RoundSeatResult {
  return { bet, won, roundScore: 0, total: 0, wins: 0, losses: 0 };
}

describe("a history cell's note", () => {
  it("is the tricks taken and then the bid", () => {
    expect(noteFor(seat(2, 1))).toBe("1/2");
    expect(noteFor(seat(0, 0))).toBe("0/0");
  });

  it("is a dash for a bid never made", () => {
    expect(noteFor(seat(null, 1))).toBe("1/–");
  });
});

describe("the totals", () => {
  it("are every seat's committed total plus what the last round was worth", () => {
    // The screenshot tool's twelve rounds: the last row of its picture reads 72, 81, 56, 51, 19 and 57.
    expect(totalsFor(rounds, 6)).toEqual([72, 81, 56, 51, 19, 57]);
  });

  it("are zeros, one for each seat, before any round is scored", () => {
    expect(totalsFor([], 4)).toEqual([0, 0, 0, 0]);
  });

  it("give a seat the round does not have a zero", () => {
    expect(totalsFor(rounds.slice(0, 1), 8).slice(6)).toEqual([0, 0]);
  });
});

describe("the history's fields", () => {
  const fields = fieldsFor(rounds, seating);
  const body = fields.table.rows.filter((row): row is Cell[] => !isNote(row));

  it("heads a column for the round, the cards and every player", () => {
    expect(fields.table.columns.map((column) => column.heading)).toEqual(["Round", "Cards", "Player", "Ana", "Bogdan", "Cristina", "Dan", "Elena"]);
    expect(fields.table.columns.map((column) => column.elide === true)).toEqual([false, false, true, true, true, true, true, true]);
    expect(fields.title).toBe("Round history");
    expect(fields.meta).toBe("Score per round, then taken/bid");
  });

  it("has a row for each round, then the totals", () => {
    expect(body).toHaveLength(13);
    expect(body[0].slice(0, 2).map((cell) => cell.text)).toEqual(["1", "1"]);
    expect(body[11].slice(0, 2).map((cell) => cell.text)).toEqual(["12", "7"]);
    expect(body[12].map((cell) => cell.text)).toEqual(["Total", "", "72", "81", "56", "51", "19", "57"]);
    // The empty cell under Cards has nothing to set in bold.
    expect(body[12].map((cell) => cell.strong === true)).toEqual([true, false, true, true, true, true, true, true]);
  });

  it("writes each score with its sign and tone, and the taken over the bid after it", () => {
    // Round 1: Player +5 with 0 of 0, Ana +6 with 1 of 1, Dan −1 with 0 of 1.
    expect(body[0][2]).toEqual({ text: "+5", tone: "good", note: "0/0" });
    expect(body[0][3]).toEqual({ text: "+6", tone: "good", note: "1/1" });
    expect(body[0][6]).toEqual({ text: "−1", tone: "bad", note: "0/1" });
  });

  it("pays the ten for five exact bids in a row in the round of six cards", () => {
    // You, Ana and Bogdan hit all five rounds of two to six cards: +16 or +17 lands in round 11.
    expect(body[10].slice(2, 5).map((cell) => cell.text)).toEqual(["+17", "+17", "+16"]);
  });

  it("says there is nothing yet, over totals of nothing", () => {
    const empty = fieldsFor([], seating);
    expect(empty.table.rows).toHaveLength(2);
    expect(empty.table.rows[0]).toEqual({ note: "No rounds finished yet." });
    expect((empty.table.rows[1] as Cell[]).map((cell) => cell.text)).toEqual(["Total", "", "0", "0", "0", "0", "0", "0"]);
  });
});
