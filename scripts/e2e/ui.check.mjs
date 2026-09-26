// End-to-end checks for UI behaviour around the game: the settings menu,
// playback controls and autocomplete. Never put editor contents into a check's
// message (see app.check.mjs).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sleep } from "./cdp.mjs";
import { expect } from "./suite.mjs";

const BUTTONS = ".playback-buttons button";

export default async function uiChecks({ browser: b, base, root, check }) {
  const solution = (id) => readFileSync(join(root, "solutions", "ch01", `${id}.py`), "utf8");

  async function openLevel(id, { fresh = false } = {}) {
    const url = fresh ? `${base}?fresh=${Date.now()}#/level/${id}` : `${base}#/level/${id}`;
    await b.send("Page.navigate", { url });
    await b.waitFor(
      `document.querySelector('.level[data-level-id="${id}"] .board .piece') && !document.querySelector('.level-right .btn-primary').disabled`,
      60_000,
      `level ${id} ready`,
    );
  }
  async function setCode(code) {
    await b.evaluate(`document.querySelector('.level-right .cm-content').focus()`);
    await b.key("a", { code: "KeyA", modifiers: 2 });
    await b.send("Input.insertText", { text: code });
  }
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

  await check("settings are reset after the checks", async () => {
    await b.evaluate(`localStorage.clear()`);
  });
}
