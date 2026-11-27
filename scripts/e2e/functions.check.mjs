// End-to-end checks for a player's own functions (Chapter 7): stepping into a function and back out, the return arrow
// in the gutter, the variables panel inside a function, the friendly errors, a function that never stops; then the
// examiner (the level screen's calls, the lesson snippet it calls, the cards' code spans) and the Codex's keywords.
// Every program typed here is made up, on the Testing ground's practice-11 (a knight level with no rule against `def`)
// or the examiner levels (a do-nothing function); none is a level's solution. Checks report facts (lines, counts,
// squares), never the editor's contents.
import { sleep } from "./cdp.mjs";
import { examinerHelpers, lessonHelpers, levelHelpers } from "./helpers.mjs";
import { expect } from "./suite.mjs";

const LEVEL = "practice-11";
const ARROW = "↩";

export default async function functionsChecks({ browser: b, base, root, check }) {
  const { openLevel, setCode, run, brief, solution, challengeTab, codexTab, button, press, toStart } = levelHelpers(b, base, root);
  const { lessonAt, runSnippet } = lessonHelpers(b, openLevel);
  const { examinerView, examinerCard, challengeCalls, stubFunction } = examinerHelpers(b);

  const boardLabel = `document.querySelector('.board-host .board').getAttribute('aria-label')`;

  /** Everything a step shows, read from the page. Lines are 1-based; `active` is the highlighted line (or null). */
  const snap = () =>
    b.evaluate(`(() => {
      const label = document.querySelector('.step-label').textContent;
      const lines = [...document.querySelectorAll('.level-right .cm-content .cm-line')];
      const active = lines.findIndex((line) => line.classList.contains('cm-step-line')) + 1;
      const marked = [...document.querySelectorAll('.level-right .cm-lineNumbers .cm-gutterElement.cm-call-line')];
      const names = (scope) => [...document.querySelectorAll(scope + ' tr')].map((r) => r.querySelector('.var-name').textContent);
      const fold = document.querySelector('.inspector details.fold');
      const gutters = document.querySelector('.level-right .cm-gutters');
      return {
        n: Number(/Step (\\d+)/.exec(label)?.[1]),
        total: Number(/of (\\d+)/.exec(label)?.[1]),
        active: active || null,
        marks: marked.map((e) => e.textContent.trim()),
        arrows: marked.map((e) => getComputedStyle(e, '::before').content),
        scope: !!document.querySelector('.inspector .scope'),
        head: document.querySelector('.inspector .scope .group-head')?.textContent ?? null,
        own: names('.inspector .scope'),
        plain: document.querySelector('.inspector .scope') ? [] : names('.inspector'),
        fold: fold ? { open: fold.open, summary: fold.querySelector('summary').textContent, rows: names('.inspector details.fold') } : null,
        console: document.querySelector('.console').innerText.split('\\n').map((s) => s.trim()).filter(Boolean),
        at: /is on ([a-z]\\d+)/.exec(${boardLabel})?.[1],
        gutterWidth: gutters.getBoundingClientRect().width,
        codeLeft: document.querySelector('.level-right .cm-content').getBoundingClientRect().left,
      };
    })()`);

  /** The board (square and rings) and the console, as one string: playback is settled when it stops changing. */
  const boardState = () => b.evaluate(`${boardLabel} + '|' + document.querySelector('.console').innerText`);
  async function settle() {
    let last = await boardState();
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      const now = await boardState();
      if (now === last) return;
      last = now;
    }
  }

  /** Rewind to before the first step and wait for the board to settle there. */
  async function rewind() {
    await toStart();
    await settle();
  }
  /**
   * Open level `id` on a fresh page, type `code` and run it (jumping to the last frame unless `jump` is false). Returns the
   * outcome card. `code` may be a function that gives the program once the level is open (it reads the page).
   */
  async function runOn(id, code, { jump = true } = {}) {
    await openLevel(id, { fresh: true });
    await setCode(typeof code === "function" ? await code() : code);
    return run({ jump });
  }
  /** Run `code` and rewind to before its first step, ready to step forward by hand. Returns the run's outcome card. */
  async function startAtZero(code) {
    const outcome = await runOn(LEVEL, code, { jump: false });
    await rewind();
    return outcome;
  }
  /** One step forward, waiting for the step to change and the board to settle; false when there is no next step. */
  async function forward() {
    const before = (await snap()).n;
    if (await b.evaluate(`${button(3)}.disabled`)) return false;
    await press(3);
    await b.waitFor(`Number(/Step (\\d+)/.exec(document.querySelector('.step-label').textContent)?.[1]) === ${before + 1}`, 5000, "the next step");
    await settle();
    return true;
  }
  /** Run `code` and step through it from step 0 to its last step; returns every step's snapshot. */
  async function stepThrough(code) {
    await startAtZero(code);
    const steps = [await snap()];
    while (await forward()) steps.push(await snap());
    return steps;
  }
  /** Step forward until a step satisfies `test`; returns its snapshot. */
  async function stepUntil(test, what) {
    for (let i = 0; i < 40; i++) {
      const s = await snap();
      if (test(s)) return s;
      expect(await forward(), `ran out of steps before ${what}`);
    }
    throw new Error(`no step with ${what} within 40 steps`);
  }
  const activeLines = (steps) => steps.map((s) => s.active).filter((line) => line !== null);

  await check("M5.2: a jump inside a function plays back: def line, calling line, body line; the knight lands on the body line's frame", async () => {
    await openLevel(LEVEL, { fresh: true });
    const label = await b.evaluate(boardLabel);
    const start = /Your knight is on ([a-z]\d+)/.exec(label)?.[1];
    const target = /It can land on (\w\d+)/.exec(label)?.[1]; // the first landing ring
    expect(start && target, `no start or landing square in the board's label`);
    const [dx, dy] = [target.charCodeAt(0) - start.charCodeAt(0), Number(target.slice(1)) - Number(start.slice(1))];
    await startAtZero(`def hop():\n    knight.jump(${dx}, ${dy})\n\nhop()`);
    const steps = [await snap()];
    while (await forward()) {
      // A step's events play a moment after its highlight appears: give the body line's jump time to land.
      if ((await snap()).active === 2) await b.waitFor(`/is on ${target}/.test(${boardLabel})`, 4000, `the knight on ${target}`).catch(() => null);
      steps.push(await snap());
    }
    const lines = activeLines(steps);
    expect(lines.slice(0, 3).join() === "1,4,2", `the highlight visited lines ${lines.join()}, not 1,4,2 first (steps ${steps.map((s) => `${s.n}/${s.total}`).join()})`);
    const body = steps.findIndex((s) => s.active === 2);
    expect(steps.slice(0, body).every((s) => s.at === start), `the knight left ${start} before the body line: ${steps.slice(0, body).map((s) => s.at).join()}`);
    expect(steps.slice(body).every((s) => s.at === target), `the knight is not on ${target} from the body line on: ${steps.slice(body).map((s) => s.at).join()}`);
    return `${steps.length - 1} steps, lines ${lines.join()}; ${start} to ${target}`;
  });

  await check("M5.2: a function's print and its returned number reach the console, the number on the calling line's frame", async () => {
    const steps = await stepThrough(`def double(n):\n    print("doubling")\n    return n * 2\n\nprint(double(21))`);
    const last = steps.at(-1).console;
    expect(last.length === 2 && last[0] === "doubling" && last[1] === "42", `the console ends with ${last.length} lines: ${JSON.stringify(last.map((l) => l.length))}`);
    const ret = steps.findIndex((s) => s.active === 3);
    expect(ret > 0 && steps[ret + 1]?.active === 5, `after the return line the highlight is on line ${steps[ret + 1]?.active}, not 5 (the calling line)`);
    expect(steps[ret].console.join() === "doubling", `on the return line the console holds ${steps[ret].console.length} lines`);
    expect(steps[ret + 1].console.join() === "doubling,42", `back on the calling line the console holds ${steps[ret + 1].console.length} lines`);
    expect(steps.slice(0, ret + 1).every((s) => !s.console.includes("42")), `the number appeared before the function's last line`);
    return `${steps.length - 1} steps, lines ${activeLines(steps).join()}`;
  });

  const nested = `def helper():\n    print("in helper")\n\ndef outer():\n    helper()\n    print("back")\n\nouter()`;
  // Where the return arrow belongs on each line of `nested`: the program's `outer()` call is line 8; inside outer, `helper()` is line 5.
  const expectedMark = { 1: [], 4: [], 8: [], 5: ["8"], 6: ["8"], 2: ["5"] };

  await check("M5.2: the return arrow marks the line that made the call, one deep and two deep, and is drawn in the gutter's padding", async () => {
    const steps = await stepThrough(nested);
    const wrong = steps.filter((s) => s.active && s.marks.join() !== expectedMark[s.active].join());
    expect(wrong.length === 0, `marks on the wrong line: ${wrong.map((s) => `step ${s.n} line ${s.active} marks [${s.marks}]`).join("; ")}`);
    for (const line of [2, 5, 6]) expect(steps.some((s) => s.active === line), `the highlight never reached line ${line}`);
    const marked = steps.filter((s) => s.marks.length > 0);
    expect(marked.every((s) => s.marks.length === 1 && s.arrows[0].includes(ARROW)), `a marked step had ${marked.map((s) => s.marks.length)} marks or no arrow`);
    expect(steps.filter((s) => s.active === 2).every((s) => s.marks.join() === "5"), "inside the helper the mark is not on line 5");
    const bare = steps.find((s) => s.active === 8 && s.marks.length === 0);
    const inside = steps.find((s) => s.active === 2);
    expect(bare && inside, "no step with and without the mark to compare");
    expect(bare.gutterWidth === inside.gutterWidth, `the gutter is ${bare.gutterWidth}px wide without the mark and ${inside.gutterWidth}px with it`);
    expect(bare.codeLeft === inside.codeLeft, `the code starts at ${bare.codeLeft}px without the mark and ${inside.codeLeft}px with it`);
    return `${steps.length - 1} steps; gutter ${inside.gutterWidth}px, code at ${inside.codeLeft}px on both`;
  });

  await check("M5.2: typing in the editor removes the return arrow", async () => {
    await startAtZero(nested);
    await stepUntil((s) => s.active === 2 && s.marks.length === 1, "the helper's body line, with its mark");
    await b.evaluate(`document.querySelector('.level-right .cm-content').focus()`);
    await b.send("Input.insertText", { text: " " });
    await b.waitFor(`document.querySelectorAll('.cm-call-line').length === 0`, 5000, "the mark gone after an edit");
    return "the mark is gone after one typed space";
  });

  const scaled = `def scale(n):\n    result = n * 3\n    return result\n\nanswer = scale(5)`;

  await check("M5.2: inside a function the variables panel shows its names, then a closed fold of the program's names that opens and stays open", async () => {
    await startAtZero(scaled);
    const top = await stepUntil((s) => s.active === 1, "the def line");
    expect(!top.scope && top.fold === null && top.plain[0] === "knight" && top.plain.includes("scale"), `module level: scope ${top.scope}, rows [${top.plain}]`);
    const first = await stepUntil((s) => s.scope, "a step inside the function");
    expect(first.head === "scale()", `the heading is "${first.head}"`);
    const inside = await stepUntil((s) => s.active === 3 && s.scope, "the function's last line");
    expect(inside.own.join() === "n,result", `the function's own names are [${inside.own}]`);
    expect(inside.fold && inside.fold.open === false, "the fold is not closed");
    const count = inside.fold.rows.length;
    expect(inside.fold.summary === `your program's names (${count})` && count >= 2, `the fold reads "${inside.fold.summary}" with ${count} rows`);
    expect(inside.fold.rows[0] === "knight", `the fold's first row is ${inside.fold.rows[0]}`);
    // Open it with a real click, at the function's first line (a body of two lines, so one more step stays inside).
    await rewind();
    await stepUntil((s) => s.active === 2 && s.scope, "the function's first line");
    const point = await b.evaluate(`(() => { const r = document.querySelector('.inspector details.fold summary').getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`);
    for (const type of ["mousePressed", "mouseReleased"]) await b.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
    await b.waitFor(`document.querySelector('.inspector details.fold')?.open === true`, 3000, "the fold open after a click");
    await sleep(300); // the page's own toggle listener (it remembers the fold) runs a moment after the click
    const opened = await snap();
    expect(opened.fold.rows[0] === "knight", `opened, the first row is ${opened.fold.rows[0]}`);
    expect(await forward(), "no step after the function's first line");
    const later = await snap();
    expect(later.active === 3 && later.scope && later.fold.open === true, `one step on (line ${later.active}), the fold is ${later.fold?.open ? "open" : "closed"}`);
    // The last step is back at module level: plain rows, no scope.
    const end = await stepUntil((s) => !s.scope && s.plain.includes("answer"), "the program's names after the call");
    expect(end.fold === null && end.plain[0] === "knight", `module level: rows [${end.plain}]`);
    // Run again: the fold is closed once more.
    await run({ jump: false });
    await rewind();
    await stepUntil((s) => s.scope, "a step inside the function on the second run");
    const again = await snap();
    expect(again.fold && again.fold.open === false, "after Run again the fold is still open");
    return `heading ${first.head}, own [${inside.own}], fold ${inside.fold.summary}`;
  });

  await check("M5.2: a function that sets a name the program also has is stopped with its friendly words, on its line, traceback folded", async () => {
    const r = await runOn(LEVEL, `total = 0\n\ndef bump():\n    total += 1\n\nbump()`);
    expect(r.head === "Python stopped", brief(r));
    expect(/makes a new total of the function's own, which has no value yet on this line/.test(r.text.replace(/`/g, "")), `the friendly words are missing: ${brief(r)}`);
    const where = await b.evaluate(`(() => {
      const lines = [...document.querySelectorAll('.level-right .cm-content .cm-line')];
      const details = document.querySelector('.outcome-host details');
      return {
        errorLines: lines.map((line, i) => (line.classList.contains('cm-error-line') ? i + 1 : 0)).filter(Boolean),
        tag: document.querySelector('.outcome-host .line-tag')?.textContent ?? null,
        folded: !!details && !details.open && /traceback/i.test(details.querySelector('summary').textContent),
        traceVisible: !!document.querySelector('.outcome-host pre.traceback')?.checkVisibility?.(),
      };
    })()`);
    expect(where.errorLines.join() === "4" && where.tag === "Line 4", `the error is on lines [${where.errorLines}], tagged ${where.tag}; it should be line 4`);
    expect(where.folded && !where.traceVisible, `traceback folded: ${where.folded}, visible: ${where.traceVisible}`);
    expect(!/Traceback|UnboundLocalError/.test(r.text), "Python's own words are showing");
    return brief(r);
  });

  /** After a bad run, one short program runs normally: the card is a result, not a "Stopped" or "Something went wrong" notice. */
  async function nextRunWorks() {
    await setCode("steps = 1");
    const r = await run();
    expect(r.head !== "Stopped" && r.head !== "Something went wrong" && r.head !== "Endless loop" && r.head !== "Python stopped", `the next run says: ${brief(r)}`);
    expect(r.vars.some((v) => v.startsWith("steps ")), "the next run did not run");
    expect(!(await b.evaluate(`document.body.innerText`)).includes("Python couldn't start"), "the page says Python couldn't start");
    return r.head;
  }

  await check("M5.2: a function that calls itself forever ends with Python's own recursion limit, and Python is still alive", async () => {
    const started = Date.now();
    const r = await runOn(LEVEL, `def again():\n    again()\n\nagain()`);
    const took = Date.now() - started;
    expect(r.head === "Python stopped", `the run ended with: ${brief(r)}`);
    expect(r.text.includes("A function kept calling itself and never stopped, so Python gave up."), `the recursion sentence is missing: ${brief(r)}`);
    const next = await nextRunWorks();
    return `${took} ms to the card; next run: ${next}`;
  });

  await check("M5.2: a function that loops forever ends as an endless loop, and the next run works", async () => {
    const started = Date.now();
    const r = await runOn(LEVEL, `def spin():\n    while True:\n        pass\n\nspin()`);
    const took = Date.now() - started;
    expect(r.head === "Endless loop", `the run ended with: ${brief(r)}`);
    const next = await nextRunWorks();
    return `${took} ms to the card; next run: ${next}`;
  });

  await check("M5.2: a function that calls itself until Python stops it, caught and carried on from, ends with the game's lost-track sentence, and the next run works", async () => {
    const r = await runOn(LEVEL, `def again():\n    again()\n\ntry:\n    again()\nexcept RecursionError:\n    pass\nprint("carried on")`);
    const text = r.text.replace(/`/g, "");
    expect(r.head === "Python stopped", `the run ended with: ${brief(r)}`);
    expect(text.includes("The game lost track of this program partway through"), `the lost-track sentence is missing: ${brief(r)}`);
    expect(text.includes("Give the function a way to stop calling itself"), `the advice is missing: ${brief(r)}`);
    expect(r.stars === 0 && r.next === null, `the run was judged: ${r.stars} stars, next ${r.next}`); // an error is neither solved nor lost on the board
    expect(!(await b.evaluate(`!!document.querySelector('.outcome-host .line-tag')`)), "the card carries a line tag");
    const next = await nextRunWorks();
    return `the lost-track sentence on the card; next run: ${next}`;
  });

  // ---- The examiner on the level screen (ch07-l03 judges the board only; ch07-l04 also wants an answer handed back) ----
  // A failing run types a made-up function named as the page's call list names it, taking any call and doing nothing.
  // The answers the examiner wants are spoilers: these checks read them in the page and report counts and booleans only,
  // and never `brief` an answer level's card (it holds wanted and got values).
  const BOARD_ONLY = "ch07-l03";
  const ANSWER = "ch07-l04";
  const MARK = { ok: "✓", no: "✗" };
  const caseButtons = `[...document.querySelectorAll('.board-host .case-row button')]`;

  /** Open the level, type the made-up function and run it (jumping to the last frame unless `jump` is false). */
  const stubRun = (id, opts) => runOn(id, stubFunction, opts);
  const clickCase = (index) => b.evaluate(`${caseButtons}[${index}].click()`);
  const pressedIs = (index) => `${caseButtons}[${index}]?.getAttribute('aria-pressed') === 'true'`;
  const rowPicked = (index) => `document.querySelectorAll('.outcome-host table.calls tr')[${index + 1}]?.classList.contains('picked')`;
  const pickedIndex = (card) => card.table.rows.findIndex((row) => row.picked);

  await check("M5.2: before a run the Challenge panel lists the examiner's calls, one per board, the first board on show", async () => {
    await openLevel(BOARD_ONLY, { fresh: true });
    const seen = await b.evaluate(`(() => ({
      said: [...document.querySelectorAll('p')].some((p) => p.textContent.trim() === 'The examiner will call:'),
      calls: [...document.querySelectorAll('ol.call-list li')].map((li) => li.textContent.trim()),
      codes: document.querySelectorAll('ol.call-list li code.call-code').length,
      thumbs: document.querySelectorAll('.board-host button.board-thumb').length,
      caption: document.querySelector('.board-host p.boards-caption')?.textContent ?? '',
    }))()`);
    expect(seen.said, "the sentence 'The examiner will call:' is missing");
    expect(seen.thumbs >= 1 && seen.calls.length === seen.thumbs + 1, `${seen.calls.length} calls for ${seen.thumbs} small boards plus one`);
    expect(seen.codes === seen.calls.length, `${seen.codes} calls in code of ${seen.calls.length}`);
    const names = seen.calls.map((call) => call.split("(")[0]);
    expect(names[0] !== "" && names.every((name) => name === names[0]) && seen.calls.every((call) => call.endsWith(")")), "the calls are not all one function's");
    expect(seen.calls.every((call) => !/on board/i.test(call)), "an item says which board it is on");
    expect(seen.caption.startsWith("Board 1 of"), `the main board's caption starts "${seen.caption.slice(0, 12)}"`);
    await challengeTab(); // the list sits in the Challenge panel, which has no size while the lesson is on show
    const gap = await b.evaluate(`document.querySelector('ol.call-list').getBoundingClientRect().top - document.querySelector('p.call-intro').getBoundingClientRect().bottom`);
    expect(gap >= 5 && gap <= 7, `the call list is ${gap}px under its sentence, not 5 to 7`);
    return `${seen.calls.length} calls, ${seen.thumbs} small boards; the list is ${gap}px under its sentence`;
  });

  await check("M5.2: a failed run shows a button per call, each ✗, the first pressed, no small boards, the examiner's line and no table", async () => {
    const r = await stubRun(BOARD_ONLY);
    expect(r.head !== "Solved!", `the made-up function solved the level: ${r.head}`);
    const view = await examinerView();
    const card = await examinerCard();
    expect(view.row === "The examiner's calls" && view.calls.length >= 2, `the row is ${JSON.stringify(view.row)} with ${view.calls.length} buttons`);
    expect(view.marks.every((m) => m === MARK.no), `marks ${view.marks.join("")}`);
    expect(view.pressed.join() === "0", `pressed buttons: [${view.pressed}]`);
    expect(view.thumbs === 0 && view.cases === 1, `${view.thumbs} small boards, ${view.cases} rows of buttons`);
    expect(card.line && card.mark === "E", `the examiner's line: ${card.line}, its mark: ${card.mark}`);
    expect(card.table === null, "a table of calls on a level that wants no answer");
    expect(new RegExp(`worked for 0 of the ${view.calls.length} calls`).test(r.note ?? ""), `the case note: ${(r.note ?? "").slice(0, 60)}`);
    // The card's sentences show the call as code, with no backtick left in the text.
    const spans = await b.evaluate(`(() => {
      const card = document.querySelector('.outcome-host .outcome');
      return { codes: [...card.querySelectorAll('p code')].map((e) => e.textContent), text: card.textContent };
    })()`);
    expect(spans.codes.includes(view.calls[view.pressed[0]]), `no paragraph holds the pressed call in code (${spans.codes.length} code elements in paragraphs)`);
    expect(!spans.text.includes("`"), "a backtick shows in the card's text");
    return `${view.calls.length} calls, all ✗; the pressed call is code in the card`;
  });

  await check("M5.2: a call's button replays that call: it becomes the pressed one, the card speaks of it, another board is on show", async () => {
    await stubRun(BOARD_ONLY);
    const before = await examinerView();
    await clickCase(2);
    await b.waitFor(pressedIs(2), 5000, "the third button pressed");
    await b.waitFor(`document.querySelector('.outcome-host .outcome').innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(before.calls[2])})`, 5000, "the card speaking of the third call");
    const after = await examinerView();
    const card = await examinerCard();
    expect(after.pressed.join() === "2", `pressed buttons: [${after.pressed}]`);
    expect(!card.text.includes(before.calls[0]), "the card still speaks of the first call");
    expect(after.shape !== before.shape, `the board's shape is the same as before (${after.shape})`);
    expect(after.calls.join() === before.calls.join(), "the calls changed");
    return `call 3 pressed; the board went from ${before.shape} to ${after.shape}`;
  });

  await check('M5.2: the caption is empty at the start, reads "The examiner calls" and the call at the end, and the board does not move', async () => {
    await stubRun(BOARD_ONLY, { jump: false });
    /** Whether the caption is there and holds nothing but non-breaking spaces. */
    const empty = () =>
      b.evaluate(`(() => { const t = document.querySelector('.board-host p.boards-caption')?.textContent ?? ''; return t.length > 0 && [...t].every((c) => c === '\\u00a0'); })()`);
    await rewind();
    const start = await examinerView();
    expect(await empty(), `at the first frame the caption holds ${JSON.stringify(start.caption)}`);
    await press(4);
    await b.waitFor(`document.querySelector('.board-host p.boards-caption')?.textContent.startsWith('The examiner calls ')`, 8000, "the caption filled at the last frame");
    await settle();
    const end = await examinerView();
    const said = end.caption.slice("The examiner calls ".length).replace(/\.$/, "");
    expect(said === end.calls[end.pressed[0]], `the caption names ${said}, the pressed button is ${end.calls[end.pressed[0]]}`);
    expect(Math.abs(end.top - start.top) < 1, `the board's top is ${start.top}px with the caption empty and ${end.top}px filled`);
    await rewind();
    const back = await examinerView();
    expect((await empty()) && Math.abs(back.top - start.top) < 1, "back at the start the caption is not empty, or the board moved");
    return `caption empty, filled, empty; the board's top moves ${Math.abs(end.top - start.top)}px (from ${start.top}px)`;
  });

  await check("M5.2: a level that wants an answer shows a table of calls, wanted and got; the picked row follows the pressed call", async () => {
    const r = await stubRun(ANSWER);
    expect(r.head !== "Solved!", `the made-up function solved the level: ${r.head}`);
    const view = await examinerView();
    let card = await examinerCard();
    const n = view.calls.length;
    expect(card.table && card.table.head === 4 && card.table.rows.length === n, `head cells ${card.table?.head}, rows ${card.table?.rows.length} for ${n} calls`);
    const rows = card.table.rows;
    expect(rows.every((row) => row.wanted), "a wanted cell is empty");
    expect(rows.every((row) => row.none), "a got cell does not read None");
    expect(rows.every((row) => row.mark === MARK.no && row.markClass === "no"), "a mark is not a ✗ with class no");
    expect(rows.filter((row) => row.picked).length === 1 && pickedIndex(card) === view.pressed[0], `picked row ${pickedIndex(card)}, pressed button ${view.pressed[0]}`);
    expect(rows.every((row, i) => row.call === view.calls[i]), "a row's call is not its button's call");
    await clickCase(n - 1);
    await b.waitFor(`${pressedIs(n - 1)} && ${rowPicked(n - 1)}`, 5000, "the last button pressed and its row picked");
    card = await examinerCard();
    const moved = await examinerView();
    expect(moved.pressed.join() === String(n - 1) && pickedIndex(card) === n - 1, `after the click: pressed [${moved.pressed}], picked row ${pickedIndex(card)}`);
    // And the other way: a row's own button replays its call.
    await b.evaluate(`document.querySelectorAll('.outcome-host table.calls tr')[2].children[0].querySelector('button').click()`);
    await b.waitFor(`${pressedIs(1)} && ${rowPicked(1)}`, 5000, "the second button pressed from its row");
    card = await examinerCard();
    expect(pickedIndex(card) === 1, "the row's button did not move the picked row");
    return `${n} rows, none returned, the picked row follows the pressed call both ways`;
  });

  await check("M5.3: after a run the buttons say call 1, call 2 … each with its mark, the table's first column says call N, and the full call is each button's tooltip (the table's after Replay)", async () => {
    const r = await stubRun(ANSWER);
    expect(r.head !== "Solved!", `the made-up function solved the level: ${r.head}`);
    const listed = await challengeCalls(); // the Challenge panel's numbered list: "call N" is its Nth item
    const view = await examinerView();
    const card = await examinerCard();
    const n = listed.length;
    expect(n >= 2 && view.texts.length === n, `${n} calls listed, ${view.texts.length} buttons`);
    const numbered = listed.map((_, i) => `call ${i + 1}`);
    expect(JSON.stringify(view.texts) === JSON.stringify(numbered.map((words) => `${words} ${MARK.no}`)), `the buttons read ${JSON.stringify(view.texts)}`);
    expect(JSON.stringify(view.calls) === JSON.stringify(listed), "a button's tooltip is not the Challenge panel's item of the same number");
    expect(card.table && card.table.rows.length === n, `the table has ${card.table?.rows.length} rows for ${n} calls`);
    const rows = card.table.rows;
    expect(JSON.stringify(rows.map((row) => row.words)) === JSON.stringify(numbered), `the table's first column reads ${JSON.stringify(rows.map((row) => row.words))}`);
    expect(rows.every((row, i) => row.replays && row.call === listed[i]), "a table button's tooltip is not Replay and the Challenge panel's item of the same number");
    return `${n} buttons and rows: ${numbered.join(", ")}; tooltips match the Challenge list`;
  });

  await check("M5.3: a hidden-goal level's case buttons keep their square labels and carry no tooltip and no call number", async () => {
    const r = await runOn("practice-01", "pass"); // a made-up program that moves nothing: every case fails
    expect(r.head !== "Solved!", `the made-up program solved the level: ${r.head}`);
    const row = await b.evaluate(`[...document.querySelectorAll('.board-host .case-row button')].map((e) => ({ text: e.textContent, titled: e.hasAttribute('title') }))`);
    expect(row.length === 4, `${row.length} buttons in the case row`);
    expect(row.every((e) => new RegExp("^[a-h][1-8] [" + MARK.ok + MARK.no + "]$").test(e.text)), `the buttons read ${JSON.stringify(row.map((e) => e.text))}`);
    expect(row.every((e) => !e.titled), `${row.filter((e) => e.titled).length} buttons carry a title`);
    expect((await examinerCard()).table === null, "a table of calls on a hidden-goal level");
    return `${row.length} buttons read ${row.map((e) => e.text).join(", ")}, none with a tooltip`;
  });

  await check("M5.2: a program that makes the examiner's call itself is refused before the run, naming the line", async () => {
    await openLevel(BOARD_ONLY, { fresh: true });
    const before = await examinerView();
    const own = await stubFunction();
    const line = own.split("\n").length + 1;
    await setCode(`${own}\n${own.slice(4, own.indexOf("("))}()`);
    const r = await run();
    expect(r.head === "Check the rules", brief(r));
    expect(new RegExp(`line ${line}\\b`, "i").test(r.text) && /examiner makes the calls/.test(r.text), `the sentence: ${brief(r)}`);
    const after = await examinerView();
    expect(after.cases === 0 && after.thumbs === before.thumbs && after.thumbs >= 1, `${after.cases} rows of buttons, ${after.thumbs} small boards (${before.thumbs} before)`);
    return `refused, line ${line} named`;
  });

  await check("M5.2: the reference programs pass: every call ✓ and three stars; with an answer, every row ✓ and got equal to wanted", async () => {
    await openLevel(BOARD_ONLY, { fresh: true });
    await setCode(solution(BOARD_ONLY));
    const r = await run();
    expect(r.head === "Solved!" && r.stars === 3, `${BOARD_ONLY}: ${r.head}, ${r.stars} stars`);
    const view = await examinerView();
    expect(view.calls.length >= 2 && view.marks.every((m) => m === MARK.ok), `marks ${view.marks.join("")}`);
    await openLevel(ANSWER, { fresh: true });
    await setCode(solution(ANSWER));
    const a = await run();
    expect(a.head === "Solved!", `${ANSWER}: ${a.head}`);
    const answered = await examinerView();
    const card = await examinerCard();
    expect(answered.marks.length >= 2 && answered.marks.every((m) => m === MARK.ok), `marks ${answered.marks.join("")}`);
    expect(card.table && card.table.rows.length === answered.calls.length, "the table is missing or has the wrong number of rows");
    expect(card.table.rows.every((row) => row.mark === MARK.ok && row.markClass === "ok"), "a row is not a ✓ with class ok");
    expect(card.table.rows.every((row) => row.same && row.wanted), "a got cell differs from its wanted cell");
    return `${view.calls.length} and ${answered.calls.length} calls, all ✓`;
  });

  // ---- Code spans in the cards ----
  await check("M5.2: a misspelt ability's error card has its sentence with the line tag first, code spans and no backtick", async () => {
    const r = await runOn(LEVEL, "knight.jum(1, 2)");
    expect(r.head === "Python stopped", brief(r));
    const detail = await b.evaluate(`(() => {
      const p = document.querySelector('.outcome-host .error-detail p');
      return p && { first: p.firstElementChild?.className ?? null, codes: p.querySelectorAll('code').length, text: p.textContent };
    })()`);
    expect(detail, "the card has no .error-detail p");
    expect(detail.first === "line-tag", `the sentence starts with ${detail.first}, not the line tag`);
    expect(detail.codes >= 1, "the sentence holds no code element");
    expect(!detail.text.includes("`"), "a backtick shows in the sentence");
    return `${detail.codes} code elements, the line tag first`;
  });

  // ---- The lesson snippet the examiner calls (ch07-l03: the board only; ch07-l04: an answer back) ----
  // Lessons are not spoilers, but the answer the examiner wants is: only its shape is read ("and got ... back"), never the value.
  const lessonSnippets = () =>
    b.evaluate(`[...document.querySelectorAll('.lesson .snippet')].map((s) => ({
      call: s.querySelector('.snippet-call')?.textContent ?? null,
      code: s.querySelector('.snippet-call code')?.textContent ?? null,
    }))`);
  /** Where the lesson's one caption is, and what a run of the called snippet says (A1 and A2, and A3's first half). */
  async function calledSnippet(id, index, total) {
    await lessonAt(id, index);
    const all = await lessonSnippets();
    expect(all.length === total, `${all.length} snippets, not ${total}`);
    const withCall = all.flatMap((s, i) => (s.call === null ? [] : [i]));
    expect(withCall.join() === String(index), `snippets with a call: [${withCall}], not [${index}]`);
    expect(all[index].call.startsWith("The examiner calls") && /^\w+\(.*\)$/.test(all[index].code), "the caption is not 'The examiner calls' and a call in code");
    const ran = await runSnippet(index);
    expect(ran.status === "✓ Finished", `the status reads "${ran.status}"`);
    expect(ran.summary.trim() !== "" && !ran.summary.includes("`"), `the summary is ${ran.summary.length} characters, backtick: ${ran.summary.includes("`")}`);
    expect(ran.codes.includes(ran.caption), `no code element in the summary equals the caption's call (${ran.codes.length} code elements)`);
    return ran;
  }

  await check("M5.2: ch07-l03's lesson captions only the snippet with a call, and running it reports the call in code", async () => {
    await calledSnippet(BOARD_ONLY, 1, 3);
    return "one caption, on the second snippet; Finished, and the summary names the call in code";
  });

  await check('M5.2: ch07-l04\'s lesson snippet with a call also says "and got ... back" after its run', async () => {
    const ran = await calledSnippet(ANSWER, 2, 3);
    expect(/and got .+ back/.test(ran.summary), "the summary does not say it got something back");
    return "one caption, on the third snippet; Finished, and the summary says something came back";
  });

  await check("M5.2: a lesson snippet whose function is missing from its code ends as Not called", async () => {
    await lessonAt(BOARD_ONLY, 1);
    const name = (await lessonSnippets())[1].code.split("(")[0];
    await setCode(`def ${name}_missing(*args, **kwargs):\n    pass`, ".lesson-step:not([hidden]) .snippet-editor .cm-content");
    const ran = await runSnippet(1);
    expect(ran.status === "✗ Not called", `the status reads "${ran.status}"`);
    expect(!ran.summary.includes("`"), "a backtick shows in the summary");
    return `status ${ran.status}`;
  });

  // ---- The Codex's keywords, and help() ----
  /** The Codex tab's "Keywords" group on a level: whether it is there, and its entries' names. */
  async function keywords(id) {
    await openLevel(id, { fresh: true });
    await codexTab();
    await b.waitFor(`document.querySelector('.codex .codex-entry')`, 20_000, "the Codex's entries");
    return b.evaluate(`(() => {
      let group = '';
      const names = [];
      for (const el of document.querySelector('.codex').children) {
        if (el.tagName === 'H3') group = el.textContent;
        else if (group === 'Keywords' && el.classList.contains('codex-entry')) names.push(el.dataset.codex);
      }
      return { group: [...document.querySelectorAll('.codex h3')].some((e) => e.textContent === 'Keywords'), names };
    })()`);
  }

  await check("M5.2: the Codex's keywords: def comes with ch07-l02, return with ch07-l04 (not before)", async () => {
    const seen = {};
    for (const id of ["ch07-l01", "ch07-l02", "ch07-l03", "ch07-l04"]) seen[id] = await keywords(id);
    const has = (id, word) => seen[id].names.includes(word);
    expect(seen["ch07-l01"].group, "ch07-l01's Codex has no Keywords group");
    expect(!has("ch07-l01", "def") && !has("ch07-l01", "return"), `ch07-l01 lists [${seen["ch07-l01"].names}]`);
    expect(has("ch07-l02", "def") && !has("ch07-l02", "return"), `ch07-l02 lists [${seen["ch07-l02"].names}]`);
    expect(has("ch07-l03", "def") && !has("ch07-l03", "return"), `ch07-l03 lists [${seen["ch07-l03"].names}]`);
    expect(has("ch07-l04", "def") && has("ch07-l04", "return"), `ch07-l04 lists [${seen["ch07-l04"].names}]`);
    return Object.entries(seen).map(([id, k]) => `${id}: ${k.names.length}`).join(", ");
  });

  await check("M5.2: help(\"def\") in Scratch Python prints the entry the Codex tab shows for def, on the same level", async () => {
    await openLevel("ch07-l02", { fresh: true });
    await codexTab();
    await b.waitFor(`document.querySelector('.codex-entry[data-codex="def"]')`, 20_000, "the def entry");
    // The entry's own words (its call, its summary and its paragraphs), with no backticks or spacing, to match the wrapped help text.
    const squash = (text) => text.replace(/[`\s]/g, "");
    const words = await b.evaluate(`(() => {
      const e = document.querySelector('.codex-entry[data-codex="def"]');
      return [...e.querySelectorAll('.codex-call, .codex-gist, .codex-body > p:not(.muted)')].map((p) => p.textContent);
    })()`);
    expect(words.length >= 2 && words.every((w) => w.trim() !== ""), `${words.length} parts found in the def entry`);
    await b.evaluate(`document.querySelector('.repl-drawer').open = true`);
    await b.evaluate(`document.querySelector('.repl-editor .cm-content').focus()`);
    await b.send("Input.insertText", { text: 'help("def")' });
    await b.key("Enter");
    await b.waitFor(`document.querySelector('.repl-log').textContent.includes('Help on def')`, 10_000, "help's text in the log");
    const log = squash(await b.evaluate(`document.querySelector('.repl-log').textContent`));
    const missing = words.filter((w) => !log.includes(squash(w)));
    expect(missing.length === 0, `${missing.length} of ${words.length} parts of the entry are not in help's text`);
    return `${words.length} parts of the entry are in help's text`;
  });

  await check("M5.2: help() on the player's own functions prints the signature and the docstring, or says it has no description yet", async () => {
    const r = await runOn(LEVEL, `def stride(squares, times=2):\n    "Takes some squares, some times."\n    return squares * times\n\ndef plain(a):\n    return a\n\nhelp(stride)\nhelp(plain)`);
    const lines = r.console.split("\n").map((l) => l.trim());
    const at = (start) => lines.findIndex((l) => l.startsWith(start));
    const [sig, doc, sig2, none] = [at("stride(squares, times=2)"), at("Takes some squares, some times."), at("plain(a)"), at("It has no description yet")];
    expect(sig >= 0 && doc > sig && sig2 > doc && none > sig2, `lines found at ${[sig, doc, sig2, none]} of ${lines.length}`);
    return `${lines.length} console lines, signature and docstring, then signature and "no description yet"`;
  });
}
