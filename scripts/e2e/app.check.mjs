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
  const PRACTICE = ["practice-02", "practice-03", "practice-04", "practice-05", "practice-06", "practice-07", "practice-08", "practice-09"];
  const drawn = () =>
    b.evaluate(`(() => {
      const board = document.querySelector('.board-host .board');
      const count = (selector) => board.querySelectorAll(selector).length;
      return {
        pits: count('.pit'), waypoints: count('.waypoint'), gems: count('.gem'), timed: count('.timed-gate'),
        enemies: count('.enemy'), armoured: count('.enemy.armoured'), routes: count('.route'),
        crossed: count('.waypoint.crossed'), collected: count('.gem.collected'), captured: count('.enemy.captured'),
        badges: [...board.querySelectorAll('.badge-text')].map((e) => e.textContent),
        lost: board.classList.contains('lost'),
      };
    })()`);

  await check("M3.1: each obstacle is drawn, and the Challenge panel says its rule", async () => {
    const seen = {};
    for (const id of PRACTICE) {
      await openLevel(id, { fresh: true });
      await challengeTab();
      const obstacles = await b.evaluate(`document.querySelector('ul.obstacles')?.innerText ?? ''`);
      seen[id] = { ...(await drawn()), obstacles: obstacles.split("\n").filter(Boolean).length };
    }
    const d = seen;
    expect(d["practice-02"].pits === 4 && d["practice-02"].obstacles === 1, `pits: ${JSON.stringify(d["practice-02"])}`);
    expect(d["practice-03"].waypoints === 3, `waypoints: ${JSON.stringify(d["practice-03"])}`);
    expect(d["practice-04"].enemies === 1 && d["practice-04"].routes === 1 && d["practice-04"].obstacles === 2, `patrol: ${JSON.stringify(d["practice-04"])}`);
    expect(d["practice-05"].badges.includes("chases") && d["practice-05"].routes === 0, `chaser: ${JSON.stringify(d["practice-05"])}`);
    expect(d["practice-06"].badges.includes("⚙"), `clockwork: ${JSON.stringify(d["practice-06"])}`);
    expect(d["practice-07"].timed === 2 && d["practice-07"].badges.join() === "every 3,every 4", `timed gates: ${JSON.stringify(d["practice-07"])}`);
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

  await check("M3.1: every practice level's reference solution earns three stars", async () => {
    const results = [];
    for (const id of PRACTICE) {
      await openLevel(id, { fresh: true });
      await setCode(solution(id));
      const r = await run();
      expect(r.head === "Solved!" && r.stars === 3, `${id}: ${r.stars} stars: ${brief(r)}`);
      const board = await drawn();
      if (id === "practice-03") expect(board.crossed === 3, `waypoints ticked off: ${board.crossed}`);
      if (id === "practice-08") expect(board.collected === 3, `gems collected: ${board.collected}`);
      if (id === "practice-09") expect(board.captured === 1, `enemies captured: ${board.captured}`);
      results.push(id);
    }
    return `${results.length} solved`;
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
    const guard = await b.evaluate(`[...document.querySelectorAll('.console .game-message')].map((e) => e.textContent)`);
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
    const guard = await b.evaluate(`document.querySelectorAll('.console .game-message').length`);
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
    expect(/stars solve the level\. use \d+ lines? of code or fewer \(par\)\. solve it without opening a hint\./i.test(text), "the Stars section is missing or worded differently");
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

  await check("no console errors during the app checks", async () => {
    const errors = b.logs.filter((line) => /exception|error/i.test(line));
    expect(errors.length === 0, errors.join(" | "));
  });
}
