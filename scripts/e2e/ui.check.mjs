// End-to-end checks for UI behaviour around the game: the settings menu,
// playback controls and autocomplete. Never put editor contents into a check's
// message (see helpers.mjs).
import { sleep } from "./cdp.mjs";
import { BUTTONS, levelHelpers } from "./helpers.mjs";
import { expect } from "./suite.mjs";

export default async function uiChecks({ browser: b, base, root, check }) {
  const { solution, openLevel, setCode, clickButton } = levelHelpers(b, base, root);
  const dialogOpen = () => b.evaluate(`document.querySelector('.settings-dialog').open`);
  const choose = (key, value) => b.evaluate(`document.querySelector('input[name="setting-${key}"][value="${value}"]').click()`);
  const closeDialog = () => b.evaluate(`document.querySelector('.settings-dialog').close()`);

  // -- QA-006: settings menu -----------------------------------------------------------------
  await check("QA-006: the Settings button is on every screen", async () => {
    const seen = [];
    for (const hash of ["#/", "#/level/ch01-l01", "#/harness"]) {
      await b.send("Page.navigate", { url: `${base}?fresh=${Date.now()}${hash}` });
      await b.waitFor(`document.querySelector('.topbar .settings-button')`, 30_000, `settings button on ${hash}`);
      seen.push(hash);
    }
    return seen.join(" ");
  });

  await check("QA-006: Esc opens settings from the board and closes it again, returning focus", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await b.evaluate(`localStorage.clear()`);
    await b.evaluate(`document.querySelector('.level-middle .btn-icon:not([disabled])')?.focus() ?? document.querySelector('.scrubber').focus()`);
    const before = await b.evaluate(`document.activeElement?.className ?? ''`);
    await b.key("Escape");
    expect(await dialogOpen(), "Esc didn't open settings");
    await b.key("Escape");
    await sleep(50);
    const after = await b.evaluate(`document.activeElement?.className ?? ''`);
    expect(!(await dialogOpen()), "Esc didn't close settings");
    expect(before === after, `focus went to "${after}" instead of back to "${before}"`);
  });

  await check("QA-006: Esc opens settings from inside the code editor", async () => {
    await b.evaluate(`document.querySelector('.level-right .cm-content').focus()`);
    await b.key("Escape");
    expect(await dialogOpen(), "Esc in the editor didn't open settings");
    await closeDialog();
  });

  await check("QA-006: with the editor's search panel open, Esc only closes the search", async () => {
    await b.evaluate(`document.querySelector('.level-right .cm-content').focus()`);
    await b.key("f", { code: "KeyF", modifiers: 2 }); // Ctrl+F
    await b.waitFor(`document.querySelector('.level-right .cm-search')`, 3000, "search panel");
    await b.key("Escape");
    await sleep(50);
    const searchOpen = await b.evaluate(`!!document.querySelector('.level-right .cm-search')`);
    expect(!searchOpen && !(await dialogOpen()), `search open: ${searchOpen}, settings open: ${await dialogOpen()}`);
  });

  await check("QA-006: opening settings pauses playback", async () => {
    await setCode(solution("ch01-l01"));
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`document.querySelectorAll('${BUTTONS}')[2].title === 'Pause'`, 10_000, "playing");
    await b.evaluate(`document.body.focus()`);
    await b.key("Escape");
    await sleep(100);
    const title = await b.evaluate(`document.querySelectorAll('${BUTTONS}')[2].title`);
    await closeDialog();
    expect(title !== "Pause", `still playing (${title})`);
  });

  await check("QA-001 + QA-006: speed syncs both ways and carries over to other levels and reloads", async () => {
    await openLevel("ch01-l01");
    await b.evaluate(`(() => { const s = document.querySelector('.speed'); s.value = '2'; s.dispatchEvent(new Event('change')); })()`);
    const inMenu = await b.evaluate(`document.querySelector('input[name="setting-speed"]:checked').value`);
    await choose("speed", "4");
    const dropdown = await b.evaluate(`document.querySelector('.speed').value`);
    await openLevel("ch01-l02");
    const nextLevel = await b.evaluate(`document.querySelector('.speed').value`);
    await openLevel("ch01-l03", { fresh: true });
    const afterReload = await b.evaluate(`document.querySelector('.speed').value`);
    expect(inMenu === "2" && dropdown === "4" && nextLevel === "4" && afterReload === "4", JSON.stringify({ inMenu, dropdown, nextLevel, afterReload }));
    return `menu ${inMenu} · dropdown ${dropdown} · next level ${nextLevel} · after reload ${afterReload}`;
  });

  await check("QA-006: theme can be forced dark or light, and set back to the system", async () => {
    const background = () => b.evaluate(`getComputedStyle(document.body).backgroundColor`);
    await choose("theme", "dark");
    const dark = await background();
    await choose("theme", "light");
    const light = await background();
    await choose("theme", "system");
    const attribute = await b.evaluate(`document.documentElement.dataset.theme ?? 'none'`);
    expect(dark === "rgb(28, 26, 24)" && light === "rgb(244, 241, 234)" && attribute === "none", `${dark} / ${light} / ${attribute}`);
    return `dark ${dark} · light ${light}`;
  });

  await check("QA-006: code text size and reduced animations apply straight away", async () => {
    await choose("codeSize", "large");
    const size = await b.evaluate(`getComputedStyle(document.querySelector('.level-right .cm-editor')).fontSize`);
    await choose("motion", "reduced");
    const transition = await b.evaluate(`getComputedStyle(document.querySelector('.level-middle .piece')).transitionProperty`);
    await choose("motion", "system");
    await choose("codeSize", "medium");
    expect(size === "17px" && transition === "none", `font ${size} · piece transition ${transition}`);
    return `font ${size} · piece transition ${transition}`;
  });

  // -- M2: Reset progress --------------------------------------------------------------------
  await check("M2: Reset progress asks inside Settings first; Cancel keeps your code, Yes clears it", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await setCode("# my notes"); // our own text, not a solution
    const hasNotes = () => b.evaluate(`document.querySelector('.level-right .cm-content').innerText.includes('my notes')`);
    await b.evaluate(`document.querySelector('.settings-button').click()`);
    await clickButton("Reset progress…", ".reset-progress");
    const asked = await b.evaluate(`!!document.querySelector('.reset-progress .confirm-step')`);
    await clickButton("Cancel", ".reset-progress");
    const keptAfterCancel = await hasNotes();
    await clickButton("Reset progress…", ".reset-progress");
    await clickButton("Yes, reset", ".reset-progress");
    await b.waitFor(`!document.querySelector('.level-right .cm-content').innerText.includes('my notes')`, 5000, "the code cleared by Reset progress");
    const note = await b.evaluate(`document.querySelector('.reset-progress').innerText.includes('Progress reset.')`);
    await closeDialog();
    await openLevel("ch01-l01", { reload: true });
    const afterReload = await hasNotes();
    expect(asked, "Reset progress didn't ask first");
    expect(keptAfterCancel, "Cancel cleared the code");
    expect(note && !afterReload, `confirmation shown: ${note}; code back after a reload: ${afterReload}`);
  });

  // -- QA-009: code panel on the right, bottom or left ----------------------------------------
  const rects = () =>
    b.evaluate(`(() => {
      const r = (s) => { const e = document.querySelector(s).getBoundingClientRect(); return { left: Math.round(e.left), right: Math.round(e.right), top: Math.round(e.top), bottom: Math.round(e.bottom) }; };
      return { learn: r('.level-left'), board: r('.level-middle'), code: r('.level-right'), scratch: r('.repl-drawer') };
    })()`);

  await check("QA-009: Settings has a Code panel option, Right by default", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await b.evaluate(`localStorage.clear()`);
    await openLevel("ch01-l01", { fresh: true });
    const checked = await b.evaluate(`document.querySelector('input[name="setting-codePanel"]:checked')?.value`);
    const r = await rects();
    expect(checked === "right" && r.learn.right < r.board.left && r.board.right < r.code.left, `${checked} ${JSON.stringify(r)}`);
  });

  await check("QA-009: Bottom puts the whole code column under the Learn panel and the board", async () => {
    await choose("codePanel", "bottom");
    const r = await rects();
    expect(r.learn.right < r.board.left, "Learn/Challenge should stay on the left");
    expect(r.code.top > r.board.bottom && r.code.top > r.learn.bottom, "the code should be underneath");
    const viewportRight = await b.evaluate(`document.documentElement.clientWidth`);
    expect(Math.abs(r.code.left - r.learn.left) < 2 && viewportRight - r.code.right < 16, `full width? ${JSON.stringify(r)}`);
    const inside = await b.evaluate(`['.level-right .toolbar', '.level-right .editor', '.subpanel-vars', '.subpanel-console'].every((s) => document.querySelector('.level-right').contains(document.querySelector(s)))`);
    expect(inside, "Run/Stop, editor, Variables and Console should all be in the code column");
  });

  await check("QA-009: Left gives code | board | Learn, with Scratch Python moving with Learn", async () => {
    await choose("codePanel", "left");
    const r = await rects();
    expect(r.code.right < r.board.left && r.board.right < r.learn.left, JSON.stringify(r));
    expect(r.scratch.left >= r.learn.left && r.scratch.right <= r.learn.right, "Scratch Python should sit in the Learn panel");
  });

  await check("QA-009: switching layouts keeps the code, its undo history and the playback position", async () => {
    await openLevel("ch01-l02", { fresh: true });
    await setCode("pawn.move()");
    await sleep(700); // CodeMirror merges edits made within 500 ms into one undo step
    await b.send("Input.insertText", { text: "\npawn.move()" });
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`document.querySelector('.outcome-host .outcome')`, 20_000, "run finished");
    await b.evaluate(`document.querySelectorAll('${BUTTONS}')[0].click()`);
    await b.evaluate(`document.querySelectorAll('${BUTTONS}')[3].click()`);
    const before = await b.evaluate(`({ label: document.querySelector('.step-label').textContent, code: document.querySelector('.level-right .cm-content').innerText })`);
    await choose("codePanel", "bottom");
    await choose("codePanel", "right");
    const after = await b.evaluate(`({ label: document.querySelector('.step-label').textContent, code: document.querySelector('.level-right .cm-content').innerText })`);
    await b.evaluate(`document.querySelector('.level-right .cm-content').focus()`);
    await b.key("z", { code: "KeyZ", modifiers: 2 }); // Ctrl+Z undoes the last typed line
    const undone = await b.evaluate(`document.querySelector('.level-right .cm-content').innerText.trim() === 'pawn.move()'`);
    expect(before.label === after.label && before.code === after.code, `step ${before.label} → ${after.label}; code kept: ${before.code === after.code}`);
    expect(undone, "undo history was lost");
    return after.label;
  });

  await check("QA-009: the choice carries over to the next level and survives a reload", async () => {
    await choose("codePanel", "left");
    await openLevel("ch01-l03");
    const next = await rects();
    await openLevel("ch01-l03", { fresh: true });
    const reloaded = await rects();
    expect(next.code.right < next.board.left && reloaded.code.right < reloaded.board.left, JSON.stringify({ next, reloaded }));
  });

  await check("QA-009: narrow windows keep today's layout (code underneath)", async () => {
    await b.send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 860, deviceScaleFactor: 1, mobile: false });
    await sleep(200);
    const r = await rects();
    await b.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false });
    await choose("codePanel", "right");
    expect(r.learn.right < r.board.left && r.code.top > r.board.bottom, JSON.stringify(r));
  });

  // -- QA-010: the Learn panel in steps -------------------------------------------------------
  const pager = () =>
    b.evaluate(`(() => {
      const steps = [...document.querySelectorAll('.lesson-step')];
      const [back, count, next] = document.querySelector('.lesson-pager').children;
      return {
        visible: steps.findIndex((s) => !s.hidden) + 1,
        total: steps.length,
        count: count.hidden ? '' : count.textContent,
        back: back.hidden ? 'hidden' : back.disabled ? 'disabled' : 'enabled',
        next: next.textContent,
        pagerShown: !document.querySelector('.lesson-pager').hidden,
        challenge: document.querySelectorAll('.tab')[1].classList.contains('active'),
      };
    })()`);
  const pagerNext = () => b.evaluate(`document.querySelector('.lesson-pager .btn-primary').click()`);
  const pagerBack = () => b.evaluate(`document.querySelector('.lesson-pager .btn').click()`);

  for (const panel of ["right", "bottom", "left"]) {
    await check(`QA-010: level 1's lesson pages through its steps (code panel: ${panel})`, async () => {
      await choose("codePanel", panel);
      await openLevel("ch01-l01", { fresh: true });
      const first = await pager();
      await pagerNext();
      const second = await pager();
      await pagerBack();
      const back = await pager();
      await pagerNext();
      await pagerNext(); // "Start the challenge →" on the last step
      const done = await pager();
      expect(first.visible === 1 && first.count === "Step 1 of 2" && first.back === "disabled" && first.next === "Next →", JSON.stringify(first));
      expect(second.visible === 2 && second.next === "Start the challenge →", JSON.stringify(second));
      expect(back.visible === 1, JSON.stringify(back));
      expect(done.challenge && !done.pagerShown, JSON.stringify(done));
      return `${first.count} → ${second.count}`;
    });
  }
  await choose("codePanel", "right");

  await check("QA-010: a snippet's code, board and output survive paging, and the Challenge tab keeps the step", async () => {
    await openLevel("ch01-l04", { fresh: true });
    await b.evaluate(`document.querySelector('.snippet .btn').click()`);
    await b.waitFor(`document.querySelector('.snippet-status').textContent.includes('Finished')`, 20_000, "snippet ran");
    await pagerNext();
    await pagerBack();
    const kept = await b.evaluate(`({
      output: document.querySelector('.snippet-output').textContent,
      board: !!document.querySelector('.lesson-step:not([hidden]) .snippet-board svg'),
      status: document.querySelector('.snippet-status').textContent,
    })`);
    await pagerNext();
    await b.evaluate(`document.querySelectorAll('.tab')[1].click()`);
    await b.evaluate(`document.querySelectorAll('.tab')[0].click()`);
    const afterTabs = await pager();
    expect(kept.output.includes("Hello, board!") && kept.board && kept.status.includes("Finished"), JSON.stringify(kept));
    expect(afterTabs.visible === 2 && afterTabs.pagerShown, JSON.stringify(afterTabs));
  });

  await check("QA-010: a one-snippet lesson shows no step count, just the way to the challenge", async () => {
    await openLevel("ch01-l05", { fresh: true });
    const state = await pager();
    expect(state.total === 1 && state.count === "" && state.back === "hidden" && state.next === "Start the challenge →", JSON.stringify(state));
  });

  // -- QA-012: bottom layout -----------------------------------------------------------------------
  const boardBox = () =>
    b.evaluate(`(() => { const r = document.querySelector('.level-middle .board').getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), centre: Math.round(r.left + r.width / 2) }; })()`);
  const where = (selector) =>
    b.evaluate(`document.querySelector('.level-right').contains(document.querySelector('${selector}')) ? 'code' : 'board'`);

  await check("QA-012: with the code at the bottom, playback and outcome sit beside the editor; the board is centred", async () => {
    await choose("codePanel", "bottom");
    await openLevel("ch01-l03", { fresh: true });
    await setCode("pawn.move()\npawn.turn_right()\npawn.move()");
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
    await b.waitFor(`document.querySelector('.outcome-host .outcome')`, 20_000, "outcome");
    const placed = { playback: await where(".playback"), outcome: await where(".outcome-host") };
    const middleOnly = await b.evaluate(`document.querySelector('.level-middle').children.length === 1`);
    const box = await boardBox();
    const centre = Math.round((await b.evaluate(`document.documentElement.clientWidth`)) / 2);
    expect(placed.playback === "code" && placed.outcome === "code" && middleOnly, JSON.stringify({ placed, middleOnly }));
    expect(Math.abs(box.centre - centre) <= 3, `board centre ${box.centre}, screen centre ${centre}`);
    return `board ${box.width}×${box.height}, centre ${box.centre}`;
  });

  await check("QA-012: switching layouts mid-run brings the playback position and outcome along", async () => {
    await b.evaluate(`document.querySelectorAll('${BUTTONS}')[1].click()`); // one step back from the end
    const before = await b.evaluate(`document.querySelector('.step-label').textContent`);
    await choose("codePanel", "right");
    const right = { playback: await where(".playback"), label: await b.evaluate(`document.querySelector('.step-label').textContent`) };
    await b.evaluate(`document.querySelectorAll('${BUTTONS}')[4].click()`);
    await choose("codePanel", "bottom");
    const outcome = await b.evaluate(`!!document.querySelector('.level-right .outcome-host .outcome')`);
    await choose("codePanel", "right");
    expect(right.playback === "board" && right.label === before, JSON.stringify({ before, right }));
    expect(outcome, "the outcome card should come along to the bottom layout");
  });

  // -- QA-013 (reworks QA-011): collapsing the Learn panel moves nothing else --------------------------
  const collapse = async () => {
    await b.evaluate(`document.querySelector('.panel-toggle').click()`);
    await sleep(400); // the panel's width animates
  };
  const expand = async () => {
    await b.evaluate(`document.querySelector('.expand-strip').click()`);
    await sleep(400);
  };
  const collapsedState = () =>
    b.evaluate(`({
      collapsed: document.querySelector('.level').classList.contains('learn-collapsed'),
      strip: getComputedStyle(document.querySelector('.expand-strip')).display !== 'none',
      tabsHidden: getComputedStyle(document.querySelector('.level-left .tabs')).display === 'none',
    })`);

  for (const panel of ["right", "bottom", "left"]) {
    await check(`QA-013: collapsing hides the lesson; the board and code don't move or resize (code panel: ${panel})`, async () => {
      await choose("codePanel", panel);
      await openLevel("ch01-l03", { fresh: true });
      await sleep(300);
      const before = { board: await boardBox(), code: (await rects()).code };
      await collapse();
      const state = await collapsedState();
      const after = { board: await boardBox(), code: (await rects()).code };
      const r = await rects();
      await expand();
      const centre = Math.round((await b.evaluate(`document.documentElement.clientWidth`)) / 2);
      expect(state.collapsed && state.strip && state.tabsHidden, JSON.stringify(state));
      expect(JSON.stringify(before) === JSON.stringify(after), `moved: ${JSON.stringify({ before, after })}`);
      // Centred on the screen at the bottom; beside a (wider, QA-014) code panel, centred in its column.
      const column = await b.evaluate(`(() => { const r = document.querySelector('.level-middle').getBoundingClientRect(); return Math.round(r.left + r.width / 2); })()`);
      const target = panel === "bottom" ? centre : column;
      expect(Math.abs(before.board.centre - target) <= 3, `board centre ${before.board.centre}, expected ${target}`);
      if (panel !== "bottom") {
        // (measured after expand(), so the Learn panel is back to its full width)
        const ratio = (r.code.right - r.code.left) / (await b.evaluate(`document.querySelector('.level-left').getBoundingClientRect().width`));
        expect(Math.abs(ratio - 1.25) < 0.03, `QA-014: code panel should be about 25% wider than the Learn column (ratio ${ratio.toFixed(2)})`);
      }
      const stripSide = panel === "left" ? r.learn.left > r.board.right : r.learn.right < r.board.left;
      expect(stripSide && r.learn.right - r.learn.left < 60, `strip at the wrong side or too wide: ${JSON.stringify(r.learn)}`);
      return `board ${before.board.width}×${before.board.height} at centre ${before.board.centre}, unchanged`;
    });
  }
  await choose("codePanel", "right");

  await check("QA-011: collapsed survives a layout change; the next level opens expanded", async () => {
    await openLevel("ch01-l02", { fresh: true });
    await collapse();
    await choose("codePanel", "bottom");
    const afterLayout = await collapsedState();
    await choose("codePanel", "right");
    await openLevel("ch01-l03");
    const nextLevel = await collapsedState();
    expect(afterLayout.collapsed && !nextLevel.collapsed, JSON.stringify({ afterLayout, nextLevel }));
  });

  await check("QA-011: collapse and expand keep the lesson step, snippet results and Scratch Python", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await b.evaluate(`document.querySelector('.repl-drawer').open = true`);
    await b.evaluate(`document.querySelector('.repl-editor .cm-content').focus()`);
    await b.send("Input.insertText", { text: "6 * 7" });
    await b.key("Enter");
    await sleep(300);
    await pagerNext();
    await b.evaluate(`document.querySelector('.lesson-step:not([hidden]) .snippet .btn').click()`);
    await b.waitFor(`document.querySelector('.lesson-step:not([hidden]) .snippet-status').textContent.includes('Finished')`, 20_000, "snippet ran");
    await collapse();
    await expand();
    const kept = await b.evaluate(`({
      step: document.querySelector('.lesson-pager .muted').textContent,
      snippet: document.querySelector('.lesson-step:not([hidden]) .snippet-status').textContent,
      repl: document.querySelector('.repl-log').innerText.includes('42'),
    })`);
    expect(kept.step === "Step 2 of 2" && kept.snippet.includes("Finished") && kept.repl, JSON.stringify(kept));
  });

  await check("QA-013: the panel's collapse animates, and is instant with reduced animations", async () => {
    const normal = await b.evaluate(`getComputedStyle(document.querySelector('.level-left')).transitionProperty`);
    await choose("motion", "reduced");
    const reduced = await b.evaluate(`getComputedStyle(document.querySelector('.level-left')).transitionProperty`);
    await choose("motion", "system");
    expect(normal.includes("width") && reduced === "none", `normal: ${normal} · reduced: ${reduced}`);
  });

  // -- QA-015: wrap long lines ------------------------------------------------------------
  // A long comment line then a short one; only layout facts come back, never the code.
  const longLines = `# ${"wrap ".repeat(60)}\n# two`;
  // CodeMirror lines the gutter up with the text in its next layout pass (an
  // animation frame after a change), so measure after two frames.
  const wrapState = (scope = ".level-right") =>
    b.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))).then(() => {
      const editor = document.querySelector('${scope} .cm-editor');
      const scroller = editor.querySelector('.cm-scroller');
      const lines = [...editor.querySelectorAll('.cm-line')];
      const number2 = [...editor.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].find((e) => e.textContent === '2');
      return {
        wrapping: editor.querySelector('.cm-content').classList.contains('cm-lineWrapping'),
        overflows: scroller.scrollWidth > scroller.clientWidth + 1,
        rows: Math.round(lines[0].getBoundingClientRect().height / parseFloat(getComputedStyle(lines[0]).lineHeight)),
        numberAligned: number2 ? Math.abs(number2.getBoundingClientRect().top - lines[1].getBoundingClientRect().top) < 2 : null,
        button: document.querySelector('.level-right .btn-toggle')?.getAttribute('aria-pressed'),
        menu: document.querySelector('input[name="setting-wrapLines"]:checked')?.value,
      };
    })`);

  await check("QA-015: long lines wrap by default; the Wrap button and Settings both say On", async () => {
    await b.evaluate(`localStorage.clear()`);
    await openLevel("ch01-l01", { fresh: true });
    await setCode(longLines);
    const s = await wrapState();
    expect(s.wrapping && !s.overflows && s.rows > 1 && s.numberAligned && s.button === "true" && s.menu === "true", JSON.stringify(s));
    return `first line on ${s.rows} rows, line 2's number beside line 2`;
  });

  await check("QA-015: a wrapped line's extra rows start past its indentation, so they never look dedented", async () => {
    await setCode(`    # ${"wrap ".repeat(60)}`);
    const r = await b.evaluate(`(() => {
      const line = document.querySelector('.level-right .cm-line');
      const range = document.createRange();
      range.selectNodeContents(line);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
      const top = Math.min(...rects.map((rect) => rect.top));
      const lineLeft = line.getBoundingClientRect().left;
      return {
        firstRow: Math.round(Math.min(...rects.filter((rect) => rect.top < top + 2).map((rect) => rect.left)) - lineLeft),
        text: Math.round(line.querySelector('span').getBoundingClientRect().left - lineLeft),
        laterRows: Math.round(Math.min(...rects.filter((rect) => rect.top >= top + 2).map((rect) => rect.left)) - lineLeft),
      };
    })()`);
    expect(r.firstRow === 6 && r.laterRows > r.text + 8, JSON.stringify(r));
    return `first row at ${r.firstRow}px, text at ${r.text}px, wrapped rows at ${r.laterRows}px`;
  });

  await check("QA-015: the Wrap button and the Settings menu switch the same setting, straight away", async () => {
    await setCode(longLines);
    await b.evaluate(`document.querySelector('.level-right .btn-toggle').click()`);
    const off = await wrapState();
    const lessonOff = await wrapState(".level-left");
    await choose("wrapLines", "true");
    const on = await wrapState();
    const lessonOn = await wrapState(".level-left");
    expect(!off.wrapping && off.overflows && off.rows === 1 && off.button === "false" && off.menu === "false", `off: ${JSON.stringify(off)}`);
    expect(on.wrapping && !on.overflows && on.rows > 1 && on.numberAligned && on.button === "true", `on: ${JSON.stringify(on)}`);
    expect(!lessonOff.wrapping && lessonOn.wrapping, "the lesson's example editor should follow the setting too");
  });

  await check("QA-015: the choice carries over to the next level and survives a reload", async () => {
    await choose("wrapLines", "false");
    await openLevel("ch01-l02");
    const nextLevel = await wrapState();
    await openLevel("ch01-l03", { fresh: true });
    const afterReload = await wrapState();
    await choose("wrapLines", "true");
    const off = (s) => !s.wrapping && s.button === "false" && s.menu === "false";
    expect(off(nextLevel) && off(afterReload), JSON.stringify({ nextLevel, afterReload }));
  });

  // -- QA-005: playback buttons -----------------------------------------------------------
  const buttons = () =>
    b.evaluate(`[...document.querySelectorAll('${BUTTONS}')].map((e) => ({ title: e.title, disabled: e.disabled, icon: !!e.querySelector('svg'), text: e.textContent.trim() }))`);
  const outcome = () => b.waitFor(`document.querySelector('.outcome-host .outcome')?.innerText.replace(/\\s+/g, ' ')`, 20_000, "outcome");
  const stepLabel = () => b.evaluate(`document.querySelector('.step-label').textContent`);

  await check("QA-005: five icon buttons in order, with the right hover text", async () => {
    await openLevel("ch01-l01", { fresh: true });
    const list = await buttons();
    const titles = list.map((button) => button.title);
    expect(
      JSON.stringify(titles) === JSON.stringify(["Back to the start", "Step back", "Play", "Step forward", "Jump to the outcome"]),
      titles.join(" | "),
    );
    expect(list.every((button) => button.icon && button.text === ""), "buttons should show SVG icons, not text glyphs");
    return titles.join(" | ");
  });

  await check("QA-005: on a fresh level, Play runs the code; the left arrows wait for a run", async () => {
    const before = await buttons();
    expect(before[0].disabled && before[1].disabled && !before[2].disabled && !before[3].disabled && !before[4].disabled, JSON.stringify(before));
    await setCode("pawn.move()");
    await b.evaluate(`document.querySelectorAll('${BUTTONS}')[2].click()`);
    const card = await outcome();
    expect(card.startsWith("Not there yet"), card);
  });

  await check("QA-005: single right runs the code and shows step 1", async () => {
    await openLevel("ch01-l02", { fresh: true });
    await setCode("pawn.move()\npawn.move()");
    await b.evaluate(`document.querySelectorAll('${BUTTONS}')[3].click()`);
    const label = await b.waitFor(`document.querySelector('.step-label').textContent`, 10_000, "step label");
    const highlighted = await b.evaluate(`!!document.querySelector('.level-right .cm-step-line')`);
    expect(label.startsWith("Step 1 of 2") && highlighted, `${label} / highlighted: ${highlighted}`);
    return label;
  });

  await check("QA-005: double right runs the code and lands on the error, with its line marked", async () => {
    await openLevel("ch01-l03", { fresh: true });
    await setCode("pawn.move()\npawn.turn_right()\npawn.move()");
    await b.evaluate(`document.querySelectorAll('${BUTTONS}')[4].click()`);
    const card = await outcome();
    const marked = await b.evaluate(`!!document.querySelector('.level-right .cm-error-line')`);
    const after = await buttons();
    expect(card.startsWith("Python stopped") && marked, `${card.slice(0, 80)} / marked: ${marked}`);
    expect(after[4].title === "Jump to the error" && after[4].disabled && !after[0].disabled, JSON.stringify(after.map((x) => [x.title, x.disabled])));
    await b.evaluate(`document.querySelectorAll('${BUTTONS}')[0].click()`);
    const label = await stepLabel();
    expect(label.startsWith("Step 0 of"), `double left: ${label}`);
    return card.slice(0, 80);
  });

  await check("QA-005: after an edit, the old recording is dropped and Play runs the new code", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await setCode("pawn.move()");
    await b.evaluate(`document.querySelector('.level-right .btn-primary').click()`); // the Run button still works
    const first = await outcome();
    await setCode("pawn.move(9)");
    const stale = await b.evaluate(`({
      note: !!document.querySelector('.outcome.stale .stale-note'),
      leftDisabled: document.querySelectorAll('${BUTTONS}')[0].disabled && document.querySelectorAll('${BUTTONS}')[1].disabled,
      label: document.querySelector('.step-label').textContent,
    })`);
    expect(stale.note && stale.leftDisabled && stale.label.includes("Code changed"), JSON.stringify(stale));
    await b.evaluate(`document.querySelectorAll('${BUTTONS}')[2].click()`);
    await b.waitFor(`!document.querySelector('.outcome.stale')`, 10_000, "fresh run");
    const second = await outcome();
    expect(first.startsWith("Not there yet") && second.includes("edge of the board"), `${first.slice(0, 40)} → ${second.slice(0, 60)}`);
  });

  await check("QA-005: Ctrl+Enter still runs", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await setCode("pawn.move()");
    await b.key("Enter", { modifiers: 2 });
    const card = await outcome();
    expect(card.startsWith("Not there yet"), card);
  });

  // -- QA-003: autocomplete for calls you've typed ---------------------------------------------
  const MAIN = ".level-right";
  const type = async (text) => {
    await b.send("Input.insertText", { text });
    await sleep(350); // the list opens shortly after typing
  };
  const suggestions = (scope = MAIN) =>
    b.evaluate(
      `[...document.querySelectorAll('${scope} .cm-tooltip-autocomplete li')].map((li) => li.querySelector('.cm-completionLabel')?.textContent ?? li.textContent)`,
    );
  const lastLine = (scope = MAIN) => b.evaluate(`[...document.querySelectorAll('${scope} .cm-line')].at(-1)?.textContent ?? ''`);
  const focusMain = () => b.evaluate(`document.querySelector('${MAIN} .cm-content').focus()`);

  await check("QA-003: a fresh level offers nothing (the standard Python suggestions are gone)", async () => {
    await openLevel("ch01-l03", { fresh: true });
    await focusMain();
    await type("pawn.");
    const afterDot = await suggestions();
    await type("\npr");
    const afterWord = await suggestions();
    expect(afterDot.length === 0 && afterWord.length === 0, JSON.stringify({ afterDot, afterWord }));
  });

  await check("QA-003: typed methods are offered after `pawn.`, and narrow as you type", async () => {
    await openLevel("ch01-l03", { fresh: true });
    await focusMain();
    await type("pawn.move()\npawn.turn_left()\npawn.");
    const both = await suggestions();
    await type("t");
    const narrowed = await suggestions();
    const hint = await b.evaluate(
      `getComputedStyle(document.querySelector('${MAIN} .cm-tooltip-autocomplete li[aria-selected] .cm-tab-hint')).display`,
    );
    expect(JSON.stringify(both) === JSON.stringify(["move()Tab", "turn_left()"]) || JSON.stringify(both) === JSON.stringify(["move()", "turn_left()"]), JSON.stringify(both));
    expect(narrowed.length === 1 && narrowed[0].startsWith("turn_left()"), JSON.stringify(narrowed));
    expect(hint !== "none", "the Tab label isn't shown on the highlighted row");
    return `${JSON.stringify(both)} → ${JSON.stringify(narrowed)}`;
  });

  await check("QA-003: Tab accepts with the cursor inside (); Enter always makes a new line", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await focusMain();
    await type("pawn.move()\npawn.m");
    await b.key("Tab");
    await type("2"); // lands between the parentheses
    const accepted = await lastLine();
    await b.key("End", { keyCode: 35 });
    await type("\npawn.");
    const listOpen = (await suggestions()).length > 0;
    await b.key("Enter");
    await sleep(100);
    const afterEnter = await b.evaluate(`[...document.querySelectorAll('${MAIN} .cm-line')].map((l) => l.textContent).slice(-2)`);
    expect(accepted === "pawn.move(2)", `after Tab + typing: ${accepted}`);
    // Enter kept "pawn." as typed (nothing accepted) and started a new, blank line
    // (which may carry Python's continuation indent).
    expect(listOpen && afterEnter[0] === "pawn." && afterEnter[1].trim() === "", `list open: ${listOpen}, last lines: ${JSON.stringify(afterEnter)}`);
  });

  await check("QA-003: Tab still indents when no list is open", async () => {
    const before = (await lastLine()).length;
    await b.key("Tab");
    const after = (await lastLine()).length;
    expect(after === before + 4, `indent went from ${before} to ${after} spaces`);
  });

  await check("QA-003: a misspelled call is never offered", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await focusMain();
    await type("pawn.mvoe()\nprnit('x')\npawn.");
    const method = await suggestions();
    await type("\npr");
    const plain = await suggestions();
    expect(method.length === 0 && plain.length === 0, JSON.stringify({ method, plain }));
  });

  await check("QA-003: plain calls — `p` offers print(), `pa` closes the list; nothing in comments or strings", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await focusMain();
    await type("print('hi')\np");
    const p = await suggestions();
    await type("a");
    const pa = await suggestions();
    await type("\n# p");
    const inComment = await suggestions();
    await type("\nprint('p");
    const inString = await suggestions();
    expect(p.length === 1 && p[0].startsWith("print()"), `p: ${JSON.stringify(p)}`);
    expect(pa.length === 0 && inComment.length === 0 && inString.length === 0, JSON.stringify({ pa, inComment, inString }));
  });

  await check("QA-003: lesson snippets never show suggestions", async () => {
    await openLevel("ch01-l01", { fresh: true });
    await b.evaluate(`document.querySelector('.snippet .cm-content').focus()`);
    await b.key("End", { keyCode: 35, modifiers: 2 });
    await type("\npawn.");
    const offered = await suggestions(".snippet");
    expect(offered.length === 0, JSON.stringify(offered));
  });

  await check("QA-003: scratch REPL offers only calls made in the session, and Reset clears them", async () => {
    await b.evaluate(`document.querySelector('.repl-drawer').open = true`);
    await b.evaluate(`document.querySelector('.repl-editor .cm-content').focus()`);
    await type("p");
    const before = await suggestions(".repl");
    await b.key("Escape"); // closes the list if one opened (it shouldn't have)
    await b.evaluate(`document.querySelector('.settings-dialog').open && document.querySelector('.settings-dialog').close()`);
    await b.evaluate(`document.querySelector('.repl-editor .cm-content').focus()`);
    await b.key("End", { keyCode: 35 });
    await type("rint(1)");
    await b.key("Enter");
    await sleep(300);
    await type("p");
    const after = await suggestions(".repl");
    await b.key("Escape");
    await b.evaluate(`[...document.querySelectorAll('.repl-actions button')][0].click()`);
    await sleep(300);
    await b.evaluate(`document.querySelector('.repl-editor .cm-content').focus()`);
    await type("p");
    const reset = await suggestions(".repl");
    const log = await b.evaluate(`document.querySelector('.repl-log').innerText`);
    expect(before.length === 0 && after.length === 1 && after[0].startsWith("print()") && reset.length === 0, JSON.stringify({ before, after, reset, log }));
  });

  await check("settings are reset after the checks", async () => {
    await b.evaluate(`localStorage.clear()`);
  });
}
