// End-to-end checks for the level editor (M4.2): painting, undo, the engine's problems on the board, the
// properties, test-play, files and My levels. Every level here is hand-made on a blank board; no curriculum level's
// hints or solution is ever read or typed. Never put a level's contents into a check's message.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sleep } from "./cdp.mjs";
import { buttonHelpers } from "./helpers.mjs";
import { expect } from "./suite.mjs";

const KEY_CODES = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13, Escape: 27, Delete: 46 };
const SHIFT = 8;
const CTRL = 2;

export default async function editorChecks({ browser: b, base, check }) {
  const { clickButton, hasButton } = buttonHelpers(b);
  const text = (selector) => b.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
  const saved = () => b.evaluate(`(() => { const s = JSON.parse(localStorage.getItem('rank-and-file:editor') ?? '{"levels":{}}'); return Object.values(s.levels).map((e) => e.data); })()`);
  const wallCount = async () => (((await saved())[0]?.map ?? "").match(/#/g) ?? []).length;
  const press = async (key, modifiers = 0) => b.key(key, { code: key, keyCode: KEY_CODES[key], modifiers });

  /** Centre of square (x, y), in page coordinates. */
  const centre = (x, y) =>
    b.evaluate(`(() => { const svg = document.querySelector('.ed-board .board'); const m = svg.getScreenCTM(); const rows = (svg.viewBox.baseVal.height - 22) / 64;
      const p = new DOMPoint(22 + ${x} * 64 + 32, (rows - 1 - ${y}) * 64 + 32).matrixTransform(m); return { x: p.x, y: p.y }; })()`);
  const mouse = (type, x, y, button = "left") => b.send("Input.dispatchMouseEvent", { type, x, y, button, buttons: type === "mouseReleased" ? 0 : button === "left" ? 1 : 2, clickCount: 1 });
  const click = async (x, y, button = "left") => {
    const c = await centre(x, y);
    await mouse("mouseMoved", c.x, c.y);
    await mouse("mousePressed", c.x, c.y, button);
    await mouse("mouseReleased", c.x, c.y, button);
    await sleep(120);
  };
  const drag = async (from, to) => {
    const a = await centre(...from);
    const z = await centre(...to);
    await mouse("mouseMoved", a.x, a.y);
    await mouse("mousePressed", a.x, a.y);
    for (let i = 1; i <= 8; i++) await mouse("mouseMoved", a.x + ((z.x - a.x) * i) / 8, a.y + ((z.y - a.y) * i) / 8);
    await mouse("mouseReleased", z.x, z.y);
    await sleep(200);
  };
  const tool = (name) => b.evaluate(`[...document.querySelectorAll('.tool')].find((t) => t.querySelector('.tool-name').textContent === ${JSON.stringify(name)}).click()`);
  const focusBoard = () => b.evaluate(`document.querySelector('.ed-board').focus()`);
  const problemsText = () => text(".ed-problems");
  const settled = async () => {
    // the engine's answer to the draft on screen: Test-play enables, or a problem is listed
    await b.waitFor(`!document.querySelector('.ed-toolbar .btn-primary').disabled || document.querySelector('.problem-link')`, 30_000, "the engine's answer");
    await sleep(100);
  };

  /** A fresh browser profile state, then a new blank level in the editor. */
  async function newLevel() {
    await b.send("Page.navigate", { url: `${base}?fresh=${Date.now()}#/editor` });
    await b.waitFor(`document.querySelector('.editor-list h1')`, 60_000, "My levels");
    await clickButton("New level");
    await b.waitFor(`document.querySelector('.ed-board .board') && document.querySelector('.tool')`, 90_000, "the editor");
    await settled();
    await focusBoard();
  }

  // -- getting in ---------------------------------------------------------------------------------------------
  await check("M4.2: the start menu's Level Editor opens My levels, empty at first", async () => {
    await b.send("Page.navigate", { url: `${base}?fresh=${Date.now()}#/` });
    await b.waitFor(`document.querySelector('.ts-menu')`, 60_000, "the start menu");
    const soon = await b.evaluate(`[...document.querySelectorAll('.ts-item')].find((i) => i.textContent.includes('Level Editor')).classList.contains('soon')`);
    expect(!soon, "the Level Editor entry still says coming soon");
    await b.evaluate(`[...document.querySelectorAll('.ts-item')].find((i) => i.textContent.includes('Level Editor')).click()`);
    await b.waitFor(`document.querySelector('.editor-list h1')`, 30_000, "My levels");
    expect((await text(".my-levels")).includes("haven't made a level"), "an empty list should say so");
    return "opens #/editor";
  });

  await check("M4.2: a new level opens the editor on an 8 x 8 board with the palette from the sprite registry", async () => {
    await newLevel();
    const tools = await b.evaluate(`[...document.querySelectorAll('.tool-name')].map((t) => t.textContent)`);
    for (const wanted of ["Select", "Erase", "Wall", "Pit", "Sign", "Gate", "Timed gate", "Start", "Goal", "Hidden goal", "Patrol", "Rook", "Bishop", "Route"]) expect(tools.includes(wanted), `no ${wanted} in the palette`);
    const size = await b.evaluate(`[...document.querySelectorAll('.ed-size input')].map((i) => i.value).join('x')`);
    expect(size === "8x8", `size ${size}`);
    expect((await problemsText()).includes("None"), "a new level has no problems");
    return `${tools.length} tools, ${size}`;
  });

  // -- painting -----------------------------------------------------------------------------------------------
  await check("M4.2: keys pick a tool, arrows move a cursor and Enter paints; the status line says what happened", async () => {
    await newLevel();
    await b.key("3", { code: "Digit3" }); // Wall
    await press("ArrowRight");
    await press("ArrowUp");
    await press("Enter");
    const status = await text("#ed-status");
    expect(/b2/.test(status) && /wall/i.test(status), `status: ${status}`);
    expect((await wallCount()) === 1, "one wall saved");
    return status;
  });

  await check("M4.2: dragging paints a line, and one Undo takes the whole stroke away; Redo brings it back", async () => {
    await newLevel();
    await tool("Wall");
    await drag([1, 3], [5, 3]);
    expect((await wallCount()) === 5, `walls after the drag: ${await wallCount()}`);
    await clickButton("Undo", ".ed-toolbar");
    await sleep(150);
    expect((await wallCount()) === 0, "the stroke should undo in one step");
    await clickButton("Redo", ".ed-toolbar");
    await sleep(150);
    expect((await wallCount()) === 5, "redo brings it back");
    return "5 squares, one undo step";
  });

  await check("M4.2: Ctrl+Z and Ctrl+Shift+Z undo and redo from the board", async () => {
    await newLevel();
    await tool("Wall");
    await click(2, 2);
    await focusBoard();
    await b.key("z", { code: "KeyZ", modifiers: CTRL });
    await sleep(150);
    expect((await wallCount()) === 0, "ctrl+z should undo");
    await b.key("z", { code: "KeyZ", modifiers: CTRL | SHIFT });
    await sleep(150);
    expect((await wallCount()) === 1, "ctrl+shift+z should redo");
  });

  await check("M4.2: right-click erases, and Shift+arrows with Enter fill a rectangle", async () => {
    await newLevel();
    await tool("Wall");
    await click(3, 3);
    await click(3, 3, "right");
    expect((await wallCount()) === 0, "right-click should erase");
    await focusBoard();
    await press("ArrowRight");
    await press("ArrowUp");
    await press("ArrowRight", SHIFT);
    await press("ArrowRight", SHIFT);
    await press("ArrowUp", SHIFT);
    await press("Enter");
    expect((await wallCount()) === 6, `a 3 x 2 rectangle: ${await wallCount()} walls`);
  });

  await check("M4.2: Escape drops a rectangle first, and opens Settings only when there is none", async () => {
    await newLevel();
    await tool("Wall");
    await focusBoard();
    await press("ArrowRight", SHIFT);
    await press("Escape");
    const dialog = () => b.evaluate(`document.querySelector('.settings-dialog').open`);
    expect(!(await dialog()), "Escape should only drop the rectangle");
    expect(!(await b.evaluate(`!!document.querySelector('.ed-rectangle')`)), "the rectangle should be gone");
    await press("Escape");
    expect(await dialog(), "a second Escape should open Settings");
    await b.evaluate(`document.querySelector('.settings-dialog').close()`);
  });

  await check("M4.2: the start, the goal and a hidden goal move rather than multiply, and say so", async () => {
    await newLevel();
    await tool("Hidden goal");
    await click(6, 6);
    expect((await text("#ed-status")).includes("goal is gone"), "a ? square should replace the goal, and say so");
    await tool("Goal");
    await click(4, 4);
    expect((await text("#ed-status")).includes("squares are gone"), "a goal should replace the ? squares, and say so");
    await tool("Start");
    await click(1, 0);
    const level = (await saved())[0];
    expect(level.map.split("\n").filter(Boolean).pop().startsWith(". P"), "the start moved to b1");
    expect((level.map.match(/P/g) ?? []).length === 1 && (level.map.match(/G/g) ?? []).length === 1, "one start and one goal");
    return "one of each";
  });

  // -- the engine's problems ----------------------------------------------------------------------------------
  await check("M4.2: a rook attacking the start is marked on the board and listed; Test-play waits; fixing it shades the attacks", async () => {
    await newLevel();
    await tool("Rook");
    await click(0, 6);
    await b.waitFor(`document.querySelector('.problem-link')`, 30_000, "the problem");
    expect((await problemsText()).includes("Problems (1)"), "one problem");
    const rings = await b.evaluate(`document.querySelectorAll('.ed-problem').length`);
    expect(rings === 2, `outlines on the start and the rook, got ${rings}`);
    expect(await b.evaluate(`document.querySelector('.ed-toolbar .btn-primary').disabled`), "Test-play should be disabled");
    expect((await b.evaluate(`document.querySelector('.ed-toolbar .btn-primary').title`)).includes("Fix the problem"), "and say why");
    await tool("Select");
    const from = await centre(0, 6);
    const to = await centre(4, 6);
    await mouse("mouseMoved", from.x, from.y);
    await mouse("mousePressed", from.x, from.y);
    await mouse("mouseMoved", to.x, to.y);
    await mouse("mouseReleased", to.x, to.y);
    await settled();
    expect((await problemsText()).includes("None"), "moving the rook away clears the problem");
    const shaded = await b.evaluate(`document.querySelectorAll('.ed-board .attacked').length`);
    expect(shaded > 0, "the squares the rook attacks are shaded once the engine accepts the level");
    return `${shaded} shaded squares`;
  });

  await check("M4.2: clicking a problem goes to its place; a problem with no square (no goal) picks the Goal tool", async () => {
    await newLevel();
    await tool("Erase");
    await click(7, 7); // the goal
    await b.waitFor(`document.querySelector('.problem-link')`, 30_000, "the problem");
    await b.evaluate(`document.querySelector('.problem-link').click()`);
    const active = await b.evaluate(`document.querySelector('.tool.active .tool-name').textContent`);
    expect(active === "Goal", `the active tool is ${active}`);
    await click(7, 7);
    await settled();
    expect((await problemsText()).includes("None"), "placing the goal fixes it");
  });

  await check("M4.2: a smaller board asks first, naming what it would drop; Keep leaves it alone", async () => {
    await newLevel();
    await tool("Rook");
    await click(6, 3);
    await settled();
    const set = (n) => b.evaluate(`(() => { const i = document.querySelectorAll('.ed-size input')[0]; i.value = '${n}'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await set(5);
    const asked = await text(".ed-confirm");
    expect(asked.includes("rook") && asked.includes("goal"), `the question: ${asked}`);
    await clickButton("Keep the size", ".ed-confirm");
    expect((await b.evaluate(`document.querySelectorAll('.ed-size input')[0].value`)) === "8", "the width should still be 8");
    await set(5);
    await clickButton("Yes, make it smaller", ".ed-confirm");
    await sleep(200);
    expect((await b.evaluate(`document.querySelectorAll('.ed-size input')[0].value`)) === "5", "now 5 wide");
    await clickButton("Undo", ".ed-toolbar");
    await sleep(200);
    expect((await b.evaluate(`document.querySelectorAll('.ed-size input')[0].value`)) === "8", "Undo restores the size");
  });

  await check("M4.2: Clear board asks, keeps the start and goal, and can be undone", async () => {
    await newLevel();
    await tool("Wall");
    await click(2, 2);
    await clickButton("Clear board", ".ed-toolbar");
    await clickButton("Yes, clear the board", ".ed-confirm");
    await sleep(150);
    expect((await wallCount()) === 0, "the wall is gone");
    await clickButton("Undo", ".ed-toolbar");
    await sleep(150);
    expect((await wallCount()) === 1, "undo brings it back");
  });

  // -- properties ---------------------------------------------------------------------------------------------
  await check("M4.2: a new sign selects itself; its words can be edited and are saved, and a typing burst is one undo step", async () => {
    await newLevel();
    await tool("Sign");
    await click(3, 5);
    const tab = await text(".props .tab.active");
    expect(tab === "Square", `the ${tab} tab is open`);
    const field = `document.querySelector('.props textarea')`;
    await b.evaluate(`(() => { const t = ${field}; t.focus(); for (const v of ['M', 'Mi', 'Min', 'Mind']) { t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
    await settled(); // the engine's answer arrives while the field is still being used
    expect((await b.evaluate(`document.activeElement === ${field}`)), "typing, and the engine's answer, must not take the cursor out of the field");
    const level = (await saved())[0];
    expect(JSON.stringify(level.legend).includes("Mind"), "the sign's words are saved");
    await clickButton("Undo", ".ed-toolbar");
    await sleep(150);
    expect(!JSON.stringify((await saved())[0].legend ?? {}).includes("Min"), "one Undo takes the whole burst of typing back to the sign's starting words");
  });

  await check("M4.2: the Level tab sets the title (shown in the crumbs), abilities and planks; the Enemy tab changes an enemy", async () => {
    await newLevel();
    await b.evaluate(`(() => { const t = document.querySelector('[data-field="title"] input'); t.value = 'Cross the Courtyard'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(200);
    expect((await text(".crumbs")).includes("Cross the Courtyard"), "the crumb follows the title");
    await b.evaluate(`[...document.querySelectorAll('[data-field="api"] label')].find((l) => l.textContent.includes('wait')).querySelector('input').click()`);
    await sleep(150);
    expect((await saved())[0].api.includes("wait"), "the ability is saved");
    await tool("Patrol");
    await click(2, 2);
    expect((await text(".props .tab.active")) === "Enemy", "a placed enemy opens the Enemy tab");
    await b.evaluate(`(() => { const s = document.querySelector('.props select'); s.value = 'rook'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(200);
    expect((await saved())[0].enemies[0].kind === "rook", "the kind changed");
  });

  await check("M4.2: a patrol's route only takes straight lines, and says why when it refuses", async () => {
    await newLevel();
    await tool("Patrol");
    await click(2, 1);
    await tool("Route");
    await click(2, 4);
    await click(5, 6); // crooked
    expect((await text("#ed-status")).includes("straight"), "a crooked corner is refused with a reason");
    await click(6, 4);
    await settled();
    const enemy = (await saved())[0].enemies[0];
    expect(enemy.route.length === 3, `the route has ${enemy.route.length} corners`);
    expect((await problemsText()).includes("None"), "the engine accepts it");
  });

  // -- keeping and playing ------------------------------------------------------------------------------------
  await check("M4.2: a level survives a reload, and My levels lists it", async () => {
    await newLevel();
    await tool("Wall");
    await click(4, 4);
    await b.send("Page.navigate", { url: `${base}#/editor` });
    await b.waitFor(`document.querySelector('.my-level')`, 30_000, "the list");
    expect((await text(".my-levels")).includes("Untitled level"), "listed");
    await b.evaluate(`document.querySelector('.my-level-open').click()`);
    await b.waitFor(`document.querySelector('.ed-board .board')`, 60_000, "the editor");
    expect((await wallCount()) === 1, "the wall is still there");
  });

  await check("M4.2: Test-play opens the real level screen on the Challenge tab, with no lesson, hints, solution offer or stars, and saves no progress", async () => {
    await newLevel();
    await clickButton("Test-play", ".ed-toolbar");
    await b.waitFor(`document.querySelector('.level[data-level-id]') && !document.querySelector('.level-right .btn-primary').disabled`, 60_000, "the level screen");
    const tabs = await b.evaluate(`[...document.querySelectorAll('.level-left .tab')].filter((t) => !t.hidden).map((t) => t.textContent + (t.classList.contains('active') ? '*' : '')).join(' ')`);
    expect(tabs === "Challenge* Codex", `tabs: ${tabs}`);
    expect(!(await b.evaluate(`!!document.querySelector('.level-left .help')`)), "no hints or solution offer");
    expect(!(await text(".level-left")).includes("Stars"), "no star goals");
    // a hand-made level on a blank board: north to the top, turn right, east to the goal
    await b.evaluate(`document.querySelector('.level-right .cm-content').focus()`);
    await b.key("a", { code: "KeyA", modifiers: CTRL });
    await b.send("Input.insertText", { text: "for _ in range(7):\n    pawn.move()\npawn.turn_right()\nfor _ in range(7):\n    pawn.move()\n" });
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`document.querySelector('.outcome')`, 30_000, "the result");
    await sleep(300);
    expect((await text(".outcome")).includes("Solved"), "solved");
    expect(!(await b.evaluate(`!!document.querySelector('.outcome .stars')`)), "no stars on the outcome");
    const progress = await b.evaluate(`localStorage.getItem('rank-and-file:progress') ?? ''`);
    expect(!progress.includes("my-"), "test-play must not write progress");
    await b.evaluate(`[...document.querySelectorAll('.outcome a')].find((a) => a.textContent.includes('Back to the editor')).click()`);
    await b.waitFor(`document.querySelector('.ed-board .board')`, 30_000, "back in the editor");
    return "solved, no progress saved";
  });

  await check("M4.2: Test-play of a level the engine refuses explains it, with a way back", async () => {
    await newLevel();
    await tool("Rook");
    await click(0, 6);
    await b.waitFor(`document.querySelector('.problem-link')`, 30_000, "the problem");
    const id = await b.evaluate(`location.hash.split('/')[2]`);
    await b.send("Page.navigate", { url: `${base}#/editor/${id}/play` });
    await b.waitFor(`document.querySelector('.notice, .level-middle')`, 60_000, "the level screen");
    await sleep(800);
    expect(await hasButton("← Editor", ".level-right") || (await b.evaluate(`!!document.querySelector('.level-right a[href="#/editor/${id}"]')`)), "a way back to the editor");
  });

  // -- files --------------------------------------------------------------------------------------------------
  await check("M4.2: Export gives a .yaml file named after the title, and Import reads it back as a new level", async () => {
    await newLevel();
    await b.evaluate(`(() => { const t = document.querySelector('[data-field="title"] input'); t.value = 'My Test Level'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await tool("Gem");
    await click(3, 3);
    await b.evaluate(`(() => { window.__saved = []; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { window.__blob = blob; return make(blob); }; HTMLAnchorElement.prototype.click = function () { window.__saved.push(this.download); }; })()`);
    await clickButton("Export", ".ed-toolbar");
    const name = await b.evaluate(`window.__saved[0]`);
    expect(name === "my-test-level.yaml", `file name ${name}`);
    const exported = await b.evaluate(`window.__blob.text()`);
    expect(/^title: My Test Level$/m.test(exported) && /^map: \|$/m.test(exported) && /gem/.test(exported), "the file is a level");
    const dir = mkdtempSync(join(tmpdir(), "rank-and-file-"));
    try {
      const file = join(dir, "imported.yaml");
      writeFileSync(file, exported);
      await b.send("Page.navigate", { url: `${base}#/editor` });
      await b.waitFor(`document.querySelector('.editor-list h1')`, 30_000, "My levels");
      const { root } = await b.send("DOM.getDocument", {});
      const { nodeId } = await b.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
      await b.send("DOM.setFileInputFiles", { files: [file], nodeId });
      await b.waitFor(`location.hash.startsWith('#/editor/') && document.querySelector('.ed-board .board')`, 60_000, "the imported level");
      const levels = await saved();
      expect(levels.length === 2, `${levels.length} levels saved`);
      expect(new Set(levels.map((l) => l.id)).size === 2, "an import is a new level, not the same one");
      expect(levels.every((l) => l.title === "My Test Level"), "the title came across");
      writeFileSync(file, "this: is [not a level");
      await b.send("Page.navigate", { url: `${base}#/editor` });
      await b.waitFor(`document.querySelector('.editor-list h1')`, 30_000, "My levels");
      const doc = await b.send("DOM.getDocument", {});
      const input = await b.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "input[type=file]" });
      await b.send("DOM.setFileInputFiles", { files: [file], nodeId: input.nodeId });
      await b.waitFor(`document.querySelector('.editor-list [role=status]')?.textContent.includes("Couldn't")`, 15_000, "the refusal");
      expect(!(await b.evaluate(`location.hash.startsWith('#/editor/')`)), "a bad file opens nothing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    return name;
  });

  await check("M4.2: copying a lesson level gives its board and rules, and never its hints, starter code or lesson", async () => {
    await b.send("Page.navigate", { url: `${base}?fresh=${Date.now()}#/editor` });
    await b.waitFor(`document.querySelector('.ed-copy select')`, 60_000, "the copy picker");
    await clickButton("Copy it", ".ed-copy");
    await b.waitFor(`document.querySelector('.ed-board .board')`, 60_000, "the copy");
    await settled();
    const [level] = await saved();
    const left = ["hints", "starter", "lesson", "lesson_board", "mastery", "chapter"].filter((key) => key in level);
    expect(left.length === 0, `left in the copy: ${left.join(", ")}`);
    expect(/\(copy\)$/.test(level.title), "titled as a copy");
    expect((await problemsText()).includes("None"), "the engine accepts the copy");
    return "no hints, starter, lesson or chapter";
  });

  await check("M4.2: Duplicate and Delete in My levels (Delete asks first); Reset progress leaves My levels alone", async () => {
    await newLevel();
    await b.send("Page.navigate", { url: `${base}#/editor` });
    await b.waitFor(`document.querySelector('.my-level')`, 30_000, "the list");
    await b.evaluate(`[...document.querySelectorAll('.my-level button')].find((x) => x.textContent === 'Duplicate').click()`);
    await sleep(200);
    expect((await b.evaluate(`document.querySelectorAll('.my-level').length`)) === 2, "two levels after Duplicate");
    expect((await text(".my-levels")).includes("Copy of Untitled level"), "the copy says so");
    // Settings -> Reset progress, confirmed
    await b.evaluate(`document.querySelector('.settings-button').click()`);
    await clickButton("Reset progress…", ".reset-progress");
    await clickButton("Yes, reset", ".reset-progress");
    await sleep(300);
    await b.evaluate(`document.querySelector('.settings-dialog').close()`);
    expect((await b.evaluate(`document.querySelectorAll('.my-level').length`)) === 2, "Reset progress must not touch My levels");
    await b.evaluate(`[...document.querySelectorAll('.my-level button')].find((x) => x.textContent === 'Delete').click()`);
    expect(await b.evaluate(`!!document.querySelector('.ed-confirm .confirm-step')`), "Delete asks first");
    await clickButton("Keep it", ".ed-confirm");
    expect((await b.evaluate(`document.querySelectorAll('.my-level').length`)) === 2, "Keep it keeps the level");
    await b.evaluate(`[...document.querySelectorAll('.my-level button')].find((x) => x.textContent === 'Delete').click()`);
    await clickButton("Yes, delete it", ".ed-confirm");
    await sleep(200);
    expect((await b.evaluate(`document.querySelectorAll('.my-level').length`)) === 1, "one level left");
  });

  // -- looks --------------------------------------------------------------------------------------------------
  await check("M4.2: in a narrow window the board comes first and the columns stack", async () => {
    await newLevel();
    await b.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 1100, deviceScaleFactor: 1, mobile: false });
    try {
      await sleep(400);
      const tops = await b.evaluate(`({ board: document.querySelector('.ed-board').getBoundingClientRect().top, palette: document.querySelector('.ed-left').getBoundingClientRect().top })`);
      expect(tops.board < tops.palette, `the board is at ${Math.round(tops.board)}, the palette at ${Math.round(tops.palette)}`);
      const overflow = await b.evaluate(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
      expect(!overflow, "no sideways scroll");
    } finally {
      await b.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false });
    }
  });

  await check("M4.2: the editor works in the light theme too", async () => {
    await b.evaluate(`localStorage.setItem('rank-and-file:settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('rank-and-file:settings') ?? '{}'), theme: 'light' }))`);
    try {
      await newLevel();
      const scheme = await b.evaluate(`getComputedStyle(document.documentElement).colorScheme`);
      expect(scheme.includes("light"), `colour scheme ${scheme}`);
      await tool("Wall");
      await click(2, 2);
      expect((await wallCount()) === 1, "paints as usual");
    } finally {
      await b.evaluate(`(() => { const s = JSON.parse(localStorage.getItem('rank-and-file:settings') ?? '{}'); delete s.theme; localStorage.setItem('rank-and-file:settings', JSON.stringify(s)); })()`);
    }
  });

  await check("editor checks leave nothing behind", async () => {
    await b.evaluate(`localStorage.clear()`);
  });
}
