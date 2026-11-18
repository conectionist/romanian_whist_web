import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../src/i18n/language";
import { decode } from "../../src/net/decode";
import type { ServerMessage, Snapshot } from "../../src/net/protocol";
import { KEPT } from "../../src/dom/announcer";
import { announcementFor, roundAnnouncement } from "../../src/play/announce";
import { modelOf } from "../../src/play/model";
import { Store } from "../../src/play/store";
import { cardInSentence, cardNameFor, suitName } from "../../src/table/cardNames";
import { handLabelFor, seatLabelFor } from "../../src/table/names";

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

  it("is said in Romanian with the rank as a word and no article, and a capital to start it", () => {
    setLanguage("ro");
    expect([cardNameFor("QS"), cardNameFor("TH"), cardNameFor("AD"), cardNameFor("JC"), cardNameFor("KH")]).toEqual([
      "Damă de inimă neagră",
      "Zece de inimă roșie",
      "As de romb",
      "Valet de treflă",
      "Popă de inimă roșie",
    ]);
    expect("23456789".split("").map((rank) => cardNameFor(`${rank}C`))).toEqual([
      "Doi de treflă",
      "Trei de treflă",
      "Patru de treflă",
      "Cinci de treflă",
      "Șase de treflă",
      "Șapte de treflă",
      "Opt de treflă",
      "Nouă de treflă",
    ]);
    expect((["S", "H", "D", "C"] as const).map(suitName)).toEqual(["inimă neagră", "inimă roșie", "romb", "treflă"]);
  });
});

describe("what a sentence calls a card", () => {
  it("is its rank and its suit with the article, in lower case", () => {
    expect([cardInSentence("QH"), cardInSentence("TH"), cardInSentence("AS"), cardInSentence("JC"), cardInSentence("KD"), cardInSentence("7C"), cardInSentence("2S")]).toEqual([
      "the queen of hearts",
      "the 10 of hearts",
      "the ace of spades",
      "the jack of clubs",
      "the king of diamonds",
      "the 7 of clubs",
      "the 2 of spades",
    ]);
  });

  it("is said in Romanian as the label is, in lower case, with no article", () => {
    setLanguage("ro");
    expect(cardInSentence("QH")).toBe("damă de inimă roșie");
    expect(cardInSentence("KS")).toBe("popă de inimă neagră");
    expect(cardInSentence("JD")).toBe("valet de romb");
    expect(cardInSentence("AC")).toBe("as de treflă");
    expect(cardInSentence("TH")).toBe("zece de inimă roșie");
    expect(cardInSentence("7C")).toBe("șapte de treflă");
    for (const rank of "23456789TJQKA") {
      for (const suit of "SHDC") {
        const card = `${rank}${suit}`;
        expect(cardInSentence(card)).toBe(cardNameFor(card).charAt(0).toLocaleLowerCase("ro") + cardNameFor(card).slice(1));
      }
    }
  });

  it("is not the label in English, which has an article and no capital", () => {
    for (const rank of "23456789TJQKA") {
      for (const suit of "SHDC") {
        expect(cardInSentence(`${rank}${suit}`)).not.toBe(cardNameFor(`${rank}${suit}`));
      }
    }
  });
});

describe("what a card of the hand says", () => {
  it("adds whether it is playable, on your turn", () => {
    expect(handLabelFor("QS", true, true)).toBe("Queen of spades, playable");
    expect(handLabelFor("QS", true, false)).toBe("Queen of spades, not playable");
  });

  it("says only its name between turns, when nothing can be played", () => {
    expect(handLabelFor("QS", false, false)).toBe("Queen of spades");
  });

  it("says a card face down is one, since there is no name to give", () => {
    expect(handLabelFor(null, true, true)).toBe("Your card, face down");
  });

  it("is said in Romanian", () => {
    setLanguage("ro");
    expect(handLabelFor("QS", true, true)).toBe("Damă de inimă neagră, se poate juca");
    expect(handLabelFor("QS", true, false)).toBe("Damă de inimă neagră, nu se poate juca");
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
    expect(seatLabelFor(bogdan, { active: false, human: false, pill: "Fără licitație" })).toBe("Bogdan, Fără licitație, Deconectat");
  });

  it("is said in Romanian, with the 'to move' and the 'you' of its own", () => {
    setLanguage("ro");
    const [you] = seats();
    expect(seatLabelFor(you, { active: true, human: true, pill: "Fără licitație" })).toBe("Player (tu), Fără licitație, mută");
  });
});

