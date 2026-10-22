// Opening a shared level (M4.3 step 5d, docs/M4/M4.3.md sections 5 and 6): what a link or a kept level becomes on the
// real level screen, and the plain page for one that can't be opened. A shared level is data from a stranger:
// every word of it reaches the page through `h()` as a text node, it has no lesson Markdown, and the author's solution
// is only ever offered as text for the comparison's read-only editor. Nothing here, or anywhere, runs it.
import type { LevelSource } from "../content";
import type { Requests } from "../py/protocol";
import { decodeLevel, ShareError } from "../share/codec";
import { authorSolution as authorSolutionOf, type SolutionSource } from "./compare";
import { h } from "./dom";

type LevelCheck = Requests["loadLevel"]["result"];

/** A shared level as the level screen opens it: in no chapter, with no lesson, under its `shared-…` id. */
export function sharedSource(data: Record<string, unknown>): LevelSource {
  return {
    id: String(data.id),
    chapter: 0,
    title: typeof data.title === "string" ? data.title : "Untitled",
    trains: typeof data.trains === "string" ? data.trains : "",
    mastery: false,
    lesson: "",
    data,
  };
}

/**
 * The author's solution, offered after three failed runs and shown as text only, or null when the level has none.
 * Its source belongs to the `shared-…` level, so it can never reach the curriculum's `loadSolution` by id.
 */
export function authorSolution(data: Record<string, unknown>): SolutionSource | null {
  const code = data.solution;
  return typeof code === "string" && code.trim() ? authorSolutionOf(() => code) : null;
}

export type SharedOpening = { ok: true; data: Record<string, unknown> } | { ok: false; reason: string };

/**
 * A share code, opened: decoded, judged by the engine (`check` is its `loadLevel`), and only then kept (`keep`). A
 * level that can't be read or that the engine refuses is not kept; the reason is for the player.
 */
export async function openShared(
  code: string,
  deps: { check: (data: Record<string, unknown>) => Promise<LevelCheck>; keep: (data: Record<string, unknown>) => void },
): Promise<SharedOpening> {
  let data: Record<string, unknown>;
  try {
    data = await decodeLevel(code);
  } catch (error) {
    return { ok: false, reason: error instanceof ShareError ? error.message : "This browser couldn't read the level code." };
  }
  let checked: LevelCheck;
  try {
    checked = await deps.check(data);
  } catch (error) {
    return { ok: false, reason: `The level couldn't be checked: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!checked.ok) return { ok: false, reason: checked.error };
  deps.keep(data);
  return { ok: true, data };
}

/** The plain page for a level that can't be opened: why, and the way back. */
export function sharedProblem(reason: string): HTMLElement {
  return h(
    "div",
    { class: "editor-missing" },
    h("h1", {}, "This level can't be opened"),
    h("p", {}, reason),
    h("a", { class: "btn", href: "#/editor" }, "← My levels"),
  );
}

/** Above a shared level's screen: whose it is, and a way to make a copy of your own to change. */
export function sharedBanner(remix: () => void): HTMLElement {
  return h(
    "div",
    { class: "panel shared-banner" },
    h("strong", {}, "Shared level"),
    h("span", { class: "muted" }, "Made by someone else. Your stars and hints are kept here, apart from the lessons."),
    h("button", { class: "btn btn-small", onClick: remix }, "Open in the editor"),
  );
}

/** The banner above the level screen, in a column that gives the screen the height that is left. */
export function sharedFrame(banner: HTMLElement, screen: HTMLElement): HTMLElement {
  return h("div", { class: "shared-frame" }, banner, screen);
}
