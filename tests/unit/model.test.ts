import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decode } from "../../src/net/decode";
import { modelOf, type TableModel } from "../../src/play/model";
import { Store } from "../../src/play/store";

const LOOK = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol/look");

function modelFor(name: string): TableModel {
  const { state } = JSON.parse(readFileSync(join(LOOK, `${name}.json`), "utf8"));
  const message = decode(JSON.stringify({ type: "sync", seq: 0, ...state }));
  const store = new Store();
  store.apply(message, 0);
  const model = modelOf(store.state);
  if (model === null) {
    throw new Error(`${name} has no game`);
  }
  return model;
}

// What protocol/look/README.md says each file shows.
const MOMENTS = [
  { name: "bidding", round: 1, of: 32, trick: 0, table: 0, hand: 1, seats: 6 },
  { name: "table-3-players", round: 8, of: 23, trick: 2, table: 2, hand: 5, seats: 3 },
  { name: "table-4-players", round: 8, of: 26, trick: 2, table: 3, hand: 4, seats: 4 },
  { name: "table-5-players", round: 9, of: 29, trick: 2, table: 4, hand: 4, seats: 5 },
  { name: "table-6-players", round: 10, of: 32, trick: 2, table: 5, hand: 4, seats: 6 },
  { name: "hand-1-card", round: 1, of: 24, trick: 1, table: 1, hand: 1, seats: 4 },
  { name: "hand-4-cards", round: 7, of: 24, trick: 1, table: 1, hand: 4, seats: 4 },
  { name: "hand-8-cards", round: 11, of: 24, trick: 1, table: 1, hand: 8, seats: 4 },
];

describe("the look fixtures' models", () => {
  for (const moment of MOMENTS) {
    it(`${moment.name} is round ${moment.round} of ${moment.of}, with ${moment.table} on the table and ${moment.hand} in hand`, () => {
      const model = modelFor(moment.name);
      expect(model.roundNumber).toBe(moment.round);
      expect(model.roundCount).toBe(moment.of);
      expect(model.trickNumber).toBe(moment.trick);
      expect(model.table).toHaveLength(moment.table);
      expect(model.hand.entries).toHaveLength(moment.hand);
      expect(model.seats).toHaveLength(moment.seats);
      expect(model.humanSeat).toBe(0);
      expect(model.hand.positions).toHaveLength(moment.hand);
    });
  }

  it("is on the person's turn in every one", () => {
    for (const { name } of MOMENTS) {
      const model = modelFor(name);
      expect(model.activeSeat, name).toBe(model.humanSeat);
      expect(model.prompt, name).not.toBeNull();
    }
  });

  it("asks for a bid in bidding.json, and for a card elsewhere", () => {
    expect(modelFor("bidding").prompt).toMatchObject({ kind: "bet", max: 1, forbidden: null, first: true });
    expect(modelFor("bidding").phase).toBe("betting");
    expect(modelFor("table-4-players").prompt?.kind).toBe("play");
    expect(modelFor("table-4-players").phase).toBe("playing");
  });

  it("shows table 4's hand as the desktop does: 8H KC 7C QD, with KC and 7C legal", () => {
    const model = modelFor("table-4-players");
    expect(model.hand.entries.map((entry) => entry.card)).toEqual(["8H", "KC", "7C", "QD"]);
    expect(model.hand.entries.map((entry) => entry.legal)).toEqual([false, true, true, false]);
    expect(model.hand.positions).toEqual([3, 0, 2, 1]);
    expect(model.hand.playable).toBe(true);
    expect(model.trump).toBe("9S");
  });

  it("keeps the table's cards with who played them and who is winning", () => {
    const model = modelFor("table-4-players");
    expect(model.table).toEqual([
      { seat: 1, card: "8C", winning: false },
      { seat: 2, card: "7S", winning: false },
      { seat: 3, card: "QS", winning: true },
    ]);
    expect(model.leadSeat).toBe(1);
    expect(model.leadSuit).toBe("C");
  });

  it("takes each seat's face and who is here from the table state", () => {
    const model = modelFor("table-4-players");
    expect(model.seats[0]).toMatchObject({ name: "Player", gender: "male", avatar: "man-white-hair-hat", kind: "human", presence: "here", isHuman: true });
    expect(model.seats[1]).toMatchObject({ name: "Ana", gender: "female", avatar: "woman-shoulder-hair", kind: "computer", level: "low-risk", presence: null, isHuman: false });
  });

  it("takes the run from wins and losses, and a bid of nothing from a bid of zero", () => {
    const model = modelFor("table-4-players");
    expect(model.seats[0]).toMatchObject({ winStreak: 0, lossStreak: 1, hasBet: true, bet: 0, totalScore: 23 });
    const bidding = modelFor("bidding");
    expect(bidding.seats.every((seat) => !seat.hasBet)).toBe(true);
    expect(bidding.betsPlaced).toBe(0);
  });

  it("shows no raised card but marks hand-8's as legal", () => {
    const model = modelFor("hand-8-cards");
    const queen = model.hand.entries.find((entry) => entry.card === "QH");
    expect(queen?.legal).toBe(true);
    expect(model.trump).toBeNull();
  });

  it("has no game to draw for a table with no snapshot", () => {
    const { state } = JSON.parse(readFileSync(join(LOOK, "table-empty.json"), "utf8"));
    expect(state).toBeNull();
  });

  it("builds a model for every look fixture that has a state", () => {
    for (const file of readdirSync(LOOK).filter((name) => name.endsWith(".json"))) {
      const { state } = JSON.parse(readFileSync(join(LOOK, file), "utf8"));
      if (state !== null) {
        expect(modelFor(file.replace(/\.json$/, "")).seats.length).toBeGreaterThan(1);
      }
    }
  });
});

describe("the hand between turns and in blind rounds", () => {
  it("shows the snapshot's hand, never playable, when there is no prompt", () => {
    const { state } = JSON.parse(readFileSync(join(LOOK, "table-4-players.json"), "utf8"));
    const message = decode(JSON.stringify({ type: "sync", seq: 0, ...state, prompt: null }));
    const store = new Store();
    store.apply(message, 0);
    const model = modelOf(store.state);
    expect(model?.hand.entries.map((entry) => entry.card)).toEqual(["8H", "KC", "7C", "QD"]);
    expect(model?.hand.entries.every((entry) => entry.legal)).toBe(true);
    expect(model?.hand.playable).toBe(false);
    expect(model?.prompt).toBeNull();
  });

  it("draws a blind prompt's hand as playable backs", () => {
    const { state } = JSON.parse(readFileSync(join(LOOK, "table-4-players.json"), "utf8"));
    const blind = { id: 24, kind: "play", deadline: null, handSize: 1, legal: [0], blind: true };
    const message = decode(JSON.stringify({ type: "sync", seq: 0, ...state, prompt: blind }));
    const store = new Store();
    store.apply(message, 0);
    const model = modelOf(store.state);
    expect(model?.hand).toEqual({ entries: [], backs: 1, positions: [0], playable: true });
  });

  it("shows another seat's cards, in display order, where the snapshot lets this viewer see them", () => {
    const { state } = JSON.parse(readFileSync(join(LOOK, "table-4-players.json"), "utf8"));
    state.snapshot.seats[1].hand = ["7D", "AS", "9S"];
    const message = decode(JSON.stringify({ type: "sync", seq: 0, ...state }));
    const store = new Store();
    store.apply(message, 0);
    const model = modelOf(store.state);
    expect(model?.seats[1].hand.map((entry) => entry.card)).toEqual(["AS", "9S", "7D"]);
  });
});
