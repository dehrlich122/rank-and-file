// Packages a playable demo: the built game plus demo/ (the install README, the
// check and start scripts, and the two small servers), as a folder and a zip
// in release/ (gitignored).
//
//   npm run demo -- <name> --title "M2 demo: feedback depth"
//   node scripts/package-demo.mjs <name> --title "..." [--root <checkout>] [--no-progress]
//
// --root builds another checkout, e.g. a git worktree of an older tag; the
// demo/ files always come from this one. --no-progress is for builds from
// before progress was saved (M1).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const name = args[0];
if (!name || name.startsWith("--")) {
  console.error('Usage: node scripts/package-demo.mjs <name> --title "..." [--root <checkout>] [--no-progress]');
  process.exit(2);
}
const title = option("--title") ?? name;
const root = resolve(option("--root") ?? here);
const saved = args.includes("--no-progress")
  ? "Your settings (speed, theme, text size, layout and line wrapping) are saved. This version doesn't save solved levels yet."
  : "Your settings, solved levels, stars, opened hints and the code you wrote for each level are saved.";

const out = join(here, "release");
const folder = join(out, name);
rmSync(folder, { recursive: true, force: true });
await build({ root, logLevel: "error", build: { outDir: folder, emptyOutDir: true } });

for (const file of readdirSync(join(here, "demo"))) {
  let text = readFileSync(join(here, "demo", file), "utf8").replace(/\r\n/g, "\n");
  if (file === "README.md") text = text.replaceAll("{{TITLE}}", title).replaceAll("{{SAVED}}", saved);
  if (file.endsWith(".cmd")) text = text.replace(/\n/g, "\r\n"); // batch files need Windows line endings
  writeFileSync(join(folder, file), text);
}

// bsdtar (built into Windows 10+ and macOS) writes a zip when the name ends in
// .zip. On Windows, use the system's own: Git Bash's tar can't write zips.
const zip = join(out, `${name}.zip`);
rmSync(zip, { force: true });
const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
try {
  execFileSync(tar, ["-a", "-c", "-f", zip, "-C", out, name], { stdio: "inherit" });
  console.log(`Packaged ${folder}\n     and ${zip}`);
} catch {
  console.log(`Packaged ${folder}. The zip needs bsdtar (Windows 10+, macOS): zip the folder yourself.`);
  process.exitCode = 1;
}
