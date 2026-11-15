// End-to-end checks for Free Play (M4.4): the hub and its five pages, the tags and the filters on My levels, the
// Sandbox, the Skins gallery, Shared with me in its new home, the pointers from the promotion screen and Lessons, and
// "Save to the repo". Every level here is hand-made on a blank board (a few are shared by a code made in the page by
// the app's own codec, so those checks need the Vite dev server, like share.check.mjs). The programs typed are
// one-line moves written for these boards. Never put editor contents into a check's message or return value.
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sleep } from "./cdp.mjs";
import { buttonHelpers, levelHelpers } from "./helpers.mjs";
import { expect } from "./suite.mjs";

const SETTINGS = "rank-and-file:settings";
// Chapter 6's five core levels solved: the pawn tier is cleared and the knight is unlocked (as in ui.check.mjs)
const SOLVED_CHAPTER_6 = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`ch06-l0${n}`, { stars: 3, hints: 0, failedRuns: 0, helped: false, solutionSeen: false, code: null }]));

const WALK = "pawn.move()\npawn.move()\n"; // solves the corridor below
const corridor = (title) => ({
  id: "claimed-by-the-author",
  title,
  brief: "Walk east to the goal.",
  map: "P . G",
  start: { facing: "east" },
  api: ["move"],
  par: { lines: 2 },
  hints: ["Look at the row.", "Move twice.", "Call the move ability two times."],
});

