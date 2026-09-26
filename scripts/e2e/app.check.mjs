// End-to-end checks for the game itself: levels, playback, errors, lessons, REPL.
// Solutions are read from solutions/ and typed into the editor; this file never
// contains solution code, and nothing here prints it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sleep } from "./cdp.mjs";
import { expect } from "./suite.mjs";

const LEVELS = ["ch01-l01", "ch01-l02", "ch01-l03", "ch01-l04", "ch01-l05"];
const BUTTONS = ".playback-buttons button"; // back to start, step back, play, step forward, jump to end

export default async function appChecks({ browser: b, base, root, check }) {
  const solution = (id, suffix = "") => readFileSync(join(root, "solutions", "ch01", `${id}${suffix}.py`), "utf8");
  const withoutExpectLine = (code) => code.split("\n").slice(1).join("\n");

  async function openLevel(id) {
    await b.send("Page.navigate", { url: `${base}#/level/${id}` });
    await b.waitFor(
      `document.querySelector('.level[data-level-id="${id}"] .board .piece') && !document.querySelector('.level-right .btn-primary').disabled`,
      60_000,
      `level ${id} ready`,
    );
  }

  async function setCode(code, selector = ".level-right .cm-content") {
    await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await b.key("a", { code: "KeyA", modifiers: 2 }); // Ctrl+A
    await b.send("Input.insertText", { text: code });
  }

  const button = (index) => `document.querySelectorAll('${BUTTONS}')[${index}]`;

  /** Press Run, optionally jump to the end, and describe the outcome. */
  async function run({ jump = true } = {}) {
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`!document.querySelector('.outcome-host').textContent.includes('Running')`, 20_000, "run finished");
    if (jump) await b.evaluate(`(() => { const e = ${button(4)}; if (!e.disabled) e.click(); })()`);
    await b.waitFor(`document.querySelector('.outcome-host .outcome')`, 30_000, "outcome card");
    return b.evaluate(`({
      head: document.querySelector('.outcome-head strong').textContent,
      text: document.querySelector('.outcome-host .outcome').innerText.replace(/\\s+/g, ' '),
      errorLine: !!document.querySelector('.level-right .cm-error-line'),
      warnMarks: document.querySelectorAll('.level-right .cm-lint-marker-warning').length,
      step: document.querySelector('.step-label').textContent,
      vars: [...document.querySelectorAll('.inspector tr')].map((r) => r.innerText.replace(/\\s+/g, ' ')),
      console: document.querySelector('.console').innerText,
      next: document.querySelector('.outcome-host a')?.textContent ?? null,
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
      return `${brief(r)} | next: ${r.next}`;
    });
  }

  await check("step controls: rewind to the start, then step forward twice", async () => {
    // continues from the solved level 5 above
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

  await check("level select marks solved levels", async () => {
    await b.send("Page.navigate", { url: `${base}#/` });
    const solved = await b.waitFor(`document.querySelectorAll('.level-card.solved').length`, 5000, "level cards");
    expect(solved === LEVELS.length, `${solved} solved`);
    return `${solved} solved`;
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
    await b.evaluate(`[...document.querySelectorAll('.tab')][1].click()`);
    const text = await b.evaluate(`document.querySelector('.tab-panel:not([hidden])').innerText.replace(/\\s+/g, ' ')`);
    expect(text.includes("Reach the goal on b8") && text.includes("At most 2 lines"), text.slice(0, 160));
    return text.slice(0, 120);
  });

  await check("a snippet meant to fail explains itself (level 2)", async () => {
    await openLevel("ch01-l02");
    await b.evaluate(`document.querySelectorAll('.snippet .btn')[1].click()`);
    await b.waitFor(`document.querySelectorAll('.snippet-status')[1].textContent.includes('stopped')`, 20_000, "error snippet");
    const text = await b.evaluate(`document.querySelectorAll('.snippet')[1].innerText.replace(/\\s+/g, ' ')`);
    expect(text.includes("quote marks"), text.slice(0, 120));
  });

  await check("scratch REPL remembers variables and explains errors", async () => {
    await openLevel("ch01-l01");
    await b.evaluate(`document.querySelector('.repl-drawer').open = true`);
    for (const line of ["gold = 20", "gold * 2", "glod"]) {
      await b.evaluate(`document.querySelector('.repl-input').focus()`);
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
