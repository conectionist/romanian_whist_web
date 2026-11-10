import { el } from "../dom/el";
import { fitBox, fitScale, marginTop, marginX, marginBottom, type Size } from "./space";

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
  }

  dispose(): void {
    this.observer.disconnect();
  }
}
