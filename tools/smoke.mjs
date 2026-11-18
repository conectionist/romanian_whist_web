#!/usr/bin/env node
// Checks a running deployment of the page, and plays the first moments of a solo game through it.
// Usage and profiles: the README, under Checking a deployment.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { smokeGame, waitForPage } from "../libs/romanian_whist_server/tools/smoke/smoke.mjs";

// The page's content-security-policy. Every place that sends it carries this exact string.
export const PAGE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

// Every place that sends the policy: the image's Caddyfile and the server's own header file, which holds
// it as a bare string literal.
const CSP_FILES = [
  { file: "deploy/Caddyfile", pattern: /Content-Security-Policy[ \t]+"([^"]*)"/g },
  { file: "libs/romanian_whist_server/server/app/PageHeaders.h", pattern: /contentSecurityPolicy\s*=\s*"([^"]*)"/g },
];

const here = fileURLToPath(new URL("..", import.meta.url));

// The policy each file sends, or null where a file has none or says it more than once.
export function cspCopies(root = here) {
  return CSP_FILES.map(({ file, pattern }) => {
    const found = [...readFileSync(`${root}/${file}`, "utf8").matchAll(pattern)];
    return { file, csp: found.length === 1 ? found[0][1] : null };
  });
}

// The server sends the page's headers and caching rules itself, so every profile is held to them. What differs is
// what stands in front of it.
const PROFILES = {
  // Our Caddy in front of the page and the server.
  web: { woff2: ["font/woff2"], compression: "required", noServerHeader: true },
  // The server alone, serving the page itself.
  server: { woff2: ["font/woff2", "application/font-woff2"], compression: "reported", noServerHeader: true },
  // The server behind a proxy that forwards everything, as the examples do. Caddy and nginx each name themselves in a
  // Server header of their own, which the examples leave be.
  proxy: { woff2: ["font/woff2", "application/font-woff2"], compression: "reported", noServerHeader: false },
};

const TABLE_CODE = "K7QM4P";
const KEPT = /public|immutable|max-age=[1-9]|s-maxage=[1-9]/;
// What the answers about the server itself say, so that no cache keeps one.
const NOT_STORED = /(^|,\s*)no-store(\s*,|$)/;

async function get(baseUrl, path, headers = {}) {
  const response = await fetch(new URL(path, baseUrl), { headers, redirect: "manual", signal: AbortSignal.timeout(10000) });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, body };
}

// Whether the script holds exactly this commit, as the build writes it: a whole string, in quotes, so that a commit
// that is the start of the one written, such as the hash of a build marked -dirty, does not pass for it.
export function scriptHoldsCommit(text, commit) {
  const escaped = commit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(["'\`])${escaped}\\1`).test(text);
}

// The answer to a WebSocket handshake, whose headers are the 101's: fetch cannot read them, since it never hands the
// upgraded connection over.
function handshake(baseUrl) {
  const url = new URL("/ws", baseUrl);
  const request = (url.protocol === "https:" ? https : http).request(url, {
    headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": randomBytes(16).toString("base64") },
    timeout: 10000,
  });
  return new Promise((resolve, reject) => {
    request.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode, headers: new Headers(Object.entries(response.headers).map(([name, value]) => [name, String(value)])) });
    });
    request.on("response", (response) => {
      response.resume();
      reject(new Error(`/ws answered ${response.statusCode} to a handshake, not 101`));
    });
    request.on("timeout", () => request.destroy(new Error("/ws did not answer a handshake in time")));
    request.on("error", reject);
    request.end();
  });
}

