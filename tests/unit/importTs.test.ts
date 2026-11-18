import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import desktop from "../../src/i18n/ro.desktop.json";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
interface Entry {
  context: string;
  source: string;
  comment?: string;
  translation?: string;
  forms?: string[];
}

const entries = desktop.entries as Entry[];

function find(context: string, source: string, comment?: string): Entry | undefined {
  return entries.find((entry) => entry.context === context && entry.source === source && entry.comment === comment);
}

describe("the desktop's translation as tools/import_ts.py writes it", () => {
  it("names the desktop commit it was read at, and the language", () => {
    expect(desktop.desktopCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(desktop.language).toBe("ro");
  });

  it("holds the 211 translated strings, 8 of them with plural forms", () => {
    expect(entries).toHaveLength(211);
    expect(entries.filter((entry) => entry.forms !== undefined)).toHaveLength(8);
  });

  it("keeps the three forms of a plural, in Qt's order, and no single translation beside them", () => {
    const rounds = find("newgame", "%n rounds");
    expect(rounds?.forms).toEqual(["%n rundă", "%n runde", "%n de runde"]);
    expect(rounds?.translation).toBeUndefined();
    for (const entry of entries.filter((each) => each.forms !== undefined)) {
      expect(entry.forms, entry.source).toHaveLength(3);
      expect(entry.source, "a plural string counts with %n").toContain("%n");
    }
  });

  it("keeps the comment that tells two sources that read alike apart, as part of the key", () => {
    expect(find("trickpanel", "Leader: %1", "about a man")?.translation).toBe("%1 e primul");
    expect(find("trickpanel", "Leader: %1", "about a woman")?.translation).toBe("%1 e prima");
    expect(find("trickpanel", "Leader: %1")).toBeUndefined();
    const keys = entries.map((entry) => JSON.stringify([entry.context, entry.source, entry.comment ?? ""]));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("decodes what the XML escapes, and keeps a line break inside a source", () => {
    expect(find("NewGameDialog", "I'm watching")?.translation).toBe("Doar privesc");
    expect(entries.some((entry) => entry.source.includes("&apos;") || entry.source.includes("&amp;amp;"))).toBe(false);
    expect(find("TableTopItem", "Romanian\nWhist", "The logo on the table: its lines, split by line breaks. One line or two.")?.translation).toBe(
      "Whist",
    );
  });

  it("writes the letters with a comma below, which the page's fonts carry", () => {
    const text = JSON.stringify(entries);
    expect(text).toMatch(/[ășț]/);
    expect(text).not.toMatch(/[şţŞŢ]/);
  });

  it("is what the tool writes from the desktop commit it names, when that checkout is beside this one", () => {
    const checkout = join(ROOT, "..", "romanian_whist_desktop");
    if (!existsSync(join(checkout, ".git"))) {
      return;
    }
    try {
      execFileSync("git", ["-C", checkout, "cat-file", "-e", `${desktop.desktopCommit}^{commit}`], { stdio: "ignore" });
    } catch {
      return;
    }
    const folder = mkdtempSync(join(tmpdir(), "import-ts-"));
    try {
      const output = join(folder, "ro.desktop.json");
      execFileSync("python3", [join(ROOT, "tools/import_ts.py"), "--desktop", checkout, "--commit", desktop.desktopCommit, "--output", output], {
        stdio: "ignore",
      });
      expect(readFileSync(output, "utf8")).toBe(readFileSync(join(ROOT, "src/i18n/ro.desktop.json"), "utf8"));
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
