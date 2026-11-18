import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { buildCommit } from "../../tools/buildCommit.mjs";
import { sheet } from "./online";

const PAGE_REPOSITORY = "https://github.com/conectionist/romanian_whist_web";
const SERVER_REPOSITORY = "https://github.com/conectionist/romanian_whist_server";

const PAGE_VERSION = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;

// What the build wrote for the commit, as the build works it out: the one it was told, else the checkout's head, with
// -dirty after it while the tree has changes, else none. A dirty or unknown build links the repository itself.
const written = buildCommit(process.cwd(), process.env);
const pageCommit = /^[0-9a-f]{7,40}$/i.test(written) ? written.toLowerCase() : null;
const pageDirty = written.endsWith("-dirty");
const pageHref = pageCommit === null ? PAGE_REPOSITORY : `${PAGE_REPOSITORY}/tree/${pageCommit}`;
const pageBuilt = pageDirty ? `${PAGE_VERSION}, with local changes` : pageCommit === null ? `${PAGE_VERSION}, commit unknown` : `${PAGE_VERSION}, commit ${pageCommit.slice(0, 7)}`;

async function menu(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-status", "at no table");
  await expect(page.locator(".menu-page")).toBeVisible();
}

test("the main menu's foot links to the source of the server and the page at the commits that run", async ({ page }) => {
  await menu(page);
  const version = await page.evaluate(() => fetch("/version").then((response) => response.json() as Promise<{ commit: string; version: string; protocol: number }>));
  const foot = page.locator(".menu-source");
  await expect(foot).toContainText("Source:");
  const server = foot.locator('[data-menu-page="server-source"]');
  const source = foot.locator('[data-menu-page="page-source"]');
  // A server built with no git history says no commit, and then the link is to the repository itself.
  const named = /^[0-9a-f]{7,40}$/i.test(version.commit);
  await expect(server).toHaveAttribute("href", named ? `${SERVER_REPOSITORY}/tree/${version.commit.toLowerCase()}` : SERVER_REPOSITORY);
  await expect(source).toHaveAttribute("href", pageHref);
  // Each opens in a tab of its own, which cannot reach back into the page.
  for (const link of [server, source]) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
  await expect(foot.locator('[data-menu-page="about"]')).toHaveText("About");
  // The short words are named in full for a screen reader, and that the link opens another tab.
  await expect(foot.getByRole("link", { name: "Server source code (opens in a new tab)" })).toHaveText("server");
  await expect(foot.getByRole("link", { name: "Page source code (opens in a new tab)" })).toHaveText("page");
});

test("About tells the licence, the sources, the versions and what is kept, and Escape closes it and gives the keyboard back", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.addInitScript(() => window.localStorage.setItem("whist.pace", "slow"));
  await menu(page);
  const version = await page.evaluate(() => fetch("/version").then((response) => response.json() as Promise<{ commit: string; version: string; protocol: number }>));

  const about = page.locator('[data-menu-page="about"]');
  await about.focus();
  await about.press("Enter");
  const sheetNow = sheet(page, "about");
  await expect(sheetNow).toBeVisible();
  await expect(sheetNow.locator(".sheet-title")).toHaveText("About this page");
  await expect(sheetNow).toContainText("AGPL-3.0-or-later");
  await expect(sheetNow.locator(".about-link").first()).toHaveAttribute("href", /^https:\/\/github\.com\/conectionist\/romanian_whist_server/);
  await expect(sheetNow.locator(".about-link").nth(1)).toHaveAttribute("href", pageHref);
  const serverBuild = /^[0-9a-f]{7,40}$/i.test(version.commit) ? `commit ${version.commit.slice(0, 7).toLowerCase()}` : "commit unknown";
  const versions = sheetNow.locator(".about-versions");
  await expect(versions.locator("dt")).toHaveText(["Page", "Server", "Protocol"]);
  await expect(versions.locator("dd")).toHaveText([pageBuilt, `${version.version}, ${serverBuild}`, String(version.protocol)]);
  // Everything the page keeps, by name, and the words that nothing else is.
  for (const key of ["whist.token", "whist.profile", "whist.setup.en", "whist.setup.ro", "whist.pace", "whist.language", "whist.reloaded", "whist.fullscreenNoticeDismissed"]) {
    await expect(sheetNow.locator(".about-stored")).toContainText(key);
  }
  await expect(sheetNow).toContainText("no accounts and no cookies");
  await expect(sheetNow.getByRole("link", { name: "Report a problem (opens in a new tab)" })).toHaveAttribute("href", "https://github.com/conectionist/romanian_whist_web/issues");
  await expect(sheetNow.getByRole("link", { name: "Server source code (opens in a new tab)" })).toBeVisible();
  await expect(sheetNow.locator('[data-action="close"]')).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(sheetNow).toBeHidden();
  await expect(about).toBeFocused();
  expect(problems).toEqual([]);
});

