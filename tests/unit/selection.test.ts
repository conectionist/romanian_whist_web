import { describe, expect, it } from "vitest";
import type { HandView, TableModel } from "../../src/play/model";
import { isTyping } from "../../src/play/keyboard";
import { moveSelection, optionsFor, pressOn, stillSelected, type Options, type Selected } from "../../src/play/selection";

const hand: HandView = {
  entries: [
    { card: "8H", legal: false },
    { card: "KC", legal: true },
    { card: "7C", legal: true },
    { card: "QD", legal: true },
    { card: "2S", legal: false },
  ],
  backs: 0,
  positions: [0, 1, 2, 3, 4],
  playable: true,
};
const model = (prompt: unknown, shown: HandView = hand) => ({ prompt, hand: shown }) as TableModel;
const play = { kind: "play", id: 7, blind: false, deadlineAt: null };
const bet = (forbidden: number | null) => ({ kind: "bet", id: 3, max: 4, forbidden, first: false, roundType: "normal", deadlineAt: null });

describe("what can be picked", () => {
  it("is the cards that can be played, by slot, on your turn", () => {
    expect(optionsFor(model(play))).toEqual({ prompt: 7, kind: "card", values: [1, 2, 3] });
  });

  it("is every back of a blind round", () => {
    expect(optionsFor(model(play, { entries: [], backs: 2, positions: [0, 1], playable: true }))).toEqual({ prompt: 7, kind: "card", values: [0, 1] });
  });

  it("is the bids the strip offers, 0 to the highest, leaving out the struck-out one", () => {
    expect(optionsFor(model(bet(null)))).toEqual({ prompt: 3, kind: "bid", values: [0, 1, 2, 3, 4] });
    expect(optionsFor(model(bet(0)))).toEqual({ prompt: 3, kind: "bid", values: [1, 2, 3, 4] });
    expect(optionsFor(model(bet(2)))).toEqual({ prompt: 3, kind: "bid", values: [0, 1, 3, 4] });
  });

  it("is nothing when nothing is asked", () => {
    expect(optionsFor(model(null))).toBeNull();
    expect(optionsFor(null)).toBeNull();
  });
});

describe("moving what is picked", () => {
  const options: Options = { prompt: 7, kind: "card", values: [1, 2, 3] };
  const at = (value: number): Selected => ({ prompt: 7, kind: "card", value });

  it("starts at the first with a step right and at the last with a step left", () => {
    expect(moveSelection(options, null, 1)).toEqual(at(1));
    expect(moveSelection(options, null, -1)).toEqual(at(3));
  });

  it("steps over what cannot be picked, and stops at the ends rather than going round", () => {
    expect(moveSelection(options, at(1), 1)).toEqual(at(2));
    expect(moveSelection(options, at(2), 1)).toEqual(at(3));
    expect(moveSelection(options, at(3), 1)).toEqual(at(3));
    expect(moveSelection(options, at(3), -1)).toEqual(at(2));
    expect(moveSelection(options, at(1), -1)).toEqual(at(1));
  });

  it("starts over when the pick is no longer one of the options", () => {
    expect(moveSelection(options, at(0), 1)).toEqual(at(1));
    expect(moveSelection(options, at(0), -1)).toEqual(at(3));
  });

  it("picks nothing where there is nothing to pick", () => {
    expect(moveSelection({ prompt: 1, kind: "bid", values: [] }, null, 1)).toBeNull();
  });
});

describe("holding on to a pick", () => {
  const options: Options = { prompt: 7, kind: "card", values: [1, 2, 3] };

  it("keeps it while it is on offer in the prompt it was made for", () => {
    const picked: Selected = { prompt: 7, kind: "card", value: 2 };
    expect(stillSelected(picked, options)).toBe(picked);
  });

  it("lets go of it for another prompt, however good the card still is", () => {
    expect(stillSelected({ prompt: 6, kind: "card", value: 2 }, options)).toBeNull();
  });

  it("lets go of it when the card can no longer be played, or the question is another kind", () => {
    expect(stillSelected({ prompt: 7, kind: "card", value: 4 }, options)).toBeNull();
    expect(stillSelected({ prompt: 7, kind: "bid", value: 2 }, options)).toBeNull();
    expect(stillSelected({ prompt: 7, kind: "card", value: 2 }, null)).toBeNull();
    expect(stillSelected(null, options)).toBeNull();
  });
});

describe("what a press on a card does", () => {
  it("plays at once for a mouse, a pen and the keyboard", () => {
    for (const pointer of ["mouse", "pen", "keyboard"]) {
      expect(pressOn(pointer, false), pointer).toBe("play");
      expect(pressOn(pointer, true), pointer).toBe("play");
    }
  });

  it("picks the card for a first touch and plays it for a second on the same card", () => {
    expect(pressOn("touch", false)).toBe("select");
    expect(pressOn("touch", true)).toBe("play");
  });
});

describe("a field that takes typing", () => {
  it("is a text field, a number field, a select and a text area, where a digit is a character", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(isTyping({ tagName })).toBe(true);
    }
    expect(isTyping({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is not a button, the page or nothing", () => {
    expect(isTyping({ tagName: "BUTTON" })).toBe(false);
    expect(isTyping({ tagName: "BODY" })).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
