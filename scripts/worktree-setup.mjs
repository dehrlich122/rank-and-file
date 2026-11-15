// Makes a worker's git worktree ready for `npm run check` (docs/WORKFLOW.md):
//   npm run worktree:setup
// Claude Code copies node_modules/, .venv/ and public/pyodide/ into new worktrees
// (.worktreeinclude). This checks they arrived and copies any that didn't from the main
// checkout. In the main checkout itself it does nothing.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const python = process.platform === "win32" ? join(".venv", "Scripts", "python.exe") : join(".venv", "bin", "python");
// Each folder, with a file that shows it is complete.
const needed = [
  ["node_modules", join("node_modules", "vite", "package.json")],
  [".venv", python],
  [join("public", "pyodide"), join("public", "pyodide", "pyodide.mjs")],
];

const commonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root })
  .toString()
  .trim();
const main = dirname(resolve(commonDir));
if (resolve(main) === resolve(root)) {
  console.log("worktree-setup: this is the main checkout; nothing to do");
  process.exit(0);
}

const copied = [];
for (const [folder, marker] of needed) {
  if (existsSync(join(root, marker))) continue;
  if (!existsSync(join(main, marker))) {
    console.error(`worktree-setup: ${folder} is missing in the main checkout too; run npm install there first`);
    process.exit(1);
  }
  cpSync(join(main, folder), join(root, folder), { recursive: true });
  copied.push(folder);
}

const lock = (dir) => readFileSync(join(dir, "package-lock.json"), "utf8");
if (lock(root) !== lock(main)) {
  console.warn("worktree-setup: package-lock.json differs from the main checkout's; workers must not change dependencies");
}
console.log(`worktree-setup: ok${copied.length ? ` (copied ${copied.join(", ")} from the main checkout)` : ""}`);
