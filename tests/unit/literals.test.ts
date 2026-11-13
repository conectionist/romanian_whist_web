import { describe, expect, it } from "vitest";
import { literalsIn, readString } from "./support/literals";

const found = (text: string) => literalsIn(text, "sample.ts");
const keys = (text: string) => found(text).literals.map((each) => [each.context, each.source, each.comment]);

describe("reading a string literal", () => {
  it("decodes the escapes of the three quotes, and refuses a template with a substitution", () => {
    expect(readString('"a\\"b\\n\\u00e9"', 0)?.value).toBe('a"b\né');
    expect(readString("'it\\'s'", 0)?.value).toBe("it's");
    expect(readString("`one\ntwo`", 0)?.value).toBe("one\ntwo");
    expect(readString("`a ${b}`", 0)).toBeNull();
    expect(readString("name", 0)).toBeNull();
  });
});

describe("finding the page's strings in its source", () => {
  it("reads a call on one line, with its arguments and its options", () => {
    expect(keys('const x = t("scoreboard", "Round %1 of %2", [8, 26]);')).toEqual([["scoreboard", "Round %1 of %2", ""]]);
    expect(keys('t("a", "b", [], { n: 3, comment: "about a man" })')).toEqual([["a", "b", "about a man"]]);
  });

  it("reads a call that runs over several lines, with a comment between the arguments", () => {
    const text = `lines.push(
      appended
        ? t(
            "rulessheet", // the context
            "Rounds go 8 (×%1) … %n rounds.",
            [seats],
            options,
          )
        : t("rulessheet", "Rounds go 8 (×%1): %n rounds.", [seats], options),
    );`;
    expect(keys(text)).toEqual([
      ["rulessheet", "Rounds go 8 (×%1) … %n rounds.", ""],
      ["rulessheet", "Rounds go 8 (×%1): %n rounds.", ""],
    ]);
  });

  it("reads a call inside another call, and the second call of a line", () => {
    expect(keys('emphasised(t("trickpanel", "%1 wins the trick."), [name(winning.seat)], false); t("x", "y");')).toEqual([
      ["trickpanel", "%1 wins the trick.", ""],
      ["x", "y", ""],
    ]);
  });

  it("does not take a function whose name ends in t, a method called t, or the definition", () => {
    expect(keys('split("a", "b"); this.t("a", "b"); export function t(context: string, source: string)')).toEqual([]);
    expect(found('split("a", "b");').unreadable).toEqual([]);
  });

  it("reports a call whose context or source is not a literal", () => {
    expect(found("t(context, source)").unreadable).toEqual(["sample.ts:1"]);
    expect(found('t("a", variant.source)').unreadable).toEqual(["sample.ts:1"]);
    expect(found('t("a", `b ${c}`)').unreadable).toEqual(["sample.ts:1"]);
  });

  it("reads the sources inside a gendered pair, in the context the call that translates it passes", () => {
    const text = `const YOU_BID_LAST: Gendered = {
      male: { source: "You bid last. %1 would add up to %2.", comment: "about you, a man" },
      female: { source: "You bid last. %1 would add up to %2.", comment: "about you, a woman" },
    };
    fields.note = translateGendered("bidstrip", YOU_BID_LAST, yourGender(model), [1, 2]);`;
    expect(keys(text)).toEqual([
      ["bidstrip", "You bid last. %1 would add up to %2.", "about you, a man"],
      ["bidstrip", "You bid last. %1 would add up to %2.", "about you, a woman"],
    ]);
  });

  it("reads the sources inside a sentence, in the context it names", () => {
    const text = `const LEADER: Sentence = {
      context: "trickpanel",
      others: {
        male: { source: "Leader: %1", comment: "about a man" },
        female: { source: "Leader: %1", comment: "about a woman" },
      },
      yours: {
        male: { source: "Leader: %1", comment: "about you, a man" },
        female: { source: "Leader: %1", comment: "about you, a woman" },
      },
    };`;
    expect(keys(text).map((each) => each[2])).toEqual(["about a man", "about a woman", "about you, a man", "about you, a woman"]);
    expect(new Set(keys(text).map((each) => each[0]))).toEqual(new Set(["trickpanel"]));
  });

  it("reports a gendered pair that no call translates, since it has no context", () => {
    const text = `const ORPHAN: Gendered = { male: { source: "Away", comment: "about a man" }, female: { source: "Away", comment: "about a woman" } };`;
    expect(found(text).literals).toEqual([]);
    expect(found(text).unreadable).toHaveLength(2);
  });
});
