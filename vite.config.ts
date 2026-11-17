import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// The commit the build is of: the one the image build is told, else what git says, else none. The image's build context
// has no git history, and a build with no commit says so in About and links to the repository itself.
function buildCommit(): string {
  const told = (process.env.WHIST_WEB_COMMIT ?? "").trim();
  if (told !== "") {
    return told;
  }
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;

export default defineConfig(({ mode }) => ({
  define: {
    __WHIST_WEB_COMMIT__: JSON.stringify(buildCommit()),
    __WHIST_WEB_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5173,
    // The server's submodule holds Drogon, the engine and their builds: files the page never uses.
    watch: { ignored: ["**/libs/**"] },
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8080", ws: true },
    },
  },
  // The dependency scan would otherwise read every HTML file in the repository, the submodule's
  // and the mock-up's included.
  optimizeDeps: { entries: ["index.html"] },
  build: {
    // The look page renders the server's look fixtures with no server, for comparing with the
    // desktop client's pictures. It is built on its own and never shipped.
    outDir: mode === "look" ? "dist-look" : "dist",
    emptyOutDir: true,
    // Everything is a file the server serves: the page's content-security-policy refuses data: URLs.
    assetsInlineLimit: 0,
    ...(mode === "look" ? { rollupOptions: { input: { look: "look.html" } } } : {}),
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
}));
