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

  await check("settings are reset after the checks", async () => {
    await b.evaluate(`localStorage.clear()`);
  });
}
