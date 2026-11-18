import { describe, expect, it } from "vitest";
import type { LastTrick } from "../../src/net/protocol";
import { CARD_GAP, CARD_WIDTH, cardHeight, fieldsFor, metaFor } from "../../src/sheets/lastTrickSheet";
import { seatingOf } from "../../src/sheets/seating";
import { storeFor } from "./support/sheetState";

const store = storeFor("sheet-last-trick");
const trick = store.state.lastTrick as LastTrick;
const seating = seatingOf(store.state);
const watcher = { ...seating, you: null };

describe("the line under the title", () => {
  it("says who won, by name", () => {
    // Dan took it with the Ace, in round 10, which is the round on the table.
    expect(metaFor(trick, seating, 10)).toBe("Dan won it");
  });

  it("says You when the winner is your seat", () => {
    const yours = { ...trick, cards: trick.cards.map((played) => ({ ...played, winning: played.seat === 0 })) };
    expect(metaFor(yours, seating, 10)).toBe("You won it");
  });

  it("names the round when the trick is from an earlier one", () => {
    expect(metaFor(trick, seating, 11)).toBe("Dan won it · round 10");
    const yours = { ...trick, cards: trick.cards.map((played) => ({ ...played, winning: played.seat === 0 })) };
    expect(metaFor(yours, seating, 11)).toBe("You won it · round 10");
  });

  it("has no You in a game that is watched", () => {
    const first = { ...trick, cards: trick.cards.map((played) => ({ ...played, winning: played.seat === 0 })) };
    expect(metaFor(first, watcher, 10)).toBe("Player won it");
  });

  it("says no trick has finished when there is none", () => {
    expect(metaFor(null, seating, 1)).toBe("No trick has finished yet.");
    expect(metaFor({ ...trick, cards: [] }, seating, 1)).toBe("No trick has finished yet.");
  });

  it("says nothing rather than guess a winner the server did not name", () => {
    expect(metaFor({ ...trick, cards: trick.cards.map((played) => ({ ...played, winning: false })) }, seating, 10)).toBe("");
  });
});

describe("the cards", () => {
  const fields = fieldsFor(trick, seating, 10);

  it("are in the order they were played, each over its player's name, and the winner's ringed", () => {
    expect(fields.cards.map((card) => [card.card, card.name, card.winning])).toEqual([
      ["9H", "Bogdan", false],
      ["KH", "Cristina", false],
      ["AH", "Dan", true],
      ["7H", "Elena", false],
      ["TH", "Player", false],
      ["QS", "Ana", false],
    ]);
  });

  it("are 88 wide at the art's own shape, 12 apart", () => {
    expect([CARD_WIDTH, CARD_GAP]).toEqual([88, 12]);
    expect(cardHeight()).toBeCloseTo(127.7, 0);
    expect(fieldsFor(null, seating, 1).cards).toEqual([]);
  });

  it("has the title the desktop's sheet has", () => {
    expect(fields.title).toBe("Last trick");
  });
});
