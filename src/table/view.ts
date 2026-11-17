import { el } from "../dom/el";
import { centre, fitBox, fitScale, marginTop, marginX, marginBottom, woodRadius, type Size } from "./space";

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

// What the view draws: the desktop's table fitted to it, or the scaled table, drawn for a window `size` of
// its own units and scaled up by `scale` to the view.
export type ViewLayout = { kind: "desktop" } | { kind: "scaled"; size: Size; scale: number };

// Where the scaled table's wood is, in the window's own units: its centre and radius.
export interface Wood {
  cx: number;
  cy: number;
  R: number;
}

// The transform that takes the table's units to the window's own units, for a table drawn with its centre
// at (cx, cy) and `2 * R / 1020` of its size.
export function woodTransform(wood: Wood): string {
  const k = wood.R / woodRadius;
  return `translate(${wood.cx - centre.x * k}px, ${wood.cy - centre.y * k}px) scale(${k})`;
}

// The room and the layers over it: the fitted table space, the corner panels pinned to the view,
// and the bid strip over those. On the scaled table the corner panels and the bid strip are not used;
// the stage holds the window's own units instead, scaled up whole.
export class TableView {
  readonly root: HTMLElement;
  // Table units, scaled to the view.
  readonly space: HTMLElement;
  // The bid strip, in the same space but over the corner panels.
  readonly top: HTMLElement;
  // The corner panels: the view's own pixels, each scaled by --s.
  readonly hud: HTMLElement;
  // The scaled table's layer: the window's own units, from 640 by 360 up, scaled by --scale.
  readonly stage: HTMLElement;

  private fit: Fit | null = null;
  private layout: ViewLayout = { kind: "desktop" };
  private readonly observer: ResizeObserver;

  constructor(parent: HTMLElement) {
    this.space = el("div", { class: "space" });
    this.hud = el("div", { class: "hud" });
    this.top = el("div", { class: "space-top" });
    this.stage = el("div", { class: "stage" });
    this.stage.hidden = true;
    this.root = el("div", { class: "view" }, this.space, this.hud, this.top, this.stage);
    parent.append(this.root);

    this.observer = new ResizeObserver(() => this.refit());
    this.observer.observe(this.root);
    this.refit();
  }

  get scale(): number {
    return this.fit?.scale ?? 1;
  }

  // Draws the desktop's table, or the scaled one for a window of this size and scale. The table's own
  // elements are placed by the scene, which says where the wood is with placeWood().
  setLayout(layout: ViewLayout): void {
    this.layout = layout;
    this.stage.hidden = layout.kind === "desktop";
    this.root.classList.toggle("scaled", layout.kind === "scaled");
    if (layout.kind === "desktop") {
      this.stage.style.width = "";
      this.stage.style.height = "";
      this.stage.style.transform = "";
      this.stage.style.removeProperty("--scale");
      this.refit();
      return;
    }
    const style = this.stage.style;
    style.width = `${layout.size.w / layout.scale}px`;
    style.height = `${layout.size.h / layout.scale}px`;
    style.transform = `scale(${layout.scale})`;
    style.setProperty("--scale", String(layout.scale));
  }

  // Puts the scaled table's wood where the layout has it. The table space is drawn at the window's own
  // units, scaled with the stage, and the played cards, which are in the stage, carry the same transform.
  placeWood(wood: Wood): string {
    const into = woodTransform(wood);
    if (this.layout.kind === "scaled") {
      this.space.style.transform = `scale(${this.layout.scale}) ${into}`;
      this.root.style.setProperty("--s", String(this.layout.scale));
    }
    return into;
  }

  // Fits the table to the view as it is now.
  refit(): void {
    if (this.layout.kind === "scaled") {
      return;
    }
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
