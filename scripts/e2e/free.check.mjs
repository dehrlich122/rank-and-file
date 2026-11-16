// End-to-end checks for Free Play (M4.4): the hub and its five pages, the tags and the filters on My levels, the
// Sandbox (QA-061: a scratch level on the real level screen at #/free/sandbox, its board changed in the real level
// editor at #/free/sandbox/board; the level-screen side is checked here), the Skins gallery, Shared with me in its new
// home, the pointers from the promotion screen and Lessons, and "Save to the repo". Every level here is hand-made on a blank board (a few are shared by a code made in the page by
// the app's own codec, so those checks need the Vite dev server, like share.check.mjs). The programs typed are
// one-line moves written for these boards. Never put editor contents into a check's message or return value.
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sleep } from "./cdp.mjs";
import { BUTTONS, buttonHelpers, hoverHelpers, levelHelpers } from "./helpers.mjs";
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
  const { setCode, editorText, solution, withoutExpectLine } = levelHelpers(b, base, root);
  const { clickButton, hasButton } = buttonHelpers(b);
  const { wordAt, hover, hoverAway } = hoverHelpers(b);
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

  /** Whether a filter row (the list controls) is on screen. */
  const filterRowShown = () => b.evaluate(`[...document.querySelectorAll('.list-controls-host, .list-controls')].some((e) => e.getClientRects().length > 0)`);
  /** The Challenges page's rows, in screen order: the number, title, "Draws on" line and difficulty tag of each. */
  const challengeRows = () =>
    b.evaluate(`[...document.querySelectorAll('.ch-row')].map((a) => {
      const tag = a.querySelector('.diff-tag');
      return {
        num: a.querySelector('.lrow-num').textContent, title: a.querySelector('.lrow-text strong').textContent, draws: a.querySelector('.lrow-text .muted').textContent,
        step: Number(tag?.dataset.step), word: tag?.querySelector('code')?.textContent ?? '', pips: tag?.querySelectorAll('.diff-pip').length ?? 0, on: tag?.querySelectorAll('.diff-pip.on').length ?? 0,
      };
    })`);

  // -- the hub --------------------------------------------------------------------------------------------------
  await check("M4.4: the start menu's Free Play opens the hub: five rows with counts, crumbs 'Free Play', the heading focused", async () => {
    await load("#/", { fresh: true });
    await b.waitFor(`document.querySelector('.ts-menu')`, 60_000, "the start menu");
    const soon = await b.evaluate(`[...document.querySelectorAll('.ts-item')].find((i) => i.textContent.includes('Free Play')).classList.contains('soon')`);
    expect(!soon, "Free Play still says coming soon");
    await b.evaluate(`[...document.querySelectorAll('.ts-item')].find((i) => i.textContent.includes('Free Play')).click()`);
    await b.waitFor(`document.querySelector('.free-play .fp-row')`, 30_000, "the hub");
    expect((await hash()) === "#/free", `hash ${await hash()}`);
    const found = await b.evaluate(`[...document.querySelectorAll('.fp-row')].map((r) => ({ section: r.dataset.section, name: r.querySelector('strong').textContent, count: r.querySelector('.fp-count').textContent.trim(), line: r.querySelector('.fp-text .muted').textContent.trim(), href: r.getAttribute('href') }))`);
    expect(found.map((r) => r.section).join() === "challenges,levels,shared,sandbox,skins", `rows: ${found.map((r) => r.section)}`);
    expect(found.map((r) => r.name).join() === "Challenges,My levels,Shared with me,Sandbox,Skins", `names: ${found.map((r) => r.name)}`);
    expect(found.every((r) => r.count.length > 0), "every row has a count");
    // QA-061 (decision 9): the Sandbox row says what it is and shows its board's size where a count of abilities used to be
    const sandbox = found.find((r) => r.section === "sandbox");
    expect(sandbox.line === "A board of your own to paint and code on", `the Sandbox row's line: ${sandbox.line}`);
    expect(sandbox.count === "8 × 8", `the Sandbox row's count: ${sandbox.count}`);
    expect((await crumbs()) === "Free Play", `crumbs: ${await crumbs()}`);
    expect(await headingFocused(), "the heading is focused");
    expect((await text(".free-play h1")) === "Free Play", "the heading says Free Play");
    return found.map((r) => `${r.name}: ${r.count}`).join(" | ");
  });

  // -- each section opens from its row ----------------------------------------------------------------------------
  await check("M4.4: each of the five rows opens its page with the right heading, crumbs starting 'Free Play' and the heading focused", async () => {
    const pages = [
      { section: "challenges", hash: "#/free/challenges", heading: "Challenges" },
      { section: "levels", hash: "#/editor", heading: "My levels" },
      { section: "shared", hash: "#/free/shared", heading: "Shared with me" },
      { section: "sandbox", hash: "#/free/sandbox", heading: "Sandbox", level: true }, // QA-061: the level screen, which has no page heading
      { section: "skins", hash: "#/free/skins", heading: "Skins" },
    ];
    await load("#/free", { fresh: true });
    const seen = [];
    for (const page of pages) {
      await b.waitFor(`document.querySelector('.fp-row[data-section="${page.section}"]')`, 60_000, "the hub");
      await b.evaluate(`document.querySelector('.fp-row[data-section="${page.section}"]').click()`);
      await b.waitFor(
        `location.hash === ${JSON.stringify(page.hash)} && ${page.level ? `document.querySelector('.level[data-level-id="sandbox"]')` : `document.querySelector('main h1')?.textContent === ${JSON.stringify(page.heading)}`}`,
        30_000,
        `the ${page.heading} page`,
      );
      const trail = await crumbs();
      expect(trail === `Free Play/${page.heading}`, `${page.heading}: crumbs "${trail}"`);
      if (!page.level) expect(await headingFocused(), `${page.heading}: the heading is focused`);
      // the first crumb is a way back to the hub
      expect(await exists('.crumbs a[href="#/free"]'), `${page.heading}: Free Play crumb links to the hub`);
      seen.push(page.heading);
      await goto("#/free");
    }
    return seen.join(", ");
  });

  // -- Challenges ----------------------------------------------------------------------------------------------
  await check("M4.5: Challenges lists The Last Rank with its Pawn tier tag and '0 of 5 solved': five rows numbered 1 to 5, each with a title, a 'Draws on' line and a difficulty tag; no 'coming soon'; the filter row is shown", async () => {
    await load("#/free/challenges", { fresh: true });
    await b.waitFor(`document.querySelector('.set-head') && document.querySelector('.ch-row')`, 30_000, "the Challenges page");
    expect((await text(".set-head h2")) === "The Last Rank", `set: ${await text(".set-head h2")}`);
    const tag = await text(".set-head .tier-tag");
    expect(tag.includes("Pawn"), `tier tag: ${tag}`);
    expect((await text(".set-head")).includes("0 of 5 solved"), `the head: ${await text(".set-head")}`);
    expect(!(await text(".free-play")).includes("coming soon"), "the page still says coming soon");
    const found = await challengeRows();
    expect(found.map((r) => r.num).join() === "1,2,3,4,5", `row numbers: ${found.map((r) => r.num)}`);
    expect(found.every((r) => r.title.length > 0 && r.draws.startsWith("Draws on ") && r.word.length > 0 && r.pips === 5), `a row lacks a title, a Draws on line or a difficulty tag: ${JSON.stringify(found.map((r) => [r.title.length, r.draws.length, r.word, r.pips]))}`);
    expect(found.every((r) => r.step >= 1 && r.step <= 5 && r.on === r.step), "a difficulty tag's pips do not match its step");
    expect(await filterRowShown(), "no filter row on Challenges");
    return `The Last Rank, ${tag.trim()}, five rows`;
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

  // -- Sandbox (QA-061): the scratch level on the real level screen -----------------------------------------------
  const SANDBOX = '.level[data-level-id="sandbox"]';
  const SOLVE_SANDBOX = "for _ in range(7):\n    pawn.move()\npawn.turn_right()\nfor _ in range(7):\n    pawn.move()\n"; // the fresh board's goal, top-right
  const sandboxReady = () =>
    b.waitFor(`document.querySelector('${SANDBOX} .board-host .board .piece') && !document.querySelector('${SANDBOX} .level-right .btn-primary').disabled`, 90_000, "the Sandbox's level screen");
  const openSandbox = async () => {
    await load("#/free/sandbox", { fresh: true });
    await sandboxReady();
  };
  /** Type `code` into the Sandbox's editor, Run it, and wait for the outcome card at the end of playback. */
  const runSandbox = async (code) => {
    await setCode(code);
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`!!document.querySelector('.outcome-host .outcome')`, 60_000, "the outcome card");
    await sleep(150);
  };
  /** The piece's and the goal's centres as fractions of the board (0 to 1, from its top-left), and how many squares it has. */
  const boardFacts = () =>
    b.evaluate(`(() => {
      const squares = document.querySelector('.board-host .board .squares');
      const area = squares.getBoundingClientRect();
      const centre = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { x: (r.x + r.width / 2 - area.x) / area.width, y: (r.y + r.height / 2 - area.y) / area.height };
      };
      return { squares: squares.querySelectorAll('rect.sq-light, rect.sq-dark').length, piece: centre('.board-host .board .piece'), goal: centre('.board-host .board .goal') };
    })()`);
  const editorBoardReady = () => b.waitFor(`document.querySelector('.ed-board .board') && document.querySelector('.tool') && document.querySelector('[data-field="api"]')`, 90_000, "the Sandbox's board editor");
  /** The Sandbox's editor, with the ability `name` switched off in its Level tab, then back on the level screen. */
  async function sandboxWithout(name) {
    await load("#/free/sandbox/board", { fresh: true });
    await editorBoardReady();
    await settled();
    await b.evaluate(`(() => {
      const box = [...document.querySelectorAll('[data-field="api"] label.check')].find((l) => l.textContent.trim() === ${JSON.stringify(name)})?.querySelector('input');
      if (!box || !box.checked) throw new Error(${JSON.stringify(`no ticked ${name} box`)});
      box.click();
    })()`);
    await sleep(300);
    await clickButton("Write code", ".ed-toolbar");
    await sandboxReady();
  }

  await check("QA-061: #/free/sandbox is the level screen with crumbs Free Play / Sandbox; Change the board opens the editor on it, and Write code comes back (crumbs Free Play / Sandbox / Board)", async () => {
    await openSandbox();
    expect(!(await exists(".ed-board")), "the editor opened instead of the level screen");
    expect((await crumbs()) === "Free Play/Sandbox", `crumbs: ${await crumbs()}`);
    expect(await exists(".level-right .cm-content"), "no code editor");
    expect((await text(".level-right .btn-primary")).startsWith("Run"), "no Run button");
    const link = '.level-right .toolbar a[href="#/free/sandbox/board"]';
    expect((await text(link)) === "Change the board", `the toolbar's link to the board editor: "${await text(link)}"`);
    await b.evaluate(`document.querySelector(${JSON.stringify(link)}).click()`);
    await editorBoardReady();
    await settled(); // Write code is enabled once the engine has answered for the board
    expect((await hash()) === "#/free/sandbox/board", `hash ${await hash()}`);
    expect((await crumbs()) === "Free Play/Sandbox/Board", `crumbs in the editor: ${await crumbs()}`);
    expect((await text(".ed-toolbar .btn-primary")) === "Write code", `the editor's main button: ${await text(".ed-toolbar .btn-primary")}`);
    await clickButton("Write code", ".ed-toolbar");
    await sandboxReady();
    expect((await hash()) === "#/free/sandbox", `hash after Write code: ${await hash()}`);
    expect((await crumbs()) === "Free Play/Sandbox", `crumbs after coming back: ${await crumbs()}`);
    return "level screen, editor, and back";
  });

  await check("QA-061: a fresh Sandbox is an 8 x 8 board with the piece bottom-left and the goal top-right, and every ability is on (turn_left runs without an error)", async () => {
    await openSandbox();
    const facts = await boardFacts();
    expect(facts.squares === 64, `${facts.squares} squares`);
    expect(facts.piece.x < 0.25 && facts.piece.y > 0.75, `the piece is at ${JSON.stringify(facts.piece)}`);
    expect(facts.goal.x > 0.75 && facts.goal.y < 0.25, `the goal is at ${JSON.stringify(facts.goal)}`);
    await runSandbox("pawn.turn_left()\npawn.turn_right()\npawn.move()\n");
    expect(!(await exists(".outcome-host .error-detail")), "an ability the Sandbox should have on raised an error");
    return "8 x 8, piece bottom-left, goal top-right, turn_left allowed";
  });

  await check("QA-061: code typed in the Sandbox runs, the piece moves, playback ends with no error, and the code is still there after a reload", async () => {
    await openSandbox();
    const piece = () => b.evaluate(`document.querySelector('.board-host .board .piece').style.transform`);
    const start = await piece();
    const program = "# my try\npawn.move()\npawn.move()\npawn.move()\n";
    await runSandbox(program);
    expect(!(await exists(".outcome-host .error-detail")), "an error card");
    expect(start !== (await piece()), "the piece did not move");
    // what was typed is kept in the browser, and is there after a reload
    await load("#/free/sandbox");
    await sandboxReady();
    expect((await editorText()).trimEnd() === program.trimEnd(), "the code is not there after a reload");
    return "ran, moved, kept";
  });

  await check("QA-061: the Sandbox's level screen has no Learn tab, tier tag, hints or solution offer; the Challenge tab says what it is and lists no Stars; a failed run offers no hint, solution or compare", async () => {
    await openSandbox();
    const tabs = await b.evaluate(`[...document.querySelectorAll('.level-left .tabs button')].filter((t) => t.getClientRects().length > 0).map((t) => t.textContent.trim())`);
    expect(!tabs.includes("Learn") && tabs.includes("Challenge"), `tabs: ${tabs}`);
    const panel = await text(".level-left .tab-scroll .tab-panel:not([hidden])");
    expect(panel.includes("A board of your own"), "the Challenge tab does not say what the Sandbox is");
    const starList = await b.evaluate(`[...document.querySelectorAll('.level-left h3')].some((e) => e.textContent.trim() === 'Stars') || !!document.querySelector('.level-left .star-goals')`);
    expect(!starList, "the Challenge tab has a Stars heading or list");
    const bare = () =>
      b.evaluate(`({
        tier: !!document.querySelector('.level-left .tier-tag'),
        // the hints and solution sections (their headings and buttons), not the Stars list, which has its own words
        help: [...document.querySelectorAll('.level-left .tab-panel:not([hidden]) h3, .level-left .tab-panel:not([hidden]) button')].some((e) => /hint|solution/i.test(e.textContent.trim())),
        keep: !!document.querySelector('.keep-solution'),
        actions: [...document.querySelectorAll('.outcome-host button, .outcome-host a')].map((e) => e.textContent.trim()).filter((t) => /hint|solution|compare/i.test(t)),
      })`);
    const before = await bare();
    expect(!before.tier && !before.help && !before.keep, `before a run: ${JSON.stringify(before)}`);
    const seen = [];
    // the third failed run is where another level would start offering a solution
    for (const code of ["pawn.move()\n", "pawn.fly()\n", "pawn.turn_left()\npawn.move()\npawn.fly()\n"]) {
      await runSandbox(code);
      seen.push((await text(".outcome-host .outcome-head strong")).trim());
      const now = await bare();
      expect(!now.tier && !now.help && !now.keep && now.actions.length === 0, `after "${seen.at(-1)}": ${JSON.stringify(now)}`);
    }
    return `none offered after: ${seen.join(", ")}`;
  });

  await check("QA-061: reaching the goal in the Sandbox says so, offers Change the board, and has no Compare button or 'undefined' in the card", async () => {
    await openSandbox();
    await runSandbox(SOLVE_SANDBOX);
    const card = await b.evaluate(`(() => {
      const outcome = document.querySelector('.outcome-host');
      return {
        head: outcome.querySelector('.outcome-head strong')?.textContent ?? '',
        undefinedText: /undefined/i.test(outcome.textContent),
        buttons: [...outcome.querySelectorAll('button')].map((e) => e.textContent.trim()),
        onward: [...outcome.querySelectorAll('a')].map((e) => ({ text: e.textContent.trim(), href: e.getAttribute('href') })),
        keep: !!outcome.querySelector('.keep-solution'),
      };
    })()`);
    expect(card.head === "Solved!", `the card says "${card.head}"`);
    expect(!card.undefinedText, "the card has 'undefined' in it");
    expect(card.onward.some((a) => a.text === "Change the board" && a.href === "#/free/sandbox/board"), `links: ${JSON.stringify(card.onward)}`);
    expect(!card.buttons.some((t) => /compare|solution/i.test(t)) && !card.keep, `buttons: ${JSON.stringify(card.buttons)}`);
    return "solved, Change the board offered, nothing else";
  });

  // Decision 4 says no stars are kept. The card draws the engine's stars, so this fails while the app lists them.
  await check("QA-061: the Sandbox's solved card lists no stars", async () => {
    await openSandbox();
    await runSandbox(SOLVE_SANDBOX);
    const stars = await b.evaluate(`document.querySelectorAll('.outcome-host .stars li').length`);
    expect(stars === 0, `the solved card lists ${stars} stars`);
    return "no stars listed";
  });

  await check("QA-061: with an ability switched off in the scratch level, calling it says 'In this level it knows', never 'Here it knows'", async () => {
    await sandboxWithout("turn_left"); // unticked in the editor's Level tab
    await runSandbox("pawn.turn_left()\n");
    await b.waitFor(`document.querySelector('.outcome-host .error-detail')`, 30_000, "the error");
    const message = await text(".outcome-host .error-detail");
    expect(message.includes("In this level it knows"), "the error does not say 'In this level it knows'");
    expect(!message.includes("Here it knows"), "the error says 'Here it knows'");
    return "In this level it knows";
  });

  // -- Skins ------------------------------------------------------------------------------------------------------
  /** One skin card's state: its classes, its Wear it button's label (null when it has none), and the status or "how" text. */
  const card = (piece) =>
    b.evaluate(`(() => {
      const c = document.querySelector('.skin-card[data-piece="${piece}"]');
      return {
        worn: c.classList.contains('worn'), locked: c.classList.contains('locked'), name: c.querySelector('strong').textContent,
        button: c.querySelector('button')?.textContent ?? null, status: c.querySelector('.skin-worn')?.textContent ?? '',
        how: c.querySelector('.skin-how')?.textContent ?? '', focused: document.activeElement === c,
      };
    })()`);
  await check("M4.4: Skins: 'Wear it' on the Charger sets Settings → Piece to the knight, the card says Worn and keeps keyboard focus", async () => {
    await load("#/free/skins", { fresh: true });
    await b.waitFor(`document.querySelector('.skin-card')`, 30_000, "the gallery");
    const before = await card("knight");
    expect(before.locked && !before.worn && !before.button && before.how.startsWith("Locked: "), `the Charger is locked before the tier is cleared: ${JSON.stringify(before)}`);
    await setStorage("rank-and-file:progress", SOLVED_CHAPTER_6);
    await load("#/free/skins");
    await b.waitFor(`document.querySelector('.skin-card[data-piece="knight"]')`, 30_000, "the gallery again");
    const piece = () => b.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS)}) ?? '{}').piece ?? 'pawn'`);
    try {
      const unlocked = await card("knight");
      expect(unlocked.name === "Charger", "the knight skin is the Charger");
      expect(!unlocked.locked && !unlocked.worn && unlocked.button === "Wear it", `the Charger can be worn: ${JSON.stringify(unlocked)}`);
      const pawn = await card("pawn");
      expect(pawn.worn && !pawn.button && pawn.status.endsWith("Worn"), `the pawn is worn at first, with no button: ${JSON.stringify(pawn)}`);
      // press the button from the keyboard's position (focus on it), as a keyboard player would
      await b.evaluate(`document.querySelector('.skin-card[data-piece="knight"] button').focus(); document.querySelector('.skin-card[data-piece="knight"] button').click()`);
      await b.waitFor(`document.querySelector('.skin-card[data-piece="knight"]').classList.contains('worn')`, 10_000, "the Charger worn");
      const now = await card("knight");
      expect(now.worn && !now.locked && !now.button && now.status.endsWith("Worn"), `the card after: ${JSON.stringify(now)}`);
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
    const back = await card("pawn");
    expect((await piece()) === "pawn" && back.worn, `the pawn is back: ${JSON.stringify(back)}`);
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

  // -- QA1 fixes (Session 17) ------------------------------------------------------------------------------------------
  await check("QA-046: the Title box stops at its limit however much is typed, and a saved level with a longer title says 'has problems' on My levels", async () => {
    await load("#/editor", { fresh: true });
    await myLevelsReady();
    await clickButton("New level");
    await editorReady();
    await settled();
    await b.evaluate(`document.querySelector('[data-field="title"] input').focus()`);
    await b.key("a", { code: "KeyA", modifiers: 2 }); // Ctrl+A, so the typed text replaces the title
    await b.send("Input.insertText", { text: "x".repeat(100) });
    const found = await b.evaluate(`(() => { const i = document.querySelector('[data-field="title"] input'); return { length: i.value.length, max: i.getAttribute('maxlength') }; })()`);
    expect(found.max !== null && Number(found.max) > 0 && Number(found.max) < 100, `maxlength attribute: ${found.max}`);
    expect(found.length === Number(found.max), `typed 100, the box holds ${found.length} of ${found.max}`);
    // a level saved with a title past the limit (an old save, or one written by hand): the engine refuses it
    const { id: _id, ...data } = corridor("y".repeat(100));
    await setStorage("rank-and-file:editor", { levels: { "qa046-too-long": { data, edited: Date.now() } } });
    await load("#/editor");
    await myLevelsReady();
    await b.waitFor(`[...document.querySelectorAll('.my-level .problem-tag')].some((t) => t.textContent.trim() === 'has problems')`, 60_000, "the 'has problems' mark");
    return `limit ${found.max}; the too-long level is marked`;
  });

  await check("QA-047: every Free Play page's heading sits at the same height, in the same type, as Lessons' (within 1px)", async () => {
    const look = () =>
      b.evaluate(`(() => {
        const h = document.querySelector('main h1, .lessons-title');
        const s = getComputedStyle(h);
        return { gap: h.getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().bottom, family: s.fontFamily, transform: s.textTransform, color: s.color };
      })()`);
    await load("#/lessons", { fresh: true });
    await b.waitFor(`document.querySelector('.lessons-title')`, 30_000, "Lessons");
    await sleep(300);
    const lessons = await look();
    const bad = [];
    for (const page of ["#/free", "#/free/challenges", "#/editor", "#/free/shared", "#/free/sandbox", "#/free/skins"]) {
      await load(page);
      if (page === "#/free/sandbox") {
        // QA-061: the Sandbox is the level screen, which has no page heading to measure
        await b.waitFor(`location.hash === ${JSON.stringify(page)} && document.querySelector('.level[data-level-id="sandbox"]')`, 60_000, `the page ${page}`);
        continue;
      }
      await b.waitFor(`location.hash === ${JSON.stringify(page)} && document.querySelector('main h1')`, 60_000, `the page ${page}`);
      await sleep(300);
      const now = await look();
      if (Math.abs(now.gap - lessons.gap) > 1 || now.family !== lessons.family || now.transform !== lessons.transform || now.color !== lessons.color) {
        bad.push(`${page}: gap ${now.gap} vs ${lessons.gap}, ${now.family === lessons.family ? "" : "font "}${now.transform === lessons.transform ? "" : "case "}${now.color === lessons.color ? "" : "colour"}`);
      }
    }
    expect(bad.length === 0, `headings differ from Lessons': ${bad.join("; ")}`);
    return `6 headings at gap ${Math.round(lessons.gap)}px, ${lessons.transform}`;
  });

  await check("QA-048: Open a link or code: its note sits right under the box, an empty try and a junk try each say so, and Esc closes the form with focus back on the button", async () => {
    await load("#/free/shared", { fresh: true });
    await b.waitFor(`document.querySelector('.editor-list h1')?.textContent === 'Shared with me'`, 30_000, "Shared with me");
    await clickButton("Open a link or code", ".editor-list");
    expect(await b.evaluate(`!document.querySelector('.link-form').hidden`), "the form opens");
    const submit = () => b.evaluate(`document.querySelector('.link-form').requestSubmit()`);
    await submit();
    const empty = await text(".link-note");
    expect(empty === "Paste a link or code first.", `empty try said: ${empty}`);
    expect(await b.evaluate(`document.querySelector('.link-form .toolbar').nextElementSibling === document.querySelector('.link-note')`), "the note is the input row's next sibling");
    await b.evaluate(`(() => { const i = document.querySelector('#link-or-code'); i.value = 'not a level'; })()`);
    await submit();
    const junk = await text(".link-note");
    expect(junk !== "" && junk !== empty, `junk try said: ${junk}`);
    await b.evaluate(`document.querySelector('#link-or-code').focus()`);
    await b.key("Escape");
    expect(await b.evaluate(`document.querySelector('.link-form').hidden`), "Esc hides the form");
    expect(!(await exists("dialog[open]")), "Esc did not open Settings");
    const back = await b.evaluate(`document.activeElement?.tagName === 'BUTTON' && document.activeElement.textContent === 'Open a link or code'`);
    expect(back, "focus is back on the Open a link or code button");
    return "note under the box, both tries answered, Esc closes";
  });

  await check("QA-049: no filter row on the empty My levels and Shared with me (Challenges, having levels, shows one); with two levels and nothing matching, 'Clear filters' resets Tier and Difficulty, keeps the sort, and both rows return", async () => {
    await load("#/editor", { fresh: true });
    await myLevelsReady();
    expect(!(await filterRowShown()), "a filter row on the empty My levels");
    await goto("#/free/shared");
    await b.waitFor(`document.querySelector('.editor-list h1')?.textContent === 'Shared with me'`, 30_000, "Shared with me");
    expect(!(await filterRowShown()), "a filter row on the empty Shared with me");
    await goto("#/free/challenges");
    await b.waitFor(`document.querySelector('.set-head')`, 30_000, "Challenges");
    expect(await filterRowShown(), "no filter row on Challenges, which has levels");
    await makeLevels([2, 5]);
    expect(await filterRowShown(), "no filter row once there are levels");
    try {
      await control("Sort", "hardest");
      await control("Difficulty", "3");
      expect((await rows()) === 0, `${await rows()} rows with nothing matching`);
      await clickButton("Clear filters", ".my-levels");
      expect((await controlValue("Tier")) === "" && (await controlValue("Difficulty")) === "", `Tier "${await controlValue("Tier")}", Difficulty "${await controlValue("Difficulty")}"`);
      expect((await controlValue("Sort")) === "hardest", `Sort is ${await controlValue("Sort")}`);
      expect((await rows()) === 2, `${await rows()} rows after clearing`);
      expect(await filterRowShown(), "the filter row stays");
    } finally {
      await control("Sort", "order");
    }
    return "hidden while empty; cleared, sort kept, both rows back";
  });

  await check("QA-050: My levels tags stay in fixed columns: the tier and difficulty columns line up across rows, do not move when the engine answers, and no tags cell is a bare dash", async () => {
    await makeLevels([2]);
    await clickButton("New level"); // a second level, with no difficulty
    await editorReady();
    await settled();
    await goto("#/editor");
    await myLevelsReady();
    await load("#/editor");
    await b.waitFor(`document.querySelectorAll('.my-levels .my-level .tags-tier').length === 2`, 30_000, "both rows' tag columns");
    // x is measured from the row's own left edge: the whole page may shift a few pixels (a scrollbar, the fonts
    // swapping in) while the engine starts, and that is not the tags moving
    const columns = () =>
      b.evaluate(`[...document.querySelectorAll('.my-levels .my-level')].map((li) => { const left = li.getBoundingClientRect().left; return { tier: li.querySelector('.tags-tier').getBoundingClientRect().left - left, diff: li.querySelector('.tags-diff').getBoundingClientRect().left - left, diffTags: li.querySelectorAll('.diff-tag').length }; })`);
    const early = await columns();
    expect(early.length === 2 && early.some((r) => r.diffTags === 1) && early.some((r) => r.diffTags === 0), `rows: ${JSON.stringify(early)}`);
    expect(Math.abs(early[0].tier - early[1].tier) < 0.5 && Math.abs(early[0].diff - early[1].diff) < 0.5, `columns differ between rows: ${JSON.stringify(early)}`);
    await b.waitFor(`document.querySelectorAll('.my-levels .tags-tier > *').length === 2`, 60_000, "both tier tags");
    const late = await columns();
    expect(early.every((r, i) => Math.abs(r.tier - late[i].tier) < 0.5 && Math.abs(r.diff - late[i].diff) < 0.5), `columns moved when the engine answered: ${JSON.stringify(early)} then ${JSON.stringify(late)}`);
    const dashes = await b.evaluate(`[...document.querySelectorAll('.my-levels .tags')].filter((t) => /^\\s*[-\\u2013\\u2014]\\s*$/.test(t.textContent)).length`);
    expect(dashes === 0, `${dashes} tags cells are a bare dash`);
    return "columns fixed across rows and over the engine's answer";
  });

  await check("QA-051: on My levels, the lesson-level picker and its Copy it button sit on one line at 1440 and 1000 wide", async () => {
    await load("#/editor", { fresh: true });
    await myLevelsReady();
    const seen = [];
    try {
      for (const width of [1440, 1000]) {
        await b.send("Emulation.setDeviceMetricsOverride", { width, height: 860, deviceScaleFactor: 1, mobile: false });
        await sleep(300);
        const at = await b.evaluate(`(() => {
          const s = document.querySelector('.ed-copy select').getBoundingClientRect();
          const k = document.querySelector('.ed-copy-pick button').getBoundingClientRect();
          return { centre: (k.top + k.bottom) / 2, top: s.top, bottom: s.bottom };
        })()`);
        expect(at.centre >= at.top && at.centre <= at.bottom, `at ${width}: the button's centre ${Math.round(at.centre)} is outside the select (${Math.round(at.top)} to ${Math.round(at.bottom)})`);
        seen.push(width);
      }
    } finally {
      await b.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false });
    }
    return `aligned at ${seen.join(" and ")}`;
  });

  await check("QA-054: hovering a function in the Sandbox's editor shows its Codex entry; other words show nothing", async () => {
    await openSandbox();
    const tooltip = () => b.evaluate(`document.querySelector('.cm-tooltip .codex-card .codex-call')?.textContent ?? null`);
    // the Codex request follows Python's start, so the tooltips arrive a moment after the board: try again for a while
    let shown = null;
    for (const started = Date.now(); shown === null && Date.now() - started < 10_000; ) {
      await hover(await wordAt("move"));
      await sleep(900); // longer than the hover delay
      shown = await tooltip();
      await hoverAway();
    }
    expect(shown === "pawn.move(squares=1)", `hovering move shows ${JSON.stringify(shown)}`);
    // a word of the starter's comment is no function
    await hover(await wordAt("anything"));
    await sleep(900);
    const none = await tooltip();
    await hoverAway();
    expect(none === null, `hovering a word of the comment shows ${JSON.stringify(none)}`);
    return "move shows its entry; a comment word shows nothing";
  });

  await check("QA-059: the Skins page says what it is, its cards are keyboard stops with names, and the Charger is labelled in Settings", async () => {
    await load("#/free/skins", { fresh: true });
    await b.waitFor(`document.querySelector('.skin-card[data-piece="knight"]')`, 30_000, "the gallery");
    expect((await text(".skins-intro")) === "Skins change how your piece looks. Promotions unlock them.", "the intro line");
    const cards = await b.evaluate(`[...document.querySelectorAll('.skin-card')].map((c) => ({ piece: c.dataset.piece, tab: c.getAttribute('tabindex'), label: c.getAttribute('aria-label') ?? '' }))`);
    expect(cards.length >= 2 && cards.every((c) => c.tab === "0" && c.label !== ""), `every card is a tab stop with a label: ${JSON.stringify(cards)}`);
    expect(cards.find((c) => c.piece === "knight")?.label.startsWith("Charger, locked: "), "the locked knight's label");
    const stray = await b.evaluate(`({ inCards: document.querySelectorAll('.skin-card.worn button, .skin-card.locked button').length, disabled: document.querySelectorAll('.skins button:disabled').length })`);
    expect(stray.inCards === 0 && stray.disabled === 0, `no button on a worn or locked card, none disabled: ${JSON.stringify(stray)}`);
    // the real Tab key from the top of the page reaches the locked card, which has no button to stop on
    await b.evaluate(`document.activeElement?.blur()`);
    let presses = 0;
    while (presses < 60 && !(await b.evaluate(`document.activeElement === document.querySelector('.skin-card[data-piece="knight"]')`))) {
      await b.key("Tab", { code: "Tab" });
      presses++;
    }
    expect(await b.evaluate(`document.activeElement === document.querySelector('.skin-card[data-piece="knight"]')`), `Tab did not reach the locked Charger in ${presses} presses`);
    // Settings → Piece names the knight's skin
    await b.evaluate(`document.querySelector('.topbar .settings-button').click()`);
    let label = "";
    try {
      // (the label's own words: a locked option also carries a separate "locked until..." note)
      label = await b.evaluate(`(() => {
        const copy = document.querySelector('input[name="setting-piece"][value="knight"]')?.closest('label')?.cloneNode(true);
        copy?.querySelector('.lock-note')?.remove();
        return copy?.textContent.trim() ?? '';
      })()`);
    } finally {
      await b.evaluate(`document.querySelector('.settings-dialog')?.close()`);
    }
    expect(label === "Knight · Charger", `Settings → Piece labels the knight ${JSON.stringify(label)}`);
    return `Tab reaches the locked Charger in ${presses} presses; Settings says "${label}"`;
  });


  // -- M4.5: The Last Rank, a challenge played for real ---------------------------------------------------------------
  // The programs typed are the references (and wrong attempts) read from disk in Node; no check here reports editor
  // contents or a hint's text, only counts, lengths and yes/no. Which challenge has which difficulty is read off the page.
  const CHALLENGES = [1, 2, 3, 4, 5].map((n) => `last-rank-0${n}`);
  const openChallenge = async (id, { fresh = false } = {}) => {
    await load(`#/challenge/${id}`, { fresh });
    await b.waitFor(
      `document.querySelector('.level[data-level-id="${id}"] .board-host .board .piece') && !document.querySelector('.level-right .btn-primary').disabled`,
      90_000,
      `challenge ${id}`,
    );
  };
  /** Type `code`, Run, jump to the end of playback, and describe the outcome card (its head, earned stars and links). */
  const runChallenge = async (code) => {
    await setCode(code);
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`!document.querySelector('.outcome-host').textContent.includes('Running')`, 60_000, "the run to finish");
    await b.evaluate(`(() => { const e = document.querySelectorAll(${JSON.stringify(BUTTONS)})[4]; if (e && !e.disabled) e.click(); })()`);
    await b.waitFor(`document.querySelector('.outcome-host .outcome')`, 60_000, "the outcome card");
    return b.evaluate(`({
      head: document.querySelector('.outcome-head strong').textContent,
      stars: document.querySelectorAll('.outcome-host .stars li.earned').length,
      links: [...document.querySelectorAll('.outcome-host a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
    })`);
  };
  /** The Challenges page once its rows are up (progress kept unless `fresh`). */
  const challengesPage = async ({ fresh = false } = {}) => {
    await load("#/free/challenges", { fresh });
    await b.waitFor(`document.querySelector('.set-head') && document.querySelector('.ch-row')`, 30_000, "the Challenges page");
  };
  const stepsOnScreen = () => b.evaluate(`[...document.querySelectorAll('.ch-row .diff-tag')].map((t) => Number(t.dataset.step))`);
  const numbersOnScreen = () => b.evaluate(`[...document.querySelectorAll('.ch-row .lrow-num')].map((n) => n.textContent).join()`);

  await check("M4.5: the Difficulty and Tier filters narrow Challenges, Hardest first orders by difficulty (read from the rows), and the choices are put back", async () => {
    await challengesPage({ fresh: true });
    const all = await stepsOnScreen();
    expect(all.length === 5 && all.every((n) => n >= 1 && n <= 5), `difficulties on screen: ${all}`);
    try {
      const wanted = all[0];
      await control("Difficulty", String(wanted));
      const narrowed = await stepsOnScreen();
      expect(narrowed.length === all.filter((n) => n === wanted).length && narrowed.every((n) => n === wanted), `Difficulty ${wanted}: ${narrowed}`);
      const absent = [1, 2, 3, 4, 5].find((n) => !all.includes(n));
      if (absent !== undefined) {
        await control("Difficulty", String(absent));
        expect((await stepsOnScreen()).length === 0 && (await text(".free-play")).includes("No challenges match these filters."), `Difficulty ${absent} (no challenge has it) did not say nothing matches`);
      }
      await control("Difficulty", "");
      expect((await stepsOnScreen()).length === 5, "Any brings all five back");
      await control("Sort", "hardest");
      const hardest = await stepsOnScreen();
      expect(hardest.length === 5 && hardest.every((n, i) => i === 0 || hardest[i - 1] >= n), `Hardest first: ${hardest}`);
      expect((await numbersOnScreen()).split(",").sort().join() === "1,2,3,4,5", "Hardest first lost or repeated a row");
      await control("Sort", "easiest");
      const easiest = await stepsOnScreen();
      expect(easiest.every((n, i) => i === 0 || easiest[i - 1] <= n), `Easiest first: ${easiest}`);
      await control("Tier", "pawn");
      expect((await stepsOnScreen()).length === 5 && (await text(".set-head .tier-tag")).includes("Pawn"), "the Pawn tier filter dropped the Pawn set");
    } finally {
      await control("Tier", "");
      await control("Difficulty", "");
      await control("Sort", "order");
    }
    expect((await numbersOnScreen()) === "1,2,3,4,5", `the order after putting the choices back: ${await numbersOnScreen()}`);
    return `five rows, steps ${all}`;
  });

  await check("M4.5: a challenge opens at #/challenge/<id>: its brief, the tier tag and difficulty in the Challenge panel, 'Draws on' chips that link to lessons, and no Learn tab", async () => {
    await challengesPage({ fresh: true });
    const first = (await challengeRows())[0];
    await openChallenge(CHALLENGES[0], { fresh: true });
    const panel = ".level-left .tab-scroll .tab-panel:not([hidden])";
    const tabs = await b.evaluate(`[...document.querySelectorAll('.level-left .tabs button')].filter((t) => t.getClientRects().length > 0).map((t) => t.textContent.trim())`);
    expect(!tabs.includes("Learn"), `tabs: ${tabs}`);
    expect((await text(panel)).includes(first.title) && (await text(panel)).length > 150, "the Challenge panel does not show the title and the brief");
    await b.waitFor(`document.querySelector('.level-left .level-tags .tier-tag')`, 30_000, "the tier tag");
    expect((await text(".level-left .level-tags .tier-tag")).includes("Pawn"), "tier Pawn in the Challenge panel");
    const step = await b.evaluate(`document.querySelector('.level-left .level-tags .diff-tag')?.dataset.step`);
    expect(Number(step) === first.step, `difficulty in the panel ${step}, on the list ${first.step}`);
    const chips = await b.evaluate(`[...document.querySelectorAll('.level-left .draws-on a.chapter-chip')].map((a) => ({ text: a.textContent, href: a.getAttribute('href') }))`);
    expect(chips.length >= 2 && chips.every((c) => /^#\/lessons\/\d+$/.test(c.href) && c.text.length > 0), `chips: ${JSON.stringify(chips)}`);
    await b.evaluate(`document.querySelector('.level-left .draws-on a.chapter-chip').click()`);
    await b.waitFor(`location.hash === ${JSON.stringify(chips[0].href)} && !document.querySelector('.level')`, 30_000, "the lessons page");
    expect(await exists("main h1, main h2"), "the chip landed on an empty page");
    await goto(`#/challenge/${CHALLENGES[0]}`);
    await b.waitFor(`document.querySelector('.level[data-level-id="${CHALLENGES[0]}"] .board-host .board .piece')`, 60_000, "the challenge again");
    return `no Learn tab, ${chips.length} chips, lands at ${chips[0].href}`;
  });

  await check("M4.5: solving The Toll Road with its reference earns three stars and offers 'Next challenge →'; Challenges and the hub then say '1 of 5 solved', kept over a reload; the last challenge offers 'Back to Free Play'", async () => {
    await openChallenge(CHALLENGES[0], { fresh: true });
    const r = await runChallenge(solution(CHALLENGES[0]));
    expect(r.head === "Solved!" && r.stars === 3, `${r.head}, ${r.stars} stars`);
    const next = r.links.find((l) => l.text === "Next challenge →");
    expect(next?.href === `#/challenge/${CHALLENGES[1]}`, `links: ${JSON.stringify(r.links)}`);
    await b.evaluate(`document.querySelector('.outcome-host a[href="${next.href}"]').click()`);
    await b.waitFor(`location.hash === ${JSON.stringify(next.href)} && document.querySelector('.level[data-level-id="${CHALLENGES[1]}"] .board-host .board .piece')`, 60_000, "the next challenge");
    const onPage = async () => {
      const row = await b.evaluate(`(() => { const a = document.querySelector('.ch-row'); return { num: a.querySelector('.lrow-num').textContent, stars: a.querySelector('.card-stars').textContent }; })()`);
      expect(row.num === "✓" && row.stars.startsWith("★★★"), `row 1: ${JSON.stringify(row)}`);
      expect((await text(".set-head")).includes("1 of 5 solved"), `the head: ${await text(".set-head")}`);
      expect((await b.evaluate(`document.querySelectorAll('.ch-row .lrow-num')[1].textContent`)) === "2", "row 2 should still be unsolved");
    };
    await goto("#/free/challenges");
    await b.waitFor(`document.querySelector('.ch-row')`, 30_000, "Challenges");
    await onPage();
    await challengesPage(); // a reload keeps the progress
    await onPage();
    await load("#/free");
    await b.waitFor(`document.querySelector('.fp-row[data-section="challenges"]')`, 30_000, "the hub");
    const count = (await text('.fp-row[data-section="challenges"] .fp-count')).trim();
    expect(count === "1 of 5 solved", `hub: ${count}`);
    // the last challenge ends the set: no next one, so the card leads back
    await openChallenge(CHALLENGES[4]);
    const last = await runChallenge(solution(CHALLENGES[4]));
    expect(last.head === "Solved!" && last.stars >= 1, `${last.head}, ${last.stars} stars`);
    const back = last.links.find((l) => l.text === "Back to Free Play");
    expect(back?.href === "#/free/challenges" && !last.links.some((l) => l.text === "Next challenge →"), `links: ${JSON.stringify(last.links)}`);
    await b.evaluate(`document.querySelector('.outcome-host a[href="#/free/challenges"]').click()`);
    await b.waitFor(`location.hash === '#/free/challenges' && document.querySelector('.ch-row')`, 30_000, "Challenges");
    expect((await text(".set-head")).includes("2 of 5 solved"), `the head after the last: ${await text(".set-head")}`);
    return "3 stars, next offered, 1 of 5 then 2 of 5, kept over a reload";
  });

  await check("M4.5: a challenge's hints open in order, its third failed run offers 'Show me a solution', and what it shows is the reference on disk", async () => {
    const id = CHALLENGES[1];
    await openChallenge(id, { fresh: true });
    const wrong = withoutExpectLine(solution(id, ".naive"));
    const failedOffers = async () => {
      const r = await runChallenge(wrong);
      expect(r.head !== "Solved!", `a wrong attempt solved ${id}`);
      return hasButton("Show me a solution…", ".outcome-host");
    };
    expect(!(await failedOffers()), "a solution is offered after one failed run");
    expect(await hasButton("Need a hint?", ".outcome-host"), "no 'Need a hint?' after a failed run");
    await clickButton("Need a hint?", ".outcome-host");
    const lengths = [];
    for (let n = 1; n <= 3; n++) {
      await b.evaluate(`document.querySelector('.hints .hint-button').click()`);
      const open = await b.evaluate(`[...document.querySelectorAll('.hints .hint-list li')].map((li) => li.textContent.trim().length)`);
      expect(open.length === n && open.every((len) => len > 0), `after ${n} clicks: ${open.length} hints open, lengths ${open}`);
      lengths.push(open[n - 1]);
    }
    expect(!(await failedOffers()), "a solution is offered after two failed runs");
    expect(await failedOffers(), "no 'Show me a solution' after the third failed run");
    await clickButton("Show me a solution…", ".outcome-host");
    await b.evaluate(`document.querySelector('.give-up-button').click()`);
    await clickButton("Show it", ".solution-section .confirm-step");
    await b.waitFor(`!!document.querySelector('.compare-dialog .compare-idiomatic .cm-line')`, 10_000, "the solution");
    const shown = (await editorText(".compare-dialog .compare-idiomatic")) === solution(id).trimEnd();
    await b.key("Escape");
    expect(shown, "the solution shown is not the reference on disk");
    return `three hints (text lengths ${lengths}), solution offered on the third failed run and equal to the file`;
  });
}
