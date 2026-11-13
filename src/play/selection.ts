import { isPlayable } from "../table/hand";
import { offers } from "../table/bidStrip";
import type { TableModel } from "./model";

// What the player has picked but not yet answered with, a card of the hand or a bid: Left and Right
// move it, Enter answers with it, and a first tap makes it. It belongs to the prompt it was made for,
// since an answer is irrevocable and a card picked for one trick must not be played in the next.
export interface Selected {
  prompt: number;
  kind: "card" | "bid";
  // The hand's slot, or the bid.
  value: number;
}

// What can be picked now, in the order it is laid out left to right.
export interface Options {
  prompt: number;
  kind: "card" | "bid";
  values: number[];
}

export function optionsFor(model: TableModel | null): Options | null {
  const prompt = model?.prompt ?? null;
  if (model === null || prompt === null) {
    return null;
  }
  if (prompt.kind === "bet") {
    const values = Array.from({ length: prompt.max + 1 }, (_, bet) => bet).filter((bet) => offers({ highest: prompt.max, forbidden: prompt.forbidden }, bet));
    return { prompt: prompt.id, kind: "bid", values };
  }
  const slots = model.hand.backs > 0 ? model.hand.backs : model.hand.entries.length;
  const values = Array.from({ length: slots }, (_, slot) => slot).filter((slot) => isPlayable(model.hand, slot));
  return { prompt: prompt.id, kind: "card", values };
}

// The pick, if it is still one of the options of the prompt it was made for.
export function stillSelected(selected: Selected | null, options: Options | null): Selected | null {
  if (selected === null || options === null) {
    return null;
  }
  const same = selected.prompt === options.prompt && selected.kind === options.kind;
  return same && options.values.includes(selected.value) ? selected : null;
}

// One step to the left or right among the options, and not past the ends. With nothing picked, a step
// right picks the first and a step left the last.
export function moveSelection(options: Options, selected: Selected | null, step: -1 | 1): Selected | null {
  if (options.values.length === 0) {
    return null;
  }
  const at = selected === null ? -1 : options.values.indexOf(selected.value);
  const next = at < 0 ? (step > 0 ? 0 : options.values.length - 1) : Math.min(Math.max(at + step, 0), options.values.length - 1);
  return { prompt: options.prompt, kind: options.kind, value: options.values[next] };
}

// What a press on a card of the hand does: a mouse and a pen play it at once, and a finger or the keyboard
// picks it first and plays it on the second press, so a card nobody picked is never played unseen.
export function pressOn(pointer: string, alreadySelected: boolean): "play" | "select" {
  return (pointer === "touch" || pointer === "keyboard") && !alreadySelected ? "select" : "play";
}

// The control of the table that has the keyboard: a card of the hand or a bid.
export interface Focused {
  kind: "card" | "bid";
  value: number;
}

// What to do with a keyboard that is on a control of the table, so that Enter never answers with
// something the player cannot see is picked. It is the pick, or it is made the pick if that is on offer
// and nothing else is picked, or it is let go.
export function settleFocus(focused: Focused | null, selected: Selected | null, options: Options | null): { pick: Selected | null; blur: boolean } {
  if (focused === null) {
    return { pick: selected, blur: false };
  }
  if (selected !== null && selected.kind === focused.kind && selected.value === focused.value) {
    return { pick: selected, blur: false };
  }
  if (selected === null && options !== null && options.kind === focused.kind && options.values.includes(focused.value)) {
    return { pick: { prompt: options.prompt, kind: focused.kind, value: focused.value }, blur: false };
  }
  return { pick: selected, blur: true };
}
