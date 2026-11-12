import { el } from "../dom/el";
import { bidStripHeight, bidStripOrigin, bidStripWidth, fitBox, fitScale, marginTop, marginX, marginBottom, type Rect, type Size } from "./space";
import type { Room } from "./geometry/grown";

// The clear space kept between a panel and what is next to it, in pixels of the window.
const GAP = 4;

export interface Fit {
  scale: number;
  // Where the fit box's top-left corner lands in the view, in pixels.
  x: number;
  y: number;
}

// TableView::fitTable(): one scale for both axes, so the table stays round; the largest that fits
// the fit box inside the margins; and the box centred in what the margins leave. Null for a view
// with no room inside its margins, which leaves the last fit alone.
export function fitFor(view: Size): Fit | null {
  const scale = fitScale(view);
  if (scale <= 0) {
    return null;
  }
  const padded = { w: view.w - 2 * marginX, h: view.h - marginTop - marginBottom };
  return {
    scale,
    x: marginX + (padded.w - fitBox.w * scale) / 2,
    y: marginTop + (padded.h - fitBox.h * scale) / 2,
  };
}

// Takes table space, with the fit box's corner at the origin, to the view.
export function spaceTransform(fit: Fit): string {
  return `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale}) translate(${-fitBox.x}px, ${-fitBox.y}px)`;
}

// The room and the layers over it: the fitted table space, the corner panels pinned to the view,
// and the bid strip over those.
export class TableView {
  readonly root: HTMLElement;
  // Table units, scaled to the view.
  readonly space: HTMLElement;
  // The bid strip, in the same space but over the corner panels.
  readonly top: HTMLElement;
  // The corner panels: the view's own pixels, each scaled by --s.
  readonly hud: HTMLElement;

  private fit: Fit | null = null;
  private readonly observer: ResizeObserver;
  private readonly fitted: (() => void)[] = [];

  constructor(parent: HTMLElement) {
    this.space = el("div", { class: "space" });
    this.hud = el("div", { class: "hud" });
    this.top = el("div", { class: "space-top" });
    this.root = el("div", { class: "view" }, this.space, this.hud, this.top);
    parent.append(this.root);

    this.observer = new ResizeObserver(() => this.refit());
    this.observer.observe(this.root);
    this.refit();
  }

  get scale(): number {
    return this.fit?.scale ?? 1;
  }

  // Told when the table is fitted to a view of another size.
  onFit(handler: () => void): void {
    this.fitted.push(handler);
  }

  // The view's size, which what stands in it is worked out for.
  get size(): Size {
    return { w: this.root.clientWidth, h: this.root.clientHeight };
  }

  // Where the seats' panels may stand and what they keep clear of, in table units: the view, the elements
  // given, where they are drawn, and, for the panels alone, the bid strip's place whether it is up or not
  // and whatever else is asked.
  room(keep: readonly Element[], also: readonly Rect[]): Room | null {
    if (this.fit === null) {
      return null;
    }
    const { scale, x, y } = this.fit;
    const outer = this.root.getBoundingClientRect();
    const toTable = (rect: DOMRect): Rect => ({
      x: (rect.left - outer.left - x) / scale + fitBox.x,
      y: (rect.top - outer.top - y) / scale + fitBox.y,
      w: rect.width / scale,
      h: rect.height / scale,
    });
    const grown = this.top.firstElementChild === null ? "none" : getComputedStyle(this.top.firstElementChild).scale;
    const by = grown === "none" ? 1 : parseFloat(grown);
    const w = bidStripWidth * by;
    const h = bidStripHeight * by;
    const strip: Rect = { x: bidStripOrigin.x + (bidStripWidth - w) / 2, y: bidStripOrigin.y + (bidStripHeight - h) / 2, w, h };
    const view = toTable(outer);
    const gap = GAP / scale;
    return {
      view: { x: view.x + gap, y: view.y + gap, w: view.w - 2 * gap, h: view.h - 2 * gap },
      keep: keep.map((element) => toTable(element.getBoundingClientRect())),
      covered: [strip, ...also],
      gap,
    };
  }

  // Fits the table to the view as it is now.
  refit(): void {
    const next = fitFor({ w: this.root.clientWidth, h: this.root.clientHeight });
    if (next === null) {
      return;
    }
    this.fit = next;
    const transform = spaceTransform(next);
    this.space.style.transform = transform;
    this.top.style.transform = transform;
    this.root.style.setProperty("--s", String(next.scale));
    for (const handler of this.fitted) {
      handler();
    }
  }

  dispose(): void {
    this.observer.disconnect();
  }
}
