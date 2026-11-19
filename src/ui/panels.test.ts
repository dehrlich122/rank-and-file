import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelResult, Var } from "../py/protocol";
import { type Fake, asFake, fakeDocument } from "./dom.fake";
import { Inspector, outcomeCard, piecesFirst } from "./panels";

const v = (name: string, type: string): Var => ({ name, value: "0", type });
const names = (vars: Var[]) => vars.map((x) => x.name).join(",");

describe("piecesFirst: the variables panel's order", () => {
  it("puts the knight first on a knight level, then the player's variables in order", () => {
    const vars = [v("steps", "int"), v("knight", "Knight"), v("me", "Knight"), v("tag", "str")];
    expect(names(piecesFirst(vars, "knight"))).toBe("knight,me,steps,tag");
  });

  it("keeps the pawn level's order as before", () => {
    const vars = [v("steps", "int"), v("pawn", "Pawn"), v("tag", "str")];
    expect(names(piecesFirst(vars, "pawn"))).toBe("pawn,steps,tag");
  });

  it("leaves the order alone when no variable holds the piece", () => {
    expect(names(piecesFirst([v("steps", "int"), v("tag", "str")], "knight"))).toBe("steps,tag");
    expect(names(piecesFirst([v("a", "Pawn"), v("b", "int")], "knight"))).toBe("a,b");
  });
});

describe("Inspector", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  const val = (name: string, value: string): Var => ({ name, value, type: "int" });
  const make = () => new Inspector("pawn");
  const root = (i: Inspector): Fake => asFake(i.element);
  const changed = (f: Fake) => f.all("tr").filter((r) => r.attributes.get("class") === "changed").map((r) => r.text.slice(0, 1));
  const inFn = (name = "double", depth = 1, globals: Var[] = []) => ({ scope: name, depth, globals });
  type Foldable = Fake & { open?: boolean };
  const fold = (i: Inspector) => root(i).find("fold")[0]! as Foldable;

  it("at module level builds one table straight inside, and the empty sentence", () => {
    const i = make();
    i.show(null);
    expect(root(i).text).toBe("No variables yet. Your own variables appear here as the program runs.");
    i.show([val("a", "1")]);
    expect(root(i).children.length).toBe(1);
    expect((root(i).children[0] as Fake).tag).toBe("table");
    i.show([val("a", "2"), val("b", "1")], inFn("f", 0));
    expect(root(i).children.length).toBe(1);
    expect(changed(root(i))).toEqual(["a", "b"]);
  });

  it("inside a function shows its heading, its names, and a closed fold of the program's names, the piece first", () => {
    const i = make();
    i.show([val("n", "3")], inFn("double", 1, [val("x", "1"), { name: "hero", value: "5", type: "Pawn" }, val("y", "2")]));
    const scope = root(i).find("scope")[0]!;
    expect(scope.find("group-head")[0]!.text).toBe("double()");
    expect(scope.all("tr").map((t) => t.text)).toEqual(["n3int"]);
    expect(fold(i).tag).toBe("details");
    expect(fold(i).attributes.has("open")).toBe(false);
    expect(fold(i).all("summary")[0]!.text).toBe("your program's names (3)");
    expect(fold(i).all("tr").map((t) => t.text.slice(0, 1))).toEqual(["h", "x", "y"]);
  });

  it("shows a scope that is not an identifier as it is", () => {
    const i = make();
    i.show([val("x", "1")], inFn("<lambda>"));
    expect(root(i).find("group-head")[0]!.text).toBe("<lambda>");
  });

  it("says so when the function has no names of its own yet, and keeps the fold", () => {
    const i = make();
    i.show([], inFn("double", 1, [val("a", "1")]));
    expect(root(i).find("scope")[0]!.text).toBe("double()No names of its own yet.");
    expect(root(i).find("fold").length).toBe(1);
  });

  it("keeps the fold as the player left it, and reset closes it", () => {
    const i = make();
    const g = [val("a", "1")];
    i.show([val("n", "1")], inFn("f", 1, g));
    fold(i).open = true;
    fold(i).fire("toggle");
    i.show([val("n", "2")], inFn("f", 1, g));
    expect(fold(i).attributes.has("open")).toBe(true);
    fold(i).open = false;
    fold(i).fire("toggle");
    i.show([val("n", "3")], inFn("f", 1, g));
    expect(fold(i).attributes.has("open")).toBe(false);
    fold(i).open = true;
    fold(i).fire("toggle");
    i.reset();
    i.show([val("n", "1")], inFn("f", 1, g));
    expect(fold(i).attributes.has("open")).toBe(false);
  });

  it("marks changes list by list: the program's names against the program's, the function's against its own", () => {
    const i = make();
    i.show([val("a", "1"), val("b", "1")]); // module level
    i.show([val("n", "3")], inFn("f", 1, [val("a", "1"), val("b", "1")])); // first step inside: nothing marked
    expect(changed(root(i))).toEqual([]);
    i.show([val("n", "4")], inFn("f", 1, [val("a", "1"), val("b", "2")])); // same call: n and b changed
    expect(changed(root(i)).sort()).toEqual(["b", "n"]);
    i.show([val("n", "4"), val("m", "0")], inFn("f", 1, [val("a", "1"), val("b", "2")])); // a new own name is marked
    expect(changed(root(i))).toEqual(["m"]);
    i.show([val("n", "4")], inFn("g", 1, [val("a", "1"), val("b", "2")])); // another function: nothing marked
    expect(changed(root(i))).toEqual([]);
    i.show([val("n", "4")], inFn("g", 2, [val("a", "1"), val("b", "2")])); // deeper call: nothing marked
    expect(changed(root(i))).toEqual([]);
    i.show([val("a", "1"), val("b", "2")]); // back at module level: only what really changed
    expect(changed(root(i))).toEqual([]);
    i.show([val("a", "9"), val("b", "2")]);
    expect(changed(root(i))).toEqual(["a"]);
  });
});

describe("outcomeCard on an examiner level", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  const whole = "The examiner called `f(1)`, and the board is as it should be.";
  const result = (over: Partial<LevelResult>): LevelResult =>
    ({ status: "solved", summary: `Solved! ${whole} “Fine.”`, error: null, problems: [], stars: [], case_note: "", truncated: false, call: null, ...over }) as LevelResult;
  const call = { text: "f(1)", returned: null, wanted: null, first_step: 0, happened: whole, said: "Fine." };
  const card = (run: LevelResult) => asFake(outcomeCard(run, run));

  it("shows what happened, then the examiner's line apart with its mark", () => {
    const c = card(result({ call }));
    const paras = c.all("p").map((p) => p.text);
    expect(paras).toContain(whole);
    const line = c.find("examiner-line")[0]!;
    expect(line.text).toBe("E“Fine.”");
    expect(line.find("examiner-mark")[0]!.attributes.get("title")).toBe("the examiner");
    expect(paras.some((p) => p.includes("Solved!"))).toBe(false);
  });

  it("is as before with no happened, or with a problem", () => {
    expect(card(result({ call: { ...call, happened: null, said: null } })).find("examiner-line").length).toBe(0);
    expect(card(result({ call: null })).all("p").map((p) => p.text)).toContain(`${whole} “Fine.”`);
    expect(card(result({ call, problems: ["no"] })).find("examiner-line").length).toBe(0);
  });
});
