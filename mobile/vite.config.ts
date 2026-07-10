import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-mobile",
    emptyOutDir: true,
  },
  test: {
    exclude: ["e2e/**", "node_modules/**", "dist-mobile/**"],
  },
});
