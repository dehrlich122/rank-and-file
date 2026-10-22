import { describe, expect, it } from "vitest";
import type { SolveProgress } from "../py/protocol";
import { solveFootnote, solveLines, solveStatus, startSolve } from "./solve";

const progress = (changes: Partial<SolveProgress> = {}): SolveProgress => ({ done: false, case: 1, cases: 1, unit: "board", positions: 0, results: [], ...changes });
const result = (status: SolveProgress["results"][number]["status"], extra: Partial<SolveProgress["results"][number]> = {}) => ({ label: "board 1", where: "on board 1", status, lines: null, positions: 10, ...extra });

/** A client that answers solveStart, then each solveStep from the list, and remembers what it was asked. */
function fakeClient(steps: SolveProgress[], start: { ok: true; cases: number } | { ok: false; error: string } = { ok: true, cases: 1 }) {
  const asked: string[] = [];
  const client = {
    ready: () => Promise.resolve({ pythonVersion: "3", loadMs: 0 }),
    call: (kind: string) => {
      asked.push(kind);
      return Promise.resolve(kind === "solveStart" ? start : steps.shift());
    },
  };
  return { client: client as never, asked };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("startSolve", () => {
  it("starts the search, asks again after each slice until it is done, and reports each", async () => {
    const seen: string[] = [];
    const { client, asked } = fakeClient([progress({ positions: 5 }), progress({ positions: 9 }), progress({ done: true, results: [result("route", { lines: 3 })] })]);
    startSolve(client, { id: "x" }, { progress: (p) => seen.push(`p${p.positions}`), done: () => seen.push("done"), failed: (m) => seen.push(m) });
    await settle();
    expect(asked).toEqual(["solveStart", "solveStep", "solveStep", "solveStep"]);
    expect(seen).toEqual(["p5", "p9", "done"]);
  });

  it("stops asking once cancelled", async () => {
    const seen: string[] = [];
    const steps = Array.from({ length: 50 }, (_, i) => progress({ positions: i }));
    const { client, asked } = fakeClient(steps);
    const run = startSolve(client, {}, { progress: () => run.cancel(), done: () => seen.push("done"), failed: () => seen.push("failed") });
    await settle();
    expect(asked.filter((kind) => kind === "solveStep")).toHaveLength(1);
    expect(seen).toEqual([]);
  });

  it("says why when the engine refuses the level", async () => {
    const seen: string[] = [];
    const { client, asked } = fakeClient([], { ok: false, error: "no goal" });
    startSolve(client, {}, { progress: () => {}, done: () => {}, failed: (message) => seen.push(message) });
    await settle();
    expect(seen).toEqual(["no goal"]);
    expect(asked).toEqual(["solveStart"]);
  });

  it("reports a request that fails", async () => {
    const seen: string[] = [];
    const client = { ready: () => Promise.resolve({}), call: () => Promise.reject(new Error("Python stopped")) } as never;
    startSolve(client, {}, { progress: () => {}, done: () => {}, failed: (message) => seen.push(message) });
    await settle();
    expect(seen).toEqual(["Python stopped"]);
  });
});

describe("the answers in words", () => {
  it("say a route's lines, and that a loop might do better, for a level with one board", () => {
    const [line] = solveLines(progress({ done: true, results: [result("route", { lines: 6 })] }));
    expect(line).toEqual({ mark: "ok", text: "A route exists: plain calls do it in 6 lines. A loop might do it in fewer." });
    expect(solveLines(progress({ results: [result("route", { lines: 1 })] }))[0]!.text).toContain("in 1 line.");
  });

  it("name each board when there are several, and keep no route, gave up and can't judge apart", () => {
    const lines = solveLines(
      progress({
        done: true,
        cases: 4,
        results: [result("route", { lines: 8, label: "board 1", where: "on board 1" }), result("no_route", { label: "board 2", where: "on board 2" }), result("gave_up", { label: "board 3", where: "on board 3", positions: 200000 }), result("clocks", { label: "board 4", where: "on board 4" })],
      }),
    );
    expect(lines.map((line) => line.mark)).toEqual(["ok", "none", "gave", "skip"]);
    expect(lines[0]!.text).toBe("On board 1: a route exists, 8 lines of plain calls.");
    expect(lines[1]!.text).toMatch(/^On board 2: no route found\./);
    expect(lines[2]!.text).toMatch(/^On board 3: gave up after 200,000 positions\./);
    expect(lines[3]!.text).toMatch(/^On board 4: can't judge/);
  });

  it("name each place a hidden goal could be", () => {
    const [line] = solveLines(progress({ cases: 2, unit: "place", results: [result("route", { lines: 4, label: "b3", where: "with the goal on b3" })] }));
    expect(line!.text).toBe("With the goal on b3: a route exists, 4 lines of plain calls.");
  });

  it("explain that a route on each board is not one program for all, only when there are several", () => {
    expect(solveFootnote(progress())).toBeNull();
    expect(solveFootnote(progress({ cases: 3 }))).toMatch(/^Each board is checked on its own\..*your own solution/);
    expect(solveFootnote(progress({ cases: 2, unit: "place" }))).toMatch(/^Each place the goal could be/);
  });

  it("say where the search is", () => {
    expect(solveStatus(null)).toBe("Starting the search…");
    expect(solveStatus(progress({ positions: 45000 }))).toBe("Searching · 45,000 positions so far");
    expect(solveStatus(progress({ cases: 3, case: 2, positions: 45000 }))).toBe("Searching board 2 of 3 · 45,000 positions so far");
    expect(solveStatus(progress({ cases: 2, case: 1, unit: "place" }))).toBe("Searching place 1 of 2 · 0 positions so far");
  });
});
