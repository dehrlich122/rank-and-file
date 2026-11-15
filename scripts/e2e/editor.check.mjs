// End-to-end checks for the level editor (M4.2): painting, undo, the engine's problems on the board, the
// properties, test-play, files and My levels (M4.2); then the rules and hints, other boards, the solvability check,
// the kept solution and the Share dialog (M4.3). Every level here is hand-made on a blank board; no curriculum level's
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
    await b.waitFor(
      `!document.querySelector('.ed-problems')?.textContent.includes('checking') && (!document.querySelector('.ed-toolbar .btn-primary').disabled || document.querySelector('.problem-link'))`,
      30_000,
      "the engine's answer",
    );
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

  await check("M4.2: Test-play opens the real level screen on the Challenge tab, with no lesson, hints or solution offer, its star goals, and saves no progress", async () => {
    await newLevel();
    await clickButton("Test-play", ".ed-toolbar");
    await b.waitFor(`document.querySelector('.level[data-level-id]') && !document.querySelector('.level-right .btn-primary').disabled`, 60_000, "the level screen");
    const tabs = await b.evaluate(`[...document.querySelectorAll('.level-left .tab')].filter((t) => !t.hidden).map((t) => t.textContent + (t.classList.contains('active') ? '*' : '')).join(' ')`);
    expect(tabs === "Challenge* Codex", `tabs: ${tabs}`);
    // (a level with no hints and no kept solution has an empty help panel: M4.3 gave test-play the real one)
    expect((await text(".level-left .help")).trim() === "", "no hints or solution offer");
    expect((await text(".level-left")).includes("Stars"), "test-play shows the star goals, as a player sees them (M4.3)");
    // a hand-made level on a blank board: north to the top, turn right, east to the goal
    await b.evaluate(`document.querySelector('.level-right .cm-content').focus()`);
    await b.key("a", { code: "KeyA", modifiers: CTRL });
    await b.send("Input.insertText", { text: "for _ in range(7):\n    pawn.move()\npawn.turn_right()\nfor _ in range(7):\n    pawn.move()\n" });
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`document.querySelector('.outcome')`, 30_000, "the result");
    await sleep(300);
    expect((await text(".outcome")).includes("Solved"), "solved");
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

  // -- M4.3: the rules, hints, boards, the check, the kept solution and the Share dialog ----------------------------
  // Every level here is hand-made on a blank board, and the programs typed are two-line ones written for it.
  const openTab = (name) => b.evaluate(`[...document.querySelectorAll('.props .tab')].find((t) => t.textContent === ${JSON.stringify(name)}).click()`);
  const fieldBox = (label) => `[...document.querySelectorAll('.props .field')].find((f) => f.querySelector(':scope > .field-label')?.textContent === ${JSON.stringify(label)})`;
  /** Type into a properties-panel field (by its label), as the browser would: focus, new value, an input event. */
  const setValue = (label, value) =>
    b.evaluate(`(() => { const t = ${fieldBox(label)}.querySelector('input, textarea'); t.focus(); t.value = ${JSON.stringify(String(value))}; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const getValue = (label) => b.evaluate(`${fieldBox(label)}.querySelector('input, textarea, select').value`);
  const chooseOption = (label, index) =>
    b.evaluate(`(() => { const s = ${fieldBox(label)}.querySelector('select'); s.selectedIndex = ${index}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const readAloudText = () => text(".rules-read");
  const waitText = (selector, condition, what, ms = 30_000) => b.waitFor(`(() => { const t = document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''; return ${condition}; })()`, ms, what);
  const afterEdit = async () => {
    // the change has reached the engine and its answer is back
    await sleep(150);
    await settled();
  };

  /** A program for the blank 8 x 8 board: north to the top, turn right, east to the goal (written for this board). */
  const SOLVES = "for _ in range(7):\n    pawn.move()\npawn.turn_right()\nfor _ in range(7):\n    pawn.move()\n";
  const FAILS = "pawn.move()\n";

  async function testPlay() {
    await clickButton("Test-play", ".ed-toolbar");
    await b.waitFor(`document.querySelector('.level[data-level-id]') && !document.querySelector('.level-right .btn-primary').disabled`, 60_000, "the level screen");
  }
  async function runProgram(code) {
    await b.evaluate(`document.querySelector('.level-right .cm-content').focus()`);
    await b.key("a", { code: "KeyA", modifiers: CTRL });
    await b.send("Input.insertText", { text: code });
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`document.querySelector('.outcome')`, 30_000, "the result");
    await sleep(300);
  }
  async function backToEditor() {
    await b.evaluate(`document.querySelector('.level-right a[href^="#/editor/"]').click()`);
    await b.waitFor(`document.querySelector('.ed-board .board') && document.querySelector('.props')`, 60_000, "back in the editor");
    await settled();
  }
  /** A new level whose solution has been kept, and the editor on screen again. */
  async function levelWithKeptSolution() {
    await newLevel();
    await testPlay();
    await runProgram(SOLVES);
    expect((await text(".outcome")).includes("Solved"), "the program should solve the blank board");
    await clickButton("Keep this as the level's solution", ".keep-solution");
    await backToEditor();
  }
  const solutionBlock = () => text('[data-field="solution"]');
  const keptLines = async () => {
    await waitText('[data-field="solution"]', `/Kept: \\d+ lines?/.test(t)`, "the kept solution's length");
    return Number(((await solutionBlock()).match(/Kept: (\d+)/) ?? [])[1]);
  };

  await check("M4.3: the Rules tab: Most lines of code and a phrase change what the player will read, and a Must-use box counts", async () => {
    await newLevel();
    await openTab("Rules");
    await waitText(".rules-read", `t.length > 0 && !t.includes('Once the engine accepts')`, "what the player will read");
    const plain = await readAloudText();
    await setValue("Most lines of code", 3);
    await waitText(".rules-read", `t !== ${JSON.stringify(plain)} && !t.includes('Checking')`, "the rules to change");
    const limited = await readAloudText();
    expect(limited.includes("3"), "the rules should name the limit of 3 lines");
    expect((await saved())[0].constraints?.max_lines === 3, "the limit is saved");
    // a phrase objective: added (the panel is rebuilt), worded by the engine, edited, removed
    await clickButton("+ Say a phrase", ".props");
    await waitText(".rules-read", `t !== ${JSON.stringify(limited)} && !t.includes('Checking')`, "the goal to change");
    await b.evaluate(`(() => { const i = document.querySelector('input[aria-label="Phrase 1 to say"]'); i.focus(); i.value = 'Open sesame'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitText(".rules-read", `t.includes('Open sesame')`, "the phrase in the goal");
    expect(JSON.stringify((await saved())[0].objectives).includes("Open sesame"), "the phrase is saved");
    await b.evaluate(`document.querySelector('button[aria-label="Remove phrase 1"]').click()`);
    await waitText(".rules-read", `t === ${JSON.stringify(limited)}`, "the goal to go back");
    expect((await saved())[0].objectives === undefined, "the default goal writes no key");
    // Must use: a checklist whose heading counts what is ticked
    await b.evaluate(`(() => { const d = [...document.querySelectorAll('.props details')].find((x) => x.querySelector('summary').textContent.startsWith('Must use')); d.open = true; [...d.querySelectorAll('label.check')].find((l) => /while/i.test(l.textContent)).querySelector('input').click(); })()`);
    await sleep(150);
    expect((await text('.props details summary')).includes("(1)"), "the heading counts one ticked");
    expect(((await saved())[0].constraints?.require_nodes ?? []).length === 1, "one construct is required in the saved level");
    return "limit, phrase and Must use";
  });

  await check("M4.3: Collect gems = all on a board with no gem is the engine's problem and greys out Test-play; a gem clears it", async () => {
    await newLevel();
    await openTab("Rules");
    await b.evaluate(`[...document.querySelectorAll('[data-field="objectives"] .choice-row')].find((r) => r.querySelector('.field-label').textContent === 'Collect gems').querySelectorAll('input[type=radio]')[1].click()`);
    await b.waitFor(`document.querySelector('.problem-link')`, 30_000, "the problem");
    expect(await b.evaluate(`document.querySelector('.ed-toolbar .btn-primary').disabled`), "Test-play should be disabled");
    await tool("Gem");
    await click(3, 3);
    await settled();
    expect((await problemsText()).includes("None"), "a gem on the board clears it");
    expect(!(await b.evaluate(`document.querySelector('.ed-toolbar .btn-primary').disabled`)), "Test-play is back");
  });

  await check("QA-043: two fields typed in a row both keep their change: the Level tab, the Rules tab, a gate's words, a patrol's clock", async () => {
    await newLevel();
    await setValue("Title", "Two Fields");
    await setValue("Brief", "Reach the far corner.");
    await setValue("What it trains", "Walking");
    let level = (await saved())[0];
    expect(level.title === "Two Fields" && level.brief === "Reach the far corner." && level.trains === "Walking", "title, brief and what-it-trains all saved");
    await openTab("Rules");
    await setValue("Most lines of code", 7);
    await setValue("Par (lines of code)", 4);
    await setValue("Starter code", "# begin here");
    level = (await saved())[0];
    expect(level.constraints?.max_lines === 7 && level.par?.lines === 4 && String(level.starter).includes("begin here"), "limit, par and starter all saved");
    await tool("Gate");
    await click(3, 3);
    await setValue("The answer that opens it", "alpha");
    await setValue("What the guard asks (optional)", "Who goes?");
    const legend = JSON.stringify((await saved())[0].legend);
    expect(legend.includes("alpha") && legend.includes("Who goes?"), "the gate's passphrase and question both saved");
    await tool("Patrol");
    await click(5, 5);
    await chooseOption("Ticks with", 1);
    await b.evaluate(`[...document.querySelectorAll('.props .check')].find((l) => l.textContent.includes('Loops round')).querySelector('input').click()`);
    await sleep(150);
    const patrol = (await saved())[0].enemies[0];
    expect(patrol.clock !== undefined && patrol.loop === true, "the patrol's clock and Loops round both saved");
    // leaving and coming back: the three Level-tab fields are still there
    await b.send("Page.navigate", { url: `${base}#/editor` });
    await b.waitFor(`document.querySelector('.my-level-open')`, 30_000, "the list");
    await b.evaluate(`document.querySelector('.my-level-open').click()`);
    await b.waitFor(`document.querySelector('.ed-board .board') && document.querySelector('.props')`, 60_000, "the editor");
    expect((await getValue("Title")) === "Two Fields" && (await getValue("Brief")) === "Reach the far corner." && (await getValue("What it trains")) === "Walking", "the Level tab fields survived a trip to My levels");
  });

  await check("M4.3: the Hints tab: a tier waits for the one above and keeps its words; test-play offers the hints one at a time", async () => {
    await newLevel();
    await openTab("Hints");
    const areas = (n) => b.evaluate(`document.querySelectorAll('[data-field="hints"] textarea')[${n}].disabled`);
    expect(!(await areas(0)) && (await areas(1)) && (await areas(2)), "only the first hint is open to write at first");
    const write = (n, words) => b.evaluate(`(() => { const t = document.querySelectorAll('[data-field="hints"] textarea')[${n}]; t.focus(); t.value = ${JSON.stringify(words)}; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await write(0, "Look at the edges.");
    expect(!(await areas(1)), "writing the first wakes the second");
    await write(1, "Moves go the way you face.");
    await write(0, "");
    expect(await areas(1), "emptying the first puts the second back to waiting");
    expect((await b.evaluate(`document.querySelectorAll('[data-field="hints"] textarea')[1].value`)) === "Moves go the way you face.", "the second keeps its words");
    await write(0, "Look at the edges.");
    expect((await saved())[0].hints?.length === 2, "two hints are saved");
    await settled();
    await testPlay();
    expect((await text(".help .hints")).includes("Show a hint (1 of 2)"), "the first hint is offered");
    await runProgram(FAILS);
    expect(await hasButton("Need a hint?", ".outcome"), "a failed run offers a hint");
    await b.evaluate(`document.querySelector('.hint-button').click()`);
    expect((await b.evaluate(`document.querySelectorAll('.hint-list li').length`)) === 1, "one hint is open");
    expect((await text(".help .hints")).includes("Show the next hint (2 of 2)"), "the next one is offered");
    await b.evaluate(`document.querySelector('.hint-button').click()`);
    expect((await b.evaluate(`document.querySelectorAll('.hint-list li').length`)) === 2 && !(await b.evaluate(`!!document.querySelector('.hint-button')`)), "both open, and nothing more to offer");
    await runProgram(SOLVES);
    expect((await text(".outcome")).includes("Solved"), "the level can still be solved after hints");
  });

  await check("M4.3: boards: a second board is a copy; paint and a gate's words stay on the board they were made on", async () => {
    await newLevel();
    await tool("Gate");
    await click(3, 3);
    await setValue("The answer that opens it", "alpha");
    await clickButton("+ Add a board", ".board-row");
    await b.waitFor(`document.querySelectorAll('.board-tab').length === 2 && document.querySelectorAll('.board-tab')[1].getAttribute('aria-pressed') === 'true'`, 15_000, "board 2");
    expect((await text("#ed-status")).includes("Board 2"), "the status line names the board");
    await tool("Select");
    await click(3, 3);
    expect((await getValue("The answer that opens it")) === "alpha", "board 2 starts as a copy, gate included");
    await setValue("The answer that opens it", "beta");
    await tool("Wall");
    await click(1, 5);
    let [level] = await saved();
    const walls = (map) => (map.match(/#/g) ?? []).length;
    expect(walls(level.map) === 0 && walls(level.variants[0].map) === 1, "the wall is on board 2 only");
    const board2 = level.variants[0].map;
    // back on board 1: no wall there, the gate keeps its own words
    await b.evaluate(`document.querySelectorAll('.board-tab')[0].click()`);
    await tool("Select");
    await click(3, 3);
    expect((await getValue("The answer that opens it")) === "alpha", "board 1's gate still has its own passphrase");
    await tool("Wall");
    await click(5, 1);
    level = (await saved())[0];
    expect(walls(level.map) === 1 && level.variants[0].map === board2, "a wall on board 1 leaves board 2 as it was");
    await b.evaluate(`document.querySelectorAll('.board-tab')[1].click()`);
    await tool("Select");
    await click(3, 3);
    expect((await getValue("The answer that opens it")) === "beta", "board 2's gate keeps its own passphrase");
    // hidden-goal squares belong to board 1
    await tool("Hidden goal");
    await click(2, 6);
    expect((await text("#ed-status")).includes("only on Board 1"), "a ? square on board 2 is refused, with the reason");
    return "walls and gate words per board";
  });

  await check("M4.3: a problem on board 2 puts a mark on its tab, and clicking the problem switches to that board; Remove asks and Undo restores", async () => {
    await newLevel();
    await clickButton("+ Add a board", ".board-row");
    await b.waitFor(`document.querySelectorAll('.board-tab')[1]?.getAttribute('aria-pressed') === 'true'`, 15_000, "board 2");
    await tool("Erase");
    await click(7, 7); // board 2's goal
    await b.waitFor(`document.querySelector('.problem-link')`, 30_000, "the problem");
    expect(await b.evaluate(`!!document.querySelectorAll('.board-tab')[1].querySelector('.problem-badge')`), "board 2's tab is marked");
    expect(!(await b.evaluate(`!!document.querySelectorAll('.board-tab')[0].querySelector('.problem-badge')`)), "board 1's tab is not");
    expect(await b.evaluate(`document.querySelector('.ed-toolbar .btn-primary').disabled`), "Test-play is greyed");
    await b.evaluate(`document.querySelectorAll('.board-tab')[0].click()`);
    await b.evaluate(`document.querySelector('.problem-link').click()`);
    expect(await b.evaluate(`document.querySelectorAll('.board-tab')[1].getAttribute('aria-pressed') === 'true'`), "the problem took us to board 2");
    // Remove this board asks first; Undo brings it back
    await clickButton("Remove this board", ".board-row");
    expect(await b.evaluate(`!!document.querySelector('.ed-confirm .confirm-step')`), "removing asks first");
    await clickButton("Keep it", ".ed-confirm");
    expect((await b.evaluate(`document.querySelectorAll('.board-tab').length`)) === 2, "Keep it keeps the board");
    await clickButton("Remove this board", ".board-row");
    await clickButton("Yes, remove it", ".ed-confirm");
    await settled();
    expect((await b.evaluate(`document.querySelectorAll('.board-tab').length`)) === 1, "one board left");
    expect((await problemsText()).includes("None"), "the board with the problem is gone");
    await clickButton("Undo", ".ed-toolbar");
    await sleep(200);
    expect((await b.evaluate(`document.querySelectorAll('.board-tab').length`)) === 2, "Undo brings board 2 back");
  });

  await check("M4.3: test-play of a two-board level says the code has to work on all of them", async () => {
    await newLevel();
    await clickButton("+ Add a board", ".board-row");
    await settled();
    await testPlay();
    expect((await text(".level-left")).includes("all 2 boards"), "the Challenge tab says so");
    await runProgram(SOLVES);
    expect((await text(".outcome")).includes("Solved"), "the same program solves both blank boards");
  });

  // -- the check: can it be solved? ----------------------------------------------------------------------------
  const solveText = () => text(".solve-box");
  const pressCheck = async (label = "Check") => {
    await settled();
    await clickButton(label, ".solve-box");
  };

  await check("M4.3: Check on a trivial level reports a route and how many lines of plain calls, never a route", async () => {
    await newLevel();
    await pressCheck();
    await waitText(".solve-box", `t.includes('A route exists')`, "the answer", 60_000);
    const said = await solveText();
    expect(/plain calls do it in \d+ lines?/.test(said), `the answer should count lines: ${said.slice(0, 100)}`);
    expect(!/pawn\.|move\(\)/.test(said), "the check must not show code");
    expect(await b.evaluate(`!!document.querySelector('.solve-mark')`), "the answer carries a mark");
  });

  await check("M4.3: Check on a walled-in goal says no route was found; opening the wall finds one again", async () => {
    await newLevel();
    await tool("Wall");
    await click(6, 7);
    await click(7, 6);
    await pressCheck();
    await waitText(".solve-box", `t.includes('No route found')`, "the no-route answer", 60_000);
    await tool("Erase");
    await click(7, 6);
    expect((await b.evaluate(`!!document.querySelector('.stale-note')`)), "the answer is marked as older");
    await pressCheck("Check again");
    await waitText(".solve-box", `t.includes('A route exists')`, "a route once the wall is open", 60_000);
  });

  await check("M4.3: editing after an answer marks it as for an older version; Check again clears the mark", async () => {
    await newLevel();
    await pressCheck();
    await waitText(".solve-box", `t.includes('A route exists')`, "the answer", 60_000);
    expect(!(await b.evaluate(`!!document.querySelector('.stale-note')`)), "a fresh answer isn't marked");
    await tool("Wall");
    await click(4, 4);
    await waitText(".solve-box", `t.includes('older version of the level')`, "the older-version note");
    expect(await b.evaluate(`!!document.querySelector('.solve-results.stale')`), "the answer fades");
    await pressCheck("Check again");
    await waitText(".solve-box", `t.includes('A route exists') && !t.includes('older version')`, "a fresh answer", 60_000);
  });

  await check("M4.3: Cancel stops a long search and returns to idle; painting during one stops it, with a note", async () => {
    await newLevel();
    const size = (n) => b.evaluate(`(() => { for (const i of document.querySelectorAll('.ed-size input')) { i.value = '${n}'; i.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
    await size(12);
    await sleep(200);
    await tool("Gem");
    for (const [x, y] of [[1, 1], [10, 2], [2, 10], [9, 9], [5, 5], [0, 6], [11, 6], [6, 0], [6, 11], [3, 8]]) await click(x, y);
    await openTab("Rules");
    await b.evaluate(`[...document.querySelectorAll('[data-field="objectives"] .choice-row')].find((r) => r.querySelector('.field-label').textContent === 'Collect gems').querySelectorAll('input[type=radio]')[1].click()`);
    await afterEdit();
    expect((await problemsText()).includes("None"), `the engine should accept the level: ${(await problemsText()).slice(0, 120)}`);
    await pressCheck();
    await waitText(".solve-box", `t.includes('Searching')`, "the search to begin");
    expect(await hasButton("Cancel", ".solve-box"), "a search offers Cancel");
    await clickButton("Cancel", ".solve-box");
    await sleep(300);
    expect(!(await solveText()).includes("Searching"), "Cancel stops the search");
    expect(await hasButton("Check", ".solve-box"), "back to idle: Check is offered again");
    // a change while it searches stops it, and says so
    await pressCheck();
    await waitText(".solve-box", `t.includes('Searching')`, "the second search to begin");
    await tool("Wall");
    await click(8, 8);
    await waitText(".solve-box", `t.includes('The level changed, so the search stopped.')`, "the note");
    expect(!(await solveText()).includes("Searching"), "the search is stopped");
  });

  // -- keeping a solution --------------------------------------------------------------------------------------
  await check("M4.3: a solved test-play offers to keep the program, says Kept, and the Rules tab then shows its length", async () => {
    await newLevel();
    await openTab("Rules");
    expect((await solutionBlock()).includes("Solve the level in test-play"), "before keeping, the Rules tab says how");
    await settled();
    await testPlay();
    await runProgram(FAILS);
    expect(!(await b.evaluate(`!!document.querySelector('.keep-solution')`)), "a failed run offers nothing to keep");
    await runProgram(SOLVES);
    expect(await hasButton("Keep this as the level's solution", ".keep-solution"), "a solved run offers to keep it");
    await clickButton("Keep this as the level's solution", ".keep-solution");
    expect((await text(".keep-solution")).includes("Kept as the level's solution"), "it says Kept");
    expect(typeof (await saved())[0].solution === "string", "the solution is saved with the level");
    await backToEditor();
    await openTab("Rules");
    const lines = await keptLines();
    expect(lines >= 1, "the length is a number of lines");
    expect(await hasButton("Remove", '[data-field="solution"]'), "and it can be removed");
    return `${lines} lines`;
  });

  await check("M4.3: Use my solution's n lines sets par, Undo undoes it, and Remove takes the solution away", async () => {
    await levelWithKeptSolution();
    await openTab("Rules");
    const lines = await keptLines();
    await setValue("Par (lines of code)", lines + 5);
    await sleep(150);
    const button = `Use my solution's ${lines} lines`;
    expect(await hasButton(button, ".props"), "the button names the solution's length");
    await clickButton(button, ".props");
    await sleep(200);
    expect(Number(await getValue("Par (lines of code)")) === lines && (await saved())[0].par?.lines === lines, "par is now the solution's length");
    expect(!(await hasButton(button, ".props")), "the button goes once par matches");
    await clickButton("Undo", ".ed-toolbar");
    await sleep(200);
    expect(Number(await getValue("Par (lines of code)")) === lines + 5, "Undo puts the old par back");
    await clickButton("Remove", '[data-field="solution"]');
    await sleep(200);
    expect(!(await solutionBlock()).includes("Kept:") && (await solutionBlock()).includes("Solve the level in test-play"), "Remove takes the kept solution away");
    expect((await saved())[0].solution === undefined, "and from the saved level");
  });

  await check("M4.3: a level with a kept solution offers it in test-play after three failed runs", async () => {
    await levelWithKeptSolution();
    await testPlay();
    await runProgram(FAILS);
    expect(!(await hasButton("Show me a solution…", ".outcome")), "not offered after one failed run");
    await runProgram(FAILS);
    await runProgram(FAILS);
    expect(await hasButton("Show me a solution…", ".outcome"), "offered after three");
  });

  // -- sharing -------------------------------------------------------------------------------------------------
  const shareChecks = () => b.evaluate(`[...document.querySelectorAll('.share-checks li')].map((li) => li.children[0].textContent)`);
  const openShare = async () => {
    await clickButton("Share…", ".ed-toolbar");
    await b.waitFor(`document.querySelector('.share-dialog')?.open && document.querySelectorAll('.share-checks li').length > 0 && !document.querySelector('.share-checks').textContent.includes('Checking…')`, 60_000, "the share checks");
  };
  const closeShare = () => b.evaluate(`document.querySelector('.share-dialog')?.close()`);

  await check("M4.3: Share with no kept solution is blocked: a clear reason, and the link, code and file are disabled", async () => {
    await newLevel();
    await openShare();
    const marks = await shareChecks();
    expect(marks[0] === "✓" && marks.includes("✗"), `the marks: ${marks.join(" ")}`);
    expect((await text(".share-checks")).includes("No solution kept yet"), "it says why");
    expect(await b.evaluate(`!!document.querySelector('.share-out.blocked')`), "the output is marked blocked");
    const enabled = await b.evaluate(`[...document.querySelectorAll('.share-out input, .share-out textarea, .share-out button')].filter((e) => !e.disabled).length`);
    expect(enabled === 0, `${enabled} controls are enabled`);
    await closeShare();
  });

  await check("M4.3: Share after keeping a solution: every check passes, the link has #/play/rf1. and the code starts rf1.; Copy answers", async () => {
    await levelWithKeptSolution();
    await openShare();
    const marks = await shareChecks();
    expect(marks.length === 3 && marks.every((m) => m === "✓"), `the marks: ${marks.join(" ")}`);
    expect(await b.evaluate(`!document.querySelector('.share-out.blocked')`), "the output is open");
    const link = await b.evaluate(`document.querySelector('.share-out input[aria-label="Link"]').value`);
    const code = await b.evaluate(`document.querySelector('.share-out textarea').value`);
    expect(link.includes("#/play/rf1."), "the link carries the code");
    expect(code.startsWith("rf1."), "the code starts rf1.");
    expect(link.endsWith(code), "the link is the code after #/play/");
    await b.evaluate(`document.querySelector('.share-out button[aria-label="Copy the link"]').click()`);
    await waitText(".share-copy .small[role=status]", `t.length > 0`, "an answer to Copy", 5000);
    await closeShare();
    return "rf1 link and code";
  });

  await check("M4.3: Share with a par below the solution's lines shows a cross and Set par to n fixes it", async () => {
    await levelWithKeptSolution();
    await openTab("Rules");
    const lines = await keptLines();
    await setValue("Par (lines of code)", 1);
    await afterEdit();
    await openShare();
    let marks = await shareChecks();
    expect(marks.includes("✗") && marks[1] === "✓", `the marks: ${marks.join(" ")}`);
    expect(await b.evaluate(`document.querySelector('.share-out.blocked') !== null`), "a failing check blocks the output");
    expect(await hasButton(`Set par to ${lines}`, ".share-checks"), `Set par to ${lines} is offered`);
    await clickButton(`Set par to ${lines}`, ".share-checks");
    await b.waitFor(`document.querySelectorAll('.share-checks li').length > 0 && !document.querySelector('.share-checks').textContent.includes('Checking…')`, 30_000, "the checks again");
    marks = await shareChecks();
    expect(marks.every((m) => m === "✓"), `the marks after Set par: ${marks.join(" ")}`);
    await closeShare();
    expect(Number(await getValue("Par (lines of code)")) === lines, "the editor's par is now the solution's length");
  });

  await check("M4.3: the Share dialog's Download a .yaml file saves the level under its title", async () => {
    await levelWithKeptSolution();
    await b.evaluate(`(() => { window.__saved = []; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { window.__blob = blob; return make(blob); }; HTMLAnchorElement.prototype.click = function () { window.__saved.push(this.download); }; })()`);
    await openShare();
    await clickButton("Download a .yaml file", ".share-out");
    expect((await b.evaluate(`window.__saved[0]`)) === "untitled-level.yaml", "the file is named after the title");
    const file = await b.evaluate(`window.__blob.text()`);
    expect(/^title: Untitled level$/m.test(file) && /^map: \|$/m.test(file), "the file is a level");
    await closeShare();
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
