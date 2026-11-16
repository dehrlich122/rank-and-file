import { defineConfig } from "vitest/config";
import { saveLevelPlugin } from "./scripts/save-level-plugin.ts";

// Pyodide is not bundled: its runtime files are copied to public/pyodide/ by
// scripts/copy-pyodide.mjs and loaded from there by src/py/worker.ts.
export default defineConfig({
  worker: { format: "es" },
  // "Save to the repo" in the level editor: only under `vite dev`, never in a build
  plugins: [saveLevelPlugin(import.meta.dirname)],
  // workers' git worktrees live inside the repo; watching them crashes the dev server while one is being created
  server: { watch: { ignored: ["**/.claude/worktrees/**", "**/drafts/**"] } },
  build: {
    target: "es2022",
    // The main bundle (~650 kB: CodeMirror, marked, yaml) is served locally and
    // loaded once, so Vite's default 500 kB warning isn't useful here.
    chunkSizeWarningLimit: 1000,
  },
  test: { include: ["src/**/*.test.ts", "scripts/save-level-plugin.test.ts"] },
});
