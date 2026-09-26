// Take one screenshot of the running game, for eyeballing a change.
//
//   node scripts/e2e/screenshot.mjs "http://localhost:5173/#/level/ch01-l03" shot.png [--dark] [--wait=800]
//
// It waits for Python to be ready. Avoid screenshots of solved code (see CLAUDE.md).
import { writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const [url, out = "screenshot.png"] = args.filter((arg) => !arg.startsWith("--"));
const dark = args.includes("--dark");
const wait = Number(args.find((arg) => arg.startsWith("--wait="))?.slice(7) ?? 800);
if (!url) {
  console.error("usage: node scripts/e2e/screenshot.mjs <url> [out.png] [--dark] [--wait=ms]");
  process.exit(2);
}

const browser = await launch();
try {
  if (dark) await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await browser.send("Page.navigate", { url });
  await browser.waitFor(`document.querySelector('.status')?.dataset.state === 'ready'`, 60_000, "Python ready");
  await sleep(wait);
  writeFileSync(out, await browser.screenshot());
  const errors = browser.logs.filter((line) => /exception|error/i.test(line));
  console.log(`saved ${out}${errors.length ? `; console errors:\n${errors.join("\n")}` : ""}`);
} finally {
  await browser.close();
}
