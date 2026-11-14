import { typingIn } from "../dom/editing";
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
  // The scaled table is laid out for the window's own size; the desktop's follows the view by itself.
  return a.choice.kind !== "scaled" || (a.size.w === b.size.w && a.size.h === b.size.h);
}

// Watches the window for a change of table: a resize, a turn of the phone, entering or leaving full
// screen, or a pointer that becomes coarse or fine. It says so once for each change.
export class LayoutWatch {
  private current: WindowLayout | null = null;
  private readonly observer: ResizeObserver;
  private readonly pointer: MediaQueryList | null;

  constructor(
    private readonly frame: HTMLElement,
    private readonly changed: (layout: WindowLayout) => void,
  ) {
    this.observer = new ResizeObserver(() => this.check());
    this.observer.observe(frame);
    this.pointer = typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
    this.pointer?.addEventListener("change", () => this.check());
    // The window is looked at again once the keyboard is gone, in case it was a real change.
    document.addEventListener("focusout", () => window.setTimeout(() => this.check(), 120));
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
    // The keyboard of a phone takes the window's height while a field is typed in. The table is not drawn again for a
    // window that only became shorter then, or it would be too small for the table and the field would lose its focus.
    if (this.current !== null && typingIn() && size.w === this.current.size.w && size.h < this.current.size.h) {
      return;
    }
    const next: WindowLayout = { choice: layoutChoiceFor(size, touched()), size };
    if (!sameWindowLayout(this.current, next)) {
      this.current = next;
      this.changed(next);
    }
  }

  dispose(): void {
    this.observer.disconnect();
  }
}
