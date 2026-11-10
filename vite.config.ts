import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
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
