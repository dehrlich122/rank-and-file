import { describe, expect, it } from "vitest";
import { blankDraft, type Draft } from "./draft";
import { readHints, readLimits, readObjectives, readPar, readStarter, setHints, setLimits, setObjectives, setPar, setStarter } from "./rules";

const draftWith = (extra: Record<string, unknown>): Draft => ({ ...blankDraft(4, 4, "my-test"), extra });

describe("objectives", () => {
  it("default to reaching the goal, and a default writes no key", () => {
    const draft = blankDraft();
    expect(readObjectives(draft)).toEqual({ reach: true, waypoints: false, say: [], collect: null, capture: null, other: [] });
    expect("objectives" in setObjectives(draft, readObjectives(draft)).extra).toBe(false);
  });

  it("read every kind of objective, and write them back in a fixed order", () => {
    const draft = draftWith({ objectives: [{ say: "hello" }, "reach_goal", { collect: 2 }, { capture: "all" }, "waypoints", { say: "again" }] });
    const read = readObjectives(draft);
    expect(read).toEqual({ reach: true, waypoints: true, say: ["hello", "again"], collect: 2, capture: "all", other: [] });
    expect(setObjectives(draft, read).extra.objectives).toEqual(["reach_goal", "waypoints", { say: "hello" }, { say: "again" }, { collect: 2 }, { capture: "all" }]);
  });

  it("keep what the form doesn't know, as it was", () => {
    const odd = { fly: "yes" };
    const draft = draftWith({ objectives: ["reach_goal", odd, { collect: 0 }] });
    const read = readObjectives(draft);
    expect(read.other).toEqual([odd, { collect: 0 }]);
    expect(setObjectives(draft, { ...read, collect: null }).extra.objectives).toEqual(["reach_goal", odd, { collect: 0 }]);
  });

  it("turning everything off writes an empty list, for the engine to refuse", () => {
    const draft = setObjectives(blankDraft(), { reach: false, waypoints: false, say: [], collect: null, capture: null, other: [] });
    expect(draft.extra.objectives).toEqual([]);
  });

  it("leave the rest of the draft alone", () => {
    const draft = draftWith({ par: { lines: 3 } });
    expect(setObjectives(draft, { ...readObjectives(draft), say: ["x"] }).extra.par).toEqual({ lines: 3 });
  });
});

describe("limits", () => {
  it("read as nothing on a draft with none", () => {
    expect(readLimits(blankDraft())).toEqual({ max_lines: null, max_numbers: null, min_comments: 0, require_nodes: [], ban_nodes: [] });
  });

  it("write only what is on, and drop the key when nothing is", () => {
    let draft = setLimits(blankDraft(), { max_lines: 6, require_nodes: ["While"] });
    expect(draft.extra.constraints).toEqual({ max_lines: 6, require_nodes: ["While"] });
    draft = setLimits(draft, { max_lines: null });
    expect(draft.extra.constraints).toEqual({ require_nodes: ["While"] });
    draft = setLimits(draft, { require_nodes: [] });
    expect("constraints" in draft.extra).toBe(false);
  });

  it("keep a limit the form doesn't know", () => {
    const draft = setLimits(draftWith({ constraints: { max_lines: 4, secret_rule: 1 } }), { max_lines: 5 });
    expect(draft.extra.constraints).toEqual({ max_lines: 5, secret_rule: 1 });
  });

  it("treat zero comments as off", () => {
    expect(setLimits(draftWith({ constraints: { min_comments: 2 } }), { min_comments: 0 }).extra.constraints).toBeUndefined();
  });
});

describe("par", () => {
  it("is written as lines, and removed when empty", () => {
    let draft = setPar(blankDraft(), 4);
    expect(draft.extra.par).toEqual({ lines: 4 });
    expect(readPar(draft)).toBe(4);
    draft = setPar(draft, undefined);
    expect("par" in draft.extra).toBe(false);
    expect(readPar(draft)).toBeNull();
  });
});

describe("hints", () => {
  it("read as three tiers, empty where there is none", () => {
    expect(readHints(blankDraft())).toEqual(["", "", ""]);
    expect(readHints(draftWith({ hints: ["a", "b"] }))).toEqual(["a", "b", ""]);
  });

  it("are kept in order: a tier after an empty one is dropped", () => {
    expect(setHints(blankDraft(), ["a", "b", "c"]).extra.hints).toEqual(["a", "b", "c"]);
    expect(setHints(blankDraft(), ["a", "  ", "c"]).extra.hints).toEqual(["a"]);
    expect("hints" in setHints(draftWith({ hints: ["a"] }), ["", "b", ""]).extra).toBe(false);
  });
});

describe("starter code", () => {
  it("is kept as written, and removed when blank", () => {
    const draft = setStarter(blankDraft(), "# go\n");
    expect(readStarter(draft)).toBe("# go\n");
    expect("starter" in setStarter(draft, "  \n").extra).toBe(false);
  });
});
