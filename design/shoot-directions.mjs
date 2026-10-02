// M3.7 step 0, round 3: one screenshot of the four directions page. Needs `npm run dev`.
//   node design/shoot-directions.mjs [out.png]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { launch, sleep } from "../scripts/e2e/cdp.mjs";

const out = process.argv[2] ?? join(import.meta.dirname, "..", "docs", "M3", "M3.7", "shots", "round3-directions.png");
const browser = await launch({ width: 1840, height: 1000 });
try {
  await browser.send("Emulation.setScrollbarsHidden", { hidden: true });
  await browser.send("Page.navigate", { url: "http://localhost:5173/design/directions.html" });
  await browser.waitFor(`document.querySelectorAll('.dir .board').length === 4`, 60_000, "four boards");
  await browser.evaluate(`document.fonts.ready.then(() => true)`);
  await sleep(500);
  const size = await browser.evaluate(`({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })`);
  const { data } = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, ...size, scale: 1 } });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(data, "base64"));
  console.log(`saved ${out}`);
  const problems = browser.logs.filter((line) => /exception|error/i.test(line) && !/status of 404/.test(line));
  if (problems.length) console.log(`console problems:\n${problems.slice(0, 8).join("\n")}`);
} finally {
  await browser.close();
}
