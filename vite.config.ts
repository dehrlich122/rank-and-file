import { defineConfig } from "vitest/config";

// Pyodide is not bundled: its runtime files are copied to public/pyodide/ by
// scripts/copy-pyodide.mjs and loaded from there by src/py/worker.ts.
export default defineConfig({
  worker: { format: "es" },
  build: {
    target: "es2022",
    // The main bundle (~650 kB: CodeMirror, marked, yaml) is served locally and
    // loaded once, so Vite's default 500 kB warning isn't useful here.
    chunkSizeWarningLimit: 1000,
  },
  test: { include: ["src/**/*.test.ts"] },
});
