// Free Play's Sandbox (M4.4): an open 8x8 board to try code on, with every ability the player has met. No goal, no
// stars. It is one lesson-style snippet (its editor, Run, board and console), made larger; the code is kept in the
// browser as it is typed, so it is there next time.
import { chapters } from "../content";
import type { PyClient } from "../py/client";
import { progress, type ProgressStore } from "../progress";
import { browserStorage, readJson, writeJson } from "../storage";
import { h } from "./dom";
import { renderSnippet } from "./lesson";

const STORAGE_KEY = "rank-and-file:sandbox";
const STARTER = "# Try anything you have learned.\npawn.move()";

// An open 8x8 with the piece at the bottom-left square, facing north.
const BOARD = {
  map: [...Array(7).fill(". . . . . . . ."), "P . . . . . . ."].join("\n"),
  start: { facing: "north" },
};

/** The abilities of every curriculum level the player has solved, in play order, and always "move". */
export function sandboxAbilities(store: ProgressStore = progress): string[] {
  const found = new Set(["move"]);
  for (const chapter of chapters) {
    if (!chapter.curriculum) continue;
    for (const level of chapter.levels) {
      if (store.solved(level.id)) for (const name of (level.data.api as string[] | undefined) ?? []) found.add(name);
    }
  }
  return [...found];
}

/** Mount the Sandbox in `main`. Returns what to call to leave it. */
export function mountSandbox(main: HTMLElement, client: PyClient, store: ProgressStore = progress): () => void {
  const storage = browserStorage();
  const saved = readJson(storage, STORAGE_KEY);
  const abilities = sandboxAbilities(store);
  const snippet = renderSnippet(
    typeof saved === "string" && saved.trim() ? saved : STARTER,
    { client, api: abilities, board: BOARD, codex: () => null },
    { compact: false, onChange: (code) => writeJson(storage, STORAGE_KEY, code) },
  );
  main.replaceChildren(
    h(
      "div",
      { class: "free-play sandbox" },
      h("h1", { class: "free-title" }, "Sandbox"),
      h("p", {}, "Every ability you've met, on an open board. No goal, no stars: try things."),
      h("p", { class: "muted small" }, abilities.join(" · ")),
      snippet.element,
    ),
  );
  return () => snippet.dispose();
}
