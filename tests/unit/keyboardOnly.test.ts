import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const E2E = join(dirname(fileURLToPath(import.meta.url)), "../e2e");

// What a test played with the keyboard alone may not do: touch the mouse or the screen, click or tap a
// control, set a field's value from outside, move the keyboard from outside, or press a key on a locator,
// which focuses it first. None of these is a key pressed on whatever has the keyboard.
const NOT_A_KEY =
  /(?<!keyboard)\.(press|pressSequentially|type)\(|\.(click|dblclick|tap|hover|dragTo|check|uncheck|setChecked|selectOption|fill|select)\(|\.(focus|blur)\b|page\.mouse|touchscreen|dispatchEvent/;

describe("the keyboard-only game", () => {
  for (const file of ["keyboard.ts", "keyboard.spec.ts"]) {
    it(`never reaches for the mouse, the screen or a click: ${file}`, () => {
      const lines = readFileSync(join(E2E, file), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"));
      expect(lines.filter((line) => NOT_A_KEY.test(line))).toEqual([]);
    });
  }

  it("tells a key pressed on whatever has the keyboard from the ways around it", () => {
    for (const allowed of ['await page.keyboard.press("Tab");', 'await page.keyboard.type("A1");', "document.activeElement?.matches(wanted)"]) {
      expect(NOT_A_KEY.test(allowed), allowed).toBe(false);
    }
    for (const reached of [
      'await page.locator("button").press("Enter");',
      'await page.locator("input").pressSequentially("1");',
      "await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());",
      "await page.evaluate(() => document.querySelector<HTMLElement>('button')!.focus());",
      'await page.locator("button").click();',
    ]) {
      expect(NOT_A_KEY.test(reached), reached).toBe(true);
    }
  });
});
