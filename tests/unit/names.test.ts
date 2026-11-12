import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../src/i18n/language";
import { decode } from "../../src/net/decode";
import type { ServerMessage, Snapshot } from "../../src/net/protocol";
import { announcementFor, roundAnnouncement } from "../../src/play/announce";
import { modelOf } from "../../src/play/model";
import { Store } from "../../src/play/store";
import { cardNameFor, handLabelFor, seatLabelFor, suitName } from "../../src/table/names";

const LOOK = join(dirname(fileURLToPath(import.meta.url)), "../../libs/romanian_whist_server/protocol/look");
const fixture = JSON.parse(readFileSync(join(LOOK, "table-4-players.json"), "utf8")).state;

afterEach(() => setLanguage("en"));

function seats(change: (state: any) => void = () => undefined) {
  const state = structuredClone(fixture);
  change(state);
  const store = new Store();
  store.apply(decode(JSON.stringify({ type: "sync", seq: 0, ...state })), 0);
  return modelOf(store.state)!.seats;
}

describe("what a card is called", () => {
  it("is its rank and its suit, the court cards by name and the others by number", () => {
    expect([cardNameFor("QS"), cardNameFor("TH"), cardNameFor("AD"), cardNameFor("JC"), cardNameFor("KH"), cardNameFor("7C")]).toEqual([
      "Queen of spades",
      "10 of hearts",
      "Ace of diamonds",
      "Jack of clubs",
      "King of hearts",
      "7 of clubs",
    ]);
    expect((["S", "H", "D", "C"] as const).map(suitName)).toEqual(["spades", "hearts", "diamonds", "clubs"]);
  });

  it("is said in Romanian as the deck is, with the desktop's court cards", () => {
    setLanguage("ro");
    expect([cardNameFor("QS"), cardNameFor("TH"), cardNameFor("AD"), cardNameFor("JC"), cardNameFor("KH")]).toEqual([
      "Damă de pică",
      "10 de inimă",
      "As de romb",
      "Valet de treflă",
      "Popă de inimă",
    ]);
  });
});

describe("what a card of the hand says", () => {
  it("adds whether it can be played, on your turn", () => {
    expect(handLabelFor("QS", true, true)).toBe("Queen of spades, can be played");
    expect(handLabelFor("QS", true, false)).toBe("Queen of spades, cannot be played");
  });

  it("says only its name between turns, when nothing can be played", () => {
    expect(handLabelFor("QS", false, false)).toBe("Queen of spades");
  });

  it("says a card face down is one, since there is no name to give", () => {
    expect(handLabelFor(null, true, true)).toBe("Your card, face down");
  });

  it("is said in Romanian", () => {
    setLanguage("ro");
    expect(handLabelFor("QS", true, true)).toBe("Damă de pică, se poate juca");
    expect(handLabelFor("QS", true, false)).toBe("Damă de pică, nu se poate juca");
    expect(handLabelFor(null, true, true)).toBe("Cartea ta, cu fața în jos");
  });
});

describe("what a name panel says", () => {
  it("is the name, what they have bid and taken, and whose turn it is", () => {
    const [you, ana] = seats();
    expect(seatLabelFor(ana, { active: false, human: false, pill: "Taken/Bid: 1/1" })).toBe("Ana, Taken/Bid: 1/1");
    expect(seatLabelFor(ana, { active: true, human: false, pill: "Taken/Bid: 1/1" })).toBe("Ana, Taken/Bid: 1/1, to move");
    expect(seatLabelFor(you, { active: false, human: true, pill: "No bid yet" })).toBe("Player (you), No bid yet");
  });

  it("says a person away or replaced, as the person is", () => {
    const [, bogdan] = seats((state) => {
      state.table.seats[2] = { kind: "human", name: "Bogdan", gender: "male", avatar: "man-black-tee", presence: "away", you: false };
    }).slice(1);
    expect(seatLabelFor(bogdan, { active: false, human: false, pill: "No bid yet" })).toBe("Bogdan, No bid yet, Away");
    setLanguage("ro");
    expect(seatLabelFor(bogdan, { active: false, human: false, pill: "Fără licitație" })).toBe("Bogdan, Fără licitație, Plecat");
  });

  it("is said in Romanian, with the 'to move' and the 'you' of its own", () => {
    setLanguage("ro");
    const [you] = seats();
    expect(seatLabelFor(you, { active: true, human: true, pill: "Fără licitație" })).toBe("Player (tu), Fără licitație, la rând");
  });
});

