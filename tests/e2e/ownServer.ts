import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Browser, type BrowserContext } from "@playwright/test";

// A server of a test's own, on a port of its own, for what the one the other tests share must not do: stop, or
// run with settings of its own.
const SERVER = process.env.WHIST_SERVER ?? "libs/romanian_whist_server/build/server/app/whist_server";

export interface Running {
  process: ChildProcess;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  output(): string;
  folder: string;
}

export const originOf = (port: number) => `http://127.0.0.1:${port}`;

// What the server printed, to go with a failure: a test that only says a notice did not show leaves nothing to look at.
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

async function start(port: number, settings: Record<string, number>): Promise<Running> {
  const folder = mkdtempSync(join(tmpdir(), "whist-own-"));
  const config = join(folder, "server.json");
  // The limits per address are lifted, as in server.json: every page here is the one address.
  writeFileSync(
    config,
    JSON.stringify({
      port,
      document_root: "dist",
      log_level: "warn",
      max_connections_per_ip: 1000,
      tables_per_ip_per_hour: 100000,
      failed_joins_per_ip: 100000,
      max_instant_games: 1000,
      max_instant_games_per_ip: 1000,
      max_tables: 100000,
      messages_per_second: 1000,
      message_burst: 2000,
      ...settings,
    }),
  );
  const child = spawn(SERVER, ["--config", config], { stdio: ["ignore", "pipe", "pipe"] });
  let text = "";
  child.stdout?.on("data", (chunk) => (text += String(chunk)));
  child.stderr?.on("data", (chunk) => (text += String(chunk)));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  const running = { process: child, exited, output: () => text, folder };
  try {
    await expect.poll(async () => fetch(`${originOf(port)}/health`).then((response) => response.status, () => 0), { timeout: 15_000 }).toBe(200);
  } catch (error) {
    await stop(running);
    throw withOutput(error, running);
  }
  return running;
}

// Runs a test against a server of its own, whose output goes with any failure, and which is gone, and its port free,
// when it is over.
export async function withServer(
  port: number,
  settings: Record<string, number>,
  body: (running: Running, keep: (context: BrowserContext) => void) => Promise<void>,
): Promise<void> {
  const running = await start(port, settings);
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

// A browser that has been through the language dialog, and shows the table with no motion.
export async function visitor(browser: Browser, port: number): Promise<BrowserContext> {
  const origin = originOf(port);
  return browser.newContext({
    baseURL: origin,
    storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: "whist.language", value: "en" }, { name: "whist.pace", value: "off" }] }] },
  });
}
