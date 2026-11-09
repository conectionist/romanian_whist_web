import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const LOOK = join(ROOT, "libs/romanian_whist_server/protocol/look");
const OUT = join(ROOT, "build/shots/web");

interface Shot {
  file: string;
  width: number;
  height: number;
  view: "window" | "table";
  raised?: string;
}

const names = readdirSync(LOOK)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""));

test("every look fixture is rendered", () => {
  expect(names).toHaveLength(9);
});

for (const name of names) {
  test(`renders ${name} at its own size`, async ({ page }) => {
    const { shot } = JSON.parse(readFileSync(join(LOOK, `${name}.json`), "utf8")) as { shot: Shot };
    mkdirSync(OUT, { recursive: true });

    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));

    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto(`/look.html?shot=${name}`);
    await page.waitForSelector("body[data-ready]");

    if (shot.raised !== undefined) {
      await page.locator(`.hand [data-card="${shot.raised}"]`).hover();
    }

    await page.screenshot({ path: join(OUT, shot.file), animations: "disabled" });
    expect(problems).toEqual([]);
  });
}
