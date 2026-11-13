import { svg } from "./el";

// The desktop's line icons, src/paint/Icons.cpp: a 24 unit square, stroked 1.8 in the colour of the
// text they stand beside, which is why they are elements and not pictures.

export type IconName = "round-history" | "last-trick" | "new-game" | "settings" | "rules" | "exit" | "online" | "pause" | "menu" | "chip";

function paths(...d: string[]): SVGElement[] {
  return d.map((each) => svg("path", { attrs: { d: each } }));
}

function shapes(name: IconName): SVGElement[] {
  switch (name) {
    case "round-history":
      return paths("M4 4h16v16H4z", "M4 9h16M4 14h16M10 4v16");
    case "last-trick":
      return [
        svg("rect", { attrs: { x: "3", y: "6", width: "10", height: "14", rx: "1.5" } }),
        ...paths("M9 6V4.5A1.5 1.5 0 0 1 10.5 3h8A1.5 1.5 0 0 1 20 4.5v11a1.5 1.5 0 0 1-1.5 1.5H13"),
      ];
    case "new-game":
      return [svg("circle", { attrs: { cx: "12", cy: "12", r: "9" } }), ...paths("M12 7v10M7 12h10")];
    case "settings":
      return [
        svg("circle", { attrs: { cx: "12", cy: "12", r: "3.2" } }),
        ...paths("M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"),
      ];
    case "rules":
      return paths("M4 5c3-1.5 5.5-1.5 8 0v15c-2.5-1.5-5-1.5-8 0z", "M20 5c-3-1.5-5.5-1.5-8 0v15c2.5-1.5 5-1.5 8 0z");
    case "exit":
      return paths("M14 4H5v16h9", "M10 12h10M16 8l4 4-4 4");
    // The scaled table's own: pause and the menu for its corner button, and a computer player's badge.
    case "pause":
      return [svg("path", { attrs: { d: "M9 5.5v13M15 5.5v13", "stroke-width": "2.6", "stroke-linecap": "round" } })];
    case "menu":
      return [svg("path", { attrs: { d: "M4 7h16M4 12h16M4 17h16", "stroke-linecap": "round" } })];
    case "chip":
      return [
        svg("rect", { attrs: { x: "6", y: "6", width: "12", height: "12", rx: "2" } }),
        svg("rect", { attrs: { x: "9.5", y: "9.5", width: "5", height: "5", rx: "0.8" } }),
        svg("path", { attrs: { d: "M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3", "stroke-linecap": "round" } }),
      ];
    // A globe, for playing with others: the page's own, which the desktop has no use for.
    case "online":
      return [
        svg("circle", { attrs: { cx: "12", cy: "12", r: "9" } }),
        ...paths("M3 12h18", "M12 3c3 3 3 15 0 18", "M12 3c-3 3-3 15 0 18"),
      ];
  }
}

export function icon(name: IconName): SVGSVGElement {
  return svg(
    "svg",
    { attrs: { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "aria-hidden": "true", focusable: "false" } },
    ...shapes(name),
  );
}