describe("what the live region says of a game", () => {
  const snapshot: Snapshot = fixture.snapshot;
  const game = (event: object, shown: Snapshot | null = snapshot): ServerMessage => decode(JSON.stringify({ type: "game", seq: 5, game: 1, event, snapshot: shown }));

  it("says a bid, in your words for your own", () => {
    expect(announcementFor(game({ kind: "betPlaced", seat: 1, bet: 2 }))).toBe("Ana bids 2");
    expect(announcementFor(game({ kind: "betPlaced", seat: 0, bet: 0 }))).toBe("You bid 0");
  });

  it("says a card played, by name", () => {
    expect(announcementFor(game({ kind: "cardPlayed", seat: 2, card: "QH" }))).toBe("Bogdan plays Queen of hearts");
    expect(announcementFor(game({ kind: "cardPlayed", seat: 0, card: "7C" }))).toBe("You play 7 of clubs");
  });

  it("says who took the trick, with the desktop's sentences", () => {
    expect(announcementFor(game({ kind: "trickWon", seat: 3, trick: 2 }))).toBe("Cristina wins the trick.");
    expect(announcementFor(game({ kind: "trickWon", seat: 0, trick: 2 }))).toBe("You win the trick.");
  });

  it("says a round scored, each seat's score and total", () => {
    const result = { index: 2, count: 26, tricks: 3, type: "normal", trump: null, nextCountsForStreaks: true, seats: [
      { bet: 1, won: 1, roundScore: 6, total: 34, wins: 1, losses: 0 },
      { bet: 2, won: 1, roundScore: -1, total: 41, wins: 0, losses: 1 },
      { bet: 0, won: 0, roundScore: 5, total: 28, wins: 1, losses: 0 },
      { bet: 1, won: 1, roundScore: 0, total: 19, wins: 0, losses: 0 },
    ] };
    const said = announcementFor(game({ kind: "roundScored", result }));
    expect(said).toBe("Round 3 is scored. You: +6, total 34. Ana: −1, total 41. Bogdan: +5, total 28. Cristina: 0, total 19.");
    expect(said).toBe(roundAnnouncement(result as never, snapshot));
  });

  it("says the game's end and who won", () => {
    const winners = [{ seat: 1, name: "Ana", score: 63, place: 1 }];
    expect(announcementFor(game({ kind: "gameOver", standings: winners, winners }))).toBe("Game over. Ana wins with 63 points.");
  });

  it("is said in Romanian, with the count in its own form", () => {
    setLanguage("ro");
    const winners = [{ seat: 1, name: "Ana", score: 63, place: 1 }];
    expect(announcementFor(game({ kind: "betPlaced", seat: 1, bet: 2 }))).toBe("Ana licitează 2");
    expect(announcementFor(game({ kind: "betPlaced", seat: 0, bet: 2 }))).toBe("Ai licitat 2");
    expect(announcementFor(game({ kind: "cardPlayed", seat: 2, card: "QH" }))).toBe("Bogdan joacă Damă de inimă");
    expect(announcementFor(game({ kind: "cardPlayed", seat: 0, card: "QH" }))).toBe("Joci Damă de inimă");
    expect(announcementFor(game({ kind: "trickWon", seat: 3, trick: 2 }))).toBe("Cristina câștigă mâna.");
    expect(announcementFor(game({ kind: "gameOver", standings: winners, winners }))).toBe("Joc încheiat. Ana câștigă cu 63 de puncte.");
  });

  it("says nothing of a deal, a trick begun, a request for an answer, a sync or a game with no table state", () => {
    for (const event of [{ kind: "gameStarted" }, { kind: "roundStarted" }, { kind: "bettingComplete" }, { kind: "trickStarted", trick: 1, leader: 2 }, { kind: "betRequested", seat: 1 }, { kind: "cardRequested", seat: 0 }, { kind: "roundComplete" }]) {
      expect(announcementFor(game(event)), JSON.stringify(event)).toBeNull();
    }
    expect(announcementFor(game({ kind: "betPlaced", seat: 1, bet: 2 }, null))).toBeNull();
    expect(announcementFor(decode(JSON.stringify({ type: "sync", seq: 0, ...fixture })))).toBeNull();
  });
});
