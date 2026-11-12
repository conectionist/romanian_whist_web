import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const E2E = join(dirname(fileURLToPath(import.meta.url)), "../e2e");

// What a test played with the keyboard alone may not do: touch the mouse or the screen, click or tap a
// control, or set a field's value from outside, none of which a key does.
const NOT_A_KEY = /\.(click|dblclick|tap|hover|dragTo|check|uncheck|setChecked|selectOption|fill|focus)\(|page\.mouse|touchscreen|dispatchEvent/;

describe("the keyboard-only game", () => {
  for (const file of ["keyboard.ts", "keyboard.spec.ts"]) {
    it(`never reaches for the mouse, the screen or a click: ${file}`, () => {
      const lines = readFileSync(join(E2E, file), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"));
      expect(lines.filter((line) => NOT_A_KEY.test(line))).toEqual([]);
    });
  }
});
