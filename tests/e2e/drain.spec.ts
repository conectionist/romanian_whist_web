import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

// A server of its own, so that stopping it is the test's to do: the one the other tests share stays up. It waits at
// most fifteen seconds for the games someone is at, which leaves a slow machine time to do all that the test asks
// of the page while the drain goes on.
const PORT = 8091;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DRAIN_MS = 15_000;
const SERVER = process.env.WHIST_SERVER ?? "libs/romanian_whist_server/build/server/app/whist_server";

interface Running {
  process: ChildProcess;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  output(): string;
  folder: string;
}

// What the server printed, to go with a failure: a test that only says a banner did not show leaves nothing to look at.
function withOutput(error: unknown, running: Running): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`${reason}\n\nwhat the server printed:\n${running.output() || "(nothing)"}`, { cause: error });
}

// Makes the folder go and the process end, and waits for it, so that its port is free for the next test.
async function stop(running: Running): Promise<void> {
  running.process.kill("SIGKILL");
  await Promise.race([running.exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
  rmSync(running.folder, { recursive: true, force: true });
}

async function start(more: Record<string, number> = {}): Promise<Running> {
  const folder = mkdtempSync(join(tmpdir(), "whist-drain-"));
  const config = join(folder, "server.json");
  // The limits per address are lifted, as in server.json: every page here is the one address.
  writeFileSync(
    config,
    JSON.stringify({ port: PORT, document_root: "dist", log_level: "warn", drain_ms: DRAIN_MS, max_connections_per_ip: 1000, tables_per_ip_per_hour: 100000, failed_joins_per_ip: 100000, max_tables: 100000, messages_per_second: 1000, message_burst: 2000, ...more }),
  );
  const child = spawn(SERVER, ["--config", config], { stdio: ["ignore", "pipe", "pipe"] });
  let text = "";
  child.stdout?.on("data", (chunk) => (text += String(chunk)));
  child.stderr?.on("data", (chunk) => (text += String(chunk)));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  const running = { process: child, exited, output: () => text, folder };
  try {
    await expect.poll(async () => fetch(`${ORIGIN}/health`).then((response) => response.status, () => 0), { timeout: 15_000 }).toBe(200);
  } catch (error) {
    await stop(running);
    throw withOutput(error, running);
  }
  return running;
}

// Runs a test against a server of its own, whose output goes with any failure, and which is gone, and its port free,
// when it is over.
async function withServer(more: Record<string, number>, body: (running: Running, keep: (context: BrowserContext) => void) => Promise<void>): Promise<void> {
  const running = await start(more);
  const contexts: BrowserContext[] = [];
  try {
    await body(running, (context) => contexts.push(context));
  } catch (error) {
    throw withOutput(error, running);
  } finally {
    for (const context of contexts) {
      await context.close();
    }
    await stop(running);
  }
}

async function visitor(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: ORIGIN,
    storageState: { cookies: [], origins: [{ origin: ORIGIN, localStorage: [{ name: "whist.language", value: "en" }, { name: "whist.pace", value: "off" }] }] },
  });
  return context;
}

// The time of day as the banner writes it, in this machine's zone, which the browser shares.
const clock = (at: number) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

// Every time of day the banner may name: it adds what is left of the drain to the moment the page was told, which was
// after the stop and not long after.
function nameableTimes(stopped: number): string[] {
  const times = new Set<string>();
  for (let at = stopped; at <= stopped + DRAIN_MS + 3000; at += 1000) {
    times.add(clock(at));
  }
  return [...times];
}

test("a restart is told in a banner, no new game starts, and the game someone is at is cut at the deadline", async ({ browser }) => {
  await withServer({}, async (running, keep) => {
    const player = await visitor(browser);
    keep(player);
    const game = await player.newPage();
    await game.goto("/?solo=4");
    await expect(game.locator("body")).toHaveAttribute("data-status", "at a table");
    await game.locator(".hand .hcard").first().waitFor();
    const banner = game.locator('.notice[data-kind="restart"]');
    await expect(banner).toHaveCount(0);

    const stopped = Date.now();
    running.process.kill("SIGTERM");

    // The game's page is told at once: until when the games in progress can go on, and that no new one starts.
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/^The server is restarting\. Games in progress can go on until \d\d:\d\d\. No new game can start\.$/);
    expect(nameableTimes(stopped)).toContain((await banner.textContent())!.match(/until (\d\d:\d\d)/)![1]);
    // It is in the strip that a screen reader reads out as it is added, as the connection's notices are.
    await expect(game.locator('.notices[role="status"][aria-live="polite"] .notice[data-kind="restart"]')).toHaveCount(1);
    // The game goes on meanwhile.
    await expect(game.locator("body")).toHaveAttribute("data-status", "at a table");

    // A page that comes in during the drain is told right after its welcome, and shows it over the main menu.
    const late = await (await visitor(browser)).newPage();
    keep(late.context());
    await late.goto("/");
    await expect(late.locator("body")).toHaveAttribute("data-status", "at no table");
    await expect(late.locator('.notice[data-kind="restart"]')).toBeVisible();
    await expect(late.locator(".menu-page")).toBeVisible();

    // The server says so for a proxy or a monitor, and takes no new game.
    expect((await fetch(`${ORIGIN}/health`)).status).toBe(503);
    const refused = await (await visitor(browser)).newPage();
    keep(refused.context());
    await refused.goto("/?solo=2");
    await expect(refused.locator('.notice[data-kind="error"]')).toHaveText("The server is restarting and takes no new games just now.");

    // At the deadline the game is cut: the page shows the connection lost, and the banner, which was about a connection
    // that is gone, is gone with it.
    await expect.poll(async () => game.locator("body").getAttribute("data-status"), { timeout: DRAIN_MS + 15_000 }).toMatch(/^(closed|connecting)$/);
    await expect(game.locator('.notice[data-notice="connection"]')).toHaveText("The connection was lost. Trying again…");
    await expect(banner).toHaveCount(0);

    // And the server leaves of its own accord, with no failure.
    const left = await Promise.race([running.exited, new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000))]);
    expect(left).toEqual({ code: 0, signal: null });
  });
});

test("a server that runs as many games as it may says so in words, to the page that asks for one more", async ({ browser }) => {
  await withServer({ max_running_games: 1 }, async (_running, keep) => {
    const first = await (await visitor(browser)).newPage();
    keep(first.context());
    await first.goto("/?solo=4");
    await expect(first.locator("body")).toHaveAttribute("data-status", "at a table");

    const second = await (await visitor(browser)).newPage();
    keep(second.context());
    await second.goto("/?solo=4");
    await expect(second.locator('.notice[data-kind="error"]')).toHaveText("The server has as many games or tables as it can take. Try again in a few minutes.");
    await expect(second.locator("body")).toHaveAttribute("data-status", "at no table");
  });
});
