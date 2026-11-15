// End-to-end checks for shared levels (M4.3): what a player meets when a level arrives by link or code, and the lists
// that keep it. Every level here is hand-made in this file on a blank corridor, and its code is made in the page by
// the app's own codec (`import()` of src/share/codec.ts), so these checks need the Vite dev server (`npm run dev`),
// not `npm run play`. The code typed into editors is code for these hand-made levels only. Never put editor contents
// or a level's solution into a check's message or return value.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sleep } from "./cdp.mjs";
import { levelHelpers } from "./helpers.mjs";
import { expect } from "./suite.mjs";

const WALK = "pawn.move()\npawn.move()\n"; // solves the corridor below
const FAIL = "pawn.fly()\n"; // fails every level here
const EVIL = "<img src=x onerror=window.__pwned=1>";

/** A level of three squares in a row, the piece facing east. `extra` replaces or adds keys. */
const corridor = (title, extra = {}) => ({
  id: "claimed-by-the-author",
  title,
  brief: "Walk east to the goal.",
  map: "P . G",
  start: { facing: "east" },
  api: ["move"],
  par: { lines: 2 },
  hints: ["Look at the row.", "Move twice.", "Call the move ability two times."],
  ...extra,
});

export default async function shareChecks({ browser: b, base, root, check }) {
  const { setCode, clickButton, hasButton } = levelHelpers(b, base, root);
  const text = (selector) => b.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
  const stored = (key) => b.evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
  const storedJson = async (key) => JSON.parse((await stored(key)) ?? "null");
  const keptLevels = async () => Object.keys((await storedJson("rank-and-file:shared"))?.levels ?? {});
  const drafts = async () => Object.values((await storedJson("rank-and-file:editor"))?.levels ?? {}).map((entry) => entry.data);

  /** A share code for a hand-made level, made by the app's own codec in the page. */
  const codeFor = (level) =>
    b.evaluate(`import(${JSON.stringify(`${base}src/share/codec.ts`)}).then((codec) => codec.encodeLevel(${JSON.stringify(level)}))`);

  const goto = (hash, { fresh = false } = {}) =>
    fresh ? b.send("Page.navigate", { url: `${base}?fresh=${Date.now()}${hash}` }) : b.evaluate(`location.hash = ${JSON.stringify(hash)}`);

  /** Wait for a shared level's screen to be ready to run; returns its `shared-…` id. */
  async function sharedReady() {
    await b.waitFor(
      `document.querySelector('.level[data-level-id^="shared-"] .board .piece') && !document.querySelector('.level-right .btn-primary').disabled`,
      60_000,
      "the shared level",
    );
    return b.evaluate(`document.querySelector('.level').dataset.levelId`);
  }
  async function openCode(code, options) {
    await goto(`#/play/${code}`, options);
    return sharedReady();
  }
  const myLevels = async () => {
    await goto("#/editor");
    await b.waitFor(`document.querySelector('.editor-list .my-levels-title')`, 30_000, "My levels");
  };
  /** The rows of "Shared with me": their text. */
  const sharedRows = () => b.evaluate(`[...document.querySelectorAll('.my-levels')[1].querySelectorAll('.my-level')].map((li) => li.textContent)`);

  async function run() {
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`!document.querySelector('.outcome-host').textContent.includes('Running')`, 20_000, "run finished");
    await b.evaluate(`(() => { const e = document.querySelectorAll('.playback-buttons button')[4]; if (!e.disabled) e.click(); })()`);
    await b.waitFor(`document.querySelector('.outcome-host .outcome')`, 30_000, "outcome card");
    return b.evaluate(`({
      head: document.querySelector('.outcome-head strong').textContent,
      buttons: [...document.querySelectorAll('.outcome-host .outcome-head a, .outcome-host .outcome-head button')].map((e) => e.textContent),
      stars: document.querySelectorAll('.outcome-host .stars li.earned').length,
    })`);
  }
  const solve = async () => {
    await setCode(WALK);
    return run();
  };
  const failOnce = async () => {
    await setCode(FAIL);
    return run();
  };

  // A first load, so the page can import the codec.
  await b.send("Page.navigate", { url: `${base}?fresh=${Date.now()}#/editor` });
  await b.waitFor(`document.querySelector('.editor-list h1')`, 60_000, "My levels");

  const withSolution = corridor("Corridor Walk", { solution: WALK });
  const withoutSolution = corridor("Quiet Corridor");

  // -- 1: a link opens the level -------------------------------------------------------------------------------
  await check("M4.3: a link opens the shared level with its banner and crumbs, on the Challenge tab, and it is kept in Shared with me", async () => {
    const id = await openCode(await codeFor(withSolution), { fresh: true });
    expect(/^shared-[0-9a-f]{12}$/.test(id), `id ${id}`);
    const banner = await text(".shared-banner");
    expect(banner.includes("Shared level") && (await hasButton("Open in the editor", ".shared-banner")), "the banner and its remix button");
    const crumbs = await text(".crumbs");
    expect(crumbs === "Shared level/Corridor Walk", `crumbs: ${crumbs}`);
    const tabs = await b.evaluate(`[...document.querySelectorAll('.level .tabs .tab')].map((t) => ({ label: t.textContent, shown: t.offsetParent !== null, active: t.classList.contains('active') }))`);
    const learn = tabs.find((t) => t.label === "Learn");
    const challenge = tabs.find((t) => t.label === "Challenge");
    expect(!learn?.shown, "no Learn tab for a shared level");
    expect(challenge?.shown && challenge.active, "the Challenge tab is open");
    expect((await text(".level-left")).includes("Walk east to the goal."), "the author's brief is on the Challenge tab");
    await myLevels();
    const rows = await sharedRows();
    expect(rows.length === 1 && rows[0].includes("Corridor Walk"), "kept in Shared with me");
    await b.evaluate(`document.querySelectorAll('.my-levels')[1].querySelector('.my-level-open').click()`);
    expect(await sharedReady() === id, "opening it from the list reaches the same level");
    expect((await b.evaluate(`location.hash`)) === `#/shared/${id}`, "the list links to #/shared/<id>");
    expect(await hasButton("Open in the editor", ".shared-banner"), "the banner again");
    return "link, crumbs, tabs, list";
  });

  // -- 2: a claimed curriculum id ------------------------------------------------------------------------------
  await check("M4.3: a level claiming id ch01-l01 opens as itself and its progress never touches the curriculum's", async () => {
    const claim = corridor("Not Chapter One", { id: "ch01-l01" });
    await b.send("Page.navigate", { url: `${base}?fresh=${Date.now()}#/editor` });
    await b.waitFor(`document.querySelector('.editor-list h1')`, 60_000, "My levels");
    const before = await stored("rank-and-file:progress");
    const id = await openCode(await codeFor(claim));
    expect(id !== "ch01-l01" && id.startsWith("shared-"), `opened as ${id}`);
    expect((await text(".crumbs")) === "Shared level/Not Chapter One", "its own title, not Chapter 1's");
    expect((await b.evaluate(`document.title`)).startsWith("Not Chapter One"), "the page title is its own");
    const r = await solve();
    expect(r.head === "Solved!", `outcome ${r.head}`);
    const sharedStore = await storedJson("rank-and-file:shared-progress");
    expect(sharedStore?.[id]?.stars > 0, "stars are recorded under the shared id");
    const after = await storedJson("rank-and-file:progress");
    expect(!JSON.parse(before ?? "{}")["ch01-l01"] && !after?.["ch01-l01"], "the curriculum's ch01-l01 is untouched");
    expect(!(sharedStore && "ch01-l01" in sharedStore), "nothing is recorded under ch01-l01");
    return `opened as a shared level, ${sharedStore[id].stars} stars kept apart`;
  });

  // -- 3: codes that can't be opened ---------------------------------------------------------------------------
  await check("M4.3: damaged codes, non-codes, over-long codes and levels the engine refuses give a plain page with a reason, and none is kept", async () => {
    await b.send("Page.navigate", { url: `${base}?fresh=${Date.now()}#/editor` });
    await b.waitFor(`document.querySelector('.editor-list h1')`, 60_000, "My levels");
    const good = await codeFor(withSolution);
    const cases = {
      "cut off": good.slice(0, good.length - 12),
      "changed in the middle": `${good.slice(0, 20)}!!!${good.slice(23)}`,
      "not a code": "hello-this-is-not-a-code",
      "over 20,000 characters": `rf1.${"A".repeat(20_000)}`,
      "two goals": await codeFor(corridor("Two Goals", { map: "G P G" })),
      "an unknown ability": await codeFor(corridor("Odd Ability", { api: ["move", "fly"] })),
    };
    const reasons = [];
    for (const [name, code] of Object.entries(cases)) {
      await myLevels(); // away first, so a page left over from the last case is never mistaken for this one
      await goto(`#/play/${code}`);
      await b.waitFor(`document.querySelector('.editor-missing h1')`, 30_000, `the page for: ${name}`);
      const h1 = await text(".editor-missing h1");
      const reason = (await text(".editor-missing p")).trim();
      expect(h1 === "This level can't be opened", `${name}: heading "${h1}"`);
      expect(reason.length > 10, `${name}: a reason is given`);
      expect(await b.evaluate(`!!document.querySelector('.editor-missing a[href="#/editor"]')`), `${name}: a way back`);
      expect(!(await b.evaluate(`document.querySelector('.level')`)), `${name}: no level screen`);
      reasons.push(`${name}: ${reason.slice(0, 40)}`);
    }
    const kept = await keptLevels();
    expect(kept.length === 0, `${kept.length} refused levels were kept`);
    return reasons.join(" | ");
  });

  // -- 4: the author's solution after three failed runs --------------------------------------------------------
  await check("M4.3: three failed runs on a shared level with a solution offer it, and the comparison is the author's", async () => {
    await openCode(await codeFor(withSolution), { fresh: true });
    const offered = [];
    for (let i = 0; i < 3; i++) {
      await failOnce();
      offered.push(await hasButton("Show me a solution…", ".outcome-host"));
    }
    expect(JSON.stringify(offered) === "[false,false,true]", `offered after runs 1-3: ${JSON.stringify(offered)}`);
    await clickButton("Show me a solution…", ".outcome-host");
    await b.evaluate(`document.querySelector('.give-up-button').click()`);
    expect(await b.evaluate(`!!document.querySelector('.solution-section .confirm-step')`), "the offer asks first");
    expect(!(await b.evaluate(`!!document.querySelector('.compare-dialog')`)), "nothing is shown before the answer");
    await clickButton("Show it", ".solution-section .confirm-step");
    await b.waitFor(`!!document.querySelector('.compare-dialog .compare-idiomatic .cm-line')`, 10_000, "the comparison");
    const title = await text(".compare-dialog .dialog-head h2");
    expect(title.includes("the author's solution"), `dialog title: ${title}`);
    await b.key("Escape");
    return title;
  });

  await check("M4.3: a shared level without a solution offers none, however many runs fail", async () => {
    await openCode(await codeFor(withoutSolution), { fresh: true });
    for (let i = 0; i < 3; i++) await failOnce();
    expect(!(await hasButton("Show me a solution…", ".outcome-host")), "no offer on the outcome card");
    expect(await b.evaluate(`!document.querySelector('.give-up-button') && !document.querySelector('.give-up-note')`), "no offer in the Solution section");
    expect(await hasButton("Need a hint?", ".outcome-host"), "hints are still offered");
  });

  // -- 5: solving ----------------------------------------------------------------------------------------------
  await check("M4.3: solving a shared level records stars in shared progress, offers Shared with me and no next level, and the list shows the stars", async () => {
    const id = await openCode(await codeFor(withSolution), { fresh: true });
    const r = await solve();
    expect(r.head === "Solved!" && r.stars >= 1, `outcome ${r.head}, ${r.stars} stars`);
    expect(r.buttons.includes("← Shared with me"), `buttons: ${r.buttons.join(" / ")}`);
    expect(!r.buttons.some((label) => /Next level|Back to Lessons/.test(label)), "no way onward into the curriculum");
    const progress = await storedJson("rank-and-file:shared-progress");
    expect(progress?.[id]?.stars === r.stars, "the stars are in shared progress");
    expect(!(await storedJson("rank-and-file:progress"))?.[id], "and not in the curriculum's");
    await b.evaluate(`document.querySelector('.outcome-host a[href="#/editor"]').click()`);
    await b.waitFor(`document.querySelector('.editor-list .my-levels-title')`, 30_000, "My levels");
    const rows = await sharedRows();
    expect(rows.length === 1 && rows[0].includes("★") && !rows[0].includes("not solved yet"), `list row: ${rows[0]}`);
    return `${r.stars} stars, list shows ★`;
  });

  // -- 6: remix ------------------------------------------------------------------------------------------------
  await check("M4.3: Open in the editor makes a remix draft titled (remix) that carries no solution", async () => {
    await openCode(await codeFor(withSolution), { fresh: true });
    await clickButton("Open in the editor", ".shared-banner");
    await b.waitFor(`location.hash.startsWith('#/editor/') && document.querySelector('.ed-board .board')`, 60_000, "the editor");
    const title = await b.evaluate(`document.querySelector('[data-field="title"] input').value`);
    expect(title === "Corridor Walk (remix)", `title: ${title}`);
    await clickButton("Rules", ".props .tabs");
    await b.waitFor(`document.querySelector('[data-field="solution"]')`, 10_000, "the Rules tab");
    const solutionField = await text('[data-field="solution"]');
    expect(!solutionField.includes("Kept:"), "the remix shows a kept solution");
    const made = (await drafts()).filter((d) => d.title === "Corridor Walk (remix)");
    expect(made.length === 1 && !("solution" in made[0]), "the saved draft has no solution key");
    return "remix without a solution";
  });

  // -- 7: My levels: opening, junk, removing -------------------------------------------------------------------
  await check("M4.3: My levels opens a pasted link or a bare code, rejects junk, and Remove asks first and removes only the entry", async () => {
    await b.send("Page.navigate", { url: `${base}?fresh=${Date.now()}#/editor` });
    await b.waitFor(`document.querySelector('.editor-list h1')`, 60_000, "My levels");
    const open = async (value) => {
      await clickButton("Open a link or code", ".editor-list");
      await b.evaluate(`(() => { const i = document.querySelector('#link-or-code'); i.value = ${JSON.stringify(value)}; })()`);
      await clickButton("Open", ".editor-list form");
    };
    await open(`${base}#/play/${await codeFor(withSolution)}`);
    await sharedReady();
    await myLevels();
    const bare = await codeFor(withoutSolution);
    await open(bare);
    const id = await sharedReady();
    const r = await solve();
    expect(r.head === "Solved!", "the second level can be solved");
    await myLevels();
    await clickButton("Open a link or code", ".editor-list");
    await b.evaluate(`document.querySelector('#link-or-code').value = 'just some words'`);
    await clickButton("Open", ".editor-list form");
    const notice = await text(".editor-list [role=status]");
    expect(notice.includes("isn't a link or code") && (await b.evaluate(`location.hash`)) === "#/editor", `notice: ${notice}`);
    expect((await sharedRows()).length === 2, "both opened levels are listed");

    const progressBefore = await stored("rank-and-file:shared-progress");
    const draftsBefore = await stored("rank-and-file:editor");
    const removeQuiet = `[...document.querySelectorAll('.my-levels')[1].querySelectorAll('.my-level')].find((li) => li.textContent.includes('Quiet Corridor')).querySelector('[aria-label^="Remove"]').click()`;
    await b.evaluate(removeQuiet);
    expect(await b.evaluate(`!!document.querySelector('.ed-confirm .confirm-step')`), "Remove asks first");
    await clickButton("Keep it", ".ed-confirm");
    expect((await sharedRows()).length === 2, "Keep it keeps the level");
    await b.evaluate(removeQuiet);
    await clickButton("Yes, remove it", ".ed-confirm");
    await sleep(150);
    const rows = await sharedRows();
    expect(rows.length === 1 && rows[0].includes("Corridor Walk"), "only the removed entry went");
    expect(!(await keptLevels()).includes(id), "gone from the kept levels");
    expect((await stored("rank-and-file:shared-progress")) === progressBefore, "Remove leaves the stars alone");
    expect((await stored("rank-and-file:editor")) === draftsBefore, "Remove leaves My levels alone");
    return "link, bare code, junk notice, remove";
  });

  // -- 8: Reset progress ---------------------------------------------------------------------------------------
  await check("M4.3: Settings -> Reset progress clears a shared level's stars but keeps it in Shared with me", async () => {
    const id = await openCode(await codeFor(withSolution), { fresh: true });
    const r = await solve();
    expect(r.head === "Solved!", "solved first");
    await myLevels();
    expect((await sharedRows())[0].includes("★"), "stars before the reset");
    await b.evaluate(`document.querySelector('.settings-button').click()`);
    await clickButton("Reset progress…", ".reset-progress");
    await clickButton("Yes, reset", ".reset-progress");
    await sleep(300);
    await b.evaluate(`document.querySelector('.settings-dialog').close()`);
    expect(!(await storedJson("rank-and-file:shared-progress"))?.[id]?.stars, "the stars are cleared");
    await goto("#/");
    await myLevels();
    const rows = await sharedRows();
    expect(rows.length === 1 && rows[0].includes("Corridor Walk"), "the level is still listed");
    expect(rows[0].includes("not solved yet"), `list row: ${rows[0]}`);
    expect((await keptLevels()).includes(id), "still kept");
    return "stars cleared, level kept";
  });

  // -- 9: importing a file with a solution ---------------------------------------------------------------------
  await check("M4.3: importing a .yaml file that carries a solution keeps none of it", async () => {
    await b.send("Page.navigate", { url: `${base}?fresh=${Date.now()}#/editor` });
    await b.waitFor(`document.querySelector('.editor-list h1')`, 60_000, "My levels");
    const dir = mkdtempSync(join(tmpdir(), "rank-and-file-"));
    try {
      const file = join(dir, "carried.yaml");
      writeFileSync(
        file,
        ["title: Carried Corridor", "brief: Walk east to the goal.", "map: |", "  P . G", "start: {facing: east}", "api: [move]", "solution: |", "  pawn.move()", "  pawn.move()", ""].join("\n"),
      );
      const { root: doc } = await b.send("DOM.getDocument", {});
      const { nodeId } = await b.send("DOM.querySelector", { nodeId: doc.nodeId, selector: "input[type=file]" });
      await b.send("DOM.setFileInputFiles", { files: [file], nodeId });
      // either the editor opens on the import, or My levels stays and says it was added (QA-044)
      await b.waitFor(
        `(location.hash.startsWith('#/editor/') && document.querySelector('.ed-board .board')) || [...document.querySelectorAll('.editor-list [role=status]')].some((s) => s.textContent.includes('solution was left out'))`,
        60_000,
        "the import",
      );
      let how = "opened the editor";
      if (!(await b.evaluate(`location.hash.startsWith('#/editor/')`))) {
        how = "stayed on My levels";
        const notice = await text(".editor-list [role=status]");
        expect(/Its solution was left out/.test(notice), `notice: ${notice}`);
        await b.evaluate(`[...document.querySelectorAll('.my-levels')[0].querySelectorAll('.my-level-open')].find((a) => a.textContent.includes('Carried Corridor')).click()`);
      }
      await b.waitFor(`location.hash.startsWith('#/editor/') && document.querySelector('.ed-board .board')`, 60_000, "the imported level");
      await clickButton("Rules", ".props .tabs");
      await b.waitFor(`document.querySelector('[data-field="solution"]')`, 10_000, "the Rules tab");
      expect(!(await text('[data-field="solution"]')).includes("Kept:"), "the import shows a kept solution");
      const made = (await drafts()).filter((d) => d.title === "Carried Corridor");
      expect(made.length === 1 && !("solution" in made[0]), "the saved draft has no solution key");
      return how;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // -- 10: text stays text -------------------------------------------------------------------------------------
  await check("M4.3: markup in a shared level's title, brief, hints and solution is shown as literal text, and no image is ever made", async () => {
    const level = corridor(`${EVIL}Evil`, {
      brief: `Walk east. ${EVIL}`,
      trains: EVIL,
      hints: [`${EVIL} first`, "Move twice.", "Call move two times."],
      solution: `# ${EVIL}\n${WALK}`,
    });
    const noMarkup = async (where) => {
      // CodeMirror puts its own empty `img.cm-widgetBuffer` into a line that has a placeholder; that is not an image.
      const images = await b.evaluate(`document.querySelectorAll('img:not(.cm-widgetBuffer)').length`);
      const handlers = await b.evaluate(`document.querySelectorAll('[onerror], [src="x"]').length`);
      const ran = await b.evaluate(`window.__pwned !== undefined`);
      expect(images === 0 && handlers === 0 && !ran, `${where}: ${images} img elements, ${handlers} elements with the attack's attributes, script ran: ${ran}`);
    };
    await openCode(await codeFor(level), { fresh: true });
    expect((await text(".crumbs")).includes(EVIL), "the title shows as text in the crumbs");
    expect((await text(".level-left")).includes(`Walk east. ${EVIL}`), "the brief shows as text");
    await clickButton("Show a hint (1 of 3)", ".level-left");
    expect((await text(".hint-list")).includes(`${EVIL} first`), "the hint shows as text");
    await noMarkup("the level screen");
    for (let i = 0; i < 3; i++) await failOnce();
    await clickButton("Show me a solution…", ".outcome-host");
    await b.evaluate(`document.querySelector('.give-up-button').click()`);
    await clickButton("Show it", ".solution-section .confirm-step");
    await b.waitFor(`!!document.querySelector('.compare-dialog .compare-idiomatic .cm-line')`, 10_000, "the comparison");
    await noMarkup("the comparison");
    await b.key("Escape");
    await myLevels();
    expect((await sharedRows())[0].includes(EVIL), "the list shows the title as text");
    await noMarkup("My levels");
    return "no img, no script";
  });
}
