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
  const { openLevel, setCode, run, brief } = levelHelpers(b, base, root);

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
}
