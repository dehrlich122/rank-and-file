import { describe, expect, it } from "vitest";
import { shareChecks } from "./shareDialog";

const solved = (lines: number, boards = 1) => ({
  status: "solved" as const,
  summary: "",
  code_lines: lines,
  error: null,
  cases: boards > 1 ? Array.from({ length: boards }, (_, i) => ({ label: `board ${i + 1}`, status: "solved", summary: "", error: null })) : [],
});
const ok = { ok: true } as const;

describe("shareChecks", () => {
  it("passes an accepted level with a good solution", () => {
    const lines = shareChecks(ok, "code", solved(3), null);
    expect(lines.map((l) => l.ok)).toEqual([true, true, true]);
    expect(lines[0]?.text).toBe("The engine accepts the level.");
    expect(lines[1]?.text).toBe("Your solution solves the level in 3 lines.");
    expect(lines[2]?.text).toBe("No par is set.");
  });

  it("shows the engine's message when it refuses", () => {
    const lines = shareChecks({ ok: false, error: "No goal." }, "code", null, null);
    expect(lines[0]).toEqual({ ok: false, text: "No goal." });
    expect(lines[1]?.ok).toBe(false);
  });

  it("asks for a solution when none is kept", () => {
    const lines = shareChecks(ok, "  ", null, null);
    expect(lines[1]).toEqual({ ok: false, text: "No solution kept yet. Solve the level in test-play and keep your code." });
  });

  it("words one line and several boards", () => {
    expect(shareChecks(ok, "c", solved(1), null)[1]?.text).toBe("Your solution solves the level in 1 line.");
    expect(shareChecks(ok, "c", solved(4, 3), null)[1]?.text).toBe("Your solution solves all 3 boards in 4 lines.");
  });

  it("names the first failing case", () => {
    const run = { ...solved(2, 2), status: "lost" as const };
    run.cases[1] = { label: "board 2", status: "lost", summary: "Fell in a pit.", error: null };
    const line = shareChecks(ok, "c", run, null)[1];
    expect(line?.ok).toBe(false);
    expect(line?.text).toBe("Your solution no longer solves this level (board 2: Fell in a pit.). Test-play it again.");
  });

  it("falls back to the run's own reason without cases", () => {
    const run = { status: "error" as const, summary: "", code_lines: 1, error: { friendly: "A mistake." }, cases: [] };
    expect(shareChecks(ok, "c", run, null)[1]?.text).toContain("(A mistake.)");
  });

  it("checks par against the solution", () => {
    expect(shareChecks(ok, "c", solved(3), 3)[2]).toEqual({ ok: true, text: "Par (3 lines) is within reach of your solution." });
    expect(shareChecks(ok, "c", solved(3), 5)[2]?.ok).toBe(true);
    expect(shareChecks(ok, "c", solved(3), 2)[2]).toEqual({ ok: false, text: "Par is 2 lines, but your solution needs 3.", setPar: 3 });
  });
});
