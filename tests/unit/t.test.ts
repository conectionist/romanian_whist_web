import { describe, expect, it } from "vitest";
import { t } from "../../src/i18n/t";
import { translateGendered, translateSentence, yourGender, type Sentence } from "../../src/i18n/person";

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
});
