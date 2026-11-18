import { describe, expect, it } from "vitest";
import { NO_MODIFIERS, isPlain, keyAnswer, keyStateFor, shortcutFor, stepFor, type KeyState } from "../../src/play/keys";
import type { HandView, TableModel } from "../../src/play/model";

const hand = (playable: boolean): HandView => ({
  entries: [
    { card: "8H", legal: false },
    { card: "KC", legal: true },
    { card: "7C", legal: true },
    { card: "QD", legal: false },
  ],
  backs: 0,
  positions: [3, 0, 2, 1],
  playable,
});

const asking = (highest: number, forbidden: number | null = null): KeyState => ({ strip: { highest, forbidden }, hand: hand(false) });
const playing: KeyState = { strip: null, hand: hand(true) };
const between: KeyState = { strip: null, hand: hand(false) };
const key = (digit: string, state: KeyState, modifiers = NO_MODIFIERS) => keyAnswer(digit, modifiers, state);

describe("the digits while the bid strip asks", () => {
  it("bid what they say, from 0, since a bid of zero is a real bid", () => {
    expect(key("0", asking(5))).toEqual({ kind: "bid", bet: 0 });
    expect(key("3", asking(5))).toEqual({ kind: "bid", bet: 3 });
    expect(key("5", asking(5))).toEqual({ kind: "bid", bet: 5 });
  });

  it("are passed on when they are above the highest bid, which the strip does not offer", () => {
    expect(key("6", asking(5))).toEqual({ kind: "pass" });
    expect(key("9", asking(1))).toEqual({ kind: "pass" });
  });

  it("swallow the struck-out bid, zero included, without bidding it", () => {
    expect(key("2", asking(5, 2))).toEqual({ kind: "refuse" });
    expect(key("0", asking(5, 0))).toEqual({ kind: "refuse" });
    expect(key("3", asking(5, 2))).toEqual({ kind: "bid", bet: 3 });
  });

  it("play no card, since the hand is not asked while the strip is: a digit it passes on finds none", () => {
    expect(key("2", asking(1))).toEqual({ kind: "pass" });
  });
});

describe("the digits while the hand is asked", () => {
  it("play that card, from 1 at the left, if a click on it would", () => {
    expect(key("2", playing)).toEqual({ kind: "play", slot: 1 });
    expect(key("3", playing)).toEqual({ kind: "play", slot: 2 });
  });

  it("play no card that cannot be played, and none the hand does not have", () => {
    expect(key("1", playing)).toEqual({ kind: "pass" });
    expect(key("4", playing)).toEqual({ kind: "pass" });
    expect(key("8", playing)).toEqual({ kind: "pass" });
  });

  it("do not play zero, which names no card", () => {
    expect(key("0", playing)).toEqual({ kind: "pass" });
  });

  it("play nothing between turns", () => {
    expect(key("2", between)).toEqual({ kind: "pass" });
  });

  it("play a back in a blind round, by 1", () => {
    const blind: KeyState = { strip: null, hand: { entries: [], backs: 1, positions: [0], playable: true } };
    expect(key("1", blind)).toEqual({ kind: "play", slot: 0 });
    expect(key("2", blind)).toEqual({ kind: "pass" });
  });
});

describe("keys that are not a bare digit", () => {
  it("do nothing with a modifier, whichever the key", () => {
    for (const modifiers of [{ ...NO_MODIFIERS, ctrl: true }, { ...NO_MODIFIERS, alt: true }, { ...NO_MODIFIERS, meta: true }, { ...NO_MODIFIERS, shift: true }]) {
      expect(key("3", asking(5), modifiers)).toEqual({ kind: "pass" });
      expect(key("2", playing, modifiers)).toEqual({ kind: "pass" });
    }
  });

  it("do nothing for a key that is not a digit", () => {
    for (const other of ["a", "Enter", " ", "ArrowLeft", "10", "", "٣", "²"]) {
      expect(key(other, asking(5)), other).toEqual({ kind: "pass" });
      expect(key(other, playing), other).toEqual({ kind: "pass" });
    }
  });
});

describe("what the answers are asked of", () => {
  const model = (prompt: TableModel["prompt"]) => ({ prompt, hand: hand(true) }) as unknown as TableModel;

  it("is the strip's highest and forbidden bid while a bid is asked, and none for a card", () => {
    const bet = { kind: "bet", id: 4, max: 5, forbidden: 2, first: false, roundType: "normal", deadlineAt: null } as TableModel["prompt"];
    expect(keyStateFor(model(bet))?.strip).toEqual({ highest: 5, forbidden: 2 });
    const play = { kind: "play", id: 5, blind: false, deadlineAt: null } as TableModel["prompt"];
    expect(keyStateFor(model(play))?.strip).toBeNull();
    expect(keyStateFor(model(null))?.strip).toBeNull();
    expect(keyStateFor(null)).toBeNull();
  });
});

describe("the menu bar's shortcuts", () => {
  const alt = { ...NO_MODIFIERS, alt: true };

  it("are Alt with N, S, R and X, by the physical key", () => {
    expect([shortcutFor("KeyN", alt), shortcutFor("KeyS", alt), shortcutFor("KeyR", alt), shortcutFor("KeyX", alt)]).toEqual(["new-game", "settings", "rules", "exit"]);
  });

  it("are not the bare letters, nor any other key with Alt, nor Alt with another modifier", () => {
    expect(shortcutFor("KeyN", NO_MODIFIERS)).toBeNull();
    expect(shortcutFor("KeyV", alt)).toBeNull();
    expect(shortcutFor("Digit1", alt)).toBeNull();
    expect(shortcutFor("KeyN", { ...alt, ctrl: true })).toBeNull();
    expect(shortcutFor("KeyN", { ...alt, shift: true })).toBeNull();
    expect(shortcutFor("KeyN", { ...alt, meta: true })).toBeNull();
  });
});

describe("the arrows", () => {
  it("step left and right, bare", () => {
    expect(stepFor("ArrowLeft", NO_MODIFIERS)).toBe(-1);
    expect(stepFor("ArrowRight", NO_MODIFIERS)).toBe(1);
    expect(stepFor("ArrowUp", NO_MODIFIERS)).toBeNull();
    expect(stepFor("ArrowLeft", { ...NO_MODIFIERS, shift: true })).toBeNull();
    expect(stepFor("ArrowRight", { ...NO_MODIFIERS, alt: true })).toBeNull();
  });

  it("are plain only with no modifier", () => {
    expect(isPlain(NO_MODIFIERS)).toBe(true);
    expect(isPlain({ ...NO_MODIFIERS, meta: true })).toBe(false);
  });
});
