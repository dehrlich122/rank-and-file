// End-to-end checks for a player's own functions (Chapter 7): stepping into a function and back out, the return arrow
// in the gutter, the variables panel inside a function, the friendly errors, a function that never stops.
// Every program typed here is made up, on the Testing ground's practice-11 (a knight level with no rule against `def`);
// none is a level's solution. Checks report facts (lines, counts, squares), never the editor's contents.
import { sleep } from "./cdp.mjs";
import { BUTTONS, levelHelpers } from "./helpers.mjs";
import { expect } from "./suite.mjs";

const LEVEL = "practice-11";
const ARROW = "↩";

export default async function functionsChecks({ browser: b, base, root, check }) {
  const { openLevel, setCode, run, brief, solution } = levelHelpers(b, base, root);

  const button = (index) => `document.querySelectorAll('${BUTTONS}')[${index}]`;
  const press = (index) => b.evaluate(`${button(index)}.click()`);
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

  /** Run `code` and rewind to before its first step, ready to step forward by hand. Returns the run's outcome card. */
  async function startAtZero(code) {
    await openLevel(LEVEL, { fresh: true });
    await setCode(code);
    const outcome = await run({ jump: false });
    await press(0);
    await b.waitFor(`/Step 0 /.test(document.querySelector('.step-label').textContent)`, 5000, "back at step 0");
    await settle();
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
    await press(0);
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
    await press(0);
    await stepUntil((s) => s.scope, "a step inside the function on the second run");
    const again = await snap();
    expect(again.fold && again.fold.open === false, "after Run again the fold is still open");
    return `heading ${first.head}, own [${inside.own}], fold ${inside.fold.summary}`;
  });

  await check("M5.2: a function that sets a name the program also has is stopped with its friendly words, on its line, traceback folded", async () => {
    await openLevel(LEVEL, { fresh: true });
    await setCode(`total = 0\n\ndef bump():\n    total += 1\n\nbump()`);
    const r = await run();
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
    await openLevel(LEVEL, { fresh: true });
    await setCode(`def again():\n    again()\n\nagain()`);
    const started = Date.now();
    const r = await run();
    const took = Date.now() - started;
    expect(r.head === "Python stopped", `the run ended with: ${brief(r)}`);
    expect(r.text.includes("A function kept calling itself and never stopped, so Python gave up."), `the recursion sentence is missing: ${brief(r)}`);
    const next = await nextRunWorks();
    return `${took} ms to the card; next run: ${next}`;
  });

  await check("M5.2: a function that loops forever ends as an endless loop, and the next run works", async () => {
    await openLevel(LEVEL, { fresh: true });
    await setCode(`def spin():\n    while True:\n        pass\n\nspin()`);
    const started = Date.now();
    const r = await run();
    const took = Date.now() - started;
    expect(r.head === "Endless loop", `the run ended with: ${brief(r)}`);
    const next = await nextRunWorks();
    return `${took} ms to the card; next run: ${next}`;
  });

  // ---- The examiner on the level screen (ch07-l03 judges the board only; ch07-l04 also wants an answer handed back) ----
  // A failing run types a made-up function named as the page's call list names it, taking any call and doing nothing.
  // The answers the examiner wants are spoilers: these checks read them in the page and report counts and booleans only,
  // and never `brief` an answer level's card (it holds wanted and got values).
  const BOARD_ONLY = "ch07-l03";
  const ANSWER = "ch07-l04";
  const MARK = { ok: "✓", no: "✗" };
  const caseButtons = `[...document.querySelectorAll('.board-host .case-row button')]`;

  /** What the board host shows of the examiner's calls (the calls' own text, counts, booleans, the board's shape). */
  const examinerView = () =>
    b.evaluate(`(() => {
      const row = document.querySelector('.board-host .case-row');
      const buttons = row ? [...row.querySelectorAll('button')] : [];
      const caption = document.querySelector('.board-host p.boards-caption');
      const board = document.querySelector('.board-host .board');
      const box = board.getBoundingClientRect();
      return {
        row: row?.getAttribute('aria-label') ?? null,
        calls: buttons.map((e) => e.textContent.replace(/ [${MARK.ok}${MARK.no}]$/, '')),
        marks: buttons.map((e) => e.textContent.slice(-1)),
        pressed: buttons.flatMap((e, i) => (e.getAttribute('aria-pressed') === 'true' ? [i] : [])),
        thumbs: document.querySelectorAll('.board-host button.board-thumb').length,
        caption: caption?.textContent ?? null,
        top: box.top,
        shape: box.width + 'x' + box.height + '/' + board.querySelectorAll('*').length,
        cases: document.querySelectorAll('.board-host .case-row').length,
      };
    })()`);

  /** The outcome card's examiner parts and its table of calls (null when there is none): booleans and the calls' text only. */
  const examinerCard = () =>
    b.evaluate(`(() => {
      const table = document.querySelector('.outcome-host table.calls');
      const rows = table ? [...table.querySelectorAll('tr')] : [];
      return {
        line: !!document.querySelector('.outcome-host p.examiner-line'),
        mark: document.querySelector('.outcome-host p.examiner-line .examiner-mark')?.textContent ?? null,
        text: document.querySelector('.outcome-host .outcome').innerText.replace(/\\s+/g, ' '),
        table: table && {
          head: rows[0].children.length,
          rows: rows.slice(1).map((tr) => {
            const [call, wanted, got, mark] = [...tr.children];
            return {
              call: call.textContent.trim(),
              wanted: wanted.textContent.trim() !== '',
              none: got.textContent.trim() === 'None',
              same: got.textContent.trim() === wanted.textContent.trim(),
              mark: mark.textContent.trim(),
              markClass: mark.classList.contains('ok') ? 'ok' : mark.classList.contains('no') || mark.querySelector('.no') ? 'no' : '',
              picked: tr.classList.contains('picked'),
            };
          }),
        },
      };
    })()`);

  /** The made-up function: the call list's function name, a catch-all signature, a body that does nothing. */
  async function stub() {
    const call = await b.evaluate(`document.querySelector('ol.call-list code.call-code').textContent`);
    return `def ${call.split("(")[0].trim()}(*args, **kwargs):\n    pass`;
  }
  /** Open the level, type the made-up function and run it (jumping to the last frame unless `jump` is false). */
  async function stubRun(id, { jump = true } = {}) {
    await openLevel(id, { fresh: true });
    await setCode(await stub());
    return run({ jump });
  }
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
    return `${seen.calls.length} calls, ${seen.thumbs} small boards`;
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
    return `${view.calls.length} calls, all ✗`;
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
    const atStart = async () => {
      await press(0);
      await b.waitFor(`/Step 0 /.test(document.querySelector('.step-label').textContent)`, 5000, "back at step 0");
      await sleep(300);
    };
    /** Whether the caption is there and holds nothing but non-breaking spaces. */
    const empty = () =>
      b.evaluate(`(() => { const t = document.querySelector('.board-host p.boards-caption')?.textContent ?? ''; return t.length > 0 && [...t].every((c) => c === '\\u00a0'); })()`);
    await atStart();
    const start = await examinerView();
    expect(await empty(), `at the first frame the caption holds ${JSON.stringify(start.caption)}`);
    await press(4);
    await b.waitFor(`document.querySelector('.board-host p.boards-caption')?.textContent.startsWith('The examiner calls ')`, 8000, "the caption filled at the last frame");
    await sleep(300);
    const end = await examinerView();
    const said = end.caption.slice("The examiner calls ".length).replace(/\.$/, "");
    expect(said === end.calls[end.pressed[0]], `the caption names ${said}, the pressed button is ${end.calls[end.pressed[0]]}`);
    expect(Math.abs(end.top - start.top) < 1, `the board's top is ${start.top}px with the caption empty and ${end.top}px filled`);
    await atStart();
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

  await check("M5.2: a program that makes the examiner's call itself is refused before the run, naming the line", async () => {
    await openLevel(BOARD_ONLY, { fresh: true });
    const before = await examinerView();
    const own = await stub();
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
}
