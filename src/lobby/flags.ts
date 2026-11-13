import { svg } from "../dom/el";
import type { Language } from "../i18n/language";

// The flags of src/ui/LanguageDialog.cpp paintFlag(), on a 120 by 80 box with a hairline round it so
// the yellow and the white keep an edge on the panel. A flag is the same in every scheme, so its
// colours are written here and not taken from the theme.
export const FLAG_WIDTH = 120;
export const FLAG_HEIGHT = 80;

const ROMANIA = { blue: "#002b7f", yellow: "#fcd116", red: "#ce1126" };
const UNION = { blue: "#012169", red: "#c8102e", white: "#ffffff" };

// The Union Flag's counterchanged red saltire: the part of each diagonal's 4-wide stroke on one side
// of the white's, the side turning with the arms. A diagonal of slope 1/2 has its red edge the square
// root of 5 from its centre line, up or down; each piece is a quadrilateral off the flag's middle.
const SIDE = Math.sqrt(5);

export type Point = [number, number];

function polygon(points: readonly Point[]): string {
  return `M${points.map(([x, y]) => `${+x.toFixed(4)} ${+y.toFixed(4)}`).join("L")}Z`;
}

// The same piece turned half a way round the middle of the flag.
function turned(points: readonly Point[]): Point[] {
  return points.map(([x, y]) => [60 - x, 30 - y]);
}

// The four pieces, on the 60 by 30 grid.
export function redSaltirePieces(): Point[][] {
  const lower: Point[] = [
    [30, 15],
    [60, 30],
    [60, 30 - SIDE],
    [30 + 2 * SIDE, 15],
  ];
  const upper: Point[] = [
    [30, 15],
    [0, 30],
    [2 * SIDE, 30],
    [30, 15 + SIDE],
  ];
  return [lower, turned(lower), upper, turned(upper)];
}

function romania(): SVGElement[] {
  const third = FLAG_WIDTH / 3;
  return [ROMANIA.blue, ROMANIA.yellow, ROMANIA.red].map((fill, index) =>
    svg("rect", { attrs: { x: String(index * third), y: "0", width: String(third), height: String(FLAG_HEIGHT), fill } }),
  );
}

// Drawn on the usual 60 by 30 grid, stretched to the box.
function union(): SVGElement[] {
  return [
    svg(
      "g",
      { attrs: { transform: `scale(${FLAG_WIDTH / 60} ${FLAG_HEIGHT / 30})` } },
      svg("rect", { attrs: { width: "60", height: "30", fill: UNION.blue } }),
      svg("path", { attrs: { d: "M0 0L60 30M60 0L0 30", stroke: UNION.white, "stroke-width": "6", fill: "none" } }),
      svg("path", { attrs: { d: redSaltirePieces().map(polygon).join(""), fill: UNION.red } }),
      svg("path", { attrs: { d: "M25 0H35V30H25ZM0 10H60V20H0Z", fill: UNION.white } }),
      svg("path", { attrs: { d: "M27 0H33V30H27ZM0 12H60V18H0Z", fill: UNION.red } }),
    ),
  ];
}

// A flag as an element: 120 by 80 unless the page's stylesheet says another size, in its 3 to 2 shape.
export function flagFor(language: Language): SVGSVGElement {
  return svg(
    "svg",
    { attrs: { viewBox: `0 0 ${FLAG_WIDTH} ${FLAG_HEIGHT}`, width: String(FLAG_WIDTH), height: String(FLAG_HEIGHT), "aria-hidden": "true", focusable: "false" } },
    ...(language === "ro" ? romania() : union()),
    svg("rect", {
      attrs: { x: "0.5", y: "0.5", width: String(FLAG_WIDTH - 1), height: String(FLAG_HEIGHT - 1), fill: "none", stroke: "#000000", "stroke-opacity": "0.43" },
    }),
  );
}
