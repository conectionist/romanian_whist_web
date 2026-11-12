import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
// The server's fixtures, which are real games, and the page's own, which are built by hand.
const SERVER = join(ROOT, "libs/romanian_whist_server/protocol/look");
const OWN = join(ROOT, "tests/look/fixtures");
const OUT = join(ROOT, "build/shots/web");
// The same captures in Romanian, for reading the translation. They are not paired with the desktop's.
const OUT_RO = join(ROOT, "build/shots/web-ro");

interface Shot {
  file: string;
  width: number;
  height: number;
  view: "window" | "table";
  raised?: string;
}

function namesIn(directory: string): string[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""));
}

const server = namesIn(SERVER);
const own = namesIn(OWN);
const folders = [...server.map((name) => [name, SERVER] as const), ...own.map((name) => [name, OWN] as const)];

test("every look fixture is rendered", () => {
  expect(server).toHaveLength(9);
  expect(own).toEqual(
    expect.arrayContaining(["menu", "language", "sheet-round", "sheet-history", "sheet-last-trick", "sheet-game-over", "sheet-rules", "sheet-settings", "sheet-pause", "table-2-players", "table-6-players-full-hand", "sheet-new-game", "sheet-online", "sheet-create-table", "sheet-lobby"]),
  );
  // A name in both folders would be one picture drawn twice.
  expect(own.filter((name) => server.includes(name))).toEqual([]);
});

async function capture(page: Page, folder: string, name: string, out: string, query: string): Promise<void> {
  const { shot } = JSON.parse(readFileSync(join(folder, `${name}.json`), "utf8")) as { shot: Shot };
  mkdirSync(out, { recursive: true });

  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));

  await page.setViewportSize({ width: shot.width, height: shot.height });
  await page.goto(`/look.html?shot=${name}${query}`);
  await page.waitForSelector("body[data-ready]");

  if (shot.raised !== undefined) {
    await page.locator(`.hand [data-card="${shot.raised}"]`).hover();
  }

  await page.screenshot({ path: join(out, shot.file), animations: "disabled" });
  expect(problems).toEqual([]);
}

for (const [name, folder] of folders) {
  test(`renders ${name} at its own size`, async ({ page }) => {
    await capture(page, folder, name, OUT, "");
  });
}

// The language dialog has no words, so it looks the same in Romanian.
for (const [name, folder] of folders.filter(([name]) => name !== "language")) {
  test(`renders ${name} in Romanian`, async ({ page }) => {
    await capture(page, folder, name, OUT_RO, "&lang=ro");
  });
}