// Runs every check, so that one run shows all that is wrong. A check throws to fail.
export async function checkPage(baseUrl, profileName, { serverCommit, webCommit, timeoutMs = 10000, log = console.log } = {}) {
  const profile = PROFILES[profileName];
  if (profile === undefined) {
    throw new Error(`unknown profile "${profileName}", expected one of ${Object.keys(PROFILES).join(", ")}`);
  }
  for (const [name, value] of [["--server-commit", serverCommit], ["--web-commit", webCommit]]) {
    if (value !== undefined && value.trim() === "") {
      throw new Error(`${name} is empty, which would match any page: leave it out to skip that check`);
    }
  }
  let failures = 0;
  const check = async (name, run) => {
    try {
      const note = await run();
      log(`ok   ${name}${note ? ` (${note})` : ""}`);
    } catch (error) {
      failures += 1;
      log(`FAIL ${name}: ${error.message}`);
    }
  };
  const expectEqual = (what, got, want) => {
    if (got !== want) {
      throw new Error(`${what} is ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    }
  };
  const expectOk = async (path, types) => {
    const response = await get(baseUrl, path);
    expectEqual(`${path} status`, response.status, 200);
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!types.includes(type)) {
      throw new Error(`${path} is ${JSON.stringify(type)}, expected ${types.join(" or ")}`);
    }
    return response;
  };

  await waitForPage(baseUrl, { timeoutMs });

  let index;
  let script;
  await check("GET / gives the page", async () => {
    index = await expectOk("/", ["text/html"]);
    script = /\/assets\/[^"']+\.js/.exec(index.body.toString("utf8"))?.[0];
    if (script === undefined) {
      throw new Error("the page names no script under /assets/");
    }
    return script;
  });
  if (index === undefined) {
    return failures;
  }

  await check(`GET /t/${TABLE_CODE} gives the same page`, async () => {
    const link = await expectOk(`/t/${TABLE_CODE}`, ["text/html"]);
    if (!link.body.equals(index.body)) {
      throw new Error("the body differs from /");
    }
  });
  for (const path of [`/t/${TABLE_CODE.toLowerCase()}`, `/t/${TABLE_CODE}1`]) {
    await check(`GET ${path} is not found`, async () => expectEqual("status", (await get(baseUrl, path)).status, 404));
  }

  await check("the file types", async () => {
    await expectOk(script, ["text/javascript", "application/javascript"]);
    const css = /\/assets\/[^"']+\.css/.exec(index.body.toString("utf8"))?.[0];
    if (css === undefined) {
      throw new Error("the page names no stylesheet under /assets/");
    }
    await expectOk(css, ["text/css"]);
    await expectOk("/portraits/man-stubble.webp", ["image/webp"]);
    await expectOk("/portraits/man-hat-mustache.svg", ["image/svg+xml"]);
    await expectOk("/avatars.json", ["application/json"]);
    await expectOk("/fonts/alegreya-sans/AlegreyaSans-Regular.woff2", profile.woff2);
  });

  await check("the manifest and its icons, which the page names", async () => {
    const link = /<link rel="manifest" href="([^"]+)"/.exec(index.body.toString("utf8"))?.[1];
    if (link === undefined) {
      throw new Error("the page names no manifest");
    }
    const manifest = await expectOk(link, ["application/json", "application/manifest+json"]);
    const icons = JSON.parse(manifest.body.toString("utf8")).icons ?? [];
    if (icons.length === 0) {
      throw new Error("the manifest has no icons");
    }
    for (const icon of icons) {
      await expectOk(icon.src, ["image/png"]);
    }
  });

  await check("compression of the script", async () => {
    const response = await get(baseUrl, script, { "accept-encoding": "gzip" });
    const encoding = response.headers.get("content-encoding");
    if (profile.compression === "required") {
      expectEqual("content-encoding", encoding, "gzip");
    }
    return `content-encoding: ${encoding ?? "none"}`;
  });

  await check("the content-security-policy is the page's, on every kind of answer", async () => {
    const policyOf = (what, status, headers) => {
      expectEqual(`the policy of ${what} (${status})`, headers.get("content-security-policy"), PAGE_CSP);
      expectEqual(`x-content-type-options of ${what}`, headers.get("x-content-type-options"), "nosniff");
      expectEqual(`referrer-policy of ${what}`, headers.get("referrer-policy"), "no-referrer");
    };
    // /version, /health and /ws are the server's answers, which a proxy passes on: /ws without the handshake is its
    // refusal, and with it the 101.
    for (const path of ["/", `/t/${TABLE_CODE}`, script, "/avatars.json", "/assets/nope.js", "/nope.svg", "/version", "/health", "/ws"]) {
      const response = await get(baseUrl, path);
      policyOf(path, response.status, response.headers);
    }
    const upgraded = await handshake(baseUrl);
    policyOf("the WebSocket's handshake", upgraded.status, upgraded.headers);
  });

  if (profile.noServerHeader) {
    await check("no answer says what server it is", async () => {
      const said = [];
      for (const path of ["/", `/t/${TABLE_CODE}`, script, "/nope.svg", "/version", "/health", "/ws"]) {
        const server = (await get(baseUrl, path)).headers.get("server");
        if (server !== null) {
          said.push(`${path}: ${server}`);
        }
      }
      const upgraded = (await handshake(baseUrl)).headers.get("server");
      if (upgraded !== null) {
        said.push(`the WebSocket's handshake: ${upgraded}`);
      }
      if (said.length > 0) {
        throw new Error(`a server header was sent: ${said.join(", ")}`);
      }
    });
  }

  await check("the caching rules", async () => {
    const rules = [
      ["/", "no-cache"],
      [`/t/${TABLE_CODE}`, "no-cache"],
      [script, "public, max-age=31536000, immutable"],
      ["/avatars.json", "public, max-age=3600"],
    ];
    for (const [path, want] of rules) {
      expectEqual(`cache-control of ${path}`, (await get(baseUrl, path)).headers.get("cache-control"), want);
    }
  });

  // A caching rule on an error would keep a fault in a browser for as long, so an error is never given one.
  await check("an error answer is not kept by a cache", async () => {
    for (const path of ["/assets/nope.js", "/nope.svg", `/t/${TABLE_CODE.toLowerCase()}`, "/ws"]) {
      const response = await get(baseUrl, path);
      if (response.status < 400) {
        throw new Error(`${path} gave ${response.status}, expected an error`);
      }
      const cache = response.headers.get("cache-control") ?? "";
      if (KEPT.test(cache)) {
        throw new Error(`${path} (${response.status}) has cache-control: ${cache}`);
      }
    }
  });

  await check("/health says the server is up, and /version what runs, and neither is cached", async () => {
    const health = await expectOk("/health", ["application/json"]);
    expectEqual("the health", JSON.stringify(JSON.parse(health.body.toString("utf8"))), JSON.stringify({ status: "ok" }));
    const version = await expectOk("/version", ["application/json"]);
    const told = JSON.parse(version.body.toString("utf8"));
    for (const field of ["version", "commit", "protocol"]) {
      if (!(field in told)) {
        throw new Error(`/version has no ${field}`);
      }
    }
    if (serverCommit !== undefined) {
      expectEqual("the server's commit in /version", told.commit, serverCommit);
    }
    for (const [path, response] of [["/health", health], ["/version", version]]) {
      const cache = response.headers.get("cache-control") ?? "";
      if (!NOT_STORED.test(cache)) {
        throw new Error(`${path} has cache-control: ${JSON.stringify(cache)}, expected no-store`);
      }
    }
    return `version ${told.version}, commit ${told.commit || "none"}, protocol ${told.protocol}`;
  });

  if (webCommit !== undefined) {
    // The commit is in the page's one script, where the build put it for About and the footer's links.
    await check("the page was built from the commit it was given", async () => {
      const text = (await get(baseUrl, script)).body.toString("utf8");
      if (!scriptHoldsCommit(text, webCommit)) {
        throw new Error(`the script does not hold exactly ${webCommit}`);
      }
    });
  }

  await check("a solo game is played through /ws", async () => {
    const seen = await smokeGame(baseUrl, { commit: serverCommit, timeoutMs });
    return `server ${seen.version}, commit ${seen.commit || "none"}, a ${seen.prompt} was asked`;
  });

  return failures;
}

