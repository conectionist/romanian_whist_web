import { describe, expect, it } from "vitest";
import type { HandView } from "../../src/play/model";
import { isPlayable, restingSlot, slotCount, slotKey } from "../../src/table/hand";

const onTurn: HandView = {
  entries: [
    { card: "8H", legal: false },
    { card: "KC", legal: true },
    { card: "7C", legal: true },
    { card: "QD", legal: false },
  ],
  backs: 0,
  positions: [3, 0, 2, 1],
  playable: true,
};

describe("the hand's rule for what can be played", () => {
  it("plays only a legal card, on your turn", () => {
    expect([0, 1, 2, 3].map((slot) => isPlayable(onTurn, slot))).toEqual([false, true, true, false]);
  });

  it("plays nothing between turns, however legal a card reads", () => {
    const between: HandView = { ...onTurn, playable: false, entries: onTurn.entries.map((entry) => ({ ...entry, legal: true })) };
    expect([0, 1, 2, 3].map((slot) => isPlayable(between, slot))).toEqual([false, false, false, false]);
  });

  it("plays no slot the hand does not have", () => {
    expect(isPlayable(onTurn, 4)).toBe(false);
    expect(isPlayable(onTurn, -1)).toBe(false);
  });

  it("always plays a back in a blind round", () => {
    const blind: HandView = { entries: [], backs: 1, positions: [0], playable: true };
    expect(isPlayable(blind, 0)).toBe(true);
    expect(isPlayable(blind, 1)).toBe(false);
  });

  it("keeps a slot's element under its card, and a blind round's under its position", () => {
    expect(slotKey(onTurn, 1)).toBe("KC");
    expect(slotKey({ entries: [], backs: 2, positions: [0, 1], playable: true }, 1)).toBe("back:1");
  });

  it("counts the cards, or the backs", () => {
    expect(slotCount(onTurn)).toBe(4);
    expect(slotCount({ entries: [], backs: 3, positions: [0, 1, 2], playable: true })).toBe(3);
  });

  it("rests a card in the slot it holds", () => {
    expect(restingSlot(onTurn, "KC")).toBe(1);
    expect(restingSlot(onTurn, "QD")).toBe(3);
    expect(restingSlot(onTurn, "AS")).toBeNull();
  });

  it("rests a blind card in the middle back, whatever its name", () => {
    const blind = (backs: number): HandView => ({ entries: [], backs, positions: [], playable: true });
    expect(restingSlot(blind(1), "KC")).toBe(0);
    expect(restingSlot(blind(3), "KC")).toBe(1);
    expect(restingSlot(blind(4), "KC")).toBe(1);
  });
});
