import type { Pointer } from "../table/hand";
import type { SheetName } from "./sheets";
import type { TableModel } from "./model";
import { isPlain, keyAnswer, keyStateFor, shortcutFor, stepFor, type MenuShortcut, type Modifiers } from "./keys";
import { moveSelection, optionsFor, pressOn, stillSelected, type Selected } from "./selection";

// What the keyboard and a finger need of the page.
export interface KeyboardDeps {
  // The table as it stands, an answer that waits to be taken counted.
  model(): TableModel | null;
  // Whether the table takes the keys: at a table, with no sheet holding it and nothing over the page.
  live(): boolean;
  // Whether the menu bar and the sheets are in reach: not while the language dialog is over the page.
  menuLive(): boolean;
  // The sheet that is up, which Space may let go.
  sheet(): SheetName | null;
  play(slot: number): void;
  bid(bet: number): void;
  continueRound(): void;
  shortcut(which: MenuShortcut): void;
  // Shows what is picked, putting the keyboard on it when asked.
  draw(selected: Selected | null, focus: boolean): void;
}

// The parts of an event's target that tell a text field from the rest.
interface Target {
  tagName?: string;
  isContentEditable?: boolean;
  closest?(selector: string): unknown;
}

// A field that takes typing, where a digit is a character and no bid.
export function isTyping(target: Target | null): boolean {
  return target !== null && (target.isContentEditable === true || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName ?? ""));
}

// Whether the keyboard is on the table or on nothing at all, which is where the arrows and Enter are
// the table's; on any other control they are the control's own.
function atTable(target: Target | null, body: unknown): boolean {
  return target === null || target === body || (target.closest?.(".hand, .bidstrip") ?? null) !== null;
}

// The table's keys and the finger's picks: what is picked, and what each press does to it.
export class Keyboard {
  private selected: Selected | null = null;

  constructor(private readonly deps: KeyboardDeps) {}

  get picked(): Selected | null {
    return this.selected;
  }

  install(): void {
    document.addEventListener("keydown", (event) => this.keydown(event));
    // A touch anywhere but on a card puts the pick down.
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType === "touch" && !(event.target instanceof Element && event.target.closest(".hcard") !== null)) {
          this.set(null, false);
        }
      },
      true,
    );
  }

  private set(selected: Selected | null, focus: boolean): void {
    this.selected = selected;
    this.deps.draw(selected, focus);
  }

  // After every draw: a pick that is no longer on offer is let go.
  refresh(): void {
    const still = stillSelected(this.selected, optionsFor(this.deps.model()));
    if (still !== this.selected) {
      this.set(still, false);
    }
  }

  // The keyboard arrived on a card or a bid by Tab: that is the pick.
  focused(kind: "card" | "bid", value: number): void {
    const options = optionsFor(this.deps.model());
    if (options !== null && options.kind === kind && options.values.includes(value) && !(this.selected?.kind === kind && this.selected.value === value)) {
      this.set({ prompt: options.prompt, kind, value }, false);
    }
  }

  // A press on a card of the hand.
  press(slot: number, pointer: Pointer): void {
    const options = optionsFor(this.deps.model());
    if (options === null || options.kind !== "card") {
      return;
    }
    const picked = this.selected?.kind === "card" && this.selected.value === slot;
    if (pressOn(pointer, picked) === "play") {
      this.set(null, false);
      this.deps.play(slot);
    } else {
      this.set({ prompt: options.prompt, kind: "card", value: slot }, false);
    }
  }

  // Answers with what is picked.
  private commit(): boolean {
    const picked = stillSelected(this.selected, optionsFor(this.deps.model()));
    if (picked === null) {
      return false;
    }
    this.set(null, false);
    if (picked.kind === "bid") {
      this.deps.bid(picked.value);
    } else {
      this.deps.play(picked.value);
    }
    return true;
  }

  private keydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    const modifiers: Modifiers = { alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey };
    const typing = isTyping(event.target as Target | null);

    const shortcut = shortcutFor(event.code, modifiers);
    if (shortcut !== null) {
      if (!event.repeat && !typing && this.deps.menuLive()) {
        event.preventDefault();
        this.deps.shortcut(shortcut);
      }
      return;
    }

    const step = stepFor(event.key, modifiers);
    if (step !== null) {
      const options = optionsFor(this.deps.model());
      if (options !== null && this.deps.live() && !typing && atTable(event.target as Target | null, document.body)) {
        const next = moveSelection(options, stillSelected(this.selected, options), step);
        if (next !== null) {
          event.preventDefault();
          this.set(next, true);
        }
      }
      return;
    }

    // A held key acts once: a bid and a played card cannot be taken back.
    if (event.repeat || typing) {
      return;
    }
    const onNothing = event.target === null || event.target === document.body;
    if (event.key === " " && isPlain(modifiers) && this.deps.menuLive() && this.deps.sheet() === "round" && onNothing) {
      event.preventDefault();
      this.deps.continueRound();
      return;
    }
    if (!this.deps.live()) {
      return;
    }
    // On a card or a bid Enter presses it, as any button; on nothing it answers with what is picked.
    if (event.key === "Enter" && isPlain(modifiers) && onNothing) {
      if (this.commit()) {
        event.preventDefault();
      }
      return;
    }
    const state = keyStateFor(this.deps.model());
    const answer = state === null ? null : keyAnswer(event.key, modifiers, state);
    if (answer === null || answer.kind === "pass") {
      return;
    }
    event.preventDefault();
    if (answer.kind === "bid") {
      this.set(null, false);
      this.deps.bid(answer.bet);
    } else if (answer.kind === "play") {
      this.set(null, false);
      this.deps.play(answer.slot);
    }
  }
}
