import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMIT, LayoutWatch, QUIET, sameWindowLayout, type WindowLayout } from "../../src/table/layoutWatch";

// The window and the document, as far as a layout watch reads them: a touch screen, a frame whose height the test moves, and the
// focus the test puts on a field or takes away.
class FakeElement {}

class Field extends FakeElement {
  readOnly = false;
  type = "text";
}

interface Fakes {
  frame: { clientWidth: number; clientHeight: number };
  observed: () => void;
  pointerListeners: Set<unknown>;
  documentListeners: Map<string, Set<(event: unknown) => void>>;
  disconnected: () => boolean;
  focus(on: Field | null): void;
  focusOut(to: unknown): void;
}

function install(): Fakes {
  const fake: { callback: () => void; disconnected: boolean } = { callback: () => undefined, disconnected: false };
  class FakeObserver {
    constructor(callback: () => void) {
      fake.callback = callback;
    }
    observe(): void {}
    disconnect(): void {
      fake.disconnected = true;
    }
  }
  const pointerListeners = new Set<unknown>();
  const documentListeners = new Map<string, Set<(event: unknown) => void>>();
  const doc = {
    activeElement: null as unknown,
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      documentListeners.set(type, (documentListeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type: string, listener: (event: unknown) => void) => documentListeners.get(type)?.delete(listener),
  };
  Object.assign(globalThis, {
    ResizeObserver: FakeObserver,
    HTMLElement: class {},
    HTMLTextAreaElement: class {},
    HTMLInputElement: Field,
    Element: FakeElement,
    document: doc,
    window: {
      matchMedia: () => ({ matches: true, addEventListener: (_: string, fn: unknown) => pointerListeners.add(fn), removeEventListener: (_: string, fn: unknown) => pointerListeners.delete(fn) }),
      setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
      clearTimeout: (id: Parameters<typeof clearTimeout>[0]) => clearTimeout(id),
    },
  });
  return {
    frame: { clientWidth: 754, clientHeight: 247 },
    observed: () => fake.callback(),
    pointerListeners,
    documentListeners,
    disconnected: () => fake.disconnected,
    focus: (on) => (doc.activeElement = on),
    focusOut: (to) => documentListeners.get("focusout")?.forEach((listener) => listener({ relatedTarget: to })),
  };
}

let fakes: Fakes;
let drawn: WindowLayout[];
let watch: LayoutWatch;

const grow = (to: number) => {
  fakes.frame.clientHeight = to;
  fakes.observed();
};

beforeEach(() => {
  vi.useFakeTimers();
  fakes = install();
  drawn = [];
  watch = new LayoutWatch(fakes.frame as unknown as HTMLElement, (layout) => drawn.push(layout));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a layout watch", () => {
  it("chooses the layout for the window it is given, and again for a window of another size", () => {
    expect(drawn.map((each) => each.choice.kind)).toEqual(["scaled"]);
    grow(120);
    expect(drawn.map((each) => each.choice.kind)).toEqual(["scaled", "tooSmall"]);
  });

  it("is told of a change of size by the layout when the page for a window too small shows it", () => {
    const small = (h: number) => ({ choice: { kind: "tooSmall" as const, scale: h / 360 }, size: { w: 700, h } });
    expect(sameWindowLayout(small(200), small(200))).toBe(true);
    expect(sameWindowLayout(small(200), small(190))).toBe(false);
    expect(sameWindowLayout({ choice: { kind: "desktop" }, size: { w: 1280, h: 800 } }, { choice: { kind: "desktop" }, size: { w: 1200, h: 700 } })).toBe(true);
  });

  it("does not draw the table again for a window that only became shorter while a field is typed in", () => {
    fakes.focus(new Field());
    grow(111);
    expect(drawn).toHaveLength(1);
  });

  it("goes on holding the layout while the window grows back after the field lost the focus, until it has stopped, and then looks", () => {
    fakes.focus(new Field());
    grow(111);
    fakes.focus(null);
    fakes.focusOut(null);
    // Each step is shorter than the held window and nearer to it than the quiet allows to be called settled.
    for (const height of [150, 190, 230]) {
      vi.advanceTimersByTime(QUIET - 100);
      grow(height);
    }
    vi.advanceTimersByTime(QUIET - 100);
    expect(drawn).toHaveLength(1);
    // The keyboard is gone: the window is as it was, and nothing changed.
    grow(247);
    vi.advanceTimersByTime(QUIET + 100);
    expect(drawn).toHaveLength(1);
  });

  it("looks at a window that stayed short once it has been still for a moment, and never waits longer than the limit", () => {
    fakes.focus(new Field());
    grow(111);
    fakes.focus(null);
    fakes.focusOut(null);
    vi.advanceTimersByTime(QUIET - 60);
    expect(drawn).toHaveLength(1);
    vi.advanceTimersByTime(120);
    expect(drawn.map((each) => each.choice.kind)).toEqual(["scaled", "tooSmall"]);
  });

  it("looks at a window that goes on changing when the limit comes, and not before", () => {
    fakes.focus(new Field());
    grow(111);
    fakes.focus(null);
    fakes.focusOut(null);
    let waited = 0;
    for (; waited < LIMIT - 200; waited += 100) {
      grow(111 + (waited % 7));
      vi.advanceTimersByTime(100);
    }
    expect(drawn).toHaveLength(1);
    for (; waited < LIMIT + 300; waited += 100) {
      grow(111 + (waited % 7));
      vi.advanceTimersByTime(100);
    }
    expect(drawn.length).toBeGreaterThan(1);
    expect(drawn[1].choice.kind).toBe("tooSmall");
  });

  it("does not wait at all when the focus goes from one field to another, which keeps the keyboard", () => {
    fakes.focus(new Field());
    fakes.focusOut(new Field());
    expect(vi.getTimerCount()).toBe(0);
    fakes.focusOut(null);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("lets go of what it listens to when it is disposed: the pointer, the focus, the frame and the timer", () => {
    expect(fakes.pointerListeners.size).toBe(1);
    expect(fakes.documentListeners.get("focusout")?.size).toBe(1);
    fakes.focusOut(null);
    expect(vi.getTimerCount()).toBe(1);
    watch.dispose();
    expect(fakes.pointerListeners.size).toBe(0);
    expect(fakes.documentListeners.get("focusout")?.size).toBe(0);
    expect(fakes.disconnected()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
