// Runs a Python module from the project's virtual environment, on Windows or POSIX:
//   node scripts/venv.mjs pytest -k runner      (what `npm run test:py -- -k runner` does)
//   node scripts/venv.mjs ruff check
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const python =
  process.platform === "win32"
    ? join(root, ".venv", "Scripts", "python.exe")
    : join(root, ".venv", "bin", "python");

if (!existsSync(python)) {
  console.error(
    ".venv not found. Create it with:\n" +
      "  py -3.14 -m venv .venv   (Windows)   or   python3.14 -m venv .venv\n" +
      "  then install dev requirements:  .venv/Scripts/python -m pip install -r requirements-dev.txt",
  );
  process.exit(1);
}

const result = spawnSync(python, ["-m", ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
