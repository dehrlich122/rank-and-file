import { defineConfig } from "vitest/config";

// Pyodide is not bundled: its runtime files are copied to public/pyodide/ by
// scripts/copy-pyodide.mjs and loaded from there by src/py/worker.ts.
export default defineConfig({
  worker: { format: "es" },
  build: { target: "es2022" },
  test: { include: ["src/**/*.test.ts"] },
});