test("Forget this browser asks first, and then clears exactly what the page keeps and loads the page anew", async ({ page }) => {
  await page.addInitScript(() => {
    // Only the first load is given these, so that the reload after Forget starts from what is left.
    if (window.sessionStorage.getItem("seeded") === null) {
      window.sessionStorage.setItem("seeded", "1");
      window.localStorage.setItem("whist.pace", "slow");
      window.localStorage.setItem("whist.profile", "{}");
      window.localStorage.setItem("other.site.key", "kept");
      window.sessionStorage.setItem("other.session.key", "kept");
    }
  });
  await menu(page);
  expect(await page.evaluate(() => window.localStorage.getItem("whist.token"))).not.toBeNull();

  await page.locator('[data-menu-page="about"]').click();
  const about = sheet(page, "about");
  await about.getByRole("button", { name: "Forget this browser" }).click();
  // The question stands in place of the buttons, and Keep, the safe answer, has the keyboard.
  await expect(about.locator(".about-confirm")).toBeVisible();
  await expect(about.locator(".about-confirm-text")).toContainText("Remove everything listed above");
  await expect(about.getByRole("button", { name: "Keep" })).toBeFocused();
  await expect(about.getByRole("button", { name: "Close" })).toBeHidden();
  await about.getByRole("button", { name: "Keep" }).click();
  await expect(about.locator(".about-confirm")).toBeHidden();
  expect(await page.evaluate(() => window.localStorage.getItem("whist.pace"))).toBe("slow");

  // Closed and opened again, the question is not left standing.
  await page.keyboard.press("Escape");
  await page.locator('[data-menu-page="about"]').click();
  await about.getByRole("button", { name: "Forget this browser" }).click();
  const navigated = page.waitForEvent("load");
  await about.getByRole("button", { name: "Forget", exact: true }).click();
  await navigated;

  // The language was forgotten with the rest, so the page asks for it before it does anything.
  await expect(page.locator(".lang-page")).toBeVisible();
  const left = await page.evaluate(() => ({
    local: Object.keys(window.localStorage).sort(),
    session: Object.keys(window.sessionStorage).sort(),
  }));
  expect(left.local).toEqual(["other.site.key"]);
  expect(left.session).toEqual(["other.session.key", "seeded"]);
});

test("Tab goes round About through both source links and Report a problem, and stays in the sheet", async ({ page }) => {
  await menu(page);
  await page.locator('[data-menu-page="about"]').click();
  const about = sheet(page, "about");
  await expect(about.locator('[data-action="close"]')).toBeFocused();

  const visited: string[] = [];
  for (let press = 0; press < 8; press++) {
    await page.keyboard.press("Tab");
    visited.push(
      await page.evaluate(() => {
        const node = document.activeElement as HTMLElement | null;
        const inside = node?.closest('.sheet[data-sheet="about"]') !== null && node?.closest('.sheet[data-sheet="about"]') !== undefined;
        return `${inside ? "in" : "out"}:${node?.getAttribute("href") ?? node?.dataset.action ?? node?.tagName}`;
      }),
    );
  }
  // From Close it wraps to the first link, and goes on to the second, Report a problem, Forget and Close again.
  expect(visited.every((stop) => stop.startsWith("in:"))).toBe(true);
  expect(visited[0]).toMatch(/^in:https:\/\/github\.com\/conectionist\/romanian_whist_server/);
  expect(visited[1]).toBe(`in:${pageHref}`);
  expect(visited[2]).toBe("in:https://github.com/conectionist/romanian_whist_web/issues");
  expect(visited[3]).toBe("in:forget");
  expect(visited[4]).toBe("in:close");
  expect(visited[5]).toBe(visited[0]);
});

test("Forget in one tab makes the others let go and load anew, so that none writes the token back", async ({ context }) => {
  const forgetting = await context.newPage();
  const other = await context.newPage();
  await menu(forgetting);
  await menu(other);
  expect(await other.evaluate(() => window.localStorage.getItem("whist.token"))).not.toBeNull();

  const reloaded = other.waitForEvent("load");
  await forgetting.locator('[data-menu-page="about"]').click();
  const about = sheet(forgetting, "about");
  await about.getByRole("button", { name: "Forget this browser" }).click();
  await about.getByRole("button", { name: "Forget", exact: true }).click();

  // Both ask for the language again, being new, and neither has connected: the browser keeps nothing of the page's.
  await reloaded;
  await expect(other.locator(".lang-page")).toBeVisible();
  await expect(forgetting.locator(".lang-page")).toBeVisible();
  for (const page of [forgetting, other]) {
    expect(await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith("whist.")))).toEqual([]);
  }
});

test("A tab that drops a token the server refuses does not make the others load anew, as Forget does", async ({ context }) => {
  const settled = await context.newPage();
  await menu(settled);
  await settled.evaluate(() => ((window as unknown as { stayed: boolean }).stayed = true));

  // A second tab starts with a token the server cannot read, drops it, and is given another.
  const refused = await context.newPage();
  await refused.addInitScript(() => window.localStorage.setItem("whist.token", "not a token"));
  await menu(refused);
  expect(await refused.evaluate(() => window.localStorage.getItem("whist.token"))).toMatch(/^[A-Za-z0-9_-]{22}$/);

  // The first was not loaded again: what it set on its window is still there.
  await settled.waitForTimeout(500);
  expect(await settled.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true);
});