export default async function freeChecks({ browser: b, base, root, check }) {
  const { setCode } = levelHelpers(b, base, root);
  const { clickButton, hasButton } = buttonHelpers(b);
  const text = (selector) => b.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
  const exists = (selector) => b.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
  const goto = (hash) => b.evaluate(`location.hash = ${JSON.stringify(hash)}`);
  const load = (hash, { fresh = false } = {}) => b.send("Page.navigate", { url: `${base}?${fresh ? "fresh" : "reload"}=${Date.now()}${hash}` });
  const setStorage = (key, value) => b.evaluate(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))}); true`);
  const hash = () => b.evaluate(`location.hash`);
  const crumbs = () => text(".crumbs");
  /** Whether the screen's heading (h1) is the focused element. */
  const headingFocused = () => b.evaluate(`document.activeElement === document.querySelector('main h1') || document.activeElement?.tagName === 'H1'`);

  const editorReady = () => b.waitFor(`document.querySelector('.ed-board .board') && document.querySelector('.tool') && document.querySelector('[data-field="difficulty"] select')`, 90_000, "the editor");
  const myLevelsReady = () => b.waitFor(`location.hash === '#/editor' && document.querySelector('.editor-list h1')`, 30_000, "My levels");
  /** Settled: the engine has answered for the draft on screen (Test-play enables). */
  const settled = async () => {
    await b.waitFor(`!document.querySelector('.ed-problems')?.textContent.includes('checking') && !document.querySelector('.ed-toolbar .btn-primary').disabled`, 30_000, "the engine's answer");
    await sleep(100);
  };

  /**
   * Fresh profile, then one blank level in the editor for each difficulty given (each set from the Level tab's select),
   * ending on My levels. The editor saves as it goes, so leaving at once keeps the change.
   */
  async function makeLevels(difficulties) {
    await load("#/editor", { fresh: true });
    await myLevelsReady();
    for (const step of difficulties) {
      await clickButton("New level");
      await editorReady();
      await settled();
      await setDifficulty(step);
      await goto("#/editor");
      await myLevelsReady();
    }
  }
  async function setDifficulty(step) {
    await b.evaluate(`(() => { const s = document.querySelector('[data-field="difficulty"] select'); s.selectedIndex = ${step}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(200);
  }

  const rows = () => b.evaluate(`document.querySelectorAll('.my-levels .my-level').length`);
  /** Each My levels row's difficulty step (a string), or null when it has none, in list order. */
  const steps = () => b.evaluate(`[...document.querySelectorAll('.my-levels .my-level')].map((li) => li.querySelector('.diff-tag')?.dataset.step ?? null)`);
  /** Choose a value in the list-controls row's select labelled `label`. */
  const control = (label, value) =>
    b.evaluate(`(() => {
      const s = [...document.querySelectorAll('.list-controls label')].find((l) => l.firstChild.textContent === ${JSON.stringify(label)})?.querySelector('select');
      if (!s) throw new Error(${JSON.stringify(`no ${label} control`)});
      s.value = ${JSON.stringify(value)};
      s.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  const controlValue = (label) =>
    b.evaluate(`[...document.querySelectorAll('.list-controls label')].find((l) => l.firstChild.textContent === ${JSON.stringify(label)})?.querySelector('select').value`);

  // -- the hub --------------------------------------------------------------------------------------------------
  await check("M4.4: the start menu's Free Play opens the hub: five rows with counts, crumbs 'Free Play', the heading focused", async () => {
    await load("#/", { fresh: true });
    await b.waitFor(`document.querySelector('.ts-menu')`, 60_000, "the start menu");
    const soon = await b.evaluate(`[...document.querySelectorAll('.ts-item')].find((i) => i.textContent.includes('Free Play')).classList.contains('soon')`);
    expect(!soon, "Free Play still says coming soon");
    await b.evaluate(`[...document.querySelectorAll('.ts-item')].find((i) => i.textContent.includes('Free Play')).click()`);
    await b.waitFor(`document.querySelector('.free-play .fp-row')`, 30_000, "the hub");
    expect((await hash()) === "#/free", `hash ${await hash()}`);
    const found = await b.evaluate(`[...document.querySelectorAll('.fp-row')].map((r) => ({ section: r.dataset.section, name: r.querySelector('strong').textContent, count: r.querySelector('.fp-count').textContent.trim(), href: r.getAttribute('href') }))`);
    expect(found.map((r) => r.section).join() === "challenges,levels,shared,sandbox,skins", `rows: ${found.map((r) => r.section)}`);
    expect(found.map((r) => r.name).join() === "Challenges,My levels,Shared with me,Sandbox,Skins", `names: ${found.map((r) => r.name)}`);
    expect(found.every((r) => r.count.length > 0), "every row has a count");
    expect((await crumbs()) === "Free Play", `crumbs: ${await crumbs()}`);
    expect(await headingFocused(), "the heading is focused");
    expect((await text(".free-title")) === "Free Play", "the heading says Free Play");
    return found.map((r) => `${r.name}: ${r.count}`).join(" | ");
  });

  // -- each section opens from its row ----------------------------------------------------------------------------
  await check("M4.4: each of the five rows opens its page with the right heading, crumbs starting 'Free Play' and the heading focused", async () => {
    const pages = [
      { section: "challenges", hash: "#/free/challenges", heading: "Challenges" },
      { section: "levels", hash: "#/editor", heading: "My levels" },
      { section: "shared", hash: "#/free/shared", heading: "Shared with me" },
      { section: "sandbox", hash: "#/free/sandbox", heading: "Sandbox" },
      { section: "skins", hash: "#/free/skins", heading: "Skins" },
    ];
    await load("#/free", { fresh: true });
    const seen = [];
    for (const page of pages) {
      await b.waitFor(`document.querySelector('.fp-row[data-section="${page.section}"]')`, 60_000, "the hub");
      await b.evaluate(`document.querySelector('.fp-row[data-section="${page.section}"]').click()`);
      await b.waitFor(`location.hash === ${JSON.stringify(page.hash)} && document.querySelector('main h1')?.textContent === ${JSON.stringify(page.heading)}`, 30_000, `the ${page.heading} page`);
      const trail = await crumbs();
      expect(trail === `Free Play/${page.heading}`, `${page.heading}: crumbs "${trail}"`);
      expect(await headingFocused(), `${page.heading}: the heading is focused`);
      // the first crumb is a way back to the hub
      expect(await exists('.crumbs a[href="#/free"]'), `${page.heading}: Free Play crumb links to the hub`);
      seen.push(page.heading);
      await goto("#/free");
    }
    return seen.join(", ");
  });

  // -- Challenges ----------------------------------------------------------------------------------------------
  await check("M4.4: Challenges lists The Last Rank with its Pawn tier tag and says its challenges are coming soon; the filter row is there", async () => {
    await load("#/free/challenges", { fresh: true });
    await b.waitFor(`document.querySelector('.set-head')`, 30_000, "the Challenges page");
    expect((await text(".set-head h2")) === "The Last Rank", `set: ${await text(".set-head h2")}`);
    const tag = await text(".set-head .tier-tag");
    expect(tag.includes("Pawn"), `tier tag: ${tag}`);
    expect((await text(".free-play")).includes("Its challenges are coming soon."), "the coming soon line");
    expect(!(await exists(".ch-row")), "no challenge rows until M4.5 adds them");
    const labels = await b.evaluate(`[...document.querySelectorAll('.list-controls label')].map((l) => l.firstChild.textContent).join()`);
    expect(labels === "Tier,Difficulty,Sort", `controls: ${labels}`);
    const tiers = await b.evaluate(`[...document.querySelector('.list-controls select').options].map((o) => o.textContent).join()`);
    expect(tiers === "Any,Pawn", `tier options: ${tiers}`);
    return `The Last Rank, ${tag.trim()}`;
  });

  // -- the Difficulty select reaches My levels ----------------------------------------------------------------------
  await check("M4.4: the editor's Difficulty select reaches My levels: each row has its difficulty tag, and a Pawn tier tag once the engine answers", async () => {
    await makeLevels([2, 5]);
    expect((await rows()) === 2, `${await rows()} rows`);
    const found = (await steps()).sort().join();
    expect(found === "2,5", `difficulty tags: ${found}`);
    await b.waitFor(`document.querySelectorAll('.my-levels .my-level .tier-tag').length === 2`, 30_000, "both tier tags");
    const tiers = await b.evaluate(`[...document.querySelectorAll('.my-levels .my-level .tier-tag')].map((t) => t.textContent).join()`);
    expect(/^♟ Pawn,♟ Pawn$/.test(tiers), `tier tags: ${tiers}`);
    const label = await b.evaluate(`document.querySelector('.my-levels .diff-tag[data-step="5"]').getAttribute('aria-label')`);
    expect(label.startsWith("Difficulty 5 of 5"), `aria-label: ${label}`);
    // the editor kept it: the select shows the same step when the level is opened again
    await b.evaluate(`document.querySelector('.my-levels .my-level:has(.diff-tag[data-step="5"]) .my-level-open').click()`);
    await editorReady();
    const shown = await b.evaluate(`document.querySelector('[data-field="difficulty"] select').selectedIndex`);
    expect(shown === 5, `the select shows index ${shown}`);
    return "2 and 5, both Pawn";
  });

  // -- filters and sort --------------------------------------------------------------------------------------------
  await check("M4.4: the filters narrow My levels, Hardest first sorts, and the choices survive leaving and coming back", async () => {
    await makeLevels([2, 5]);
    expect((await rows()) === 2, "two levels to start");
    await control("Difficulty", "5");
    expect((await rows()) === 1 && (await steps()).join() === "5", `difficulty 5: ${await rows()} rows (${await steps()})`);
    await control("Difficulty", "3");
    expect((await rows()) === 0 && (await text(".my-levels")).includes("No levels match these filters."), "difficulty 3 matches nothing and says so");
    await control("Difficulty", "");
    expect((await rows()) === 2, "Any brings both back");
    await control("Sort", "hardest");
    expect((await steps()).join() === "5,2", `hardest first: ${await steps()}`);
    await control("Sort", "easiest");
    expect((await steps()).join() === "2,5", `easiest first: ${await steps()}`);
    await control("Sort", "hardest");
    await control("Difficulty", "5");
    // leave and come back, inside the page session
    await goto("#/free");
    await b.waitFor(`document.querySelector('.fp-row')`, 30_000, "the hub");
    await goto("#/editor");
    await myLevelsReady();
    const state = { difficulty: await controlValue("Difficulty"), sort: await controlValue("Sort") };
    expect(state.difficulty === "5" && state.sort === "hardest", `controls after coming back: ${JSON.stringify(state)}`);
    expect((await rows()) === 1 && (await steps()).join() === "5", `rows after coming back: ${await steps()}`);
    await control("Difficulty", "");
    await control("Sort", "order");
    return "narrowed to one, sorted, remembered";
  });

  // -- step 5 stops flashing with Animations reduced -----------------------------------------------------------------
  await check("M4.4: the difficulty-5 tag pulses with Animations full and is steady, with stripes, under Animations reduced (the setting is put back)", async () => {
    await makeLevels([2, 5]);
    const before = await b.evaluate(`localStorage.getItem(${JSON.stringify(SETTINGS)})`);
    const withMotion = (motion) => setStorage(SETTINGS, { ...JSON.parse(before ?? "{}"), motion });
    const look = (step) =>
      b.evaluate(`(() => { const s = getComputedStyle(document.querySelector('.my-levels .diff-tag[data-step="${step}"]')); return { animation: s.animationName, background: s.backgroundImage }; })()`);
    const seen = {};
    try {
      for (const motion of ["full", "reduced"]) {
        await withMotion(motion);
        await load("#/editor");
        await b.waitFor(`document.querySelector('.my-levels .diff-tag[data-step="5"]')`, 30_000, "the tags");
        expect((await b.evaluate(`document.documentElement.dataset.motion`)) === motion, `data-motion should be ${motion}`);
        seen[motion] = { five: await look(5), two: await look(2) };
      }
    } finally {
      // put the setting back exactly as it was
      if (before === null) await b.evaluate(`localStorage.removeItem(${JSON.stringify(SETTINGS)}); true`);
      else await b.evaluate(`localStorage.setItem(${JSON.stringify(SETTINGS)}, ${JSON.stringify(before)}); true`);
    }
    expect(seen.full.five.animation !== "none", `full: animation-name ${seen.full.five.animation}`);
    expect(seen.full.two.animation === "none", `full: a step-2 tag should not animate (${seen.full.two.animation})`);
    expect(seen.reduced.five.animation === "none", `reduced: animation-name ${seen.reduced.five.animation}`);
    expect(seen.reduced.five.background.includes("repeating-linear-gradient"), `reduced: stripes, got ${seen.reduced.five.background}`);
    expect(!seen.full.five.background.includes("repeating-linear-gradient"), "full: no stripes");
    return `full: ${seen.full.five.animation}; reduced: none + stripes`;
  });

  // -- test-play ----------------------------------------------------------------------------------------------------
  await check("M4.4: Test-play shows the level's difficulty and tier in the Challenge panel, and never on the board", async () => {
    await makeLevels([4]);
    await b.evaluate(`document.querySelector('.my-levels .my-level-open').click()`);
    await editorReady();
    await settled();
    await clickButton("Test-play", ".ed-toolbar");
    await b.waitFor(`document.querySelector('.level[data-level-id]') && !document.querySelector('.level-right .btn-primary').disabled`, 60_000, "the level screen");
    await b.waitFor(`document.querySelector('.level-left .level-tags .diff-tag')`, 30_000, "the difficulty tag");
    expect((await b.evaluate(`document.querySelector('.level-left .level-tags .diff-tag').dataset.step`)) === "4", "difficulty 4 in the Challenge panel");
    await b.waitFor(`document.querySelector('.level-left .level-tags .tier-tag')`, 30_000, "the tier tag (the engine answers)");
    expect((await text(".level-left .level-tags .tier-tag")).includes("Pawn"), "tier Pawn in the Challenge panel");
    expect(!(await exists(".board-host .diff-tag, .board-host .tier-tag, .board .diff-tag, .board .tier-tag")), "no tag on the board");
    expect(!(await exists(".level-middle .diff-tag, .level-middle .tier-tag")), "no tag in the board's column");
    const trail = await crumbs();
    expect(trail.startsWith("Free Play/My levels/") && trail.endsWith("/Test-play"), `crumbs: ${trail}`);
    return `tags in the panel only; crumbs ${trail}`;
  });

  // -- Sandbox --------------------------------------------------------------------------------------------------
  await check("M4.4: the Sandbox runs code on its board, moves the piece, and keeps the code over a reload", async () => {
    await load("#/free/sandbox", { fresh: true });
    await b.waitFor(`document.querySelector('.sandbox .snippet-board .board .piece') && document.querySelector('.sandbox .btn-primary')`, 90_000, "the Sandbox board");
    const piece = () => b.evaluate(`document.querySelector('.sandbox .snippet-board .piece').style.transform`);
    const start = await piece();
    const program = "# my try\npawn.move()\npawn.move()\npawn.move()\n";
    await setCode(program, ".sandbox .cm-content");
    await b.evaluate(`document.querySelector('.sandbox .btn-primary').click()`);
    await b.waitFor(`document.querySelector('.sandbox .snippet-status')?.textContent.includes('Finished') || document.querySelector('.sandbox .error-detail')`, 30_000, "the run");
    await sleep(200);
    expect(!(await exists(".sandbox .error-detail")), "no error");
    const end = await piece();
    expect(start !== end, "the piece moved");
    // what was typed is kept in the browser, and is there after a reload
    await load("#/free/sandbox");
    // (`!!`: a CodeMirror node can't be returned by value, so a bare element would read as "not there")
    await b.waitFor(`!!document.querySelector('.sandbox .cm-content')`, 60_000, "the Sandbox again");
    const kept = await b.evaluate(`[...document.querySelectorAll('.sandbox .cm-line')].map((l) => l.textContent).join('\\n')`);
    expect(kept.trimEnd() === program.trimEnd(), "the code is still there after a reload");
    return "ran, moved, kept";
  });

  // -- Skins ------------------------------------------------------------------------------------------------------
  await check("M4.4: Skins: 'Wear it' on the Charger sets Settings → Piece to the knight, the card says Worn and keeps keyboard focus", async () => {
    await load("#/free/skins", { fresh: true });
    await b.waitFor(`document.querySelector('.skin-card')`, 30_000, "the gallery");
    const locked = await b.evaluate(`({ knight: document.querySelector('.skin-card[data-piece="knight"]').classList.contains('locked'), disabled: document.querySelector('.skin-card[data-piece="knight"] button').disabled })`);
    expect(locked.knight && locked.disabled, "the Charger is locked before the tier is cleared");
    await setStorage("rank-and-file:progress", SOLVED_CHAPTER_6);
    await load("#/free/skins");
    await b.waitFor(`document.querySelector('.skin-card[data-piece="knight"]')`, 30_000, "the gallery again");
    const card = (piece) =>
      b.evaluate(`(() => { const c = document.querySelector('.skin-card[data-piece="${piece}"]'); return { worn: c.classList.contains('worn'), label: c.querySelector('button').textContent, disabled: c.querySelector('button').disabled, name: c.querySelector('strong').textContent, focused: document.activeElement === c }; })()`);
    const piece = () => b.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS)}) ?? '{}').piece ?? 'pawn'`);
    try {
      expect((await card("knight")).name === "Charger", "the knight skin is the Charger");
      expect((await card("knight")).label === "Wear it" && !(await card("knight")).disabled, "the Charger can be worn");
      expect((await card("pawn")).worn && (await card("pawn")).label === "Worn", "the pawn is worn at first");
      // press the button from the keyboard's position (focus on it), as a keyboard player would
      await b.evaluate(`document.querySelector('.skin-card[data-piece="knight"] button').focus(); document.querySelector('.skin-card[data-piece="knight"] button').click()`);
      await b.waitFor(`document.querySelector('.skin-card[data-piece="knight"]').classList.contains('worn')`, 10_000, "the Charger worn");
      const now = await card("knight");
      expect(now.worn && now.label === "Worn" && now.disabled, `the card after: ${JSON.stringify(now)}`);
      expect(now.focused, "keyboard focus is on the worn card");
      expect((await piece()) === "knight", `Settings → Piece is ${await piece()}`);
      // Settings shows the same choice
      await b.evaluate(`document.querySelector('.topbar .settings-button').click()`);
      const radio = await b.evaluate(`document.querySelector('input[name="setting-piece"][value="knight"]').checked`);
      await b.evaluate(`document.querySelector('.settings-dialog').close()`);
      expect(radio, "Settings → Piece shows the knight");
    } finally {
      // put the piece back to the pawn
      await b.evaluate(`document.querySelector('.skin-card[data-piece="pawn"] button')?.click()`);
      await sleep(100);
    }
    expect((await piece()) === "pawn" && (await card("pawn")).worn, "the pawn is back");
    return "Charger worn with focus kept; pawn back";
  });

  // -- Shared with me lives in Free Play -----------------------------------------------------------------------------
  await check("M4.4: Shared with me is in Free Play: a link is listed at #/free/shared, the level's crumbs start 'Free Play / Shared with me', the solved card goes back there, and My levels links to it", async () => {
    await load("#/free", { fresh: true });
    await b.waitFor(`document.querySelector('.fp-row')`, 60_000, "the hub");
    const hubShared = () => text('.fp-row[data-section="shared"] .fp-count');
    expect((await hubShared()) === "0 levels", `hub count before: ${await hubShared()}`);
    const code = await b.evaluate(`import(${JSON.stringify(`${base}src/share/codec.ts`)}).then((codec) => codec.encodeLevel(${JSON.stringify(corridor("Corridor Walk"))}))`);
    await goto(`#/play/${code}`);
    await b.waitFor(`document.querySelector('.level[data-level-id^="shared-"] .board .piece') && !document.querySelector('.level-right .btn-primary').disabled`, 60_000, "the shared level");
    const trail = await crumbs();
    expect(trail === "Free Play/Shared with me/Corridor Walk", `crumbs: ${trail}`);
    expect(await exists('.crumbs a[href="#/free/shared"]'), "the Shared with me crumb is a link to #/free/shared");
    // solve it
    await setCode(WALK);
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`document.querySelector('.outcome-host .outcome-head strong')?.textContent === 'Solved!'`, 30_000, "Solved");
    await b.waitFor(`document.querySelector('.outcome-host a[href="#/free/shared"]')`, 30_000, "the way back");
    expect((await text('.outcome-host a[href="#/free/shared"]')).includes("Shared with me"), "the solved card's link says Shared with me");
    expect(!(await exists('.outcome-host a[href="#/editor"]')), "and not My levels");
    await b.evaluate(`document.querySelector('.outcome-host a[href="#/free/shared"]').click()`);
    await b.waitFor(`location.hash === '#/free/shared' && document.querySelector('.editor-list h1')?.textContent === 'Shared with me'`, 30_000, "Shared with me");
    const listed = await b.evaluate(`[...document.querySelectorAll('.my-levels .my-level')].map((li) => li.textContent)`);
    expect(listed.length === 1 && listed[0].includes("Corridor Walk") && listed[0].includes("★"), `listed: ${listed.map((t) => t.slice(0, 60))}`);
    expect(await hasButton("Open a link or code", ".editor-list"), "Open a link or code is here");
    expect((await crumbs()) === "Free Play/Shared with me", `crumbs on the list: ${await crumbs()}`);
    // My levels no longer lists them, but links here with the count
    await goto("#/editor");
    await myLevelsReady();
    const link = await b.evaluate(`(() => { const a = document.querySelector('.editor-list a[href="#/free/shared"]'); return a ? a.textContent : null; })()`);
    expect(link !== null && link.includes("Shared with me (1)"), `My levels link: ${link}`);
    expect(!(await text(".editor-list")).includes("Corridor Walk"), "the shared level is not listed on My levels");
    // the hub counts it
    await goto("#/free");
    await b.waitFor(`document.querySelector('.fp-row')`, 30_000, "the hub");
    expect((await hubShared()) === "1 level", `hub count after: ${await hubShared()}`);
    return "listed, crumbs, solved card, link";
  });

  // -- Pointers ---------------------------------------------------------------------------------------------------
  await check("M4.4: the promotion screen and Lessons point to the Pawn tier's challenges in Free Play", async () => {
    await load("#/lessons", { fresh: true });
    await b.waitFor(`document.querySelector('.lessons .folder')`, 30_000, "Lessons");
    await setStorage("rank-and-file:progress", SOLVED_CHAPTER_6);
    await load("#/promotion/pawn");
    await b.waitFor(`document.querySelector('.promotion .pr-to')`, 30_000, "the ceremony");
    const pr = await b.evaluate(`(() => { const a = document.querySelector('.promotion a.pr-free'); return a ? { href: a.getAttribute('href'), text: a.textContent } : null; })()`);
    expect(pr !== null && pr.href === "#/free/challenges" && pr.text.includes("Pawn tier's challenges"), `promotion link: ${JSON.stringify(pr)}`);
    await b.evaluate(`document.querySelector('.promotion a.pr-free').click()`);
    await b.waitFor(`location.hash === '#/free/challenges' && document.querySelector('.set-head')`, 30_000, "Challenges");
    await load("#/lessons");
    await b.waitFor(`document.querySelector('.lessons .folder[data-chapter="6"]')`, 30_000, "Lessons");
    const next = await b.evaluate(`(() => {
      const a = document.querySelector('.lessons a.tier-next');
      if (!a) return null;
      return { href: a.getAttribute('href'), text: a.textContent, after: a.previousElementSibling?.matches('.folder[data-chapter="6"]') ?? false, inList: !!a.closest('.folder'), count: document.querySelectorAll('.lessons a.tier-next').length };
    })()`);
    expect(next !== null, "no 'Next:' row in Lessons");
    expect(next.href === "#/free/challenges" && next.text.includes("Next: the Pawn tier's challenges, in Free Play"), `Lessons row: ${JSON.stringify(next)}`);
    expect(next.after && !next.inList && next.count === 1, `the row follows Chapter 6's folder, outside it: ${JSON.stringify(next)}`);
    return "promotion link, Lessons row";
  });

  // -- Save to the repo (dev server only) -----------------------------------------------------------------------------
  await check("M4.4: Save to the repo writes drafts/<id>.yaml, asks before replacing it, and the server refuses a bad id", async () => {
    await load("#/editor", { fresh: true });
    await myLevelsReady();
    await clickButton("New level");
    await editorReady();
    await settled();
    if (!(await hasButton("Save to the repo", ".ed-toolbar"))) return "skipped: not the dev server (the button exists only in `vite dev`)";
    const id = (await hash()).split("/")[2];
    expect(/^[a-z0-9-]+$/.test(id), `draft id ${id}`);
    const drafts = join(root, "drafts");
    const made = !existsSync(drafts);
    const file = join(drafts, `${id}.yaml`);
    const status = () => text("#ed-status");
    try {
      await clickButton("Save to the repo", ".ed-toolbar");
      await b.waitFor(`document.querySelector('#ed-status')?.textContent.includes('Saved')`, 15_000, "the save");
      expect((await status()).includes(`drafts/${id}.yaml`), `status: ${await status()}`);
      expect(existsSync(file), "drafts/<id>.yaml exists");
      expect(readFileSync(file, "utf8").length > 0, "and is not empty");
      expect(!existsSync(join(drafts, `${id}.py`)), "no .py without a kept solution");
      // a second save asks first
      await clickButton("Save to the repo", ".ed-toolbar");
      await b.waitFor(`document.querySelector('.ed-confirm .confirm-step')`, 15_000, "the confirm step");
      expect((await text(".ed-confirm")).includes("Replace it?"), "asks to replace");
      await clickButton("Keep it", ".ed-confirm");
      await b.waitFor(`document.querySelector('#ed-status')?.textContent.includes('Not saved')`, 10_000, "Not saved");
      expect(!(await exists(".ed-confirm .confirm-step")), "the confirm step closes");
      await clickButton("Save to the repo", ".ed-toolbar");
      await b.waitFor(`document.querySelector('.ed-confirm .confirm-step')`, 15_000, "the confirm step again");
      await clickButton("Yes, replace it", ".ed-confirm");
      await b.waitFor(`document.querySelector('#ed-status')?.textContent.includes('Saved')`, 15_000, "the replacing save");
      // a direct POST: a bad id is refused and writes nothing
      const answers = await b.evaluate(`(async () => {
        const post = async (body) => (await fetch('/__rank-and-file/save-level', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).status;
        return { upward: await post({ id: '../escape', yaml: 'x: 1' }), capital: await post({ id: 'Bad_Id', yaml: 'x: 1' }), none: await post({ yaml: 'x: 1' }), get: (await fetch('/__rank-and-file/save-level')).status };
      })()`);
      expect(answers.upward === 400 && answers.capital === 400 && answers.none === 400, `bad ids answer ${JSON.stringify(answers)}`);
      expect(answers.get === 405, `a GET answers ${answers.get}`);
      expect(!existsSync(join(root, "escape.yaml")) && !existsSync(join(drafts, "Bad_Id.yaml")), "nothing was written for them");
    } finally {
      rmSync(file, { force: true });
      rmSync(join(drafts, `${id}.py`), { force: true });
      if (made && existsSync(drafts) && readdirSync(drafts).length === 0) rmSync(drafts, { recursive: true, force: true });
    }
    return `saved, asked to replace, bad ids refused${made ? " (drafts/ made and removed)" : ""}`;
  });
}
