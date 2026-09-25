// Copies the Pyodide runtime (CPython compiled to WebAssembly) out of
// node_modules into public/pyodide/, so the game is served entirely from this
// machine and works offline. Runs automatically after `npm install`.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pyodide");
const dest = join(root, "public", "pyodide");

// Type definitions, source maps, demo consoles and package metadata are not needed at runtime.
const skip = (name) =>
  name.endsWith(".d.ts") ||
  name.endsWith(".map") ||
  name.endsWith(".html") ||
  name === "README.md" ||
  name === "package.json";

if (!existsSync(src)) {
  console.error("copy-pyodide: node_modules/pyodide not found; run `npm install` first.");
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
const copied = [];
for (const name of readdirSync(src)) {
  if (skip(name)) continue;
  cpSync(join(src, name), join(dest, name));
  copied.push(name);
}
console.log(`copy-pyodide: copied ${copied.length} files to public/pyodide/`);
