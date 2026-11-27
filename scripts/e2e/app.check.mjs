// End-to-end checks for the game itself: levels, playback, errors, lessons, REPL.
// Solutions are read from solutions/ and typed into the editor; this file never
// contains solution code, and nothing here prints it.
import { sleep } from "./cdp.mjs";
import { codexHelpers, hoverHelpers, levelHelpers, settingsHelpers } from "./helpers.mjs";
import { expect } from "./suite.mjs";

const LEVELS = ["ch01-l01", "ch01-l02", "ch01-l03", "ch01-l04", "ch01-l05"];

export default async function appChecks({ browser: b, base, root, check }) {
  const { solution, withoutExpectLine, openLevel, setCode, editorText, clickButton, hasButton, challengeTab, codexTab, press, run, outcome, brief } = levelHelpers(b, base, root);
  const { wordAt, hover, hoverAway } = hoverHelpers(b);
  const { keepingSettings } = settingsHelpers(b);
  const { readCodex } = codexHelpers(b);

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

  await check("Lessons marks solved levels", async () => {
    await b.send("Page.navigate", { url: `${base}#/lessons` });
    const solved = await b.waitFor(`document.querySelectorAll('.lrow.solved').length`, 5000, "level cards");
    const stars = await b.evaluate(`document.querySelectorAll('.lrow .card-stars .icon-star').length`);
    expect(solved === LEVELS.length, `${solved} solved`);
    expect(stars === LEVELS.length * 3, `${stars} stars on the level rows`);
    return `${solved} solved, ${stars} stars`;
  });

  // -- M2: saved progress ------------------------------------------------------------------
  // Compares the editor with the solution file in Node and reports only yes or no.
  const levelCards = async () => {
    await b.send("Page.navigate", { url: `${base}#/lessons` });
    await b.waitFor(`document.querySelector('.lrow')`, 5000, "level rows");
    return b.evaluate(`document.querySelectorAll('.lrow.solved').length`);
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
    await setCode("pawn.fly()\n");
    await run();
    for (let i = 0; i < 3; i++) {
      await press(0); // back to the start
      await press(4); // and to the outcome again
    }
    const note = await b.evaluate(`document.querySelector('.solution-section .give-up-note')?.textContent ?? ''`);
    expect(note.includes("after 2 more runs"), `after one failed run, replayed 3 times: "${note}"`);
  });

  await check("QA-042: the third failed run offers 'Show me a solution', with no hint open", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await challengeTab();
    await setCode("pawn.fly()\n");
    const offered = [];
    for (let i = 0; i < 3; i++) {
      await run();
      offered.push(await offersSolution());
    }
    const needHint = await hasButton("Need a hint?", ".outcome-host");
    const hintsOpen = await b.evaluate(`document.querySelectorAll('.hints .hint-list li').length`);
    expect(JSON.stringify(offered) === "[false,false,true]", `offered after runs 1-3: ${JSON.stringify(offered)}`);
    expect(needHint && hintsOpen === 0, `'Need a hint?' beside it: ${needHint}; hints open: ${hintsOpen}`);
  });

  await check("M2: 'Show me a solution' asks first; 'Show it' opens the comparison and marks the level", async () => {
    await clickButton("Show me a solution…", ".outcome-host");
    const focused = await b.evaluate(`document.activeElement?.classList.contains('give-up-button') ?? false`);
    await b.evaluate(`document.querySelector('.give-up-button').click()`);
    const asked = await b.evaluate(`!!document.querySelector('.solution-section .confirm-step')`);
    await clickButton("Not yet", ".solution-section .confirm-step");
    const cancelled = await b.evaluate(`!document.querySelector('.solution-section .confirm-step') && !!document.querySelector('.give-up-button') && !document.querySelector('.compare-dialog')`);
    await b.evaluate(`document.querySelector('.give-up-button').click()`);
    await clickButton("Show it", ".solution-section .confirm-step");
    await b.waitFor(`!!document.querySelector('.compare-dialog .compare-idiomatic .cm-line')`, 10_000, "the comparison");
    const idiomatic = (await paneText("compare-idiomatic")) === solution("ch01-l01").trimEnd();
    await b.key("Escape");
    const tag = await b.evaluate(`!!document.querySelector('.solution-section button')`);
    expect(focused && asked && cancelled, `focused: ${focused}; asked: ${asked}; 'Not yet' cancelled: ${cancelled}`);
    expect(idiomatic && tag, `solution shown: ${idiomatic}; Solution section: ${tag}`);
    await levelCards();
    const cards = await b.evaluate(`(() => {
      const card = document.querySelector('[data-level-id="ch01-l01"]');
      return { tag: card.querySelector('.card-tag')?.textContent ?? null, solved: card.classList.contains('solved') };
    })()`);
    expect(cards.tag === "Solution seen" && !cards.solved, `level card: ${JSON.stringify(cards)}`);
  });

  await check("M2: solving it yourself afterwards counts, with two stars (the solution was seen)", async () => {
    await openLevel("ch01-l01");
    await setCode(solution("ch01-l01"));
    const r = await run();
    const card = await levelCards().then(() =>
      b.evaluate(`(() => { const card = document.querySelector('[data-level-id="ch01-l01"]'); return { tag: !!card.querySelector('.card-tag'), stars: card.querySelectorAll('.icon-star').length }; })()`),
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
    const heading = await b.evaluate(`[...document.querySelectorAll('.folder-title')].map((e) => e.textContent).find((t) => t.includes('Testing ground'))`);
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
  const CH05 = ["ch05-l01", "ch05-l02", "ch05-l03", "ch05-l04", "ch05-l05", "ch05-l06"]; // Chapter 5 (M3.5)
  const CH06 = ["ch06-l01", "ch06-l02", "ch06-l03", "ch06-l04", "ch06-l05", "ch06-l06"]; // Chapter 6 (M3.6)
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
    expect(r.head === "Run lost" && r.tone.includes("outcome-bad") && /fell into the pit on [a-d][1-4]\./.test(r.text), brief(r));
    expect(board.lost && r.errorLine && r.stars === 0, `board lost: ${board.lost}, error line: ${r.errorLine}`);
    return brief(r);
  });

  await check("M3.1: walking into the patrol, or a clockwork patrol catching up, is being caught", async () => {
    const results = [];
    for (const id of ["practice-04", "practice-05", "practice-06"]) {
      await openLevel(id, { fresh: true });
      await setCode(withoutExpectLine(solution(id, ".naive")));
      const r = await run();
      expect(r.head === "Run lost" && /was caught by the (patrol|chaser) on [a-g][1-6]\./.test(r.text), `${id}: ${brief(r)}`);
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
  for (const id of [...PRACTICE, ...CH02, ...CH03, ...CH04, ...CH05, ...CH06]) {
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
    expect(r.head === "Run lost" && r.text.includes("Your pawn was crushed by the gate on c1."), brief(r));
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
    const card = await b.evaluate(`document.querySelector('[data-level-id="practice-08"]').innerText`);
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
    await press(0);
    const start = await b.evaluate(`document.querySelector('.step-label').textContent`);
    await press(3);
    await press(3);
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
    ["typo in an ability", "pawn.mvoe()", (r) => r.head === "Python stopped" && r.text.includes("Did you mean move") && r.errorLine],
    ["typo in pawn", "pwan.move()", (r) => r.text.includes("Did you mean pawn")],
    ["locked ability", "pawn.turn_left()", (r) => r.text.includes("hasn't learned turn_left yet")],
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
    await press(0);
    await press(3); // step 1: line 1 is the step line
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
    expect(log.includes("40") && log.includes("Did you mean gold"), log);
    return log.slice(0, 120);
  });

  // -- The Codex (docs/Codex.md) ---------------------------------------------------------------
  // Entries are documentation, not spoilers; the code typed here is test code, never a solution.
  const showCodex = async () => {
    await codexTab();
    await b.waitFor(`document.querySelector('.codex')`, 20_000, "the Codex");
    return readCodex();
  };
  const codexEntries = async () => (await showCodex()).entries;

  await check("Codex: the tab lists the level's abilities, then the built-ins taught so far, then the kinds of value its lessons wrote, and marks what's new", async () => {
    await openLevel("ch01-l04", { fresh: true });
    const entries = await codexEntries();
    const names = entries.map((e) => e.name).join(",");
    const newOnes = entries.filter((e) => e.isNew && e.open).map((e) => e.name).join(",");
    const groups = [...new Set(entries.map((e) => e.group))].join("|");
    // whole numbers and text are brought in by earlier lessons of the chapter, so they are listed here but not new (M5.3-K2)
    expect(names === "pawn.move,pawn.turn_left,pawn.turn_right,print,whole number,text" && newOnes === "print", JSON.stringify(entries.map((e) => [e.name, e.isNew, e.open])));
    expect(groups === "Your pawn|Python|Kinds of value", groups);
    expect(entries[0].introduced.startsWith("Introduced in 1.1 "), entries[0].introduced);
    return `${names}; new: ${newOnes}`;
  });

  await check("Codex: 'Kinds of value' is the last group, holding the value entries; each method sits under its owner's group", async () => {
    await openLevel("ch06-l03", { fresh: true });
    const { headings, entries } = await showCodex();
    const kinds = ["whole number", "text", "True and False", "None", "list", "tuple"];
    const inKinds = entries.filter((e) => e.group === "Kinds of value").map((e) => e.name);
    expect(headings.at(-1) === "Kinds of value" && headings.indexOf("Text") >= 0 && headings.indexOf("Text") < headings.indexOf("Keywords"), headings.join("|"));
    expect(inKinds.length > 0 && inKinds.every((name) => kinds.includes(name)) && entries.filter((e) => kinds.includes(e.name)).every((e) => e.group === "Kinds of value"), inKinds.join());
    // Text holds only str. entries, Lists only list. entries, and Lists comes after Text. No level shows a list. method
    // yet (8.4 teaches .append(), M5.3), so Lists is absent today and the Chapter 8 e2e package pins its presence.
    expect(entries.filter((e) => e.group === "Text").length > 0 && entries.every((e) => (e.group === "Text") === e.name.startsWith("str.")), JSON.stringify(entries.map((e) => [e.name, e.group])));
    expect(entries.every((e) => (e.group === "Lists") === e.name.startsWith("list.")), "a list. method outside Lists, or the reverse");
    expect(!headings.includes("Lists") || headings.indexOf("Lists") === headings.indexOf("Text") + 1, headings.join("|"));
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
    for (const line of ["help(pawn.turn_left)", "pawn.move()", "help(abs)"]) {
      await b.evaluate(`document.querySelector('.repl-editor .cm-content').focus()`);
      await b.send("Input.insertText", { text: line });
      await b.key("Enter");
      await sleep(line === "help(abs)" ? 1500 : 400); // Python's own help loads pydoc the first time
    }
    const log = await b.evaluate(`document.querySelector('.repl-log').innerText.replace(/\\s+/g, ' ')`);
    const facts = {
      entry: log.includes("Help on pawn.turn_left:"),
      noBoard: log.includes("Scratch Python has no board"),
      pythonsOwn: log.includes("abs(x"),
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
    const card = await b.evaluate(`document.querySelector('[data-level-id="ch02-l06"] .mastery-tag')?.textContent ?? null`);
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
      chapters: [...document.querySelectorAll('.folder-title')].map((e) => e.textContent),
      cards: ${JSON.stringify(CH03)}.map((id) => !!document.querySelector('[data-level-id="' + id + '"]')),
      mastery: document.querySelector('[data-level-id="ch03-l06"] .mastery-tag')?.textContent ?? null,
    })`);
    const third = list.chapters.indexOf("03 · Marching Orders");
    expect(third > list.chapters.indexOf("02 · Counting Steps") && list.cards.every(Boolean), JSON.stringify(list));
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
    expect(typo.head === "Python stopped" && typo.text.includes("Did you mean step?"), brief(typo));
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
    expect(board.pits > 0 && r.head === "Run lost" && r.text.includes("fell into the pit on a6."), `${board.pits} pits | ${brief(r)}`);
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
    expect(copied.head === "Run lost" && /was caught by the patrol on [a-i][1-7]\./.test(copied.text), brief(copied));
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
      chapters: [...document.querySelectorAll('.folder-title')].map((e) => e.textContent),
      cards: ${JSON.stringify(CH04)}.map((id) => !!document.querySelector('[data-level-id="' + id + '"]')),
      mastery: document.querySelector('[data-level-id="ch04-l06"] .mastery-tag')?.textContent ?? null,
    })`);
    const fourth = list.chapters.indexOf("04 · Eyes Open");
    expect(fourth > list.chapters.indexOf("03 · Marching Orders") && list.cards.every(Boolean), JSON.stringify(list));
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
    expect(board.rooks > 0 && board.attacked > 0 && r.head === "Run lost", `${board.rooks} rooks, ${board.attacked} shaded | ${brief(r)}`);
  });

  await check("QA-034: the guards in True or False name their gate and say the hall is the stretch before the turn", async () => {
    await openLevel("ch04-l01", { fresh: true });
    await challengeTab();
    const brief41 = await b.evaluate(`document.body.innerText`);
    expect(/stretch you walked before your turn/.test(brief41), "the Challenge panel is missing the hall's definition");
  });

  // -- M3.5: Chapter 5 ----------------------------------------------------------------------------
  // Labels, counts and outcomes only. The code typed is test code, or a wrong attempt read from solutions/.

  await check("M3.5: Chapter 5 is listed after Chapter 4, and The Tally is its optional mastery challenge", async () => {
    await levelCards();
    const list = await b.evaluate(`({
      chapters: [...document.querySelectorAll('.folder-title')].map((e) => e.textContent),
      cards: ${JSON.stringify(CH05)}.map((id) => !!document.querySelector('[data-level-id="' + id + '"]')),
      mastery: document.querySelector('[data-level-id="ch05-l06"] .mastery-tag')?.textContent ?? null,
    })`);
    const fifth = list.chapters.indexOf("05 · Keep Going");
    expect(fifth > list.chapters.indexOf("04 · Eyes Open") && list.cards.every(Boolean), JSON.stringify(list));
    expect(list.mastery === "Mastery · optional", JSON.stringify(list));
  });

  await check("M3.5: an endless loop in a lesson snippet is stopped, and the message explains a while loop", async () => {
    await openLevel("ch05-l01", { fresh: true });
    const stopped = await runSnippet(1);
    const message = await b.evaluate(`${snippet(1)}.innerText.replace(/\\s+/g, ' ')`);
    expect(/stopped/i.test(stopped.status) && message.includes("A while repeats as long as its condition is True"), `${stopped.status} | ${message.slice(0, 120)}`);
  });

  await check("M3.5: an ability without parentheses in a while condition gets a warning on its line", async () => {
    await openLevel("ch05-l01", { fresh: true });
    await setCode("while not pawn.at_goal:\n    pawn.move()\n"); // test code: runs zero times
    const r = await run();
    expect(r.head === "Not there yet" && r.warnMarks === 1, brief(r));
  });

  await check("M3.5: 5.4 asks for a break statement, and a program without one is refused", async () => {
    await openLevel("ch05-l04", { fresh: true });
    await challengeTab();
    const rules = await b.evaluate(`[...document.querySelectorAll('ul.rules li')].map((e) => e.textContent)`);
    await setCode(withoutExpectLine(solution("ch05-l04", ".naive2")));
    const r = await run();
    expect(rules.includes("Must use a break statement."), JSON.stringify(rules));
    expect(r.head === "Check the rules" && r.text.includes("break statement"), brief(r));
    return brief(r);
  });

  await check("M3.5: the staircases show their rooks and the squares they attack, and walking on loses", async () => {
    const boards = {};
    for (const id of ["ch05-l04", "ch05-l05"]) {
      await openLevel(id, { fresh: true });
      boards[id] = await drawn();
    }
    await setCode("pawn.move()\n"); // test code: straight into a rook's line
    const r = await run();
    expect(boards["ch05-l04"].rooks === 5 && boards["ch05-l05"].rooks > 0 && boards["ch05-l05"].attacked > 0, JSON.stringify(boards));
    expect(r.head === "Run lost", brief(r));
  });

  await check("M3.5: The Tally's guard asks for a count, and its limit is 8 lines", async () => {
    await openLevel("ch05-l06", { fresh: true });
    await challengeTab();
    const rules = await b.evaluate(`[...document.querySelectorAll('ul.rules li')].map((e) => e.textContent)`);
    expect(rules.some((rule) => rule.startsWith("At most 8 lines")), JSON.stringify(rules));
  });

  // -- M3.6: Chapter 6 ----------------------------------------------------------------------------
  // Labels, counts and outcomes only. A rune's text and a level's code are never reported.

  await check("M3.6: Chapter 6 is listed after Chapter 5, and The Written Route is its optional mastery challenge", async () => {
    await levelCards();
    const list = await b.evaluate(`({
      chapters: [...document.querySelectorAll('.folder-title')].map((e) => e.textContent),
      cards: ${JSON.stringify(CH06)}.map((id) => !!document.querySelector('[data-level-id="' + id + '"]')),
      mastery: document.querySelector('[data-level-id="ch06-l06"] .mastery-tag')?.textContent ?? null,
    })`);
    expect(list.chapters.indexOf("06 · Runes") > list.chapters.indexOf("05 · Keep Going") && list.cards.every(Boolean), JSON.stringify(list));
    expect(list.mastery === "Mastery · optional", JSON.stringify(list));
  });

  await check("M3.6: a rune is drawn, its text is in the tooltip and the Challenge panel, and reading it lights it", async () => {
    await openLevel("ch06-l01", { fresh: true });
    const before = await b.evaluate(`({
      runes: document.querySelector('.board-host .board').querySelectorAll('.rune').length,
      tip: document.querySelector('.board-host .board .rune title')?.textContent ?? '',
      lit: document.querySelector('.board-host .board').querySelectorAll('.rune.reading').length,
    })`);
    await challengeTab();
    const panel = await b.evaluate(`[...document.querySelectorAll('blockquote.sign-text')].map((e) => e.querySelector('.muted')?.textContent ?? '')`);
    // The board may be redrawn when the run ends, so watch for the rune lighting up as it happens.
    await b.evaluate(`window.__runeLit = false; new MutationObserver((records) => { if (records.some((r) => r.target.classList?.contains("rune") && r.target.classList.contains("reading"))) window.__runeLit = true; }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] })`);
    await setCode("pawn.move(2)\ntext = pawn.read()\n"); // test code: walks onto the rune and reads it
    await run({ jump: false }); // natural playback: jumping to the end plays no events
    await b.waitFor(`window.__runeLit`, 10_000, "the rune lit").catch(() => {});
    const lit = await b.evaluate(`window.__runeLit`);
    expect(before.runes === 1 && before.lit === 0 && before.tip.includes("read()") && before.tip.length > 40, JSON.stringify({ ...before, tip: before.tip.length }));
    expect(panel.length === 1 && /^Rune on [a-z]\d+$/.test(panel[0]), JSON.stringify(panel));
    expect(lit === true, `the rune lit up while the code read it: ${lit}`);
  });

  await check("M3.6: reading away from a rune explains that the pawn isn't standing on one", async () => {
    await openLevel("ch06-l01", { fresh: true });
    await setCode("print(pawn.read()[0])\n"); // test code: the pawn starts off the rune
    const r = await run();
    expect(r.head === "Python stopped" && r.text.includes("isn't standing on a rune"), brief(r));
  });

  await check("M3.6: the Codex lists text methods under Text once a lesson has taught them, and hovering one shows its entry", async () => {
    await openLevel("ch06-l02", { fresh: true });
    const early = (await codexEntries()).map((e) => e.name);
    await openLevel("ch06-l03", { fresh: true });
    const { headings: heading, entries } = await showCodex();
    const names = entries.map((e) => e.name);
    await setCode("text = 'ab'\nprint(text.upper())\n");
    await sleep(300);
    await hover(await wordAt("upper"));
    await sleep(900);
    const card = await b.evaluate(`document.querySelector('.cm-tooltip .codex-card .codex-call')?.textContent ?? null`);
    await hoverAway();
    expect(!early.some((name) => name.startsWith("str.")) && early.includes("len"), early.join());
    expect(["str.strip", "str.upper", "str.lower", "str.replace"].every((name) => names.includes(name)) && !names.includes("str.split"), names.join());
    expect(heading.includes("Text") && entries.find((e) => e.name === "str.upper")?.isNew, JSON.stringify(heading));
    expect(card === "text.upper()", String(card));
  });

  await check("M3.6: a lesson snippet that takes the wrong road loses at the pit", async () => {
    await openLevel("ch06-l04", { fresh: true });
    const board = await runSnippet(1);
    expect(/lost/i.test(board.status), JSON.stringify(board).slice(0, 160));
  });

  await check("QA-035: 6.6's lesson has three panels, and the first shows that split() gives a list", async () => {
    await openLevel("ch06-l06", { fresh: true });
    const steps = await b.evaluate(`document.querySelectorAll('.lesson-step').length`);
    const ran = await runSnippet(0);
    const output = await b.evaluate(`${snippet(0)}.querySelector('.snippet-output')?.innerText ?? ''`);
    expect(steps === 3, `${steps} lesson steps`);
    expect(/Finished/i.test(ran.status) && output.includes("[") && output.includes("]"), `${ran.status} | ${output.length} characters of output`);
  });

  await check("no console errors during the app checks", async () => {
    const errors = b.logs.filter((line) => /exception|error/i.test(line));
    expect(errors.length === 0, errors.join(" | "));
  });

  // -- M5.1: the knight ---------------------------------------------------------------------------
  // What the screen shows and says around a run on a knight level (the Testing ground's practice-11 to practice-13).
  // The programs typed are one or two lines that test one thing; none is a level's solution. Labels and counts only.
  /** Which skin a piece is drawn in, inside the element `root` (a JS expression in the page): the knight's drawing has lit details (its eyes, class s-lit), the pawn's has none. */
  const heroLit = (root) =>
    b.evaluate(`(() => {
      const hero = ${root}.querySelectorAll('g.piece g.pawn > g.hero');
      return { heroes: hero.length, lit: [...hero].reduce((n, g) => n + g.querySelectorAll('.s-lit').length, 0) };
    })()`);
  const boardEl = `document.querySelector('.board-host .board')`;
  const square = (name) => ({ x: name.charCodeAt(0) - 97, y: Number(name.slice(1)) - 1 });
  const isKnightMove = (from, to) => {
    const [a, c] = [square(from), square(to)];
    return [Math.abs(a.x - c.x), Math.abs(a.y - c.y)].sort().join() === "1,2";
  };
  /** The board's label and rings, parsed in Node: size, the piece's square, the "It can land on" squares, the rings' squares. */
  async function knightView() {
    const raw = await b.evaluate(`(() => {
      const board = document.querySelector('.board-host .board');
      return {
        label: board.getAttribute('aria-label'),
        layer: !!board.querySelector('g.landings'),
        rings: [...board.querySelectorAll('g.landings g.landing')].map((g) => g.dataset.square),
        haloed: board.querySelectorAll('g.landings g.landing circle.landing-halo').length,
        inked: board.querySelectorAll('g.landings g.landing circle.landing-ink').length,
      };
    })()`);
    const [, width, height] = /^(\d+) by (\d+) board/.exec(raw.label) ?? [];
    const sentence = /It can land on ([^.]+)\./.exec(raw.label)?.[1];
    return {
      ...raw,
      width: Number(width),
      height: Number(height),
      piece: /Your (\w+) is on/.exec(raw.label)?.[1],
      at: /Your \w+ is on ([a-z]\d+)/.exec(raw.label)?.[1],
      said: sentence ? sentence.split(/, | and /) : [],
    };
  }
  /** The rings are on the board, each a knight's move from the piece, drawn whole, and the label's sentence names them in order. */
  function expectRingsAgree(view, where) {
    expect(view.at && view.rings.length > 0, `${where}: ${view.rings.length} rings, the piece on ${view.at}`);
    const onBoard = (name) => square(name).x >= 0 && square(name).x < view.width && square(name).y >= 0 && square(name).y < view.height;
    const stray = view.rings.filter((ring) => !onBoard(ring) || !isKnightMove(view.at, ring));
    expect(stray.length === 0, `${where}: rings off the board or not a knight's move from ${view.at}: ${stray.join()}`);
    expect(view.haloed === view.rings.length && view.inked === view.rings.length, `${where}: halos ${view.haloed}, inks ${view.inked} for ${view.rings.length} rings`);
    expect(view.said.join() === view.rings.join(), `${where}: label says [${view.said.join()}], rings are [${view.rings.join()}]`);
  }
  /** Wait (up to 3 s) for the rings to be exactly `want`. */
  async function ringsBecome(want) {
    for (let i = 0; i < 30; i++) {
      if ((await knightView()).rings.join() === want.join()) return true;
      await sleep(100);
    }
    return false;
  }

  await check("M5.1: with no saved settings the knight levels wear the knight and a Pawn-tier level the pawn", async () => {
    await openLevel("ch01-l01", { fresh: true }); // a page to hold the settings: the first one is blank
    return await keepingSettings(async () => {
      await b.evaluate(`localStorage.removeItem('rank-and-file:settings')`);
      await openLevel("practice-11", { fresh: true });
      const knight = await heroLit(boardEl);
      await openLevel("ch01-l01", { fresh: true });
      const pawn = await heroLit(boardEl);
      expect(knight.heroes === 1 && knight.lit > 0, `practice-11: ${JSON.stringify(knight)}`);
      expect(pawn.heroes === 1 && pawn.lit === 0, `ch01-l01: ${JSON.stringify(pawn)}`);
      return `lit details: knight ${knight.lit}, pawn ${pawn.lit}`;
    });
  });

  await check("M5.1: at the start the landing rings are knight's moves on the board, and the board's label names the same squares", async () => {
    await openLevel("practice-11", { fresh: true });
    const view = await knightView();
    expect(view.layer && view.piece === "knight", `no landings layer, or not a knight: ${view.label}`);
    expectRingsAgree(view, "practice-11");
    await openLevel("ch01-l01", { fresh: true });
    const pawn = await knightView();
    expect(pawn.layer && pawn.rings.length === 0 && pawn.said.length === 0 && pawn.piece === "pawn" && !pawn.label.includes("It can land on"), `pawn level: ${pawn.rings.length} rings, ${pawn.label}`);
    return `${view.at} → ${view.rings.join(" ")}`;
  });

  await check("M5.1: after one jump the knight, the label and the rings are at the landing, and the start brings the first rings back", async () => {
    await openLevel("practice-11", { fresh: true });
    const before = await knightView();
    const [from, to] = [square(before.at), square(before.rings[0])];
    await setCode(`knight.jump(${to.x - from.x}, ${to.y - from.y})`);
    const r = await run();
    expect(r.head !== "Solved!" && !r.errorLine, brief(r)); // one jump can't solve it, and a legal jump isn't an error
    const after = await knightView();
    expect(after.at === before.rings[0], `the label says ${after.at}, not ${before.rings[0]}`);
    expect(after.rings.join() !== before.rings.join(), `the rings did not change from ${before.rings.join()}`);
    expectRingsAgree(after, "after the jump");
    await press(0);
    expect(await ringsBecome(before.rings), `back at the start the rings are [${(await knightView()).rings.join()}], not [${before.rings.join()}]`);
    const back = await knightView();
    expect(back.at === before.at, `back at the start the label says ${back.at}, not ${before.at}`);
    return `${before.at} → ${after.at}: ${after.rings.join(" ")}`;
  });

  await check("M5.1: asking the knight to walk stops the run with its own message, on the line, and the board stays put", async () => {
    await openLevel("practice-11", { fresh: true });
    const before = await knightView();
    await setCode("knight.move()");
    const r = await run();
    const after = await knightView();
    expect(r.head === "Python stopped" && r.text.includes("Knights don't walk: they jump.") && r.errorLine, brief(r));
    expect(after.label === before.label && after.rings.join() === before.rings.join(), `the board changed: ${before.at} → ${after.at}`);
    return brief(r);
  });

  await check("M5.1: a jump that isn't an L gets the knight's own friendly error, not a traceback", async () => {
    await openLevel("practice-11", { fresh: true });
    await setCode("knight.jump(1, 1)");
    const r = await run();
    expect(r.head === "Python stopped" && r.text.includes("isn't a jump a knight can make") && r.errorLine, brief(r));
    expect(!/Traceback|JumpError|GameArgumentError/.test(r.text), brief(r));
    return brief(r);
  });

  // Chosen from the boards (`scripts.show_level`): practice-11's knight starts in the corner a1, so one square left
  // is off the board; practice-12's wall is the whole d file, so a1 → c2 → (one right, two up) lands on the wall on d4.
  // The designer's rule: on a bumped run the rings stay (the knight stands where it was), so each board is read after its run.
  await check("M5.1: a jump off the board or onto a wall is refused as blocked, in words of landing, and the rings stay drawn", async () => {
    await openLevel("practice-11", { fresh: true });
    await setCode("knight.jump(-1, 2)");
    const off = await run();
    expectRingsAgree(await knightView(), "after the jump off the board");
    await openLevel("practice-12", { fresh: true });
    await setCode("knight.jump(2, 1)\nknight.jump(1, 2)");
    const wall = await run();
    expectRingsAgree(await knightView(), "after the jump onto the wall");
    expect(off.head === "Python stopped" && off.errorLine && off.text.includes("land off the edge of the board"), brief(off));
    expect(wall.head === "Python stopped" && wall.errorLine && wall.text.includes("can't land on a wall on d4"), brief(wall));
    for (const r of [off, wall]) expect(!/walk|bumped|Traceback/.test(r.text), `a pawn's words: ${brief(r)}`);
    return `${brief(off)} | ${brief(wall)}`;
  });

  await check("M5.1: the variables panel lists the knight first, and the editor's placeholder names the piece", async () => {
    await openLevel("practice-11", { fresh: true });
    await setCode("steps = 1");
    const r = await run();
    expect(/^knight /.test(r.vars[0] ?? "") && r.vars.some((v) => v.startsWith("steps ")), JSON.stringify(r.vars.map((v) => v.slice(0, 30))));
    const placeholder = async () => {
      await b.evaluate(`document.querySelector('.level-right .cm-content').focus()`);
      await b.key("a", { code: "KeyA", modifiers: 2 }); // Ctrl+A
      await b.key("Delete", { keyCode: 46 });
      return b.waitFor(`document.querySelector('.level-right .cm-placeholder')?.textContent`, 5000, "the placeholder");
    };
    const knightText = await placeholder();
    await openLevel("ch01-l01", { fresh: true });
    const pawnText = await placeholder();
    expect(knightText.endsWith("Your knight is called knight."), knightText);
    expect(pawnText.endsWith("Your pawn is called pawn."), pawnText);
    return r.vars[0];
  });

  await check("M5.1: hovering jump shows the knight's entry, help() answers, and the Codex tab lists it", async () => {
    await openLevel("practice-11", { fresh: true });
    await setCode("knight.jump(1, 2)");
    await sleep(300);
    await hover(await wordAt("jump"));
    await sleep(900);
    const tip = await b.evaluate(`document.querySelector('.cm-tooltip .codex-card .codex-call')?.textContent ?? null`);
    await hoverAway();
    await setCode("help(knight.jump)");
    const r = await run();
    const helped = await b.evaluate(`document.querySelector('.console').innerText`);
    const entries = await codexEntries();
    expect(tip !== null && tip.startsWith("knight.jump("), `tooltip: ${tip}`);
    expect(r.head !== "Python stopped" && helped.includes("knight.jump"), `help(): ${brief(r)}`);
    expect(entries.some((e) => e.name === "knight.jump"), entries.map((e) => e.name).join());
    return `${tip}; Codex: ${entries.map((e) => e.name).join(",")}`;
  });

  await check("M5.1: the lesson's first snippet runs a knight on the small board, and the ones that go wrong show their errors in place", async () => {
    await openLevel("practice-11", { fresh: true });
    await b.waitFor(`document.querySelectorAll('.lesson .snippet').length >= 3 && ${snippet(0)}.querySelector('.board g.piece')`, 20_000, "the lesson's snippets");
    const skin = await heroLit(snippet(0));
    const ran = await runSnippet(0, { settle: true });
    const skinAfter = await heroLit(snippet(0));
    expect(skin.heroes === 1 && skin.lit > 0 && skinAfter.lit > 0, `the lesson board's piece: ${JSON.stringify([skin, skinAfter])}`);
    expect(/Finished/.test(ran.status), `snippet 0: ${ran.status}`);
    const wrong = await runSnippet(1);
    const walk = await runSnippet(2);
    const text = (index) => b.evaluate(`${snippet(index)}.innerText.replace(/\\s+/g, ' ')`);
    const [wrongText, walkText] = [await text(1), await text(2)];
    const tracebackShut = await b.evaluate(`[...${snippet(1)}.querySelectorAll('pre.traceback')].every((pre) => pre.closest('details') && !pre.closest('details').open)`); // Python's own traceback is there, but folded away
    expect(/stopped/.test(wrong.status) && wrongText.includes("isn't a jump a knight can make") && tracebackShut, `snippet 1: ${wrong.status}, traceback folded: ${tracebackShut}`);
    expect(/stopped/.test(walk.status) && walkText.includes("Knights don't walk: they jump."), `snippet 2: ${walk.status}`);
    return `${ran.status} / ${wrong.status} / ${walk.status}`;
  });

  // -- M5.1: a jump, watched while it plays ---------------------------------------------------------------
  // A recorder in the page takes one sample per frame while a jump plays; each check reads the samples back and judges
  // them in Node (the path, the facing, the lift, the trail, what changes on landing, a jump cut short, reduced motion,
  // 4x). Positions are in squares (the file and rank, fractional). Only squares and numbers are ever reported. The
  // jumps are one or two lines read off the first rings; the capture check types practice-12's reference solution and
  // reports the squares of the knight and the enemy only.
  const TILE = 64; // S and M of src/ui/sprites/floor.ts: the board's SVG units, to turn a position into squares
  const MARGIN = 22;
  const PATH_TOLERANCE = 0.2; // squares off the L. A straight diagonal is 0.67 off it at its worst; a short leg that starts a frame early cuts the corner by under a quarter of that
  const FACES = { 0: "north", 90: "east", 180: "south", 270: "west" };
  const SETTINGS_KEY = "rank-and-file:settings";

  /** Runs in the page: one sample per frame until `window.__jumpRec.stop`. With `press` ({ button, minLift }) it clicks that playback button on the first frame the solid is lifted `minLift` or more. */
  function recorder(press) {
    const matrix = (element) => {
      const value = getComputedStyle(element).transform;
      return value === "none" ? new DOMMatrix() : new DOMMatrix(value);
    };
    const rec = (window.__jumpRec = { samples: [], stop: false, pressedAt: null, pressedDisabled: null });
    const tick = () => {
      if (rec.stop) return;
      requestAnimationFrame(tick);
      const board = document.querySelector(".board-host .board");
      const piece = board?.querySelector("g.piece");
      const hero = piece?.querySelector("g.hero");
      if (!board || !hero) return;
      const [solid, shadow, brackets] = [":scope > .s", ":scope > .s-shadow", ":scope > .br"].map((selector) => hero.querySelector(selector));
      const label = board.getAttribute("aria-label") ?? "";
      const at = matrix(piece);
      const sample = {
        t: performance.now(),
        x: at.e,
        y: at.f,
        notch: hero.querySelector(".br-notch")?.getAttribute("transform") ?? "",
        lift: solid ? -matrix(solid).f : null,
        shade: shadow ? matrix(shadow).a : null,
        fade: shadow ? Number(getComputedStyle(shadow).opacity) : null,
        brLift: brackets ? -matrix(brackets).f : null,
        brAnims: brackets ? brackets.getAnimations({ subtree: true }).length : null,
        anims: hero.getAnimations({ subtree: true }).length,
        tr: piece.style.transition,
        trans: piece.getAnimations().map((a) => [Math.round(Number(a.currentTime)), Math.round(a.effect.getComputedTiming().duration)]),
        square: /is on ([a-z]\d+)/.exec(label)?.[1] ?? null,
        facing: /facing (\w+)/.exec(label)?.[1] ?? null,
        rings: [...board.querySelectorAll("g.landings g.landing")].map((g) => g.dataset.square).join(),
        trails: [...board.querySelectorAll("g.trails g.trail-hero line")].map((line) => ["x1", "y1", "x2", "y2"].map((name) => Number(line.getAttribute(name)))),
        foes: [...board.querySelectorAll(":scope > g.enemy")].map((enemy) => [matrix(enemy).e, matrix(enemy).f, enemy.classList.contains("gone")]),
      };
      rec.samples.push(sample);
      if (press && rec.pressedAt === null && sample.lift !== null && sample.lift >= press.minLift) {
        const button = document.querySelectorAll(".playback-buttons button")[press.button];
        rec.pressedDisabled = button.disabled;
        rec.pressedAt = rec.samples.length - 1;
        button.click();
      }
    };
    tick();
  }

  /** The recorder's samples placed on the board: `u`, `v` (file and rank, fractional) for the piece, each enemy and each trail line; `face` is the facing the brackets draw. */
  function onBoard(samples, height) {
    const file = (x) => (x - MARGIN - TILE / 2) / TILE;
    const rank = (y) => height - 1 - (y - TILE / 2) / TILE;
    return samples.map((s) => ({
      ...s,
      u: file(s.x),
      v: rank(s.y),
      face: FACES[Number(/rotate\((\d+)\)/.exec(s.notch)?.[1])],
      foes: s.foes.map(([x, y, gone]) => ({ u: file(x), v: rank(y), gone })),
      trails: s.trails.map(([x1, y1, x2, y2]) => [file(x1), rank(y1), file(x2), rank(y2)]),
    }));
  }

  /**
   * Play one program on `level` with the given settings while the recorder samples the board, and read it all back.
   * The settings are put back afterwards; the page is left as it was last loaded.
   */
  async function recordRun({ level, program, speed = 0.5, motion = "full", press = null, settleMs = 3500 }) {
    if ((await b.evaluate(`location.protocol`)) === "about:") await openLevel(level, { fresh: true }); // a page to hold the settings
    return await keepingSettings(async (saved) => {
      await b.evaluate(`localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, ${JSON.stringify(JSON.stringify({ ...JSON.parse(saved ?? "{}"), speed, motion }))})`);
      await openLevel(level, { fresh: true });
      const before = await knightView();
      await setCode(program(before));
      await b.evaluate(`(${recorder})(${JSON.stringify(press)})`);
      const result = await run({ jump: false });
      await sleep(settleMs);
      const rec = await b.evaluate(`(() => { window.__jumpRec.stop = true; return window.__jumpRec; })()`);
      expect(!result.errorLine && result.head !== "Python stopped", `the program stopped: ${result.head}`);
      return { before, after: await knightView(), pressedAt: rec.pressedAt, pressedDisabled: rec.pressedDisabled, samples: onBoard(rec.samples, before.height) };
    });
  }

  /** A jump from `fromName` to `toName` as an L: the corner, the facing of the long leg and of the short leg. */
  function legs(fromName, toName) {
    const [from, to] = [square(fromName), square(toName)];
    const corner = Math.abs(to.x - from.x) === 2 ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
    const facing = (p, q) => (p.x !== q.x ? (q.x > p.x ? "east" : "west") : q.y > p.y ? "north" : "south");
    return { from, to, corner, longFacing: facing(from, corner), shortFacing: facing(corner, to) };
  }
  const squareOf = ({ x, y }) => `${String.fromCharCode(97 + x)}${y + 1}`;
  const gap = (s, p) => Math.hypot(s.u - p.x, s.v - p.y);
  function gapToSegment(s, a, c) {
    const [dx, dy] = [c.x - a.x, c.y - a.y];
    const t = Math.max(0, Math.min(1, ((s.u - a.x) * dx + (s.v - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(s.u - (a.x + t * dx), s.v - (a.y + t * dy));
  }
  const offTheL = (s, g) => Math.min(gapToSegment(s, g.from, g.corner), gapToSegment(s, g.corner, g.to));
  /** Where a jump's samples turn: take-off (the first off the start square), the short leg (the first off the long leg) and landing (the first on the landing square). */
  function phases(samples, g) {
    const take = samples.findIndex((s) => gap(s, g.from) > 0.02);
    const turn = samples.findIndex((s, i) => i > take && gapToSegment(s, g.from, g.corner) > 0.05);
    const land = samples.findIndex((s, i) => i > turn && gap(s, g.to) < 0.03);
    return { take, turn, land };
  }
  const facingOf = (view) => /facing (\w+)/.exec(view.label)?.[1];
  const resting = (s) => Math.abs(s.lift) < 0.01 && s.anims === 0 && s.tr === "";
  const look = (s) => `at ${s.u.toFixed(2)},${s.v.toFixed(2)} lift ${s.lift?.toFixed(1)} animations ${s.anims} transition "${s.tr}" label ${s.square} facing ${s.facing} drawn ${s.face} rings ${s.rings} trails ${s.trails.length}`;
  /** Every sample of `list` passes `ok`; otherwise fail naming the first that doesn't. */
  function everySample(list, ok, what) {
    const bad = list.findIndex((s) => !ok(s));
    expect(bad < 0, `${what}: sample ${bad} of ${list.length}: ${bad < 0 ? "" : look(list[bad])}`);
  }

  const flights = new Map();
  /**
   * One jump from practice-11's start to its ring number `ring`, recorded (and kept: the checks share it). `back`: then
   * the jump back; `press`: a playback button to press mid-flight (see `recorder`). `g` is the jump as an L, `home` the way back.
   */
  async function flightOf(ring, { speed = 0.5, motion = "full", back = false, press = null, settleMs = 3500 } = {}) {
    const key = JSON.stringify([ring, speed, motion, back, press, settleMs]);
    if (!flights.has(key)) {
      const program = (view) => {
        const [from, to] = [square(view.at), square(view.rings[ring])];
        const jump = (sign) => `knight.jump(${sign * (to.x - from.x)}, ${sign * (to.y - from.y)})`;
        return back ? `${jump(1)}\n${jump(-1)}` : jump(1);
      };
      const recorded = await recordRun({ level: "practice-11", program, speed, motion, press, settleMs });
      const [start, landing] = [recorded.before.at, recorded.before.rings[ring]];
      flights.set(key, { ...recorded, g: legs(start, landing), home: legs(landing, start), tag: `${start} → ${landing}` });    }
    return flights.get(key);
  }

  await check("M5.1: a jump played at half speed goes along the L, the long leg first and never the diagonal, and lands on its square", async () => {
    const notes = [];
    for (const ring of [0, 1]) {
      const { samples, g, tag, after } = await flightOf(ring);
      const { take, turn, land } = phases(samples, g);
      expect(take > 0 && turn > take && land > turn, `${tag}: take-off at sample ${take}, the short leg at ${turn}, landing at ${land} of ${samples.length}`);
      const flying = samples.slice(take, land + 1);
      expect(flying.filter((s) => gap(s, g.from) > 0.3 && gap(s, g.corner) > 0.3).length >= 3 && flying.length >= 15, `${tag}: only ${flying.length} samples of the flight`);
      const worst = Math.max(...flying.map((s) => offTheL(s, g)));
      expect(worst <= PATH_TOLERANCE, `${tag}: ${worst.toFixed(2)} squares off the L at its worst (tolerance ${PATH_TOLERANCE})`);
      const leftLong = gap(samples[turn - 1], g.corner); // the last sample on the long leg: how near the corner it got
      expect(leftLong <= 0.35, `${tag}: the piece left the long leg ${leftLong.toFixed(2)} squares short of the corner`);
      everySample(samples.slice(turn), (s) => gapToSegment(s, g.corner, g.to) <= PATH_TOLERANCE, `${tag}: after the turn, on the short leg`);
      everySample(samples.slice(land), (s) => gap(s, g.to) < 0.03, `${tag}: after landing, on the landing square`);
      expect(after.at === squareOf(g.to) && gap(samples.at(-1), g.to) < 0.03, `${tag}: ended on ${after.at}`);
      notes.push(`${tag}: ${worst.toFixed(2)} off the L, left the long leg ${leftLong.toFixed(2)} short of the corner, ${flying.length} samples`);
    }
    return notes.join(" | ");
  });

  await check("M5.1: while a jump plays the knight is drawn facing along the long leg, then along the short leg, and ends facing the way the board says", async () => {
    const notes = [];
    for (const ring of [0, 1]) {
      const { samples, g, tag } = await flightOf(ring);
      const { take, turn, land } = phases(samples, g);
      const longLeg = samples.slice(take, turn).filter((s) => gap(s, g.from) > 0.1 && gap(s, g.corner) > 0.3);
      const shortLeg = samples.slice(turn, land + 1).filter((s) => gap(s, g.corner) > 0.3);
      expect(longLeg.length >= 3 && shortLeg.length >= 3, `${tag}: ${longLeg.length} samples on the long leg, ${shortLeg.length} on the short`);
      everySample(longLeg, (s) => s.face === g.longFacing, `${tag}: on the long leg the brackets should face ${g.longFacing}`);
      everySample(shortLeg, (s) => s.face === g.shortFacing, `${tag}: on the short leg the brackets should face ${g.shortFacing}`);
      const last = samples.at(-1);
      expect(last.face === g.shortFacing && last.facing === g.shortFacing, `${tag}: at the end the brackets face ${last.face} and the label says ${last.facing}, not ${g.shortFacing}`);
      notes.push(`${tag}: ${g.longFacing} then ${g.shortFacing}`);
    }
    return notes.join(" | ");
  });

  await check("M5.1: a jump hops: the solid lifts in one unbroken arc while the brackets stay put, and nothing is left lifted or in transition after landing", async () => {
    const notes = [];
    for (const ring of [0, 1]) {
      const { samples, tag } = await flightOf(ring);
      const up = samples.map((s, i) => (s.lift > 1 ? i : -1)).filter((i) => i >= 0);
      const [a, z] = [up[0], up.at(-1)];
      expect(a !== undefined && z - a >= 15, `${tag}: the solid was lifted in ${up.length} samples`);
      const arc = samples.slice(a, z + 1);
      const [begins, ends] = [samples[a].t, samples[z].t];
      const middle = arc.filter((s) => s.t >= begins + 0.25 * (ends - begins) && s.t <= begins + 0.75 * (ends - begins));
      const peak = arc.reduce((best, s) => (s.lift > best.lift ? s : best));
      const dip = Math.min(...middle.map((s) => s.lift));
      const steepest = Math.max(...arc.slice(1).map((s, i) => Math.abs(s.lift - arc[i].lift) / (s.t - arc[i].t)));
      expect(peak.lift >= 28 && peak.lift <= 36, `${tag}: the highest lift was ${peak.lift.toFixed(1)}`);
      expect(dip >= 12 && steepest <= 0.8, `${tag}: through the middle of the arc the lift fell to ${dip.toFixed(1)}, and changed by up to ${steepest.toFixed(2)} px per ms`);
      everySample(samples, (s) => Math.abs(s.brLift) < 0.01 && s.brAnims === 0, `${tag}: the brackets should never lift or animate`);
      expect(peak.brLift === 0 && peak.shade < 0.85 && peak.fade < 0.75, `${tag}: at the top the brackets were lifted ${peak.brLift}, the shadow shrank to ${peak.shade?.toFixed(2)} and faded to ${peak.fade?.toFixed(2)}`);
      expect(samples.slice(a, z + 1).some((s) => /transform/.test(s.tr)), `${tag}: no inline transition on the piece during the flight`);
      const settled = samples.findIndex((s, i) => i > z && resting(s));
      expect(settled > z, `${tag}: the art never came to rest`);
      everySample(samples.slice(-20), (s) => resting(s) && s.shade === 1 && s.fade === 1, `${tag}: long after landing, nothing lifted, animated or in transition`);
      notes.push(`${tag}: arc ${(ends - begins).toFixed(0)} ms, peak ${peak.lift.toFixed(1)}, lowest in the middle ${dip.toFixed(1)}, at rest ${(samples[settled].t - begins).toFixed(0)} ms after take-off`);
    }
    return notes.join(" | ");
  });

  await check("M5.1: a jump draws two trail legs, one horizontal and one vertical, meeting at the corner, and they are gone a little later", async () => {
    const notes = [];
    for (const ring of [0, 1]) {
      const { samples, g, tag } = await flightOf(ring);
      const lines = new Map(); // each distinct trail line: where it runs (in squares), when it was first and last seen
      for (const s of samples) {
        for (const line of s.trails) {
          const key = line.map((n) => n.toFixed(2)).join();
          lines.set(key, { line, first: lines.get(key)?.first ?? s.t, last: s.t });
        }
      }
      const seen = [...lines.values()].sort((p, q) => p.first - q.first);
      expect(seen.length === 2, `${tag}: ${seen.length} hero trail lines were drawn, not 2`);
      const straight = seen.every(({ line: [x1, y1, x2, y2] }) => (Math.abs(x1 - x2) < 0.01) !== (Math.abs(y1 - y2) < 0.01));
      expect(straight, `${tag}: a trail line that is neither horizontal nor vertical: ${seen.map((e) => e.line.map((n) => n.toFixed(2))).join(" / ")}`);
      const [long, short] = seen.map((e) => e.line);
      const near = (line, [from, to]) => Math.hypot(line[0] - from.x, line[1] - from.y) < 0.02 && Math.hypot(line[2] - to.x, line[3] - to.y) < 0.02;
      expect(near(long, [g.from, g.corner]) && near(short, [g.corner, g.to]), `${tag}: the trail legs run ${long.map((n) => n.toFixed(2))} and ${short.map((n) => n.toFixed(2))}, not start to corner to landing`);
      expect(samples.some((s) => s.trails.length === 2), `${tag}: the two legs were never on the board together`);
      const lived = seen.map((e) => e.last - e.first);
      expect(lived.every((ms) => ms >= 1000 && ms <= 2500), `${tag}: the legs stayed ${lived.map(Math.round)} ms`);
      expect(samples.at(-1).trails.length === 0, `${tag}: ${samples.at(-1).trails.length} trail lines are still there at the end`);
      notes.push(`${tag}: two legs, on screen ${lived.map(Math.round)} ms`);
    }
    return notes.join(" | ");
  });

  await check("M5.1: what a jump changes (the landing rings, the board's label) shows when it lands, not before", async () => {
    const notes = [];
    for (const ring of [0, 1]) {
      const { samples, g, tag, before, after } = await flightOf(ring);
      const { take, land } = phases(samples, g);
      expectRingsAgree(after, `${tag}: after`);
      expect(after.rings.join() !== before.rings.join(), `${tag}: the rings did not change: ${after.rings.join()}`);
      const short = samples.slice(0, land).filter((s) => gap(s, g.to) > 0.35);
      expect(take > 0 && short.length >= 15, `${tag}: only ${short.length} samples clearly short of the landing`);
      everySample(short, (s) => s.rings === before.rings.join() && s.square === before.at && s.facing === facingOf(before), `${tag}: before landing the rings, the label's square and facing stay the take-off's (${before.at}, ${facingOf(before)},${before.rings.join()})`);
      const last = samples.at(-1);
      expect(last.rings === after.rings.join() && last.square === squareOf(g.to), `${tag}: at the end the rings are [${last.rings}] and the label says ${last.square}`);
      const changed = samples.findIndex((s) => s.rings !== before.rings.join());
      expect(gap(samples[changed], g.to) <= 0.35, `${tag}: the rings changed with the knight ${gap(samples[changed], g.to).toFixed(2)} squares from the landing`);
      notes.push(`${tag}: rings changed ${gap(samples[changed], g.to).toFixed(2)} squares from landing, after ${short.length} samples short of it`);
    }
    return notes.join(" | ");
  });

  await check("M5.1: a jump that takes an enemy keeps it drawn until the knight lands on its square", async () => {
    const { samples, before } = await recordRun({ level: "practice-12", program: () => solution("practice-12"), settleMs: 3500 });
    const foes = samples[0].foes;
    expect(foes.length >= 1 && foes.every((foe) => !foe.gone), `${foes.length} enemies, ${foes.filter((foe) => foe.gone).length} gone before the run`);
    const notes = foes.map((foe, i) => {
      const spot = { x: Math.round(foe.u), y: Math.round(foe.v) };
      const taken = samples.findIndex((s) => s.foes[i].gone);
      expect(taken > 0, `the enemy on ${squareOf(spot)} was ${taken === 0 ? "gone at the start" : "never taken"}`);
      const away = samples.slice(0, taken).filter((s) => gap(s, spot) > 1).length;
      const distance = gap(samples[taken], spot);
      expect(away >= 5, `the knight was seen away from ${squareOf(spot)} in only ${away} samples before the enemy went`);
      expect(distance <= 0.5, `the enemy on ${squareOf(spot)} went with the knight ${distance.toFixed(2)} squares from it (at ${samples[taken].u.toFixed(2)},${samples[taken].v.toFixed(2)})`);
      return `${squareOf(spot)} went with the knight ${distance.toFixed(2)} squares away, after ${away} samples further than 1`;
    });
    expect(before.piece === "knight", before.label);
    return notes.join(" | ");
  });

  await check("M5.1: a jump cut short by Back to start or Jump to the end shows the state it was last given at once, nothing lifted and no transition left", async () => {
    const lifted = { button: 0, minLift: 28 }; // near the top of the arc: the knight has left both squares by then (it eases in, so at 15 it has hardly moved)
    const cut = await flightOf(0, { press: lifted, settleMs: 2500 });
    const mid = cut.samples[cut.pressedAt];
    expect(cut.pressedAt !== null && cut.pressedDisabled === false, `Back to start: pressed at sample ${cut.pressedAt}, disabled ${cut.pressedDisabled}`);
    expect(mid.lift >= 15 && gap(mid, cut.g.from) > 0.3 && gap(mid, cut.g.to) > 0.3, `${cut.tag}: pressed with the knight ${gap(mid, cut.g.from).toFixed(2)} squares from the start, ${gap(mid, cut.g.to).toFixed(2)} from the landing, lifted ${mid.lift.toFixed(1)}`);
    const atStart = (s) => gap(s, cut.g.from) < 0.02 && resting(s) && s.trails.length === 0 && s.rings === cut.before.rings.join() && s.square === cut.before.at && s.facing === facingOf(cut.before) && s.face === facingOf(cut.before);
    everySample(cut.samples.slice(cut.pressedAt + 1), atStart, `${cut.tag}: after Back to start the knight is on ${cut.before.at}, facing ${facingOf(cut.before)}, nothing lifted, with the first rings and no trail`);
    // the same, with Jump to the end: a two-jump program, so that the first jump is still in the air while the recording is at its second line
    const end = await flightOf(0, { back: true, press: { button: 4, minLift: 28 }, settleMs: 2500 });
    const midEnd = end.samples[end.pressedAt];
    expect(end.pressedAt !== null && end.pressedDisabled === false, `Jump to the end: pressed at sample ${end.pressedAt}, disabled ${end.pressedDisabled}`);
    expect(midEnd.lift >= 15 && gap(midEnd, end.g.from) > 0.3 && gap(midEnd, end.g.to) > 0.3, `${end.tag}: pressed with the knight ${gap(midEnd, end.g.from).toFixed(2)} squares from the start, ${gap(midEnd, end.g.to).toFixed(2)} from the landing`);
    const atEnd = (s) => gap(s, end.g.from) < 0.02 && resting(s) && s.trails.length === 0 && s.rings === end.before.rings.join() && s.square === end.before.at && s.facing === end.home.shortFacing && s.face === end.home.shortFacing;
    everySample(end.samples.slice(end.pressedAt + 1), atEnd, `${end.tag}: after Jump to the end the knight is back on ${end.before.at}, facing ${end.home.shortFacing} (the way the jump back ends), nothing lifted`);
    return `${cut.tag}: back to start at sample ${cut.pressedAt} (lifted ${mid.lift.toFixed(1)}); there and back: jump to end at sample ${end.pressedAt}`;
  });

  await check("M5.1: with motion reduced a jump is not flown: the knight is on its start or its landing square, nothing animates, and it ends facing the short leg's way", async () => {
    const notes = [];
    for (const ring of [0, 1]) {
      const { samples, g, tag, after } = await flightOf(ring, { motion: "reduced", settleMs: 2500 });
      expect(await b.evaluate(`document.documentElement.dataset.motion`) === "reduced", `${tag}: the page does not say motion is reduced`);
      everySample(samples, (s) => gap(s, g.from) < 0.02 || gap(s, g.to) < 0.02, `${tag}: the knight should only ever be on ${squareOf(g.from)} or ${squareOf(g.to)}`);
      expect(samples.some((s) => gap(s, g.from) < 0.02) && samples.some((s) => gap(s, g.to) < 0.02), `${tag}: the samples never saw both squares`);
      everySample(samples, (s) => resting(s) && s.trails.length === 0, `${tag}: with motion reduced nothing is lifted, animated or in transition, and no trail is drawn`);
      const last = samples.at(-1);
      expect(last.face === g.shortFacing && last.facing === g.shortFacing && after.at === squareOf(g.to), `${tag}: ended on ${after.at} with the brackets facing ${last.face}, label ${last.facing}, not ${g.shortFacing}`);
      notes.push(`${tag}: ${samples.length} samples, ends facing ${last.face}`);
    }
    return notes.join(" | ");
  });

  await check("M5.1: at 4x a jump still ends on its square facing right, with nothing lifted and no transition left", async () => {
    const notes = [];
    for (const ring of [0, 1]) {
      const { samples, g, tag, after } = await flightOf(ring, { speed: 4, settleMs: 2500 });
      const moving = samples.filter((s) => gap(s, g.from) > 0.02 && gap(s, g.to) > 0.02);
      const last = samples.at(-1);
      expect(moving.length >= 2, `${tag}: only ${moving.length} samples between the squares`);
      everySample(samples.slice(-10), (s) => gap(s, g.to) < 0.02 && resting(s) && s.face === g.shortFacing && s.facing === g.shortFacing && s.square === squareOf(g.to) && s.rings === after.rings.join(), `${tag}: the end of the jump`);
      const peak = Math.max(...samples.map((s) => s.lift ?? 0));
      const tail = moving.slice(-3).map((s) => `${gap(s, g.to).toFixed(2)}/${s.lift.toFixed(1)}`);
      notes.push(`${tag}: ${moving.length} samples in flight, peak lift ${peak.toFixed(1)}, last in flight (squares from landing / lift) ${tail.join(" ")}, ends ${last.face}`);
    }
    // there and back at 4x: is the end of the first jump cut short by the second?
    const { samples, g, home, tag, before } = await flightOf(0, { speed: 4, back: true, settleMs: 2500 });
    const reached = Math.min(...samples.map((s) => gap(s, g.to)));
    const last = samples.at(-1);
    expect(gap(last, g.from) < 0.02 && resting(last) && last.face === home.shortFacing && last.facing === home.shortFacing && last.rings === before.rings.join(), `${tag} and back: ended ${look(last)}`);
    notes.push(`there and back: came within ${reached.toFixed(2)} squares of ${squareOf(g.to)} between the jumps`);
    return notes.join(" | ");
  });
}
