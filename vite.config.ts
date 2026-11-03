import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    port: 5173,
    // The server's submodule holds Drogon, the engine and their builds: files the page never uses.
    watch: { ignored: ["**/libs/**"] },
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8080", ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
