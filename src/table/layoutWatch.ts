import { editable, typingIn } from "../dom/editing";
import { layoutChoiceFor, sameChoice, type LayoutChoice } from "./layoutChoice";
import { touched } from "./pointer";
import type { Size } from "./space";

// What the window is: its size in CSS pixels, and which table that size and its pointer call for.
export interface WindowLayout {
  choice: LayoutChoice;
  size: Size;
}

export function sameWindowLayout(a: WindowLayout | null, b: WindowLayout): boolean {
  if (a === null || !sameChoice(a.choice, b.choice)) {
    return false;
  }
  // The scaled table is laid out for the window's own size, and the page for a window too small says it; the desktop's
  // follows the view by itself.
  return a.choice.kind === "desktop" || (a.size.w === b.size.w && a.size.h === b.size.h);
}

// How long the window must be still, after a field lost the focus, before it is looked at again, and the longest it is
// waited for. A keyboard that is closing is a window growing.
export const QUIET = 350;
export const LIMIT = 2000;

// Watches the window for a change of table: a resize, a turn of the phone, entering or leaving full
// screen, or a pointer that becomes coarse or fine. It says so once for each change.
export class LayoutWatch {
  private current: WindowLayout | null = null;
  private readonly observer: ResizeObserver;
  private readonly pointer: MediaQueryList | null;
  private readonly pointerChanged = () => this.check();
  private readonly fieldLeft = (event: FocusEvent) => this.leftField(event);
  // Set from a field losing the focus until the window has settled.
  private settling: number | null = null;
  private lastResize = 0;

  constructor(
    private readonly frame: HTMLElement,
    private readonly changed: (layout: WindowLayout) => void,
  ) {
    this.observer = new ResizeObserver(() => {
      this.lastResize = Date.now();
      this.check();
    });
    this.observer.observe(frame);
    this.pointer = typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
    this.pointer?.addEventListener("change", this.pointerChanged);
    document.addEventListener("focusout", this.fieldLeft);
    this.check();
  }

  get layout(): WindowLayout | null {
    return this.current;
  }

  check(): void {
    const size = { w: this.frame.clientWidth, h: this.frame.clientHeight };
    if (size.w === 0 || size.h === 0) {
      return;
    }
    // The keyboard of a phone takes the window's height while a field is typed in, and is a while closing after it. The
    // table is not drawn again for a window that only became shorter then, or it would be too small for the table and
    // the field would lose its focus.
    if (this.current !== null && (typingIn() || this.settling !== null) && size.w === this.current.size.w && size.h < this.current.size.h) {
      return;
    }
    const next: WindowLayout = { choice: layoutChoiceFor(size, touched()), size };
    if (!sameWindowLayout(this.current, next)) {
      this.current = next;
      this.changed(next);
    }
  }

  // A field lost the focus: the window is looked at again once it has stopped changing, unless the focus went to another
  // field, which keeps the keyboard.
  private leftField(event: FocusEvent): void {
    if (event.relatedTarget instanceof Element && editable(event.relatedTarget)) {
      return;
    }
    if (this.settling !== null) {
      window.clearTimeout(this.settling);
    }
    const started = Date.now();
    const wait = () => {
      const now = Date.now();
      const back = this.current !== null && this.frame.clientHeight >= this.current.size.h;
      if (now - Math.max(this.lastResize, started) >= QUIET || back || now - started >= LIMIT) {
        this.settling = null;
        this.check();
        return;
      }
      this.settling = window.setTimeout(wait, 50);
    };
    this.settling = window.setTimeout(wait, 50);
  }

  dispose(): void {
    this.observer.disconnect();
    this.pointer?.removeEventListener("change", this.pointerChanged);
    document.removeEventListener("focusout", this.fieldLeft);
    if (this.settling !== null) {
      window.clearTimeout(this.settling);
      this.settling = null;
    }
  }
}
