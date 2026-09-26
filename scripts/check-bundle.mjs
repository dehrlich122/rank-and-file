// Guards the no-spoiler rule in the production build: reference solutions
// must never be in the main bundle. Each must be in its own lazily loaded
// file, fetched only when the player asks to compare after solving.
//
// It builds into a temporary folder, then looks for each solution's text.
// It reports counts only and never prints a solution.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";

const outDir = mkdtempSync(join(tmpdir(), "rank-and-file-bundle-"));
try {
  // Only the scripts matter here, so skip copying public/ (the 13 MB Python runtime).
  await build({ logLevel: "error", build: { outDir, emptyOutDir: true, copyPublicDir: false } });
  const assets = join(outDir, "assets");
  const scripts = readdirSync(assets)
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({ file, text: readFileSync(join(assets, file), "utf8") }));
  const main = scripts.filter(({ file }) => file.startsWith("index-"));
  const lazy = scripts.filter(({ file }) => !file.startsWith("index-"));

  const problems = [];
  let checked = 0;
  for (const chapter of readdirSync("solutions")) {
    for (const file of readdirSync(join("solutions", chapter)).filter((name) => name.endsWith(".py") && !name.includes(".naive"))) {
      const body = readFileSync(join("solutions", chapter, file), "utf8").trimEnd();
      // As written, or escaped inside a JavaScript string.
      const forms = [body, JSON.stringify(body).slice(1, -1)];
      const found = (list) => list.some(({ text }) => forms.some((form) => text.includes(form)));
      checked += 1;
      if (found(main)) problems.push(`${file} is in the main bundle`);
      else if (!found(lazy)) problems.push(`${file} isn't in any lazily loaded file`);
    }
  }
  if (main.length === 0) problems.push("no main bundle (index-*.js) was built");
  if (problems.length) {
    console.error(`Bundle check failed:\n  ${problems.join("\n  ")}`);
    process.exitCode = 1;
  } else {
    console.log(`Bundle check: ${checked} reference solutions, none in the main bundle, each in its own lazy file.`);
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
