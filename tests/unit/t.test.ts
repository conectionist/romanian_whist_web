import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../src/i18n/language";
import { t } from "../../src/i18n/t";
import { translateGendered, translateSentence, yourGender, type Sentence } from "../../src/i18n/person";

afterEach(() => setLanguage("en"));

describe("t", () => {
  it("returns the source when it has no placeholders", () => {
    expect(t("scoreboard", "None this round")).toBe("None this round");
  });

  it("puts the arguments in", () => {
    expect(t("infostrip", "Round %1 of %2", [8, 26])).toBe("Round 8 of 26");
  });

  it("substitutes in one pass, so an argument is never substituted again", () => {
    expect(t("test", "%1 and %2", ["%2", "b"])).toBe("%2 and b");
    expect(t("test", "%2 then %1", ["a", "%1"])).toBe("%1 then a");
  });

  it("gives the lowest-numbered placeholder the first argument, as Qt's arg() does", () => {
    expect(t("test", "%3 and %1", ["first", "second"])).toBe("second and first");
  });

  it("leaves a placeholder that has no argument", () => {
    expect(t("test", "Leader: %1")).toBe("Leader: %1");
  });

  it("puts the count in for %n", () => {
    expect(t("test", "%n game(s)", [], { n: 3 })).toBe("3 game(s)");
  });

  it("does not take a percent sign that is not a placeholder", () => {
    expect(t("test", "100% sure, %1", ["yes"])).toBe("100% sure, yes");
  });

  it("uses the singular a caller gives for one in English, and the source for any other count", () => {
    const options = (n: number) => ({ n, one: "%n minute" });
    expect(t("lobby", "%n minutes", [], options(1))).toBe("1 minute");
    expect(t("lobby", "%n minutes", [], options(2))).toBe("2 minutes");
    expect(t("lobby", "%n minutes", [], options(0))).toBe("0 minutes");
  });
});

describe("t in Romanian", () => {
  it("looks a string up by its context and its source", () => {
    setLanguage("ro");
    expect(t("BidBubbleItem", "You bid %1", [3])).toBe("Ai licitat 3");
    expect(t("BidBubbleItem", "Bids %1", [3])).toBe("Licitează 3");
  });

  it("keeps the same source in two contexts apart", () => {
    setLanguage("ro");
    expect(t("scoreboard", "Player")).toBe("Jucător");
    expect(t("nowhere", "Player")).toBe("Player");
  });

  it("tells two sources that read alike apart by their comment", () => {
    setLanguage("ro");
    expect(t("trickpanel", "Leader: %1", ["Ana"], { comment: "about a woman" })).toBe("Ana e prima");
    expect(t("trickpanel", "Leader: %1", ["Bogdan"], { comment: "about a man" })).toBe("Bogdan e primul");
    expect(t("trickpanel", "Leader: %1", ["Ana"])).toBe("Leader: Ana");
  });

  it("shows the source where there is no translation, and the English singular for one", () => {
    setLanguage("ro");
    expect(t("lobby", "Not in any catalogue %1", ["x"])).toBe("Not in any catalogue x");
    expect(t("lobby", "%n gaps", [], { n: 1, one: "%n gap" })).toBe("1 gap");
    expect(t("lobby", "%n gaps", [], { n: 5, one: "%n gap" })).toBe("5 gaps");
  });

  it("picks the form of a count by Qt's rule, and puts the count in", () => {
    setLanguage("ro");
    const rounds = (n: number) => t("newgame", "%n rounds", [], { n });
    expect(rounds(1)).toBe("1 rundă");
    expect(rounds(0)).toBe("0 runde");
    expect(rounds(2)).toBe("2 runde");
    expect(rounds(19)).toBe("19 runde");
    expect(rounds(20)).toBe("20 de runde");
    expect(rounds(26)).toBe("26 de runde");
    expect(rounds(101)).toBe("101 runde");
  });

  it("puts a plural's other arguments in too", () => {
    setLanguage("ro");
    expect(t("gameover", "%1 wins with %n points.", ["Ana"], { n: 1 })).toBe("Ana câștigă cu 1 punct.");
    expect(t("gameover", "%1 wins with %n points.", ["Ana"], { n: 47 })).toBe("Ana câștigă cu 47 de puncte.");
  });

  it("gives a translation its arguments by the numbers of the source, so it may leave one out", () => {
    setLanguage("ro");
    expect(t("scoreboard", "Bids total %1 for %2 tricks: over by %3", ["9", "8", "1"])).toBe("S-a licitat 9 (cu 1 peste)");
  });

  it("is English again once the language is", () => {
    setLanguage("ro");
    setLanguage("en");
    expect(t("BidBubbleItem", "You bid %1", [3])).toBe("You bid 3");
  });
});

describe("person text", () => {
  const sentence: Sentence = {
    context: "trickpanel",
    others: {
      male: { source: "Leader: %1", comment: "about a man" },
      female: { source: "Leader: %1", comment: "about a woman" },
    },
    yours: {
      male: { source: "You lead", comment: "about you, a man" },
      female: { source: "You lead", comment: "about you, a woman" },
    },
  };
  const people = { humanSeat: 1, seats: [{ gender: "female" as const }, { gender: "male" as const }] };

  it("says the others' variant of somebody else, and yours of you", () => {
    expect(translateSentence(sentence, people, 0, ["Ana"])).toBe("Leader: Ana");
    expect(translateSentence(sentence, people, 1)).toBe("You lead");
  });

  it("takes a seat the game does not have for somebody else's, a man's", () => {
    expect(translateSentence(sentence, people, 7, ["X"])).toBe("Leader: X");
  });

  it("takes the gender of the human seat, and a man's when there is none", () => {
    expect(yourGender(people)).toBe("male");
    expect(yourGender({ humanSeat: 0, seats: people.seats })).toBe("female");
    expect(yourGender({ humanSeat: -1, seats: people.seats })).toBe("male");
  });

  it("translates a gendered pair by the gender", () => {
    expect(translateGendered("bidstrip", sentence.others, "female", ["Ana"])).toBe("Leader: Ana");
  });

  it("says a sentence about a woman, a man and you each in its own words in Romanian", () => {
    setLanguage("ro");
    const leader: Sentence = {
      context: "trickpanel",
      others: sentence.others,
      yours: {
        male: { source: "Leader: %1", comment: "about you, a man" },
        female: { source: "Leader: %1", comment: "about you, a woman" },
      },
    };
    expect(translateSentence(leader, people, 0, ["Ana"])).toBe("Ana e prima");
    expect(translateSentence(leader, people, 1, ["Tu"])).toBe("Tu ești primul");
    expect(translateSentence(leader, { ...people, humanSeat: 0 }, 0, ["Tu"])).toBe("Tu ești prima");
    expect(translateGendered("trickpanel", leader.others, "male", ["Bogdan"])).toBe("Bogdan e primul");
  });
});
