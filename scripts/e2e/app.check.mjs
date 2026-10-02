// End-to-end checks for the game itself: levels, playback, errors, lessons, REPL.
// Solutions are read from solutions/ and typed into the editor; this file never
// contains solution code, and nothing here prints it.
import { sleep } from "./cdp.mjs";
import { BUTTONS, levelHelpers } from "./helpers.mjs";
import { expect } from "./suite.mjs";

const LEVELS = ["ch01-l01", "ch01-l02", "ch01-l03", "ch01-l04", "ch01-l05"];

export default async function appChecks({ browser: b, base, root, check }) {
  const { solution, withoutExpectLine, openLevel, setCode, editorText, clickButton, hasButton, challengeTab } = levelHelpers(b, base, root);

  const button = (index) => `document.querySelectorAll('${BUTTONS}')[${index}]`;

  /** Press Run, optionally jump to the end, and describe the outcome. */
  async function run({ jump = true } = {}) {
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`!document.querySelector('.outcome-host').textContent.includes('Running')`, 20_000, "run finished");
    return outcome({ jump });
  }

  /** Once a recording is playing: optionally jump to its end, then describe the outcome card. */
  async function outcome({ jump = true } = {}) {
    if (jump) await b.evaluate(`(() => { const e = ${button(4)}; if (!e.disabled) e.click(); })()`);
    await b.waitFor(`document.querySelector('.outcome-host .outcome')`, 30_000, "outcome card");
    return b.evaluate(`({
      head: document.querySelector('.outcome-head strong').textContent,
      tone: document.querySelector('.outcome-host .outcome').className,
      buttons: [...document.querySelectorAll('.outcome-host .outcome-head a, .outcome-host .outcome-head button')].map((e) => e.textContent),
      note: document.querySelector('.outcome-host .case-note')?.textContent ?? null,
      text: document.querySelector('.outcome-host .outcome').innerText.replace(/\\s+/g, ' '),
      errorLine: !!document.querySelector('.level-right .cm-error-line'),
      warnMarks: document.querySelectorAll('.level-right .cm-lint-marker-warning').length,
      step: document.querySelector('.step-label').textContent,
      vars: [...document.querySelectorAll('.inspector tr')].map((r) => r.innerText.replace(/\\s+/g, ' ')),
      console: document.querySelector('.console').innerText,
      next: document.querySelector('.outcome-host a')?.textContent ?? null,
      stars: document.querySelectorAll('.outcome-host .stars li.earned').length,
    })`);
  }
  const brief = (r) => `${r.head}: ${r.text.slice(0, 110)}`;
  /** What the game said in the console (guards, pick-ups, falls). Check it in Node; never report it: it can give a solution away. */
  const gameMessages = () => b.evaluate(`[...document.querySelectorAll('.console .game-message')].map((e) => e.textContent)`);

  // -- every level can be solved -------------------------------------------------------
  for (const id of LEVELS) {
    await check(`${id}: reference solution solves it`, async () => {
      await openLevel(id);
      await setCode(solution(id));
      const natural = id === "ch01-l05"; // one level plays through at normal speed
      const r = await run({ jump: !natural });
      expect(r.head === "Solved!", brief(r));
      expect(r.stars === 3, `${r.stars} of 3 stars: ${brief(r)}`); // the reference solution meets par, with no hints
      return `${brief(r)} | next: ${r.next}`;
    });
  }

  await check("level select marks solved levels", async () => {
    await b.send("Page.navigate", { url: `${base}#/` });
    const solved = await b.waitFor(`document.querySelectorAll('.level-card.solved').length`, 5000, "level cards");
    const stars = await b.evaluate(`document.querySelectorAll('.level-card .card-stars .icon-star').length`);
    expect(solved === LEVELS.length, `${solved} solved`);
    expect(stars === LEVELS.length * 3, `${stars} stars on the level cards`);
    return `${solved} solved, ${stars} stars`;
  });

  // -- M2: saved progress ------------------------------------------------------------------
  // Compares the editor with the solution file in Node and reports only yes or no.
  const levelCards = async () => {
    await b.send("Page.navigate", { url: `${base}#/` });
    await b.waitFor(`document.querySelector('.level-card')`, 5000, "level cards");
    return b.evaluate(`document.querySelectorAll('.level-card.solved').length`);
  };

  await check("M2: solved levels and your code survive a reload; a fresh start has neither", async () => {
    await openLevel("ch01-l01", { reload: true });
    const codeKept = (await editorText()).trimEnd() === solution("ch01-l01").trimEnd();
    const solvedAfterReload = await levelCards();
    await openLevel("ch01-l01", { fresh: true });
    const codeAfterFresh = (await editorText()).trimEnd() === solution("ch01-l01").trimEnd();
    const solvedAfterFresh = await levelCards();
    expect(codeKept, "level 1's code wasn't kept across a reload");
    expect(solvedAfterReload === LEVELS.length, `${solvedAfterReload} levels marked solved after a reload`);
    expect(!codeAfterFresh && solvedAfterFresh === 0, `a fresh start kept the code (${codeAfterFresh}) or ${solvedAfterFresh} solved marks`);
    return `${solvedAfterReload} solved after a reload, 0 after a fresh start`;
  });

  // -- M2: hints ------------------------------------------------------------------------------
  // Hints are spoilers too: these checks report counts and button labels, never hint text.
  const hintState = () =>
    b.evaluate(`({
      open: document.querySelectorAll('.hints .hint-list li').length,
      button: document.querySelector('.hints .hint-button')?.textContent ?? null,
      costNote: document.querySelector('.hints')?.innerText.includes('gives up') ?? false,
    })`);

  await check("M2: hints open one at a time, say what they cost first, and stay open after a reload", async () => {
    await openLevel("ch01-l02", { fresh: true });
    await challengeTab();
    const before = await hintState();
    await b.evaluate(`document.querySelector('.hints .hint-button').click()`);
    const one = await hintState();
    await openLevel("ch01-l02", { reload: true });
    await challengeTab();
    const reloaded = await hintState();
    expect(before.open === 0 && before.button === "Show a hint (1 of 3)" && before.costNote, `before: ${JSON.stringify(before)}`);
    expect(one.open === 1 && one.button === "Show the next hint (2 of 3)" && !one.costNote, `after one: ${JSON.stringify(one)}`);
    expect(reloaded.open === 1, `after a reload: ${JSON.stringify(reloaded)}`);
  });

  await check("M2: solving after opening a hint earns two stars; the third says why", async () => {
    await openLevel("ch01-l02");
    await setCode(solution("ch01-l02"));
    const r = await run();
    const third = await b.evaluate(`document.querySelectorAll('.outcome-host .stars li')[2].textContent`);
    expect(r.head === "Solved!" && r.stars === 2, `${r.stars} stars: ${brief(r)}`);
    expect(third.includes("you opened 1"), third);
    return third;
  });

  await check("M2: a failed run offers 'Need a hint?', which opens the Challenge panel at the hints", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await setCode("pawn.fly()\n");
    const r = await run();
    const offered = await hasButton("Need a hint?", ".outcome-host");
    if (offered) await clickButton("Need a hint?", ".outcome-host");
    const after = await b.evaluate(`({
      challenge: !document.querySelector('.tab-panel .hints').closest('.tab-panel').hidden,
      focused: document.activeElement?.classList.contains('hint-button') ?? false,
      open: document.querySelectorAll('.hints .hint-list li').length,
    })`);
    expect(r.head !== "Solved!" && offered, `${brief(r)} | offered: ${offered}`);
    expect(after.challenge && after.focused && after.open === 0, `after the click: ${JSON.stringify(after)} (it shows the hints, it doesn't open one)`);
  });

  // -- M2: the idiomatic-solution comparison --------------------------------------------------
  // The code in the dialog is compared with the files in Node; only yes/no is reported.
  const paneText = (pane) => editorText(`.compare-dialog .${pane}`);
  const solutionFetches = () => b.evaluate(`performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/solutions/')).length`);

  await check("M2: before solving, there's no comparison, and no solution has been fetched", async () => {
    await openLevel("ch01-l03", { fresh: true });
    await setCode("pawn.fly()\n");
    await run();
    await challengeTab();
    const offered = await hasButton("Compare with an idiomatic solution");
    const fetched = await solutionFetches();
    expect(!offered && fetched === 0, `compare button: ${offered}; ${fetched} solution files fetched`);
  });

  await check("M2: after solving, the comparison shows your code, the idiomatic solution and its note", async () => {
    await setCode(solution("ch01-l03"));
    const r = await run();
    await clickButton("Compare with an idiomatic solution", ".outcome-host");
    // A boolean: CodeMirror's elements carry objects that can't be sent back by value.
    await b.waitFor(`!!document.querySelector('.compare-dialog .compare-idiomatic .cm-line')`, 10_000, "the comparison");
    const reference = solution("ch01-l03").trimEnd();
    const yours = (await paneText("compare-yours")) === reference;
    const idiomatic = (await paneText("compare-idiomatic")) === reference;
    const note = await b.evaluate(`document.querySelector('.compare-note').innerText.trim().length`);
    expect(r.head === "Solved!", brief(r));
    expect(yours && idiomatic && note > 40, `your code matches: ${yours}; idiomatic matches the file: ${idiomatic}; note length ${note}`);
  });

  await check("M2: Esc closes the comparison (not opening Settings), and the Challenge panel keeps the button", async () => {
    await b.key("Escape");
    await sleep(100);
    const state = await b.evaluate(`({
      comparison: !!document.querySelector('.compare-dialog'),
      settings: document.querySelector('.settings-dialog').open,
    })`);
    await openLevel("ch01-l03", { reload: true });
    await challengeTab();
    const inPanel = await b.evaluate(`!!document.querySelector('.solution-section button')`);
    expect(!state.comparison && !state.settings, `after Esc: ${JSON.stringify(state)}`);
    expect(inPanel, "no comparison button in the Challenge panel of a solved level");
  });

  // -- QA-018: seeing the idiomatic solution gives up the third star -----------------------
  await check("QA-018: with a star to lose, Compare asks first in the Challenge panel; 'Not yet' keeps it closed", async () => {
    await openLevel("practice-04", { fresh: true });
    await setCode(`${solution("practice-04")}\nsteps = 0\n`); // solves it, one line over par
    const r = await run();
    await clickButton("Compare with an idiomatic solution", ".outcome-host");
    const asked = await b.evaluate(`({
      tab: document.querySelector('.tab.active')?.textContent,
      question: document.querySelector('.solution-section .confirm-step p')?.textContent ?? '',
      focused: document.activeElement?.textContent,
      dialog: !!document.querySelector('.compare-dialog'),
    })`);
    await clickButton("Not yet", ".solution-section .confirm-step");
    const after = await b.evaluate(`({ confirm: !!document.querySelector('.confirm-step'), dialog: !!document.querySelector('.compare-dialog') })`);
    expect(r.head === "Solved!" && r.stars === 2, `${r.stars} stars: ${brief(r)}`);
    expect(asked.tab === "Challenge" && asked.question.includes("gives up this level's third star") && asked.focused === "Show it" && !asked.dialog, JSON.stringify(asked));
    expect(!after.confirm && !after.dialog, `after 'Not yet': ${JSON.stringify(after)}`);
  });

  await check("QA-018: once the solution is seen, a run earns two stars at most, and says why", async () => {
    await clickButton("Compare with an idiomatic solution", ".solution-section");
    await clickButton("Show it", ".solution-section .confirm-step");
    await b.waitFor(`!!document.querySelector('.compare-dialog .compare-idiomatic .cm-line')`, 10_000, "the comparison");
    await b.key("Escape");
    await setCode(solution("practice-04"));
    const r = await run();
    await clickButton("Compare with an idiomatic solution", ".outcome-host");
    const reopened = await b.evaluate(`!!document.querySelector('.compare-dialog') && !document.querySelector('.confirm-step')`);
    await b.key("Escape");
    expect(r.head === "Solved!" && r.stars === 2 && r.text.includes("No hints or solution seen (you looked at the solution)"), `${r.stars} stars: ${brief(r)}`);
    expect(reopened, "a second look should open straight away: there's no star left to lose");
    return `${r.stars} stars`;
  });

  // -- M2: giving up ------------------------------------------------------------------------
  const offersSolution = () => hasButton("Show me a solution…", ".outcome-host");

  await check("M2: replaying a failed run doesn't count it again towards 'Show me a solution'", async () => {
    await openLevel("ch01-l02", { fresh: true });
    await challengeTab();
    for (let i = 0; i < 3; i++) await b.evaluate(`document.querySelector('.hints .hint-button').click()`);
    await setCode("pawn.fly()\n");
    await run();
    for (let i = 0; i < 3; i++) {
      await b.evaluate(`${button(0)}.click()`); // back to the start
      await b.evaluate(`${button(4)}.click()`); // and to the outcome again
    }
    const note = await b.evaluate(`document.querySelector('.hints p')?.textContent ?? ''`);
    expect(note.includes("after 2 more runs"), `after one failed run, replayed 3 times: "${note}"`);
  });

  await check("M2: with every hint open, the third failed run offers 'Show me a solution'", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await challengeTab();
    for (let i = 0; i < 3; i++) await b.evaluate(`document.querySelector('.hints .hint-button').click()`);
    await setCode("pawn.fly()\n");
    const offered = [];
    for (let i = 0; i < 3; i++) {
      await run();
      offered.push(await offersSolution());
    }
    const needHint = await hasButton("Need a hint?", ".outcome-host");
    expect(JSON.stringify(offered) === "[false,false,true]", `offered after runs 1-3: ${JSON.stringify(offered)}`);
    expect(!needHint, "'Need a hint?' is still offered with every hint open");
  });

  await check("M2: 'Show me a solution' asks first; 'Show it' opens the comparison and marks the level", async () => {
    await clickButton("Show me a solution…", ".outcome-host");
    const focused = await b.evaluate(`document.activeElement?.classList.contains('give-up-button') ?? false`);
    await b.evaluate(`document.querySelector('.give-up-button').click()`);
    const asked = await b.evaluate(`!!document.querySelector('.hints .confirm-step')`);
    await clickButton("Not yet", ".hints .confirm-step");
    const cancelled = await b.evaluate(`!document.querySelector('.hints .confirm-step') && !!document.querySelector('.give-up-button') && !document.querySelector('.compare-dialog')`);
    await b.evaluate(`document.querySelector('.give-up-button').click()`);
    await clickButton("Show it", ".hints .confirm-step");
    await b.waitFor(`!!document.querySelector('.compare-dialog .compare-idiomatic .cm-line')`, 10_000, "the comparison");
    const idiomatic = (await paneText("compare-idiomatic")) === solution("ch01-l01").trimEnd();
    await b.key("Escape");
    const tag = await b.evaluate(`!!document.querySelector('.solution-section button')`);
    expect(focused && asked && cancelled, `focused: ${focused}; asked: ${asked}; 'Not yet' cancelled: ${cancelled}`);
    expect(idiomatic && tag, `solution shown: ${idiomatic}; Solution section: ${tag}`);
    await levelCards();
    const cards = await b.evaluate(`(() => {
      const card = document.querySelector('a[href="#/level/ch01-l01"]');
      return { tag: card.querySelector('.card-tag')?.textContent ?? null, solved: card.classList.contains('solved') };
    })()`);
    expect(cards.tag === "Solution seen" && !cards.solved, `level card: ${JSON.stringify(cards)}`);
  });

  await check("M2: solving it yourself afterwards counts, with two stars (the hints were open)", async () => {
    await openLevel("ch01-l01");
    await setCode(solution("ch01-l01"));
    const r = await run();
    const card = await levelCards().then(() =>
      b.evaluate(`(() => { const card = document.querySelector('a[href="#/level/ch01-l01"]'); return { tag: !!card.querySelector('.card-tag'), stars: card.querySelectorAll('.icon-star').length }; })()`),
    );
    expect(r.head === "Solved!" && r.stars === 2, `${r.stars} stars: ${brief(r)}`);
    expect(!card.tag && card.stars === 2, `level card: ${JSON.stringify(card)}`);
  });

  // -- QA-016: a hidden goal (the practice level) --------------------------------------------
  // Labels, marks and counts only: never code.
  const caseRow = () => b.evaluate(`[...document.querySelectorAll('.case-row button')].map((e) => (e.getAttribute('aria-pressed') === 'true' ? '*' : '') + e.textContent)`);
  const spotMarks = () => b.evaluate(`[...document.querySelectorAll('.board-host .spot-mark')].map((e) => e.textContent).join('')`);

  await check("QA-016: the practice level shows ? where the goal might be, and says the code runs once for each", async () => {
    await levelCards();
    const heading = await b.evaluate(`[...document.querySelectorAll('.chapter h2')].map((e) => e.textContent).find((t) => t.includes('Testing ground'))`);
    await openLevel("practice-01", { fresh: true });
    await challengeTab();
    const goals = await b.evaluate(`document.querySelector('.objectives').innerText`);
    const board = await b.evaluate(`({ spots: document.querySelectorAll('.board-host .spot').length, flags: document.querySelectorAll('.board-host .goal').length })`);
    const text = await b.evaluate(`document.body.innerText`);
    expect(heading === "Testing ground", `heading: ${heading}`);
    expect(goals.includes("hidden on one of the 4 squares marked ?") && goals.includes("runs once for each"), goals);
    expect(board.spots === 4 && board.flags === 0 && (await spotMarks()) === "????", `board: ${JSON.stringify(board)}`);
    expect(!/hidden board/i.test(text), "the page still says 'hidden board'");
  });

  await check("QA-016: code that counts to one ? square works there only; each square shows how it went", async () => {
    await setCode(withoutExpectLine(solution("practice-01", ".naive")));
    const r = await run();
    const row = await caseRow();
    const marks = await spotMarks();
    expect(r.head === "Not there yet" && r.note === "It worked for 1 of the 4 places the goal could be. This run is the one with the goal on b3.", brief(r));
    expect(JSON.stringify(row) === JSON.stringify(["*b3 ✗", "b5 ✗", "b6 ✓", "b8 ✗"]), `case row: ${JSON.stringify(row)}`);
    expect(marks === "✗✓✗", `marks on the other ? squares: ${marks}`); // b3 has the flag in this case
    return row.join(" ");
  });

  await check("QA-016: replaying the case that worked still reads as a failed run, with no way on", async () => {
    await clickButton("b6 ✓", ".case-row");
    const r = await outcome();
    const row = await caseRow();
    expect(r.head === "Not there yet" && r.tone.includes("outcome-warn"), JSON.stringify(r));
    expect(!r.buttons.some((label) => /Next level|Compare/.test(label)), `offers: ${JSON.stringify(r.buttons)}`);
    expect(r.note?.endsWith("This run is the one with the goal on b6.") && row[2] === "*b6 ✓", `${r.note} | ${JSON.stringify(row)}`);
  });

  await check("QA-016: picking another case while one replays stops the first", async () => {
    await clickButton("b8 ✗", ".case-row");
    await clickButton("b5 ✗", ".case-row"); // straight away, while b8's replay is still playing
    const r = await outcome({ jump: false });
    await sleep(1500); // long enough for a leftover replay of b8 to have reached its end
    const later = await outcome({ jump: false });
    expect(r.note?.endsWith("goal on b5.") && later.note === r.note, `${r.note} | later: ${later.note}`);
  });

  await check("QA-016: the reference solution finds the goal on every ? square, for three stars", async () => {
    await setCode(solution("practice-01"));
    const r = await run();
    const row = await caseRow();
    expect(r.head === "Solved!" && r.text.includes("It worked for all 4 places the goal could be.") && r.stars === 3, `${r.stars} stars: ${brief(r)}`);
    expect(row.every((label) => label.endsWith("✓")), `case row: ${JSON.stringify(row)}`);
    return brief(r);
  });

  // -- M3.1: the obstacle toolkit (the Testing ground's practice-02 to practice-09) ------------
  // Counts, labels and outcomes only: never code, never the console (it can hold an answer).
  const PRACTICE = ["practice-02", "practice-03", "practice-04", "practice-05", "practice-06", "practice-07", "practice-08", "practice-09", "practice-10"];
  const CH02 = ["ch02-l01", "ch02-l02", "ch02-l03", "ch02-l04", "ch02-l05", "ch02-l06"]; // Chapter 2 (M3.2)
  const CH03 = ["ch03-l01", "ch03-l02", "ch03-l03", "ch03-l04", "ch03-l05", "ch03-l06"]; // Chapter 3 (M3.3)
  const CH04 = ["ch04-l01", "ch04-l02", "ch04-l03", "ch04-l04", "ch04-l05", "ch04-l06"]; // Chapter 4 (M3.4)
  const drawn = () =>
    b.evaluate(`(() => {
      const board = document.querySelector('.board-host .board');
      const count = (selector) => board.querySelectorAll(selector).length;
      return {
        pits: count('.pit'), waypoints: count('.waypoint'), gems: count('.gem'), timed: count('.timed-gate'),
        enemies: count('.enemy'), armoured: count('.enemy.armoured'), routes: count('.route'),
        crossed: count('.waypoint.crossed'), collected: count('.gem.collected'), gone: count('.enemy.gone'),
        rooks: count('.enemy-rook'), bishops: count('.enemy-bishop'), attacked: count('.attacks .attacked'),
        planks: count('.plank'), planksTaken: count('.plank.collected'), bridged: count('.pit.bridged'),
        badges: [...board.querySelectorAll('.badge-text')].map((e) => e.textContent),
        lost: board.classList.contains('lost'),
      };
    })()`);

  await check("M3.1: each obstacle is drawn, and the Challenge panel says its rule", async () => {
    const d = {};
    for (const id of PRACTICE) {
      await openLevel(id, { fresh: true });
      await challengeTab();
      const obstacles = await b.evaluate(`document.querySelector('ul.obstacles')?.innerText ?? ''`);
      d[id] = { ...(await drawn()), obstacles: obstacles.split("\n").filter(Boolean).length };
    }
    expect(d["practice-02"].pits === 10 && d["practice-02"].planks === 1 && d["practice-02"].obstacles === 2, `pits and a plank: ${JSON.stringify(d["practice-02"])}`);
    expect(d["practice-10"].pits === 3 && d["practice-10"].enemies === 1 && d["practice-10"].obstacles === 4, `pitfall: ${JSON.stringify(d["practice-10"])}`);
    expect(d["practice-03"].waypoints === 3, `waypoints: ${JSON.stringify(d["practice-03"])}`);
    expect(d["practice-04"].enemies === 1 && d["practice-04"].routes === 1 && d["practice-04"].obstacles === 2, `patrol: ${JSON.stringify(d["practice-04"])}`);
    expect(d["practice-05"].badges.includes("chases") && d["practice-05"].routes === 0, `chaser: ${JSON.stringify(d["practice-05"])}`);
    expect(d["practice-06"].badges.some((text) => text.startsWith("⚙")), `clockwork: ${JSON.stringify(d["practice-06"])}`);
    expect(d["practice-07"].timed === 2 && d["practice-07"].badges.join() === "2 of 3 · tick 0,2 of 4 · tick 0", `timed gates: ${JSON.stringify(d["practice-07"])}`);
    expect(d["practice-08"].gems === 3 && d["practice-08"].badges.includes("?"), `gems and the guard: ${JSON.stringify(d["practice-08"])}`);
    expect(d["practice-09"].enemies === 2 && d["practice-09"].armoured === 1, `capture: ${JSON.stringify(d["practice-09"])}`);
    return Object.entries(d).map(([id, x]) => `${id}: ${x.obstacles} rules`).join(", ");
  });

  await check("M3.1: The Toll shows the guard's question, never its answer", async () => {
    await openLevel("practice-08", { fresh: true });
    await challengeTab();
    const goals = await b.evaluate(`document.querySelector('.objectives').innerText`);
    expect(goals.includes('The guard asks: "How many gems did you collect?"') && goals.includes("Collect all 3 gems"), goals);
  });

  await check("M3.1: a run that falls into a pit reads Lost, says where, and marks the square", async () => {
    await openLevel("practice-02", { fresh: true });
    await setCode(withoutExpectLine(solution("practice-02", ".naive")));
    const r = await run();
    const board = await drawn();
    expect(r.head === "Lost" && r.tone.includes("outcome-bad") && /fell into the pit on [a-d][1-4]\./.test(r.text), brief(r));
    expect(board.lost && r.errorLine && r.stars === 0, `board lost: ${board.lost}, error line: ${r.errorLine}`);
    return brief(r);
  });

  await check("M3.1: walking into the patrol, or a clockwork patrol catching up, is being caught", async () => {
    const results = [];
    for (const id of ["practice-04", "practice-05", "practice-06"]) {
      await openLevel(id, { fresh: true });
      await setCode(withoutExpectLine(solution(id, ".naive")));
      const r = await run();
      expect(r.head === "Lost" && /was caught by the (patrol|chaser) on [a-g][1-6]\./.test(r.text), `${id}: ${brief(r)}`);
      results.push(`${id}: ${r.head}`);
    }
    return results.join(", ");
  });

  // Like Chapter 1's reference-solution checks, plus what the board should show at the end.
  const afterwards = {
    "practice-03": (board) => expect(board.crossed === 3, `waypoints ticked off: ${board.crossed}`),
    "practice-08": (board) => expect(board.collected === 3, `gems collected: ${board.collected}`),
    "practice-09": (board) => expect(board.gone === 1, `enemies captured: ${board.gone}`),
    "practice-02": (board) => expect(board.bridged === 1 && board.planksTaken === 1, `pits bridged: ${board.bridged}, planks taken: ${board.planksTaken}`),
    "practice-10": (board) => expect(board.gone === 1, `chasers gone: ${board.gone}`),
  };
  for (const id of [...PRACTICE, ...CH02, ...CH03, ...CH04]) {
    await check(`${id}: reference solution solves it`, async () => {
      await openLevel(id, { fresh: true });
      await setCode(solution(id));
      const r = await run();
      expect(r.head === "Solved!" && r.stars === 3, `${r.stars} of 3 stars: ${brief(r)}`);
      afterwards[id]?.(await drawn());
      return brief(r);
    });
  }

  // -- QA-017: pits swallow chasers, and planks bridge them -------------------------------
  await check("QA-017: in Pitfall, the chaser that steps into a pit falls in, and the console says so", async () => {
    await openLevel("practice-10", { fresh: true });
    await setCode(solution("practice-10"));
    const r = await run();
    const said = await gameMessages();
    const fell = said.filter((text) => /^The chaser fell into the pit on [a-f][1-5]\.$/.test(text)).length;
    expect(r.head === "Solved!" && fell === 1, `${r.head}, ${fell} falls in ${said.length} messages`);
  });

  await check("QA-017: in Stepping Stones, picking up the plank is announced, and bridging where there's no pit is an error", async () => {
    await openLevel("practice-02", { fresh: true });
    await setCode(solution("practice-02"));
    await run();
    const said = await gameMessages();
    expect(said.includes("Your pawn picked up a plank. It's carrying 1 plank."), `no pick-up among ${said.length} messages`);
    await setCode("pawn.bridge()");
    const r = await run();
    expect(r.head === "Python stopped" && r.text.includes("Planks only go over pits, and there's no open pit on c2."), brief(r));
    return brief(r);
  });

  // -- QA-019 to QA-024: lesson boards, clockwork counts, crushing gates -----------------------
  // Statuses, counts and the game's messages only: never a snippet's or a level's code.
  const snippet = (index) => `document.querySelectorAll('.lesson .snippet')[${index}]`;
  /** Run a lesson snippet (counting from 0), wait for it to end, and describe how it ended. */
  async function runSnippet(index, { settle = false } = {}) {
    await b.evaluate(`${snippet(index)}.querySelector('.btn').click()`);
    await b.waitFor(`/Finished|Lost|stopped/i.test(${snippet(index)}.querySelector('.snippet-status').textContent)`, 20_000, "snippet ended");
    if (settle) await sleep(1500); // the status shows as the last line starts; its moves animate just after
    return snippetBoard(index);
  }
  const snippetBoard = (index) =>
    b.evaluate(`(() => {
      const s = ${snippet(index)};
      return {
        status: s.querySelector('.snippet-status').textContent,
        said: [...s.querySelectorAll('.snippet-output .game-message')].map((e) => e.textContent),
        enemies: [...s.querySelectorAll('.board .enemy:not(.gone)')].map((e) => e.style.transform),
        badges: [...s.querySelectorAll('.board .badge-text')].map((e) => e.textContent),
      };
    })()`);
  const gearCount = (text = "") => /^⚙\uFE0E? (\d+)$/.exec(text)?.[1];

  await check("QA-019: Pursuit's lesson snippets have a chaser, and it moves as the code runs", async () => {
    await openLevel("practice-05", { fresh: true });
    await b.waitFor(`${snippet(1)}.querySelector('.board .enemy')`, 20_000, "the lesson board");
    const before = await snippetBoard(1);
    const after = await runSnippet(1, { settle: true });
    expect(before.enemies.length === 1 && after.enemies.length === 1 && before.enemies[0] !== after.enemies[0], `chaser: ${JSON.stringify([before.enemies, after.enemies])}`);
    expect(after.status.includes("Finished"), after.status);
  });

  await check("QA-019: snippets show the game's messages, and one meant to lose reads Lost", async () => {
    await openLevel("practice-10", { fresh: true });
    const pitfall = await runSnippet(0, { settle: true });
    await openLevel("practice-02", { fresh: true });
    const stones = await runSnippet(0);
    expect(pitfall.said.includes("The chaser fell into the pit on c2.") && pitfall.enemies.length === 0, JSON.stringify(pitfall));
    expect(stones.status.includes("Lost") && stones.said.includes("Your pawn fell into the pit on c1."), JSON.stringify(stones));
    return `${pitfall.status} / ${stones.status}`;
  });

  await check("QA-021: a clockwork patrol's gear counts only the lines that run for the first time", async () => {
    await openLevel("practice-06", { fresh: true });
    const start = (await drawn()).badges;
    await setCode("for i in range(5):\n    x = i\n"); // two new lines, the second run five times
    await run();
    const end = (await drawn()).badges;
    const looped = await runSnippet(1, { settle: true }); // the lesson's loop of moves
    expect(gearCount(start[0]) === "0" && gearCount(end[0]) === "2", `gear before and after: ${JSON.stringify([start, end])}`);
    expect(gearCount(looped.badges[0]) === "2", `the lesson's loop: ${JSON.stringify(looped.badges)}`);
    return `${start[0]} → ${end[0]}`;
  });

  await check("QA-024: Portcullis crushes a pawn under a shutting gate, and its lesson shows bump, crush and pass", async () => {
    await openLevel("practice-07", { fresh: true });
    await setCode("pawn.move(2)\n"); // into the first gate on its last open tick
    const r = await run();
    const lesson = [await runSnippet(0), await runSnippet(1), await runSnippet(2)].map((s) => s.status);
    expect(r.head === "Lost" && r.text.includes("Your pawn was crushed by the gate on c1."), brief(r));
    expect(/stopped/.test(lesson[0]) && lesson[1].includes("Lost") && lesson[2].includes("Finished"), JSON.stringify(lesson));
    return lesson.join(" / ");
  });

  // -- QA-025 to QA-028: the Testing ground's hints ------------------------------------------
  // Hints are spoilers: these checks ask the page yes/no questions about them, never for their text.
  /** Open a level's three hints and answer `questions`, JS expressions over `hints` (their texts), in the page. */
  async function aboutHints(id, questions) {
    await openLevel(id, { fresh: true });
    await challengeTab();
    for (let i = 0; i < 3; i++) await b.evaluate(`document.querySelector('.hints .hint-button').click()`);
    return b.evaluate(`(() => {
      const hints = [...document.querySelectorAll('.hints .hint-list li')].map((li) => li.textContent);
      return { ${Object.entries(questions).map(([name, test]) => `${name}: Boolean(${test})`).join(", ")} };
    })()`);
  }
  const allTrue = (facts) => Object.values(facts).every(Boolean);

  await check("QA-025: Stepping Stones' hint 2 explains planks without code, and hint 3 shows pawn.bridge()", async () => {
    const facts = await aboutHints("practice-02", {
      three: "hints.length === 3",
      explains: "hints[1].includes('plank') && !/pawn\\.|\\(\\)/.test(hints[1])",
      showsTheCode: "hints[2].includes('pawn.bridge()')",
    });
    expect(allTrue(facts), JSON.stringify(facts));
  });

  await check("QA-026, QA-027: the third hints of The Sentry's Round and Pursuit wait, and never turn on the spot", async () => {
    const facts = {};
    for (const id of ["practice-04", "practice-05"]) {
      facts[id] = await aboutHints(id, { waits: "hints[2].includes('wait()')", noTurns: "!hints[2].includes('turn_')" });
    }
    expect(Object.values(facts).every(allTrue), JSON.stringify(facts));
  });

  await check("QA-027: Pursuit unlocks wait() with par 4, and its first lesson snippet waits while the chaser stays behind its wall", async () => {
    await openLevel("practice-05", { fresh: true });
    await b.waitFor(`${snippet(0)}.querySelector('.board .enemy')`, 20_000, "the lesson board");
    const before = await snippetBoard(0);
    const after = await runSnippet(0, { settle: true });
    await challengeTab();
    const panel = await b.evaluate(`({
      knowsWait: [...document.querySelectorAll('.abilities code')].some((e) => e.textContent === 'pawn.wait'),
      par4: document.querySelector('.star-goals').textContent.includes('Use 4 lines of code or fewer'),
    })`);
    expect(after.status.includes("Finished") && before.enemies[0] === after.enemies[0], `chaser: ${JSON.stringify([before.enemies, after.enemies])}, ${after.status}`);
    expect(allTrue(panel), JSON.stringify(panel));
  });

  await check("QA-028: Portcullis' hint 2 says the gates keep cycling, hint 3 only waits, and par is 7", async () => {
    const facts = await aboutHints("practice-07", {
      reminder: "hints[1].includes('the gates keep cycling on every tick')",
      waits: "hints[2].includes('wait()') && !hints[2].includes('turn_')",
      par7: "document.querySelector('.star-goals').textContent.includes('Use 7 lines of code or fewer')",
    });
    expect(allTrue(facts), JSON.stringify(facts));
  });

  await check("QA-023: The Toll says it's a demo with nothing new to learn", async () => {
    await levelCards();
    const card = await b.evaluate(`document.querySelector('a[href="#/level/practice-08"]').innerText`);
    expect(card.includes("A demo of gems and a guard who asks a question"), card);
  });

  // -- QA-002: level 4's locked gate --------------------------------------------------------
  await check("QA-002: level 4 starts with the guard's comment, and the panels don't give the passphrase away", async () => {
    await openLevel("ch01-l04", { fresh: true });
    const starterMatches = await b.evaluate(
      `document.querySelector('.level-right .cm-content').innerText.trim() === "# Tell the guard at the gate that 'Pawns never retreat'"`,
    );
    await challengeTab();
    const panels = await b.evaluate(`document.querySelector('.level-left').innerText`);
    expect(starterMatches, "the editor doesn't start with exactly the guard's comment");
    expect(!/never retreat/i.test(panels), "the Learn/Challenge panels mention the passphrase");
    expect(panels.includes("locked gate on b3"), "the Challenge panel doesn't mention the gate");
    const gate = await b.evaluate(`!!document.querySelector('.board .gate') && !document.querySelector('.board .gate.open')`);
    expect(gate, "no locked gate drawn");
  });

  await check("QA-002: solving level 4 opens the gate on the board", async () => {
    await openLevel("ch01-l04");
    await setCode(solution("ch01-l04"));
    const r = await run();
    const open = await b.evaluate(`!!document.querySelector('.board .gate.open')`);
    expect(r.head === "Solved!" && open, `${brief(r)} | gate open: ${open}`);
  });

  await check("QA-002: a near miss next to the gate gets the guard's reply, then the gate stops the pawn", async () => {
    await openLevel("ch01-l04");
    await setCode(withoutExpectLine(solution("ch01-l04", ".naive3"))); // passphrase printed with its quote marks
    const r = await run();
    const guard = await gameMessages();
    const open = await b.evaluate(`!!document.querySelector('.board .gate.open')`);
    expect(guard.join() === "The guard called your mother a hamster! The gate remains locked.", `guard said: ${JSON.stringify(guard)}`);
    expect(!open, "the gate opened");
    expect(r.text.includes("Does your father really smell of elderberries? Maybe try the passphrase first."), brief(r));
    // QA-008: the error also points back to the line that said the wrong thing
    const pointer = r.text.match(/The guard didn't accept what line (\d+) printed\./);
    const printLine = await b.evaluate(
      `[...document.querySelectorAll('.level-right .cm-line')].findIndex((l) => l.textContent.startsWith('print(')) + 1`,
    );
    expect(pointer && Number(pointer[1]) === printLine, `pointer: ${pointer?.[0] ?? "missing"} (print is on line ${printLine})`);
    return brief(r);
  });

  await check("QA-002: saying it too early does nothing; the gate stays shut", async () => {
    await openLevel("ch01-l04");
    await setCode(withoutExpectLine(solution("ch01-l04", ".naive"))); // passphrase said far from the gate
    const r = await run();
    const guard = (await gameMessages()).length;
    expect(guard === 0 && r.text.includes("elderberries"), `${brief(r)} | guard lines: ${guard}`);
    expect(!r.text.includes("didn't accept"), "QA-008: no pointer line when the guard never heard anything");
  });

  // -- QA-004: level 5's gate mid-route ------------------------------------------------------
  await check("QA-004: level 5 has the gate on b5 and the guard's comment, with no passphrase in the panels", async () => {
    await openLevel("ch01-l05", { fresh: true });
    const starterMatches = await b.evaluate(
      `document.querySelector('.level-right .cm-content').innerText.trim() === "# Tell the guard you are 'Checking out' to get to the next chapter."`,
    );
    await challengeTab();
    const panels = await b.evaluate(`document.querySelector('.level-left').innerText`);
    expect(starterMatches, "the editor doesn't start with exactly the guard's comment");
    expect(!/checking out/i.test(panels), "the Learn/Challenge panels mention the passphrase");
    expect(panels.includes("locked gate on b5") && panels.includes("At most 13 lines"), "Challenge panel: gate on b5 / 13-line limit");
  });

  await check("QA-004: the line limit still rejects one move per line", async () => {
    await openLevel("ch01-l05");
    await setCode(withoutExpectLine(solution("ch01-l05", ".naive")));
    const r = await run();
    expect(r.head === "Check the rules" && r.text.includes("at most 13 lines"), brief(r));
    return brief(r);
  });

  await check("QA-008: in level 5, a near miss at the gate is pointed back to from the error", async () => {
    await openLevel("ch01-l05");
    await setCode(withoutExpectLine(solution("ch01-l05", ".naive4")));
    const r = await run();
    expect(r.text.includes("elderberries") && /The guard didn't accept what line (\d+) printed\./.test(r.text), brief(r));
  });

  await check("QA-004: the old route with nothing said is stopped at the gate", async () => {
    await openLevel("ch01-l05");
    await setCode(withoutExpectLine(solution("ch01-l05", ".naive2")));
    const r = await run();
    expect(r.text.includes("elderberries") && !r.text.includes("didn't accept"), brief(r));
  });

  await check("step controls: rewind to the start, then step forward twice", async () => {
    await openLevel("ch01-l05");
    await setCode(solution("ch01-l05"));
    await run();
    await b.evaluate(`${button(0)}.click()`);
    const start = await b.evaluate(`document.querySelector('.step-label').textContent`);
    await b.evaluate(`${button(3)}.click()`);
    await b.evaluate(`${button(3)}.click()`);
    const after = await b.evaluate(`({
      label: document.querySelector('.step-label').textContent,
      highlighted: !!document.querySelector('.level-right .cm-step-line'),
      outcome: !!document.querySelector('.outcome-host .outcome'),
    })`);
    expect(start.startsWith("Step 0 of"), `start label: ${start}`);
    expect(after.label.startsWith("Step 2 of") && after.highlighted && !after.outcome, JSON.stringify(after));
    return `${start} → ${after.label}`;
  });

  // -- mistakes get plain-language explanations (all deliberately wrong code) ----------
  const mistakes = [
    ["typo in an ability", "pawn.mvoe()", (r) => r.head === "Python stopped" && r.text.includes("Did you mean `move`") && r.errorLine],
    ["typo in pawn", "pwan.move()", (r) => r.text.includes("Did you mean `pawn`")],
    ["locked ability", "pawn.turn_left()", (r) => r.text.includes("hasn't learned `turn_left` yet")],
    ["text instead of a number", 'pawn.move("3")', (r) => r.text.includes("Numbers don't have quote marks")],
    ["missing bracket", "pawn.move(\npawn.move()", (r) => r.text.includes("never closed") && r.errorLine],
    ["bad indentation", "pawn.move()\n    pawn.move()", (r) => r.text.includes("starts with spaces")],
    ["no parentheses (warning)", "pawn.move", (r) => r.head === "Not there yet" && r.warnMarks === 1],
    ["walking off the board", "pawn.move(9)", (r) => r.text.includes("edge of the board")],
    ["endless loop", "while True:\n    x = 1", (r) => r.head === "Endless loop" && r.text.includes("never finished")],
    [
      "variables and console",
      'gold = 3\nprint("gold:", gold)',
      (r) => r.vars.some((v) => v.startsWith("gold 3 int")) && r.console.includes("gold: 3") && r.vars[0].startsWith("pawn pawn at c1"),
    ],
  ];
  for (const [label, code, ok] of mistakes) {
    await check(`mistake: ${label}`, async () => {
      await openLevel("ch01-l01");
      await setCode(code);
      const r = await run();
      expect(ok(r), brief(r));
      return brief(r);
    });
  }

  await check("line limit rejects one call per square (level 2)", async () => {
    await openLevel("ch01-l02");
    await setCode(withoutExpectLine(solution("ch01-l02", ".naive")));
    const r = await run();
    expect(r.head === "Check the rules" && r.text.includes("at most 2 lines"), brief(r));
    return brief(r);
  });

  await check("bump: animation and message (level 3)", async () => {
    await openLevel("ch01-l03");
    await setCode("pawn.turn_right()\npawn.move()");
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    const flashed = await b.waitFor(`document.querySelector('.bump-flash.flashing') ? 'yes' : ''`, 15_000, "bump flash");
    const r = await run();
    expect(flashed === "yes" && r.text.includes("bumped into a wall on b1"), brief(r));
    return brief(r);
  });

  await check("watchdog stops a C-level hang, then the next run is instant", async () => {
    await openLevel("ch01-l01");
    await setCode("print(sum(range(10**12)))");
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    const notice = await b.waitFor(
      `document.querySelector('.outcome-host .outcome')?.innerText.replace(/\\s+/g, ' ')`,
      15_000,
      "watchdog notice",
    );
    await setCode("pawn.move()");
    const started = Date.now();
    const r = await run();
    const ms = Date.now() - started;
    expect(notice.includes("still busy after 3 seconds"), notice);
    expect(r.head === "Not there yet", brief(r));
    return `next run ${ms} ms`;
  });

  await check("QA-007: selected text stays visible on the step and error lines", async () => {
    await openLevel("ch01-l01");
    await setCode("gold = 3\npawn.jump()");
    await run(); // ends on the error at line 2
    const errorBg = await b.evaluate(`getComputedStyle(document.querySelector('.level-right .cm-error-line')).backgroundColor`);
    await b.evaluate(`${button(0)}.click()`);
    await b.evaluate(`${button(3)}.click()`); // step 1: line 1 is the step line
    const stepBg = await b.evaluate(`getComputedStyle(document.querySelector('.level-right .cm-step-line')).backgroundColor`);
    await b.evaluate(`document.querySelector('.level-right .cm-content').focus()`);
    await b.key("Home", { keyCode: 36, modifiers: 2 }); // Ctrl+Home
    await b.key("End", { keyCode: 35, modifiers: 8 }); // Shift+End selects line 1
    const selected = await b.waitFor(`document.querySelector('.level-right .cm-selectionBackground') ? 'yes' : ''`, 3000, "selection drawn");
    const translucent = (color) => /^rgba\(.+, 0?\.\d+\)$/.test(color);
    expect(translucent(stepBg) && translucent(errorBg), `step ${stepBg} · error ${errorBg}`);
    expect(selected === "yes", "no selection drawn");
    return `step ${stepBg} · error ${errorBg}`;
  });

  // -- Learn panel, Challenge panel, scratch REPL ----------------------------------------
  await check("lesson snippet runs in place with output (level 4)", async () => {
    await openLevel("ch01-l04");
    await b.evaluate(`document.querySelector('.snippet .btn').click()`);
    await b.waitFor(`document.querySelector('.snippet-status').textContent.includes('Finished')`, 20_000, "snippet finished");
    const output = await b.evaluate(`document.querySelector('.snippet-output').textContent`);
    expect(output.includes("Hello, board!"), JSON.stringify(output));
    return JSON.stringify(output);
  });

  await check("challenge tab describes the goal and rules (level 2)", async () => {
    await openLevel("ch01-l02");
    await challengeTab();
    const text = await b.evaluate(`document.querySelector('.tab-panel:not([hidden])').innerText.replace(/\\s+/g, ' ')`);
    expect(text.includes("Reach the goal on b8") && text.includes("At most 2 lines"), text.slice(0, 160));
    // Headings are styled in capitals, and innerText returns them that way.
    expect(/stars solve the level\. use \d+ lines? of code or fewer \(par\)\. solve it without opening a hint or seeing the solution\./i.test(text), "the Stars section is missing or worded differently");
    return text.slice(0, 120);
  });

  await check("a snippet meant to fail explains itself (level 2)", async () => {
    await openLevel("ch01-l02");
    await b.evaluate(`document.querySelector('.lesson-pager .btn-primary').click()`); // to step 2, where this snippet is
    await b.evaluate(`document.querySelectorAll('.snippet .btn')[1].click()`);
    await b.waitFor(`document.querySelectorAll('.snippet-status')[1].textContent.includes('stopped')`, 20_000, "error snippet");
    const text = await b.evaluate(`document.querySelectorAll('.snippet')[1].innerText.replace(/\\s+/g, ' ')`);
    expect(text.includes("quote marks"), text.slice(0, 120));
  });

  await check("scratch REPL remembers variables and explains errors", async () => {
    await openLevel("ch01-l01");
    await b.evaluate(`document.querySelector('.repl-drawer').open = true`);
    for (const line of ["gold = 20", "gold * 2", "glod"]) {
      await b.evaluate(`document.querySelector('.repl-editor .cm-content').focus()`);
      await b.send("Input.insertText", { text: line });
      await b.key("Enter");
      await sleep(300);
    }
    const log = await b.evaluate(`document.querySelector('.repl-log').innerText.replace(/\\s+/g, ' ')`);
    expect(log.includes("40") && log.includes("Did you mean `gold`"), log);
    return log.slice(0, 120);
  });

  // -- The Codex (docs/Codex.md) ---------------------------------------------------------------
  // Entries are documentation, not spoilers; the code typed here is test code, never a solution.
  const codexTab = () => b.evaluate(`[...document.querySelectorAll('.tab')].find((t) => t.textContent === 'Codex').click()`);
  const codexEntries = async () => {
    await codexTab();
    await b.waitFor(`document.querySelector('.codex')`, 20_000, "the Codex");
    return b.evaluate(`[...document.querySelectorAll('.codex-entry')].map((e) => ({
      name: e.dataset.codex, open: e.open, isNew: !!e.querySelector('.codex-new'),
      introduced: e.querySelector('.codex-body > p.muted')?.textContent ?? '' }))`);
  };
  /** The centre of the first `word` in an editor's text, for hovering. */
  const wordAt = (word, editor = ".level-right .cm-content") =>
    b.evaluate(`(() => {
      const walker = document.createTreeWalker(document.querySelector(${JSON.stringify(editor)}), NodeFilter.SHOW_TEXT);
      for (let node; (node = walker.nextNode()); ) {
        const i = node.textContent.indexOf(${JSON.stringify(word)});
        if (i < 0) continue;
        const range = document.createRange();
        range.setStart(node, i + 1);
        range.setEnd(node, i + 2);
        const r = range.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      return null;
    })()`);
  const hover = ({ x, y }) => b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  const hoverAway = async () => {
    await hover({ x: 5, y: 5 });
    await sleep(400);
  };

  await check("Codex: the tab lists the level's abilities, then the built-ins taught so far, and marks what's new", async () => {
    await openLevel("ch01-l04", { fresh: true });
    const entries = await codexEntries();
    const names = entries.map((e) => e.name).join(",");
    const newOnes = entries.filter((e) => e.isNew && e.open).map((e) => e.name).join(",");
    expect(names === "pawn.move,pawn.turn_left,pawn.turn_right,print" && newOnes === "print", JSON.stringify(entries));
    expect(entries[0].introduced.startsWith("Introduced in 1.1 "), entries[0].introduced);
    return `${names}; new: ${newOnes}`;
  });

  await check("Codex: the Testing ground counts the chapters as taught, so range() comes from 3.1, not Clockwork", async () => {
    await openLevel("practice-06", { fresh: true });
    const entries = await codexEntries();
    const print = entries.find((e) => e.name === "print");
    const range = entries.find((e) => e.name === "range");
    expect(print && !print.isNew && range && !range.isNew && range.introduced.includes("3.1 The Grand Staircase"), JSON.stringify(entries));
  });

  await check("Codex: hovering a function in the editor shows its entry; other names show nothing", async () => {
    await openLevel("ch01-l04", { fresh: true });
    await setCode("pawn.move(2)\nprint(3)\nsteps = 1\n");
    await sleep(300);
    const shown = {};
    for (const word of ["move", "print", "steps"]) {
      await hover(await wordAt(word));
      await sleep(900); // longer than the hover delay
      shown[word] = await b.evaluate(`document.querySelector('.cm-tooltip .codex-card .codex-call')?.textContent ?? null`);
      await hoverAway();
    }
    expect(shown.move === "pawn.move(squares=1)" && shown.print === "print(value, ...)" && shown.steps === null, JSON.stringify(shown));
  });

  await check("Codex: a chip shows its entry on hover, and opens it in the Codex tab on click", async () => {
    await openLevel("ch01-l04", { fresh: true });
    await challengeTab();
    await b.waitFor(`document.querySelector('.codex')`, 20_000, "the Codex"); // entries load after the level
    const chip = await b.evaluate(`(() => { const r = document.querySelector('.codex-chip').getBoundingClientRect(); return { x: r.x + 5, y: r.y + 5 }; })()`);
    await hover(chip);
    const tip = await b.waitFor(`document.querySelector('.codex-tooltip:popover-open .codex-call')?.textContent`, 3000, "chip tooltip");
    await b.evaluate(`document.querySelector('.codex-chip').click()`);
    const after = await b.evaluate(`({
      tab: document.querySelector('.tab.active').textContent,
      open: document.querySelector('.codex-entry[data-codex="pawn.move"]').open,
      tooltipGone: !document.querySelector('.codex-tooltip:popover-open'),
    })`);
    expect(tip === "pawn.move(squares=1)" && after.tab === "Codex" && after.open && after.tooltipGone, JSON.stringify({ tip, after }));
  });

  await check("Codex: help() works in Scratch Python, whose stand-in pawn has no board", async () => {
    await openLevel("ch01-l03", { fresh: true });
    await b.evaluate(`document.querySelector('.repl-drawer').open = true`);
    for (const line of ["help(pawn.turn_left)", "pawn.move()", "help(len)"]) {
      await b.evaluate(`document.querySelector('.repl-editor .cm-content').focus()`);
      await b.send("Input.insertText", { text: line });
      await b.key("Enter");
      await sleep(line === "help(len)" ? 1500 : 400); // Python's own help loads pydoc the first time
    }
    const log = await b.evaluate(`document.querySelector('.repl-log').innerText.replace(/\\s+/g, ' ')`);
    const facts = {
      entry: log.includes("Help on pawn.turn_left:"),
      noBoard: log.includes("Scratch Python has no board"),
      pythonsOwn: log.includes("len(obj"),
    };
    expect(Object.values(facts).every(Boolean), JSON.stringify(facts));
  });

  await check("Codex: help is a built-in, never one of the Variables", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await setCode("steps = 1\n");
    await run();
    const vars = await b.evaluate(`[...document.querySelectorAll('.inspector tr')].map((r) => r.innerText.split(/\\s/)[0])`);
    expect(vars.includes("steps") && !vars.includes("help"), JSON.stringify(vars));
  });

  // -- M3.2: Chapter 2 (QA-029 to QA-032) -------------------------------------------------------
  // Labels, counts, yes or no. The code typed is test code, or a reference compared in Node.
  const boardsView = () =>
    b.evaluate(`({
      caption: document.querySelector('.boards-caption')?.textContent ?? null,
      thumbs: [...document.querySelectorAll('.board-thumb-label')].map((e) => e.textContent),
    })`);

  await check("QA-029: 2.1 has no signpost, and its one rule turns away a second number", async () => {
    await openLevel("ch02-l01", { fresh: true });
    await challengeTab();
    const panel = await b.evaluate(`({
      signs: document.querySelectorAll('.board-host .signpost, .sign-text').length,
      rules: [...document.querySelectorAll('ul.rules li')].map((e) => e.textContent),
    })`);
    await setCode("pawn.move(2)\npawn.move(3)\n");
    const r = await run();
    expect(panel.signs === 0 && panel.rules.includes("Your code may contain only one number, written once."), JSON.stringify(panel));
    expect(r.head === "Check the rules" && r.text.includes("It may contain only one number, written once"), brief(r));
    return panel.rules.join(" / ");
  });

  await check("QA-029: 2.2 brings in squares_ahead, New in its Codex, on three boards", async () => {
    await openLevel("ch02-l02", { fresh: true });
    const view = await boardsView();
    const entry = (await codexEntries()).find((e) => e.name === "pawn.squares_ahead");
    expect(view.thumbs.length === 2 && entry?.isNew === true, JSON.stringify({ view, entry }));
  });

  await check("QA-030: 2.4 starts with the guard's sentence as a comment, and its lesson's guard calls out a miscount", async () => {
    await openLevel("ch02-l04", { fresh: true });
    const starter = (await editorText()).includes('# Tell the guard "I walked X squares."');
    const lesson = await runSnippet(1, { settle: true }); // a wrong sum, then the right one
    const miscount = lesson.said.some((text) => text.startsWith('"Do you not know how to count!?" says the guard.'));
    expect(starter && miscount, JSON.stringify({ starter, miscount }));
  });

  await check("QA-031: the third hints of 2.5 and 2.6 take the remainder once", async () => {
    const facts = {};
    for (const id of ["ch02-l05", "ch02-l06"]) facts[id] = await aboutHints(id, { onePercent: "(hints[2].match(/%/g) ?? []).length === 1" });
    expect(Object.values(facts).every(allTrue), JSON.stringify(facts));
  });

  await check("QA-032: the other boards sit small beside the one on show, marked ✓ or ✗ after a run", async () => {
    await openLevel("ch02-l02", { fresh: true });
    const before = await boardsView();
    await b.evaluate(`document.querySelectorAll('.board-thumb')[0].click()`);
    const picked = await boardsView();
    expect(before.caption === "Board 1 of 3. Your code has to work on every board." && before.thumbs.join() === "Board 2,Board 3", JSON.stringify(before));
    expect(picked.caption.startsWith("Board 2 of 3") && picked.thumbs.join() === "Board 1,Board 3", JSON.stringify(picked));

    await setCode("pawn.move(1)\n"); // test code: it can't do the whole job anywhere
    const failed = await run();
    const after = await boardsView();
    expect(failed.head !== "Solved!" && /^Board [1-3] ✗$/.test(after.caption), `${brief(failed)} | ${JSON.stringify(after)}`);
    expect(after.thumbs.length === 2 && after.thumbs.every((text) => /^Board [1-3] [✓✗]$/.test(text)), JSON.stringify(after));
    const other = after.thumbs[0].split(" ")[1];
    await b.evaluate(`document.querySelectorAll('.board-thumb')[0].click()`);
    await sleep(300);
    const replayed = await boardsView();
    expect(replayed.caption.startsWith(`Board ${other} `), JSON.stringify(replayed));

    await setCode(solution("ch02-l02"));
    const solved = await run();
    const done = await boardsView();
    expect(solved.head === "Solved!" && done.caption === "Board 1 ✓" && done.thumbs.join() === "Board 2 ✓,Board 3 ✓", `${solved.head} | ${JSON.stringify(done)}`);
    return `${before.caption} → ${after.caption} → ${done.caption}`;
  });

  await check("M3.2: a timed gate's badge counts the ticks", async () => {
    await openLevel("ch02-l05", { fresh: true });
    const badge = () => b.evaluate(`document.querySelector('.boards-main .badge-text').textContent`);
    const before = /^(.+) · tick 0$/.exec(await badge());
    await setCode(solution("ch02-l05"));
    await run();
    const after = await badge();
    expect(before !== null && after.startsWith(`${before[1]} · tick `) && !after.endsWith(" · tick 0"), JSON.stringify({ before: before?.[0], after }));
  });

  await check("M3.2: The Gauntlet is tagged as the chapter's optional mastery challenge", async () => {
    await levelCards();
    const card = await b.evaluate(`document.querySelector('a[href="#/level/ch02-l06"] .mastery-tag')?.textContent ?? null`);
    await openLevel("ch02-l06", { fresh: true });
    await challengeTab();
    const panel = await b.evaluate(`document.querySelector('.mastery-note .mastery-tag')?.textContent ?? null`);
    expect(card === "Mastery · optional" && panel === card, JSON.stringify({ card, panel }));
  });

  // -- M3.3: Chapter 3 --------------------------------------------------------------------------
  // Labels, counts and outcomes. The code typed is test code, or a wrong attempt read from solutions/.

  await check("M3.3: Chapter 3 is listed after Chapter 2, and The Clocktower is its optional mastery challenge", async () => {
    await levelCards();
    const list = await b.evaluate(`({
      chapters: [...document.querySelectorAll('.chapter h2')].map((e) => e.textContent),
      cards: ${JSON.stringify(CH03)}.map((id) => !!document.querySelector('a[href="#/level/' + id + '"]')),
      mastery: document.querySelector('a[href="#/level/ch03-l06"] .mastery-tag')?.textContent ?? null,
    })`);
    const third = list.chapters.indexOf("Chapter 3 · Marching Orders");
    expect(third > list.chapters.indexOf("Chapter 2 · Counting Steps") && list.cards.every(Boolean), JSON.stringify(list));
    expect(list.mastery === "Mastery · optional", JSON.stringify(list));
  });

  await check("M3.3: a statement squeezed onto a shared line still counts as a line (3.1)", async () => {
    await openLevel("ch03-l01", { fresh: true });
    await challengeTab();
    const rules = await b.evaluate(`[...document.querySelectorAll('ul.rules li')].map((e) => e.textContent)`);
    await setCode(`${"pawn.wait(); ".repeat(7)}pawn.wait()\n`); // test code: eight statements on one line
    const r = await run();
    expect(rules.includes("At most 7 lines of code. Blank lines and comments don't count; two statements on one line count as two."), JSON.stringify(rules));
    expect(r.head === "Check the rules" && r.text.includes("yours has 8. Two statements on one line count as two."), brief(r));
    return brief(r);
  });

  await check("M3.3: loop mistakes are explained: a number with no range(), and a misspelled loop variable", async () => {
    await openLevel("ch03-l01", { fresh: true });
    await setCode("for step in 3:\n    pawn.wait()\n");
    const noRange = await run();
    await setCode("for step in range(2):\n    print(stpe)\n");
    const typo = await run();
    expect(noRange.head === "Python stopped" && noRange.text.includes("give the number to range(): for step in range(5):"), brief(noRange));
    expect(typo.head === "Python stopped" && typo.text.includes("Did you mean `step`?"), brief(typo));
  });

  await check("M3.3: range()'s Codex entry counts in steps, and it's New in 3.1", async () => {
    await openLevel("ch03-l01", { fresh: true });
    const entry = (await codexEntries()).find((e) => e.name === "range");
    const calls = await b.evaluate(`[...document.querySelectorAll('.codex-entry[data-codex="range"] .codex-call code')].map((e) => e.textContent)`);
    expect(entry?.isNew === true && calls.includes("range(start, stop, step)"), JSON.stringify({ entry, calls }));
  });

  await check("M3.3: The Spiral Walk is over pits, and stepping off the walkway reads Lost", async () => {
    await openLevel("ch03-l03", { fresh: true });
    const board = await drawn();
    await setCode("pawn.turn_right()\npawn.turn_right()\npawn.move()\n"); // test code: straight off the edge of the walkway
    const r = await run();
    expect(board.pits > 0 && r.head === "Lost" && r.text.includes("fell into the pit on a6."), `${board.pits} pits | ${brief(r)}`);
  });

  await check("M3.3: The Clockwork Sentry's gear counts only new lines, and the moves copied out get caught", async () => {
    await openLevel("ch03-l04", { fresh: true });
    const gear = async () => gearCount((await drawn()).badges.find((text) => text.startsWith("⚙")));
    const before = await gear();
    const reference = solution("ch03-l04");
    await setCode(reference);
    const solved = await run();
    const after = await gear();
    const lines = reference.split("\n").filter((line) => line.trim()).length; // every line runs, each is new once
    await setCode(withoutExpectLine(solution("ch03-l04", ".naive")));
    const copied = await run();
    expect(before === "0" && solved.head === "Solved!" && after === String(lines), JSON.stringify({ before, after }));
    expect(copied.head === "Lost" && /was caught by the patrol on [a-i][1-7]\./.test(copied.text), brief(copied));
    return `gear ${before} → ${after} | copied out: ${copied.head}`;
  });

  await check("M3.3: the lessons show a pit and a clockwork patrol at work", async () => {
    await openLevel("ch03-l03", { fresh: true });
    const pit = await runSnippet(2);
    await openLevel("ch03-l04", { fresh: true });
    const looped = await runSnippet(0, { settle: true });
    const copied = await runSnippet(1);
    expect(/Lost/i.test(pit.status), `3.3's fixed-length steps: ${pit.status}`);
    expect(/Finished/i.test(looped.status) && gearCount(looped.badges.find((text) => text.startsWith("⚙"))) === "2", JSON.stringify(looped));
    expect(/Lost/i.test(copied.status), `3.4's copied-out moves: ${copied.status}`);
  });

  // -- M3.4: Chapter 4 ----------------------------------------------------------------------------
  // Labels, counts and outcomes only: the guards' answers and the code never go into a message.

  await check("M3.4: Chapter 4 is listed after Chapter 3, and Pawn Storm is its optional mastery challenge", async () => {
    await levelCards();
    const list = await b.evaluate(`({
      chapters: [...document.querySelectorAll('.chapter h2')].map((e) => e.textContent),
      cards: ${JSON.stringify(CH04)}.map((id) => !!document.querySelector('a[href="#/level/' + id + '"]')),
      mastery: document.querySelector('a[href="#/level/ch04-l06"] .mastery-tag')?.textContent ?? null,
    })`);
    const fourth = list.chapters.indexOf("Chapter 4 · Eyes Open");
    expect(fourth > list.chapters.indexOf("Chapter 3 · Marching Orders") && list.cards.every(Boolean), JSON.stringify(list));
    expect(list.mastery === "Mastery · optional", JSON.stringify(list));
  });

  await check("M3.4: Under Attack draws rooks and shades the squares they attack", async () => {
    await openLevel("ch04-l05", { fresh: true });
    const board = await drawn();
    expect(board.rooks > 0 && board.attacked > 0, JSON.stringify(board));
  });

  await check("M3.4: a rook's attacked squares are shaded in Pawn Storm, and walking into one reads Lost", async () => {
    await openLevel("ch04-l06", { fresh: true });
    const board = await drawn();
    await setCode("while not pawn.at_goal():\n    pawn.move()\n"); // test code: walks straight, ignoring the rooks
    const r = await run();
    expect(board.rooks > 0 && board.attacked > 0 && r.head === "Lost", `${board.rooks} rooks, ${board.attacked} shaded | ${brief(r)}`);
  });

  await check("QA-034: the guards in True or False name their gate and say the hall is the stretch before the turn", async () => {
    await openLevel("ch04-l01", { fresh: true });
    await challengeTab();
    const brief41 = await b.evaluate(`document.body.innerText`);
    expect(/stretch you walked before your turn/.test(brief41), "the Challenge panel is missing the hall's definition");
  });

  await check("no console errors during the app checks", async () => {
    const errors = b.logs.filter((line) => /exception|error/i.test(line));
    expect(errors.length === 0, errors.join(" | "));
  });
}
