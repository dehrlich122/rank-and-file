// Free Play's Sandbox (M4.4): an open 8x8 board to try code on, with every ability the player has met. No goal, no
// stars. It is one lesson-style snippet (its editor, Run, board and console), made larger; the code is kept in the
// browser as it is typed, so it is there next time.
import { chapters, codexChapters } from "../content";
import type { PyClient } from "../py/client";
import type { CodexChapter } from "../py/protocol";
import { progress, type ProgressStore } from "../progress";
import { browserStorage, readJson, writeJson } from "../storage";
import type { CodexLookup } from "./codex";
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

/** The Codex's chapters for the Sandbox: the curriculum levels solved so far, then the Sandbox itself, which has every ability. */
function sandboxCodexChapters(abilities: string[], store: ProgressStore): CodexChapter[] {
  const solved = codexChapters()
    .filter((chapter) => chapter.curriculum)
    .map((chapter) => ({ ...chapter, levels: chapter.levels.filter((level) => store.solved(level.id)) }));
  const own = { id: "sandbox", data: { id: "sandbox", title: "Sandbox", map: "G\nP", api: abilities }, lesson: "" };
  return [...solved, { curriculum: false, levels: [own] }];
}

/** The line naming the abilities the Sandbox has. */
export function abilitiesLine(names: string[]): HTMLElement {
  return h("p", { class: "muted small sandbox-abilities" }, "You can use: ", ...names.flatMap((name, i) => [i ? " · " : null, h("code", {}, name)]));
}

/** Run waits for the board: it is on once nothing in the board's place is still the "loading" note. */
export function boardIsLoaded(host: { querySelector(selector: string): unknown }): boolean {
  return !host.querySelector(".board-loading");
}

/** Mount the Sandbox in `main`. Returns what to call to leave it. */
export function mountSandbox(main: HTMLElement, client: PyClient, store: ProgressStore = progress): () => void {
  const storage = browserStorage();
  const saved = readJson(storage, STORAGE_KEY);
  const abilities = sandboxAbilities(store);
  let lookup: CodexLookup | null = null; // hover tooltips, once the engine has sent the Codex
  let disposed = false;
  const snippet = renderSnippet(
    typeof saved === "string" && saved.trim() ? saved : STARTER,
    { client, api: abilities, board: BOARD, codex: () => lookup },
    { compact: false, onChange: (code) => writeJson(storage, STORAGE_KEY, code) },
  );
  main.replaceChildren(
    h(
      "div",
      { class: "free-play sandbox" },
      h("h1", { class: "lessons-title" }, "Sandbox"),
      h("p", {}, "Every ability you've met, on an open board. No goal, no stars: try things."),
      abilitiesLine(abilities),
      snippet.element,
    ),
  );

  // Until Python is up the board is empty: say so, and keep Run off so a click isn't silently queued
  const boardHost = snippet.element.querySelector<HTMLElement>(".snippet-board");
  const runButton = snippet.element.querySelector<HTMLButtonElement>(".snippet-bar .btn-primary");
  const note = h("p", { class: "muted board-loading" }, "Loading the board…");
  let observer: MutationObserver | null = null;
  if (boardHost && runButton) {
    boardHost.replaceChildren(note);
    runButton.disabled = true;
    observer = new MutationObserver(() => {
      if (boardIsLoaded(boardHost)) {
        runButton.disabled = false;
        observer?.disconnect();
      }
    });
    observer.observe(boardHost, { childList: true });
  }

  client.ready().then(
    async () => {
      try {
        const entries = await client.call("codex", { levelId: "sandbox", chapters: sandboxCodexChapters(abilities, store) });
        if (!disposed) lookup = { piece: "pawn", entries: new Map(entries.map((entry) => [entry.name, entry])) };
      } catch {
        // no tooltips: the Sandbox still works
      }
    },
    () => {
      if (disposed || !boardHost || !runButton) return;
      observer?.disconnect();
      note.textContent = "The board couldn't load.";
      runButton.disabled = false;
    },
  );

  return () => {
    disposed = true;
    observer?.disconnect();
    snippet.dispose();
  };
}
