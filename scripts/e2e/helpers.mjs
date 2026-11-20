// Helpers shared by the check suites.
//
// NEVER put editor contents into a check's message or return value: earlier
// checks type reference solutions, and the app saves each level's code.
// Use `openLevel(id, { fresh: true })` to start from a newly loaded page with
// no saved progress, or `{ reload: true }` for a reload that keeps it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sleep } from "./cdp.mjs";

export const BUTTONS = ".playback-buttons button"; // back to start, step back, play, step forward, jump to end
const playbackButton = (index) => `document.querySelectorAll('${BUTTONS}')[${index}]`;

export function levelHelpers(browser, base, root) {
  return {
    /** A solution file's text, read from disk (never written into a check). Levels live in solutions/<folder>/. */
    solution: (id, suffix = "") => {
      const file = `${id}${suffix}.py`;
      const folder = readdirSync(join(root, "solutions")).find((name) => existsSync(join(root, "solutions", name, file)));
      if (!folder) throw new Error(`no solution file ${file}`);
      return readFileSync(join(root, "solutions", folder, file), "utf8");
    },

    /** A wrong attempt's code without its `# expect: ...` first line. */
    withoutExpectLine: (code) => code.split("\n").slice(1).join("\n"),

    async openLevel(id, { fresh = false, reload = false } = {}) {
      const query = fresh ? `?fresh=${Date.now()}` : reload ? `?reload=${Date.now()}` : "";
      const url = `${base}${query}#/level/${id}`;
      await browser.send("Page.navigate", { url });
      await browser.waitFor(
        `document.querySelector('.level[data-level-id="${id}"] .board .piece') && !document.querySelector('.level-right .btn-primary').disabled`,
        60_000,
        `level ${id} ready`,
      );
    },

    /** Replace everything in an editor (the level's main editor by default) by typing. */
    async setCode(code, selector = ".level-right .cm-content") {
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      await browser.key("a", { code: "KeyA", modifiers: 2 }); // Ctrl+A
      await browser.send("Input.insertText", { text: code });
    },

    /** An editor's text inside `scope`, line by line. Compare it in Node; never report it. */
    editorText: (scope = ".level-right") =>
      browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${scope} .cm-line`)})].map((line) => line.textContent).join('\\n')`),

    ...buttonHelpers(browser),
    ...runHelpers(browser),

    /** Show the level's Challenge tab. */
    challengeTab: () => buttonHelpers(browser).clickButton("Challenge", ".tabs"),
    /** Show the level's Codex tab. */
    codexTab: () => buttonHelpers(browser).clickButton("Codex", ".tabs"),
  };
}

/** Hovering words in a CodeMirror editor, for the Codex tooltips. */
export function hoverHelpers(browser) {
  const hover = ({ x, y }) => browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  return {
    /** The centre of the first `word` in an editor's text (the editor's `.cm-content` selector), for hovering. */
    wordAt: (word, editor = ".level-right .cm-content") =>
      browser.evaluate(`(() => {
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
      })()`),
    hover,
    /** Move the mouse off the editor and let a tooltip close. */
    hoverAway: async () => {
      await hover({ x: 5, y: 5 });
      await sleep(400);
    },
  };
}

/** The settings key, for checks that change a setting and must put it back. */
export function settingsHelpers(browser) {
  const key = JSON.stringify("rank-and-file:settings");
  return {
    /**
     * Run `fn(kept)` and put the saved settings back afterwards, whatever it changed (a `?fresh=` load keeps them): the
     * saved string if there was one, no key at all if there was none. `kept` is that saved string, or null. Closes the
     * Settings dialog if `fn` left it open. Needs a loaded app page; returns what `fn` returns, and restores when it throws.
     */
    async keepingSettings(fn) {
      const kept = await browser.evaluate(`localStorage.getItem(${key})`);
      try {
        return await fn(kept);
      } finally {
        const put = kept === null ? `localStorage.removeItem(${key})` : `localStorage.setItem(${key}, ${JSON.stringify(kept)})`;
        await browser.evaluate(`document.querySelector('.settings-dialog')?.close(); ${put}; true`);
      }
    },
  };
}

/** Find buttons by their label, within a CSS `scope`. */
export function buttonHelpers(browser) {
  const find = (label, scope) =>
    `[...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find((e) => e.textContent === ${JSON.stringify(label)})`;
  return {
    /** Click the button labelled `label`. Fails if there isn't one. */
    clickButton: (label, scope = "body") =>
      browser.evaluate(`(() => {
        const button = ${find(label, scope)};
        if (!button) throw new Error(${JSON.stringify(`no "${label}" button in ${scope}`)});
        button.click();
      })()`),
    /** Whether there's a button labelled `label`. */
    hasButton: (label, scope = "body") => browser.evaluate(`!!${find(label, scope)}`),
  };
}

/** Pressing Run and reading the outcome card. */
function runHelpers(browser) {
  /** Once a recording is playing: optionally jump to its end, then describe the outcome card. */
  async function outcome({ jump = true } = {}) {
    if (jump) await browser.evaluate(`(() => { const e = ${playbackButton(4)}; if (!e.disabled) e.click(); })()`);
    await browser.waitFor(`document.querySelector('.outcome-host .outcome')`, 30_000, "outcome card");
    return browser.evaluate(`({
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
  return {
    outcome,
    /** The playback button `index` (see BUTTONS), as a JS expression for `evaluate`. */
    button: playbackButton,
    /** Click the playback button `index`. */
    press: (index) => browser.evaluate(`${playbackButton(index)}.click()`),
    /** Press Run, optionally jump to the end, and describe the outcome. */
    async run({ jump = true } = {}) {
      await browser.evaluate(`document.querySelector('.level-right .btn-primary').click()`);
      await browser.waitFor(`!document.querySelector('.outcome-host').textContent.includes('Running')`, 20_000, "run finished");
      return outcome({ jump });
    },
    /** A one-line description of an outcome, for a check's message. */
    brief: (r) => `${r.head}: ${r.text.slice(0, 110)}`,
  };
}