async function main() {
  const { values } = parseArgs({
    options: {
      url: { type: "string", default: "http://127.0.0.1:8000" },
      profile: { type: "string" },
      "server-commit": { type: "string" },
      "web-commit": { type: "string" },
      timeout: { type: "string", default: "10" },
      copies: { type: "boolean", default: false },
    },
  });

  if (values.copies) {
    let failures = 0;
    for (const { file, csp } of cspCopies()) {
      const same = csp === PAGE_CSP;
      failures += same ? 0 : 1;
      console.log(`${same ? "ok  " : "FAIL"} ${file} sends the page's policy${same ? "" : `, not ${JSON.stringify(csp)}`}`);
    }
    return failures;
  }

  const timeoutMs = Number(values.timeout) * 1000;
  if (!(timeoutMs > 0)) {
    throw new Error("--timeout must be a number of seconds above 0");
  }
  if (values.profile === undefined) {
    throw new Error(`--profile is required: ${Object.keys(PROFILES).join(", ")}`);
  }
  return checkPage(values.url, values.profile, { serverCommit: values["server-commit"], webCommit: values["web-commit"], timeoutMs });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (failures) => process.exit(failures === 0 ? 0 : 1),
    (error) => {
      console.error(`FAIL ${error.message}`);
      process.exit(1);
    },
  );
}
