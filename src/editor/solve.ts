// The solvability check (M4.3): "can this level be solved?" The engine's search (engine/rankfile/search.py) tries the
// plain calls (moving, turning, waiting, capturing, bridging, saying a phrase) on each board, in short slices, so no
// request nears the worker's 3 s watchdog and painting stays live between them. Not asking again cancels it. What comes
// back is counts and words, never the route; this file runs the slices and puts the answers into words.
import type { PyClient } from "../py/client";
import type { SolveProgress } from "../py/protocol";
import { capitalise } from "./draft";

const SLICE_SECONDS = 0.15;

export interface SolveHandlers {
  progress(progress: SolveProgress): void; // a slice ended and there is more to do
  done(progress: SolveProgress): void;
  failed(message: string): void;
}

export interface SolveRun {
  cancel(): void;
}

/** Start checking `level` (a level file's data). Results arrive through `on` until it is cancelled. */
export function startSolve(client: Pick<PyClient, "ready" | "call">, level: unknown, on: SolveHandlers): SolveRun {
  let cancelled = false;
  void (async () => {
    try {
      await client.ready();
      const started = await client.call("solveStart", { level });
      if (cancelled) return;
      if (!started.ok) return on.failed(started.error);
      while (!cancelled) {
        const progress = await client.call("solveStep", { seconds: SLICE_SECONDS });
        if (cancelled) return;
        if (progress.done) return on.done(progress);
        on.progress(progress);
        await new Promise((resolve) => setTimeout(resolve, 0)); // let the page, and any request waiting its turn, in
      }
    } catch (error) {
      if (!cancelled) on.failed(error instanceof Error ? error.message : String(error));
    }
  })();
  return {
    cancel: () => {
      cancelled = true;
    },
  };
}

// -- the answers in words ------------------------------------------------------------------------------------------

export type Mark = "ok" | "none" | "gave" | "skip";

/** One line for each board (or place the goal could be) the check has finished. */
export function solveLines(progress: SolveProgress): Array<{ mark: Mark; text: string }> {
  const several = progress.cases > 1;
  return progress.results.map((result) => {
    const where = several ? `${capitalise(result.where)}: ` : "";
    const positions = result.positions.toLocaleString("en-US");
    switch (result.status) {
      case "route":
        return { mark: "ok", text: several ? `${where}a route exists, ${result.lines} ${result.lines === 1 ? "line" : "lines"} of plain calls.` : `A route exists: plain calls do it in ${result.lines} ${result.lines === 1 ? "line" : "lines"}. A loop might do it in fewer.` };
      case "no_route":
        return { mark: "none", text: `${where}${several ? "no route found" : "No route found"}. Every move, turn, wait, capture and plank was tried.` };
      case "gave_up":
        return { mark: "gave", text: `${where}${several ? "gave up" : "Gave up"} after ${positions} positions. It might be solvable; try fewer gems or enemies.` };
      default:
        return { mark: "skip", text: `${where}${several ? "can't judge" : "Can't judge"}: some obstacles tick with your code's lines, which depends on how it is written.` };
    }
  });
}

/** What a route on each board does and doesn't show, when there are several. */
export function solveFootnote(progress: SolveProgress): string | null {
  if (progress.cases < 2) return null;
  const what = progress.unit === "board" ? "board" : "place the goal could be";
  return `Each ${what} is checked on its own. A route on each doesn't show one program can solve them all: your own solution, from test-play, does.`;
}

/** "Searching board 2 of 3 · 45,000 positions so far". */
export function solveStatus(progress: SolveProgress | null): string {
  if (!progress) return "Starting the search…";
  const which = progress.cases > 1 ? ` ${progress.unit} ${progress.case} of ${progress.cases}` : "";
  return `Searching${which} · ${progress.positions.toLocaleString("en-US")} positions so far`;
}
