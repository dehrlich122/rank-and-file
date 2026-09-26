// Helpers shared by the check suites.
//
// NEVER put editor contents into a check's message or return value: earlier
// checks type reference solutions, and the app saves each level's code.
// Use `openLevel(id, { fresh: true })` to start from a newly loaded page with
// no saved progress, or `{ reload: true }` for a reload that keeps it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const BUTTONS = ".playback-buttons button"; // back to start, step back, play, step forward, jump to end

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
  };
}