describe("what the live region says of a game", () => {
  const snapshot: Snapshot = fixture.snapshot;
  const game = (event: object, shown: Snapshot | null = snapshot): ServerMessage => decode(JSON.stringify({ type: "game", seq: 5, game: 1, event, snapshot: shown }));

  it("says a bid, in your words for your own", () => {
    expect(announcementFor(game({ kind: "betPlaced", seat: 1, bet: 2 }))).toBe("Ana bid 2");
    expect(announcementFor(game({ kind: "betPlaced", seat: 0, bet: 0 }))).toBe("You bid 0");
  });

  it("says a card played, by name", () => {
    expect(announcementFor(game({ kind: "cardPlayed", seat: 2, card: "QH" }))).toBe("Bogdan played the queen of hearts");
    expect(announcementFor(game({ kind: "cardPlayed", seat: 0, card: "7C" }))).toBe("You played the 7 of clubs");
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
    expect(announcementFor(game({ kind: "betPlaced", seat: 1, bet: 2 }))).toBe("Ana a licitat 2");
    expect(announcementFor(game({ kind: "betPlaced", seat: 0, bet: 2 }))).toBe("Ai licitat 2");
    expect(announcementFor(game({ kind: "cardPlayed", seat: 2, card: "QH" }))).toBe("Bogdan a pus damă de inimă roșie");
    expect(announcementFor(game({ kind: "cardPlayed", seat: 0, card: "QH" }))).toBe("Ai pus damă de inimă roșie");
    expect(announcementFor(game({ kind: "trickWon", seat: 3, trick: 2 }))).toBe("Cristina câștigă mâna.");
    expect(announcementFor(game({ kind: "gameOver", standings: winners, winners }))).toBe("Joc încheiat. Ana câștigă cu 63 de puncte.");
  });

  it("says a round begun: which, how many cards, a Forehead or Hidden one by name, and what is trump", () => {
    const round = (change: object) => ({ ...snapshot, round: { ...snapshot.round, ...change } });
    expect(announcementFor(game({ kind: "roundStarted" }, round({ index: 7, count: 26, tricks: 5, type: "normal", trump: "9S" })))).toBe("Round 8 of 26. 5 cards. Trump: 9 of spades.");
    expect(announcementFor(game({ kind: "roundStarted" }, round({ index: 0, count: 26, tricks: 1, type: "forehead", trump: "QH" })))).toBe("Round 1 of 26. 1 card. Forehead. Trump: Queen of hearts.");
    expect(announcementFor(game({ kind: "roundStarted" }, round({ index: 9, count: 26, tricks: 8, type: "normal", trump: null })))).toBe("Round 10 of 26. 8 cards. No trump.");
    expect(announcementFor(game({ kind: "roundStarted" }, round({ index: 25, count: 26, tricks: 1, type: "hidden", trump: "TD" })))).toBe("Round 26 of 26. 1 card. Hidden. Trump: 10 of diamonds.");
    setLanguage("ro");
    expect(announcementFor(game({ kind: "roundStarted" }, round({ index: 7, count: 26, tricks: 5, type: "normal", trump: "9H" })))).toBe("Runda 8 din 26. 5 cărți. Atu: Nouă de inimă roșie.");
    expect(announcementFor(game({ kind: "roundStarted" }, round({ index: 7, count: 26, tricks: 5, type: "normal", trump: "TS" })))).toBe("Runda 8 din 26. 5 cărți. Atu: Zece de inimă neagră.");
    expect(announcementFor(game({ kind: "roundStarted" }, round({ index: 9, count: 26, tricks: 8, type: "normal", trump: null })))).toBe("Runda 10 din 26. 8 cărți. Fără atu.");
  });

  it("says what you are asked when the question comes, in the trick panel's sentence", () => {
    type Entry = { card: string; legal: boolean };
    const said = (prompt: object, entries: Entry[] = [], leadSuit: string | null = null) => {
      const message = decode(JSON.stringify({ type: "prompt", seq: 6, id: 2, deadline: null, hand: ["JS"], ...prompt }));
      const model = { prompt: { ...prompt, id: 2 }, hand: { entries, backs: 0, positions: [], playable: true }, leadSuit } as never;
      return announcementFor(message, model);
    };
    expect(said({ kind: "bet", max: 5, forbidden: null, first: false, roundType: "normal" })).toBe("Your bid. How many tricks?");
    expect(said({ kind: "play", blind: false, legal: [0] }, [{ card: "JS", legal: true }], null)).toBe("Your turn. You lead.");
    expect(said({ kind: "play", blind: true, legal: [0] }, [], null)).toBe("Your turn.");
    expect(said({ kind: "play", blind: false, legal: [0] }, [{ card: "JS", legal: true }, { card: "2H", legal: false }], "S")).toBe("Your turn. You must follow spades.");
    setLanguage("ro");
    expect(said({ kind: "bet", max: 5, forbidden: null, first: false, roundType: "normal" })).toBe("Licitația ta. Câte faci?");
    expect(said({ kind: "play", blind: false, legal: [0] }, [{ card: "JS", legal: true }, { card: "2H", legal: false }], "S")).toBe("E rândul tău. Trebuie să pui inimă neagră.");
    // Without the table to read the question from, there is nothing to say.
    expect(announcementFor(decode(JSON.stringify({ type: "prompt", seq: 6, id: 2, deadline: null, kind: "play", blind: false, legal: [0], hand: ["JS"] })), null)).toBeNull();
  });

  it("says nothing of a deal, a trick begun, a request for an answer, a sync or a game with no table state", () => {
    for (const event of [{ kind: "gameStarted" }, { kind: "bettingComplete" }, { kind: "trickStarted", trick: 1, leader: 2 }, { kind: "betRequested", seat: 1 }, { kind: "cardRequested", seat: 0 }, { kind: "roundComplete" }]) {
      expect(announcementFor(game(event)), JSON.stringify(event)).toBeNull();
    }
    expect(announcementFor(game({ kind: "betPlaced", seat: 1, bet: 2 }, null))).toBeNull();
    expect(announcementFor(decode(JSON.stringify({ type: "sync", seq: 0, ...fixture })))).toBeNull();
  });
});

describe("what the live region keeps", () => {
  it("is a whole round of the largest table: the start, every bid, the questions, every card, every trick and the scores", () => {
    const seats = 6;
    const cards = 8;
    const round = 1 + seats + 1 + cards + seats * cards + cards + 1;
    expect(round).toBe(73);
    expect(KEPT).toBeGreaterThanOrEqual(round);
  });
});
