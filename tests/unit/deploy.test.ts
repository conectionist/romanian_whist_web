import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

// The files that deploy the page say the same things in several places; these hold them to each other.
describe("the Caddyfile", () => {
  const caddy = read("deploy/Caddyfile");

  it("passes the WebSocket and the server's two status pages to the server", () => {
    expect(caddy).toMatch(/@server path \/ws \/version \/health\b/);
  });

  it("leaves the caching of the server's own answers to the server", () => {
    const other = /@other not path ([^\n]+)/.exec(caddy)?.[1].split(/\s+/);
    expect(other).toEqual(expect.arrayContaining(["/ws", "/version", "/health"]));
  });
});

describe("the commit the page names", () => {
  it("is a build argument of the image, given to the build that makes the page", () => {
    const docker = read("Dockerfile");
    expect(docker).toMatch(/^ARG WHIST_WEB_COMMIT=""$/m);
    expect(docker).toMatch(/WHIST_WEB_COMMIT="\$WHIST_WEB_COMMIT" nice -n 19 npm run build/);
    // After the files are copied, so that a new commit does not make the dependencies install again.
    expect(docker.indexOf("ARG WHIST_WEB_COMMIT")).toBeGreaterThan(docker.indexOf("COPY . ."));
  });

  it("is passed on by the compose file, and by both builds of the image in CI", () => {
    expect(read("compose.yaml")).toMatch(/WHIST_WEB_COMMIT: \$\{WHIST_WEB_COMMIT:-\}/);
    const ci = read(".github/workflows/ci.yml");
    expect(ci.match(/build-args: WHIST_WEB_COMMIT=\$\{\{ [^}]*web_commit \}\}/g)).toHaveLength(2);
    // A pull request's own run is of a merge commit that is not in the repository.
    expect(ci).toContain("github.event.pull_request.head.sha || github.sha");
  });

  it("is looked for in the page by every run of the smoke test in CI", () => {
    const ci = read(".github/workflows/ci.yml");
    const runs = ci.match(/node tools\/smoke\.mjs --url [^\n]+/g) ?? [];
    expect(runs.length).toBeGreaterThanOrEqual(6);
    for (const run of runs) {
      expect(run, run).toContain('--web-commit "$WEB_COMMIT"');
    }
  });
});

describe("the proxy examples in CI", () => {
  it("are the server's as they are: the nginx file that once added the headers is gone", () => {
    expect(read(".github/workflows/ci.yml")).not.toContain("whist-headers.conf");
  });

  it("are stopped, and the server is expected to leave with no failure, after the stack and after the own-proxy runs", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci.match(/test "\$\(docker inspect -f '\{\{\.State\.ExitCode\}\}' whist-server-1\)" = 0/g)).toHaveLength(2);
  });
});
