import { describe, expect, it } from "vitest";
import { catalogueFor, catalogueOf, keyOf, romanianForm } from "../../src/i18n/translations";

describe("Qt's plural rule for Romanian", () => {
  // The rule as the gettext header of a Romanian catalogue states it, which Qt's own is the same as:
  // an independent statement, evaluated, so it can disagree with the port.
  const stated = new Function("n", "return (n==1 ? 0 : (n==0 || (n%100 > 0 && n%100 < 20)) ? 1 : 2);") as (n: number) => number;

  it("agrees with that statement for every count from 0 to 200", () => {
    for (let n = 0; n <= 200; n++) {
      expect(romanianForm(n), `n = ${n}`).toBe(stated(n));
    }
  });

  it("is the first form for one, the second for none and up to nineteen, the third for twenty", () => {
    expect([0, 1, 2, 3, 19, 20, 21, 99, 100].map(romanianForm)).toEqual([1, 0, 1, 1, 1, 2, 2, 2, 2]);
  });

  it("takes 101 to 119 for the second form, as the last two digits decide it", () => {
    expect([101, 102, 119, 120, 201].map(romanianForm)).toEqual([1, 1, 1, 2, 1]);
  });
});

describe("the catalogues", () => {
  it("are none for English, whose strings are the sources", () => {
    expect(catalogueFor("en")).toBeNull();
  });

  it("hold the desktop's strings for Romanian, found by context, source and comment", () => {
    const catalogue = catalogueFor("ro");
    expect(catalogue?.get(keyOf("PauseOverlay", "Paused"))?.translation).toBe("Pauză");
    expect(catalogue?.get(keyOf("trickpanel", "Leader: %1", "about you, a woman"))?.translation).toBe("%1 ești prima");
    expect(catalogue?.get(keyOf("trickpanel", "Leader: %1"))).toBeUndefined();
    expect(catalogue?.get(keyOf("PauseOverlay", "Not a string"))).toBeUndefined();
  });

  it("let the page's entry win over the desktop's with the same context and source", () => {
    const desktop = { entries: [{ context: "newgame", source: "Bot speed", translation: "Viteza boților" }, { context: "newgame", source: "Slow", translation: "Lent" }] };
    const page = { entries: [{ context: "newgame", source: "Bot speed", translation: "Viteza roboților" }] };
    const merged = catalogueOf(desktop, page);
    expect(merged.get(keyOf("newgame", "Bot speed"))?.translation).toBe("Viteza roboților");
    expect(merged.get(keyOf("newgame", "Slow"))?.translation).toBe("Lent");
    // And the Romanian the page runs in says robots, though the desktop's catalogue says bots.
    expect(catalogueFor("ro")?.get(keyOf("newgame", "Bot speed"))?.translation).toBe("Viteza roboților");
    expect(catalogueFor("ro")?.get(keyOf("NewGameDialog", "Bot %1"))?.translation).toBe("Robot %1");
  });

  it("say a robot and not a bot, in any of its forms", () => {
    const wrong = [...(catalogueFor("ro") ?? new Map()).values()].flatMap((entry) => [entry.translation, ...(entry.forms ?? [])]).filter((text) => text !== undefined && /\bbo[tț]/i.test(text));
    expect(wrong).toEqual([]);
  });

  it("are built once", () => {
    expect(catalogueFor("ro")).toBe(catalogueFor("ro"));
  });

  it("take a later file's entry over an earlier one's for the same key", () => {
    const first = { entries: [{ context: "a", source: "b", translation: "first" }] };
    const second = { entries: [{ context: "a", source: "b", translation: "second" }, { context: "a", source: "c", translation: "other" }] };
    const merged = catalogueOf(first, second);
    expect(merged.get(keyOf("a", "b"))?.translation).toBe("second");
    expect(merged.get(keyOf("a", "c"))?.translation).toBe("other");
  });

  it("do not run a context, a source and a comment together into one key", () => {
    expect(keyOf("ab", "c")).not.toBe(keyOf("a", "bc"));
    expect(keyOf("a", "b", "c")).not.toBe(keyOf("a", "bc"));
  });
});
