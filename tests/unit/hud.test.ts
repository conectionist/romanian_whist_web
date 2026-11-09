import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decode } from "../../src/net/decode";
import { modelOf, type TableModel } from "../../src/play/model";
import { Store } from "../../src/play/store";
import { headerFor, rowsFor, tensionFor, tensionText, trumpFor, widestTensions } from "../../src/table/scoreboard";
import { fieldsFor, plainFields, yourTurn } from "../../src/table/trickPanel";
import { textOf } from "../../src/dom/runs";

const LOOK = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol/look");

// A look fixture's table, with the state changed before it is read.
function modelFor(name: string, change: (state: any) => void = () => undefined): TableModel {
  const { state } = JSON.parse(readFileSync(join(LOOK, `${name}.json`), "utf8"));
  change(state);
  const store = new Store();
  store.apply(decode(JSON.stringify({ type: "sync", seq: 0, ...state })), 0);
  const model = modelOf(store.state);
  if (model === null) {
    throw new Error(`${name} has no game`);
  }
  return model;
}

describe("the scoreboard's header", () => {
  it("says the round, the cards dealt and the round type", () => {
    expect(headerFor(modelFor("table-6-players"))).toEqual({
      round: "Round 10 of 32",
      dealt: "5 cards dealt",
      roundType: "Normal",
      calledOut: false,
    });
  });

  it("says one card in the singular, and calls out Forehead and Hidden", () => {
    const header = headerFor(
      modelFor("hand-1-card", (state) => {
        state.snapshot.round.type = "forehead";
      }),
    );
    expect(header.dealt).toBe("1 card dealt");
    expect(header.roundType).toBe("Forehead");
    expect(header.calledOut).toBe(true);
  });
});

describe("the tension line", () => {
  it("reads under by the difference once every bid is in", () => {
    expect(textOf(tensionFor(modelFor("table-6-players")))).toBe("Bids total 1 for 5 tricks: under by 4");
  });

  it("puts the bid total in bold, and nothing else", () => {
    const line = tensionFor(modelFor("table-6-players"));
    expect(line.filter((run) => run.strong)).toEqual([{ text: "1", strong: true }]);
  });

  it("reads so far while the bids are coming in", () => {
    expect(textOf(tensionFor(modelFor("bidding")))).toBe("Bids so far: 0 of 1 trick");
  });

  it("reads over, and even, and the singular of one trick", () => {
    const over = modelFor("table-4-players", (state) => {
      state.snapshot.bets.sum = 9;
    });
    expect(textOf(tensionFor(over))).toBe("Bids total 9 for 5 tricks: over by 4");
    const even = modelFor("table-4-players", (state) => {
      state.snapshot.bets.sum = 5;
    });
    expect(textOf(tensionFor(even))).toBe("Bids total 5 for 5 tricks");
    expect(textOf(tensionText("under", "0", "1", "1", true))).toBe("Bids total 0 for 1 trick: under by 1");
  });

  it("finds the bold part wherever a translation puts it", () => {
    const line = tensionText("even", "7", "5", "", false);
    expect(line.map((run) => run.text).join("")).toBe("Bids total 7 for 5 tricks");
    expect(line[0].text).toBe("Bids total ");
    expect(line[1]).toEqual({ text: "7", strong: true });
  });

  it("is never narrower than its widest sentences", () => {
    const sentences = widestTensions("0", "4");
    expect(sentences).toHaveLength(4);
    expect(sentences[1]).toBe("Bids total 44 for 0 tricks: over by 00");
  });
});

describe("the scoreboard's rows", () => {
  const rows = rowsFor(modelFor("table-6-players"));

  it("run in bidding order", () => {
    expect(rows.map((row) => row.name)).toEqual(["Cristina", "Dan", "Elena", "Player", "Ana", "Bogdan"]);
  });

  it("gives each its bid, tricks taken, points and run", () => {
    expect(rows[0]).toEqual({ name: "Cristina", bid: "0", taken: "0", points: "47", run: "W3", streak: "winning", turn: false });
    expect(rows[4]).toMatchObject({ name: "Ana", bid: "1", taken: "1", points: "33", run: "L2", streak: "losing" });
  });

  it("marks the row of the seat to move", () => {
    expect(rows.filter((row) => row.turn).map((row) => row.name)).toEqual(["Player"]);
  });

  it("shows a dash for a bid not made, and for tricks while the round is being bid", () => {
    const bidding = rowsFor(modelFor("bidding"));
    expect(bidding.every((row) => row.bid === "–" && row.taken === "–")).toBe(true);
  });

  it("shows a run only while one is running", () => {
    const none = rowsFor(
      modelFor("table-4-players", (state) => {
        for (const seat of state.snapshot.seats) {
          seat.wins = 0;
          seat.losses = 0;
        }
      }),
    );
    expect(none.every((row) => row.run === "" && row.streak === "none")).toBe(true);
  });

  it("puts a seat whose bidding order is not known after the known ones", () => {
    const order = rowsFor(
      modelFor("table-4-players", (state) => {
        state.snapshot.seats[0].bidOrder = 0;
      }),
    );
    expect(order[order.length - 1].name).toBe("Player");
  });
});

