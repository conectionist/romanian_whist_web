import type { HandView as HandModel, TableModel } from "./model";
import { offers } from "../table/bidStrip";
import { isPlayable } from "../table/hand";

// The page's keys, as pure answers: what a key does at the table, decided from what the table asks
// and nothing about the DOM. The desktop's digits are src/MainWindow.cpp keyPressEvent() and
// bidstrip::answerKey().

export interface Modifiers {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

export function isPlain(modifiers: Modifiers): boolean {
  return !modifiers.alt && !modifiers.ctrl && !modifiers.meta && !modifiers.shift;
}

export const NO_MODIFIERS: Modifiers = { alt: false, ctrl: false, meta: false, shift: false };

// What the table is asking, for a key to answer: the bid strip while it is up, and the hand.
export interface KeyState {
  strip: { highest: number; forbidden: number | null } | null;
  hand: HandModel;
}

// A bid, a card, a digit the strip refuses (swallowed, so it plays nothing), or a key this does not
// answer, which goes on to whatever else binds it.
export type KeyAnswer = { kind: "bid"; bet: number } | { kind: "play"; slot: number } | { kind: "refuse" } | { kind: "pass" };

const PASS: KeyAnswer = { kind: "pass" };

// Only unmodified digits: a bid and a played card are irrevocable, and Ctrl+1 belongs to the browser.
// The keypad's digits are the same keys to the person pressing them. The bid strip's are zero-based,
// since a bid of zero is a real bid; the hand's are one-based, the leftmost card being 1. A digit the
// strip does not offer is passed on, and a card only plays if a click on it would.
export function keyAnswer(key: string, modifiers: Modifiers, state: KeyState): KeyAnswer {
  if (!isPlain(modifiers) || !/^[0-9]$/.test(key)) {
    return PASS;
  }
  const digit = Number(key);
  if (state.strip !== null && digit <= state.strip.highest) {
    return offers(state.strip, digit) ? { kind: "bid", bet: digit } : { kind: "refuse" };
  }
  return digit >= 1 && isPlayable(state.hand, digit - 1) ? { kind: "play", slot: digit - 1 } : PASS;
}

// What the key answers are asked of, from the table as it stands.
export function keyStateFor(model: TableModel | null): KeyState | null {
  if (model === null) {
    return null;
  }
  const prompt = model.prompt;
  return { strip: prompt?.kind === "bet" ? { highest: prompt.max, forbidden: prompt.forbidden } : null, hand: model.hand };
}

export type MenuShortcut = "new-game" | "settings" | "rules" | "exit";

// The menu bar's Alt+N, Alt+S, Alt+R and Alt+X, as the desktop's. By the physical key, since Alt with
// a letter types another character on some keyboards.
export function shortcutFor(code: string, modifiers: Modifiers): MenuShortcut | null {
  if (!modifiers.alt || modifiers.ctrl || modifiers.meta || modifiers.shift) {
    return null;
  }
  switch (code) {
    case "KeyN":
      return "new-game";
    case "KeyS":
      return "settings";
    case "KeyR":
      return "rules";
    case "KeyX":
      return "exit";
    default:
      return null;
  }
}

// The way an arrow key moves a selection, or none for any other key or a modified one.
export function stepFor(key: string, modifiers: Modifiers): -1 | 1 | null {
  if (!isPlain(modifiers)) {
    return null;
  }
  return key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : null;
}
