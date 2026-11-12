import { describe, expect, it, vi } from "vitest";

// The language is fixed in the entry module's body, after every module it imports has been evaluated,
// so a module that made text while it was imported would make it in English whatever the language.
const made = vi.hoisted(() => [] as string[]);

vi.mock("../../src/i18n/t", () => ({
  t: (context: string, source: string) => {
    made.push(`${context}: ${source}`);
    return source;
  },
}));

// The two entry points run the page when they are loaded, which is the point of them.
const ENTRY_POINTS = ["/src/main.ts", "/src/look/main.ts"];
const modules = Object.entries(import.meta.glob("../../src/**/*.ts")).filter(
  ([path]) => !path.endsWith(".d.ts") && !ENTRY_POINTS.some((entry) => path.endsWith(entry)),
);

describe("importing the page's modules", () => {
  it("finds the page's modules", () => {
    expect(modules.length).toBeGreaterThan(60);
  });

  it("makes no text, so the language set afterwards reaches all of it", async () => {
    for (const [, load] of modules) {
      await load();
    }
    expect(made).toEqual([]);
  });

  it("can see a module make text when one is asked to", async () => {
    const { roundTypeText } = await import("../../src/table/roundText");
    made.length = 0;
    roundTypeText("hidden");
    expect(made).toEqual(["infostrip: Hidden"]);
  });
});