describe("the trump", () => {
  it("is the card, with no words", () => {
    expect(trumpFor(modelFor("table-6-players"))).toEqual({ card: "JH", name: "" });
  });

  it("is named when the eight-card round has none", () => {
    expect(trumpFor(modelFor("hand-8-cards"))).toEqual({ card: null, name: "None this round" });
  });
});

describe("the trick panel", () => {
  it("says the trick, who leads and led, who is winning, and what you must do", () => {
    expect(plainFields(fieldsFor(modelFor("table-6-players")))).toEqual({
      title: "Trick 2 of 5",
      rows: ["Leader: Ana · Led ♣", "Winning: Bogdan, 8♥"],
      prompt: "Your turn. You must follow ♣.",
    });
  });

  it("keeps the name to be elided apart from the words round it", () => {
    const fields = fieldsFor(modelFor("table-6-players"));
    expect(fields.rows[0]).toEqual([
      { text: "Leader: " },
      { text: "Ana", strong: true, elide: true },
      { text: " · Led ♣" },
    ]);
    expect(fields.rows[1][2]).toEqual({ text: ", 8♥", strong: true });
  });

  it("says Bidding, and who bids first, and asks for your bid", () => {
    expect(plainFields(fieldsFor(modelFor("bidding")))).toEqual({
      title: "Bidding",
      rows: ["First to bid: You"],
      prompt: "Your bid. How many tricks?",
    });
  });

  it("says that another is thinking while you wait", () => {
    const fields = fieldsFor(
      modelFor("bidding", (state) => {
        state.snapshot.active = 2;
        state.prompt = null;
      }),
    );
    expect(textOf(fields.prompt)).toBe("Bogdan is thinking…");
    expect(fields.prompt[0]).toEqual({ text: "Bogdan", elide: true });
  });

  it("says Round over and Game over", () => {
    expect(plainFields(fieldsFor(modelFor("table-4-players", (state) => { state.snapshot.phase = "roundScored"; })))).toEqual({
      title: "Round over",
      rows: [],
      prompt: "Scores are in.",
    });
    expect(fieldsFor(modelFor("table-4-players", (state) => { state.snapshot.phase = "gameOver"; })).title).toBe("Game over");
  });

  it("says a dash for who is winning before a card is down, and that you lead", () => {
    const fields = plainFields(
      fieldsFor(
        modelFor("table-4-players", (state) => {
          state.snapshot.table = { ledBy: 0, leadSuit: null, cards: [] };
          state.prompt.legal = [0, 1, 2, 3];
        }),
      ),
    );
    expect(fields.rows).toEqual(["Leader: You", "Winning: –"]);
    expect(fields.prompt).toBe("Your turn. You lead.");
  });

  it("says who wins a full trick, with the name giving way", () => {
    const full = modelFor("table-3-players", (state) => {
      state.snapshot.table.cards.push({ card: "AS", seat: 0, winning: false });
      state.snapshot.active = null;
      state.prompt = null;
    });
    const fields = fieldsFor(full);
    expect(textOf(fields.prompt)).toBe("Ana wins the trick.");
    expect(fields.prompt[0]).toEqual({ text: "Ana", elide: true });
  });

  it("says you win a full trick that is yours", () => {
    const full = modelFor("table-3-players", (state) => {
      state.snapshot.table.cards = [
        { card: "9C", seat: 1, winning: false },
        { card: "JC", seat: 2, winning: false },
        { card: "AC", seat: 0, winning: true },
      ];
      state.snapshot.active = null;
      state.prompt = null;
    });
    expect(textOf(fieldsFor(full).prompt)).toBe("You win the trick.");
  });

  it("takes Trick 0 for the first, and never past the last", () => {
    const zero = modelFor("table-4-players", (state) => {
      state.snapshot.round.trick = 0;
    });
    expect(fieldsFor(zero).title).toBe("Trick 1 of 5");
    const past = modelFor("table-4-players", (state) => {
      state.snapshot.round.trick = 9;
    });
    expect(fieldsFor(past).title).toBe("Trick 5 of 5");
  });

  it("asks for your card before the prompt is here", () => {
    const fields = fieldsFor(
      modelFor("table-4-players", (state) => {
        state.prompt = null;
      }),
    );
    expect(textOf(fields.prompt)).toBe("Your turn.");
  });
});

describe("what to tell you on your turn", () => {
  const legal = (card: string) => ({ card, legal: true });
  const illegal = (card: string) => ({ card, legal: false });

  it("says only that it is your turn in a blind round", () => {
    expect(yourTurn(true, [], "H")).toBe("Your turn.");
  });

  it("says you lead when no suit has been led", () => {
    expect(yourTurn(false, [legal("AS")], null)).toBe("Your turn. You lead.");
  });

  it("says any card when nothing in the hand is refused", () => {
    expect(yourTurn(false, [legal("AS"), legal("7D")], "H")).toBe("Your turn. Any card.");
  });

  it("says to follow when a legal card is of the lead suit", () => {
    expect(yourTurn(false, [legal("KH"), illegal("7C")], "H")).toBe("Your turn. You must follow ♥.");
  });

  it("says to trump when void in the lead suit and kept to the trumps", () => {
    expect(yourTurn(false, [legal("7C"), illegal("9D")], "H")).toBe("Your turn. No ♥, you must trump.");
  });
});
