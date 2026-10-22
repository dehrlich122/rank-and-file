// The solvability check's box (M4.3), under the Problems list: a button, the search's progress with Cancel, and the
// answer in words (editor/solve.ts). It never shows a route. Every mark is a symbol as well as a colour.
import { solveFootnote, solveLines, solveStatus } from "../editor/solve";
import type { SolveProgress } from "../py/protocol";
import { h } from "./dom";

export type SolveState =
  | { kind: "idle"; note?: string }
  | { kind: "searching"; progress: SolveProgress | null }
  | { kind: "done"; revision: number; progress: SolveProgress } // the revision of the level it is about
  | { kind: "failed"; message: string };

export interface SolveContext {
  state: SolveState;
  revision: number; // the level as it is now
  canCheck: boolean; // the engine has accepted this very level
  whyNot: string; // what to say when it can't be checked yet
  start(): void;
  cancel(): void;
}

const MARKS = { ok: "✓", none: "✗", gave: "?", skip: "–" } as const;

export function renderSolve(ctx: SolveContext): HTMLElement {
  const { state } = ctx;
  const check = (label: string) => h("button", { class: "btn btn-small", disabled: !ctx.canCheck, title: ctx.canCheck ? "" : ctx.whyNot, onClick: ctx.start }, label);
  const parts: Array<HTMLElement | null> = [h("h3", { class: "pal-title" }, "Can it be solved?")];
  if (state.kind === "searching") {
    parts.push(
      h("p", { class: "small", role: "status" }, solveStatus(state.progress)),
      h("div", { class: "solve-bar", "aria-hidden": "true" }, h("span")),
      h("div", { class: "solve-actions" }, h("button", { class: "btn btn-small", onClick: ctx.cancel }, "Cancel")),
    );
  } else if (state.kind === "done") {
    const stale = state.revision !== ctx.revision;
    const lines = solveLines(state.progress);
    const footnote = solveFootnote(state.progress);
    parts.push(
      stale ? h("p", { class: "small stale-note" }, "This answer is for an older version of the level.") : null,
      h(
        "ul",
        { class: `solve-results${stale ? " stale" : ""}`, role: "status" },
        ...lines.map(({ mark, text }) => h("li", {}, h("span", { class: "solve-mark", "aria-hidden": "true" }, MARKS[mark]), h("span", {}, text))),
      ),
      footnote ? h("p", { class: "muted small" }, footnote) : null,
      h("div", { class: "solve-actions" }, check("Check again")),
    );
  } else {
    parts.push(
      state.kind === "failed" ? h("p", { class: "small", role: "status" }, `The check couldn't run: ${state.message}`) : null,
      state.kind === "idle" && state.note ? h("p", { class: "small", role: "status" }, state.note) : null,
      h("p", { class: "muted small" }, "Tries moves, turns, waits, captures and planks on each board. It can't read runes or loop, so it can't judge a program."),
      h("div", { class: "solve-actions" }, check(state.kind === "failed" ? "Try again" : "Check")),
    );
  }
  return h("section", { class: "solve-box", "aria-label": "Solvability" }, ...parts);
}
