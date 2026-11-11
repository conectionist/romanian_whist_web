import { describe, expect, it } from "vitest";
import type { Standing } from "../../src/net/protocol";
import { failureFields, fieldsFor, resultFor, resultFromSnapshot, standingsFor, winnerAnnouncement } from "../../src/sheets/gameOverSheet";
import type { Cell } from "../../src/sheets/parts";
import { serverFixture, storeFor, syncOf } from "./support/sheetState";

function standing(seat: number, name: string, score: number, place = 1): Standing {
  return { seat, name, score, place };
}

describe("the announcement of who won", () => {
  it("names one winner with their points", () => {
    expect(winnerAnnouncement([standing(2, "Cristi", 47)])).toBe("Cristi wins with 47 points.");
  });

  it("names two that tie, joined with and", () => {
    expect(winnerAnnouncement([standing(0, "Ana", 47), standing(1, "Bogdan", 47)])).toBe("Ana and Bogdan tie for first with 47 points.");
  });

  it("joins three with a comma and then and, and four the same way", () => {
    const three = [standing(0, "Ana", 47), standing(1, "Bogdan", 47), standing(2, "Dan", 47)];
    expect(winnerAnnouncement(three)).toBe("Ana, Bogdan and Dan tie for first with 47 points.");
    expect(winnerAnnouncement([...three, standing(3, "Elena", 47)])).toBe("Ana, Bogdan, Dan and Elena tie for first with 47 points.");
  });

  it("has a sentence of its own for a score below zero", () => {
    expect(winnerAnnouncement([standing(1, "Bogdan", -12)])).toBe("Bogdan wins with a score of -12.");
    expect(winnerAnnouncement([standing(0, "Ana", -3), standing(1, "Bogdan", -3)])).toBe("Ana and Bogdan tie for first with a score of -3.");
  });

  it("says nothing when nobody won", () => {
    expect(winnerAnnouncement([])).toBe("");
  });

  it("reads a name as it was typed", () => {
    expect(winnerAnnouncement([standing(0, "<b>Dan</b>", 5)])).toBe("<b>Dan</b> wins with 5 points.");
  });
});

describe("the standings", () => {
  const result = storeFor("sheet-game-over").state.result;

  it("are the desktop's tie of 63, from the screenshot tool", () => {
    expect(result).not.toBeNull();
    const table = standingsFor(result!);
    expect(table.columns.map((column) => column.heading)).toEqual(["Place", "Player", "Total", ""]);
    const rows = table.rows as Cell[][];
    expect(rows.map((row) => row.map((cell) => cell.text))).toEqual([
      ["1.", "Ana", "63", "★"],
      ["1.", "Dan", "63", "★"],
      ["3.", "Player", "51", ""],
      ["4.", "Elena", "47", ""],
      ["5.", "Bogdan", "40", ""],
      ["6.", "Cristina", "22", ""],
    ]);
  });

  it("star and set in bold every seat the server says won, and no other", () => {
    const rows = standingsFor(result!).rows as Cell[][];
    expect(rows.map((row) => row[1].strong === true)).toEqual([true, true, false, false, false, false]);
    // Ana and Dan are winners by seat; the place is the server's and never a count of rows.
    const fewer = { standings: result!.standings, winners: [result!.winners[0]] };
    const rowsOne = standingsFor(fewer).rows as Cell[][];
    expect(rowsOne.map((row) => row[3].text)).toEqual(["★", "", "", "", "", ""]);
  });

  it("show a score below zero with the minus sign of the tables", () => {
    const rows = standingsFor({ standings: [standing(0, "Ana", -12, 1)], winners: [] }).rows as Cell[][];
    expect(rows[0][2].text).toBe("−12");
  });

  it("make the final results face, with its announcement", () => {
    const fields = fieldsFor(result!);
    expect(fields.title).toBe("Final results");
    expect(fields.announcement).toBe("Ana and Dan tie for first with 63 points.");
    expect(fields.failed).toBe(false);
  });
});

describe("the other ending", () => {
  it("has no standings, and a title that says what happened", () => {
    const fields = failureFields();
    expect(fields.table).toBeNull();
    expect(fields.failed).toBe(true);
    expect(fields.title).toBe("The game ended in an error");
    expect(fields.announcement).not.toBe("");
  });
});

describe("the standings of a game found already over", () => {
  it("are worked out from the snapshot, best score first, ties sharing a place", () => {
    const over = syncOf({ ...serverFixture("sync"), snapshot: serverFixture("game.gameOver").snapshot });
    expect(over.type).toBe("sync");
    const result = resultFromSnapshot((over as any).snapshot);
    expect(result.standings.map((row) => [row.place, row.name, row.score])).toEqual([
      [1, "Bogdan", 40],
      [2, "Cora", 18],
      [3, "Ana", -4],
    ]);
    expect(result.winners.map((row) => row.name)).toEqual(["Bogdan"]);
  });

  it("skips the places a tie uses up, and keeps seat order within one", () => {
    const snapshot = {
      seats: [
        { name: "A", total: 47 },
        { name: "B", total: 47 },
        { name: "C", total: 31 },
        { name: "D", total: 28 },
      ],
    };
    const result = resultFromSnapshot(snapshot as any);
    expect(result.standings.map((row) => [row.place, row.seat])).toEqual([[1, 0], [1, 1], [3, 2], [4, 3]]);
    expect(result.winners.map((row) => row.seat)).toEqual([0, 1]);
  });

  it("is the server's word when it gave one, and the snapshot's when it did not", () => {
    const told = storeFor("sheet-game-over").state;
    expect(resultFor(told)).toBe(told.result);
    const found = storeFor("sheet-pause").state;
    expect(found.result).toBeNull();
    expect(resultFor(found)?.standings).toHaveLength(6);
  });
});
