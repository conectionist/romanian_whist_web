import { describe, expect, it } from "vitest";
import type { RoundResult, RoundSeatResult } from "../../src/net/protocol";
import { arrowFor, fieldsFor, metaFor, roundScoreFor, streakWarnings, titleFor } from "../../src/sheets/roundSheet";
import { seatingOf } from "../../src/sheets/seating";
import { sheetNumber } from "../../src/sheets/parts";
import { roundOf, storeFor } from "./support/sheetState";

const seating = seatingOf(storeFor("sheet-round").state);

function seatResult(roundScore: number, total: number, extra: Partial<RoundSeatResult> = {}): RoundSeatResult {
  return { bet: 1, won: 1, roundScore, total, wins: 0, losses: 0, ...extra };
}

function with_(change: (result: RoundResult) => void): RoundResult {
  const result = structuredClone(roundOf());
  change(result);
  return result;
}

describe("the round sheet's title", () => {
  it("names the round, the cards dealt and the round type, from the screenshot tool's round", () => {
    expect(titleFor(roundOf())).toBe("Round 10 · 5 cards · Normal");
  });

  it("says one card in the singular and names the other round types", () => {
    expect(titleFor(with_((result) => { result.index = 6; result.tricks = 1; }))).toBe("Round 7 · 1 card · Normal");
    expect(titleFor(with_((result) => { result.type = "forehead"; }))).toContain("Forehead");
    expect(titleFor(with_((result) => { result.type = "hidden"; }))).toContain("Hidden");
  });
});

describe("the line under the title", () => {
  it("names the trump and how a round is scored", () => {
    expect(metaFor(roundOf())).toBe("Trump K♥ · exact bid scores 5 + bid, a miss loses the difference");
  });

  it("says there is no trump in an eight-card round, and names none", () => {
    const meta = metaFor(with_((result) => { result.trump = null; }));
    expect(meta.startsWith("No trump")).toBe(true);
    expect(meta).not.toContain("Trump");
  });
});

describe("the total before and after", () => {
  it("shows both, with the arrow", () => {
    expect(arrowFor(seatResult(7, 34))).toBe("34 → 41");
    expect(arrowFor(seatResult(-1, 34))).toBe("34 → 33");
  });

  it("writes a negative number with the minus sign of the table, which is as wide as a digit", () => {
    expect(arrowFor(seatResult(5, -3))).toBe("−3 → 2");
    expect(arrowFor(seatResult(-4, 1))).toBe("1 → −3");
    expect(sheetNumber(-12)).toBe("−12");
    expect(sheetNumber(0)).toBe("0");
  });
});

describe("the round score", () => {
  it("carries its own sign, which colour only reinforces", () => {
    expect(roundScoreFor(seatResult(7, 0))).toBe("+7");
    expect(roundScoreFor(seatResult(-1, 0))).toBe("−1");
    expect(roundScoreFor(seatResult(0, 0))).toBe("0");
  });
});

describe("the streak warning", () => {
  const warnings = (change: (result: RoundResult) => void) => streakWarnings(with_(change), seating);

  it("is Bogdan's, from the screenshot tool's round", () => {
    expect(streakWarnings(roundOf(), seating)).toEqual(["Bogdan has hit four in a row - a fifth is worth 10."]);
  });

  it("fires on four, and only on four", () => {
    const at = (losses: number) => warnings((result) => { result.seats[1].wins = 0; result.seats[2].wins = 0; result.seats[1].losses = losses; });
    expect(at(0)).toEqual([]);
    expect(at(3)).toEqual([]);
    expect(at(4)).toEqual(["Ana has missed four in a row - a fifth costs 10."]);
    expect(at(5)).toEqual([]);
  });

  it("warns every seat on four, in table order, not only the first", () => {
    const lines = warnings((result) => {
      result.seats[1].losses = 4;
      result.seats[3].wins = 4;
    });
    expect(lines).toEqual([
      "Ana has missed four in a row - a fifth costs 10.",
      "Bogdan has hit four in a row - a fifth is worth 10.",
      "Cristina has hit four in a row - a fifth is worth 10.",
    ]);
  });

  it("is silent when the next round deals one card, which neither adds to a run nor breaks one", () => {
    expect(warnings((result) => { result.nextCountsForStreaks = false; })).toEqual([]);
  });
});

describe("the round sheet's fields", () => {
  const fields = fieldsFor(roundOf(), seating);

  it("has the five headings of the desktop's table", () => {
    expect(fields.table.columns.map((column) => column.heading)).toEqual(["Player", "Bid", "Taken", "Round", "Total"]);
    expect(fields.table.columns.map((column) => column.align)).toEqual(["left", "right", "right", "right", "right"]);
  });

  it("has a row for every seat, in table order, with your own name in bold", () => {
    const rows = fields.table.rows as { text: string; strong?: boolean; tone?: string }[][];
    expect(rows.map((row) => row[0].text)).toEqual(["Player", "Ana", "Bogdan", "Cristina", "Dan", "Elena"]);
    expect(rows.map((row) => row[0].strong === true)).toEqual([true, false, false, false, false, false]);
    expect(rows[0].map((cell) => cell.text)).toEqual(["Player", "1", "1", "+6", "34 → 40"]);
    expect(rows[1].map((cell) => cell.text)).toEqual(["Ana", "2", "1", "−1", "41 → 40"]);
  });

  it("colours a gain green and a loss red, and a zero neither", () => {
    const rows = fields.table.rows as { tone?: string }[][];
    expect(rows[0][3].tone).toBe("good");
    expect(rows[1][3].tone).toBe("bad");
    const zero = fieldsFor(with_((result) => { result.seats[0].roundScore = 0; }), seating).table.rows as { tone?: string }[][];
    expect(zero[0][3].tone).toBe("plain");
  });

  it("writes a dash for a seat that never bid", () => {
    const none = fieldsFor(with_((result) => { result.seats[2].bet = null; }), seating).table.rows as { text: string }[][];
    expect(none[2][1].text).toBe("–");
  });

  it("is built again from the next round, whatever the seat count", () => {
    const fewer = fieldsFor(with_((result) => { result.seats.length = 3; }), seating);
    expect(fewer.table.rows).toHaveLength(3);
  });
});
