// The help panel's outcome card actions: nothing is offered that the level cannot back (no solution, no hints).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressStore } from "../progress";
import type { LevelResult } from "../py/protocol";
import type { SolutionSource } from "./compare";
import { asFake, fakeDocument } from "./dom.fake";
import { HelpPanel } from "./help";

const solved = { status: "solved", stars: [{ earned: true }] } as unknown as LevelResult;
const failed = { status: "failed", stars: [] } as unknown as LevelResult;
const mine: SolutionSource = { name: "my own answer", explained: false, load: async () => null };
const panel = (hints: string[], solution: SolutionSource | null) => new HelpPanel("scratch-test", hints, () => "# code", { store: new ProgressStore(null), solution });
const texts = (actions: HTMLElement[]) => actions.map((action) => asFake(action).text);

describe("HelpPanel.outcomeActions", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  it("offers no comparison after a solved run when there is no solution", () => {
    expect(panel([], null).outcomeActions(solved, "# run", () => {})).toEqual([]);
  });

  it("offers the comparison, named for the solution, when there is one", () => {
    expect(texts(panel([], mine).outcomeActions(solved, "# run", () => {}))).toEqual(["Compare with my own answer"]);
  });

  it("offers nothing after a failed run on a level with no hints and no solution", () => {
    expect(panel([], null).outcomeActions(failed, "# run", () => {})).toEqual([]);
  });

  it("offers a hint after a failed run when the level has one", () => {
    expect(texts(panel(["look closer"], null).outcomeActions(failed, "# run", () => {}))).toEqual(["Need a hint?"]);
  });
});
