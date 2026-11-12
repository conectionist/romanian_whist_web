import type { Page } from "@playwright/test";

// What the table has on it, as shapes in the window's pixels, turned and drawn as they are: a card of
// a rack stands through a perspective, and a played card is turned, so each is a quad and not a box.
export type Quad = [number, number][];

export interface Drawn {
  kind: "seat" | "rack" | "played" | "trickpanel" | "score" | "button" | "bidstrip" | "hand";
  id: string;
  quad: Quad;
}

export interface Measured {
  // The table's scale, and the name text's own height drawn for a seat, by seat.
  scale: number;
  names: Record<string, number>;
  seats: Record<string, number>;
  drawn: Drawn[];
}

export async function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const shown = (node: Element) => !node.closest("[hidden]") && getComputedStyle(node).display !== "none";
    // A corner of the element's box, found by putting a point there and asking where it went.
    const quadOf = (node: HTMLElement): [number, number][] => {
      const restore = node.style.position;
      if (getComputedStyle(node).position === "static") {
        node.style.position = "relative";
      }
      const corners = [
        ["left", "top"],
        ["right", "top"],
        ["right", "bottom"],
        ["left", "bottom"],
      ].map(([across, down]) => {
        const point = document.createElement("span");
        point.style.cssText = `position:absolute;width:0;height:0;${across}:0;${down}:0;`;
        node.append(point);
        const at = point.getBoundingClientRect();
        point.remove();
        return [at.x, at.y] as [number, number];
      });
      node.style.position = restore;
      return corners;
    };
    const drawn: { kind: string; id: string; quad: [number, number][] }[] = [];
    const add = (kind: string, node: Element | null, id = ""): void => {
      if (node !== null && shown(node)) {
        drawn.push({ kind, id, quad: quadOf(node as HTMLElement) });
      }
    };
    document.querySelectorAll<HTMLElement>(".seat").forEach((node) => add("seat", node, node.dataset.seat));
    document.querySelectorAll(".rack").forEach((rack, at) => rack.querySelectorAll(".rack-card").forEach((card, index) => add("rack", card, `${at}.${index}`)));
    document.querySelectorAll(".trick > *").forEach((node, at) => add("played", node, String(at)));
    add("trickpanel", document.querySelector(".trickpanel"));
    add("score", document.querySelector(".score"));
    document.querySelectorAll(".corner-buttons .btn").forEach((node, at) => add("button", node, String(at)));
    add("bidstrip", document.querySelector(".bidstrip"));
    document.querySelectorAll(".hand .hcard").forEach((node, at) => add("hand", node, String(at)));

    const names: Record<string, number> = {};
    const seats: Record<string, number> = {};
    document.querySelectorAll<HTMLElement>(".seat").forEach((seat) => {
      if (shown(seat)) {
        names[seat.dataset.seat as string] = seat.querySelector(".name-text")!.getBoundingClientRect().height;
        seats[seat.dataset.seat as string] = parseFloat(getComputedStyle(seat).scale === "none" ? "1" : getComputedStyle(seat).scale);
      }
    });
    return { scale: parseFloat(getComputedStyle(document.querySelector(".view")!).getPropertyValue("--s")), names, seats, drawn } as never;
  });
}

// Whether two convex shapes overlap by more than a pixel: no line along an edge of either has them on
// its two sides, and a pixel of overlap is not counted.
export function overlap(a: Quad, b: Quad): boolean {
  for (const shape of [a, b]) {
    for (let at = 0; at < shape.length; at++) {
      const [fromX, fromY] = shape[at];
      const [toX, toY] = shape[(at + 1) % shape.length];
      const length = Math.hypot(toX - fromX, toY - fromY);
      const axis = [(fromY - toY) / length, (toX - fromX) / length];
      const along = (quad: Quad) => quad.map(([x, y]) => x * axis[0] + y * axis[1]);
      const first = along(a);
      const second = along(b);
      if (Math.max(...first) <= Math.min(...second) + 1 || Math.max(...second) <= Math.min(...first) + 1) {
        return false;
      }
    }
  }
  return true;
}

// Which pairs of things a name panel is on: another panel, a rack's card, a played card, a corner panel
// or the bid strip, or a card of the fan, apart from your own panel, which the fan has always been
// under.
export function panelsOn(drawn: readonly Drawn[]): string[] {
  const label = (item: Drawn) => `${item.kind}${item.id}`;
  const found: string[] = [];
  for (const panel of drawn.filter((item) => item.kind === "seat" && item.id !== "0")) {
    for (const other of drawn) {
      if (other === panel || (other.kind === "seat" && other.id <= panel.id)) {
        continue;
      }
      if (overlap(panel.quad, other.quad)) {
        found.push(`${label(panel)}~${label(other)}`);
      }
    }
  }
  return found;
}
