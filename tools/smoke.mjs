#!/usr/bin/env node
// Checks a running deployment of the page, and plays the first moments of a solo game through it.
// Usage and profiles: the README, under Deploying with Docker.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { smokeGame, waitForPage } from "../libs/romanian_whist_server/tools/smoke/smoke.mjs";

// The page's content-security-policy. Every place that sends it carries this exact string.
export const PAGE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

// What sends the policy besides the server's own code: the image's Caddyfile and the proxy examples.
const CSP_FILES = [
  "deploy/Caddyfile",
  "libs/romanian_whist_server/deploy/examples/whist.caddy",
  "libs/romanian_whist_server/deploy/examples/nginx/whist-headers.conf",
];

const here = fileURLToPath(new URL("..", import.meta.url));

// The policy each file sends, or null where a file has none or says it more than once.
export function cspCopies(root = here) {
  return CSP_FILES.map((file) => {
    const found = [...readFileSync(`${root}/${file}`, "utf8").matchAll(/Content-Security-Policy[ \t]+"([^"]*)"/g)];
    return { file, csp: found.length === 1 ? found[0][1] : null };
  });
}

const PROFILES = {
  // Our Caddy in front of the page and the server.
  web: { headers: true, woff2: ["font/woff2"], compression: "required", errorCache: "none" },
  // The server alone, serving the page itself.
  server: { headers: false, woff2: ["font/woff2", "application/font-woff2"], compression: "reported", errorCache: "short" },
  // The server behind a proxy that carries the examples' headers.
  proxy: { headers: true, woff2: ["font/woff2", "application/font-woff2"], compression: "reported", errorCache: "none" },
};

const TABLE_CODE = "K7QM4P";
const LONG_CACHE = /immutable|max-age=([1-9]\d{5,})/;

async function get(baseUrl, path, headers = {}) {
  const response = await fetch(new URL(path, baseUrl), { headers, redirect: "manual", signal: AbortSignal.timeout(10000) });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, body };
}

// Runs every check, so that one run shows all that is wrong. A check throws to fail.
export async function checkPage(baseUrl, profileName, { serverCommit, timeoutMs = 10000, log = console.log } = {}) {
  const profile = PROFILES[profileName];
  if (profile === undefined) {
    throw new Error(`unknown profile "${profileName}", expected one of ${Object.keys(PROFILES).join(", ")}`);
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

  await check("compression of the script", async () => {
    const response = await get(baseUrl, script, { "accept-encoding": "gzip" });
    const encoding = response.headers.get("content-encoding");
    if (profile.compression === "required") {
      expectEqual("content-encoding", encoding, "gzip");
    }
    return `content-encoding: ${encoding ?? "none"}`;
  });

  if (profile.headers) {
    await check("the content-security-policy is the page's, on every kind of answer", async () => {
      // /version is the server's answer, which the proxy passes on.
      for (const path of ["/", `/t/${TABLE_CODE}`, script, "/avatars.json", "/assets/nope.js", "/nope.svg", "/version"]) {
        const response = await get(baseUrl, path);
        expectEqual(`the policy of ${path} (${response.status})`, response.headers.get("content-security-policy"), PAGE_CSP);
        expectEqual(`x-content-type-options of ${path}`, response.headers.get("x-content-type-options"), "nosniff");
        expectEqual(`referrer-policy of ${path}`, response.headers.get("referrer-policy"), "no-referrer");
      }
    });

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
  }

  // A caching rule on an error would keep a fault in a browser for as long. Where the caching rules
  // are ours, an error has none; the server alone may set its own, which must not be long.
  const noRule = profile.errorCache === "none";
  await check(noRule ? "an error answer has no caching rule" : "an error answer is never cached for long", async () => {
    for (const path of ["/assets/nope.js", "/nope.svg", `/t/${TABLE_CODE.toLowerCase()}`, "/ws"]) {
      const response = await get(baseUrl, path);
      if (response.status < 400) {
        throw new Error(`${path} gave ${response.status}, expected an error`);
      }
      const cache = response.headers.get("cache-control") ?? "";
      if (noRule ? cache !== "" : LONG_CACHE.test(cache)) {
        throw new Error(`${path} (${response.status}) has cache-control: ${cache}`);
      }
    }
  });

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
  return checkPage(values.url, values.profile, { serverCommit: values["server-commit"], timeoutMs });
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
