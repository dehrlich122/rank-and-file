import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelInfo, LevelResult, Var } from "../py/protocol";
import { type Fake, asFake, fakeDocument } from "./dom.fake";
import { Inspector, callList, outcomeCard, piecesFirst } from "./panels";

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
  const plain = whole.replaceAll("`", ""); // the backticks become a code element, which adds no characters
  const result = (over: Partial<LevelResult>): LevelResult =>
    ({ status: "solved", summary: `Solved! ${whole} “Fine.”`, error: null, problems: [], stars: [], case_note: "", truncated: false, call: null, cases: [], ...over }) as LevelResult;
  const call = { text: "f(1)", returned: null, wanted: null, first_step: 0, happened: whole, said: "Fine." };
  const card = (run: LevelResult) => asFake(outcomeCard(run, run));

  it("shows what happened, then the examiner's line apart with its mark", () => {
    const c = card(result({ call }));
    const paras = c.all("p").map((p) => p.text);
    expect(paras).toContain(plain);
    const line = c.find("examiner-line")[0]!;
    expect(line.text).toBe("E“Fine.”");
    expect(line.find("examiner-mark")[0]!.attributes.get("title")).toBe("the examiner");
    expect(paras.some((p) => p.includes("Solved!"))).toBe(false);
  });

  it("is as before with no happened, or with a problem", () => {
    expect(card(result({ call: { ...call, happened: null, said: null } })).find("examiner-line").length).toBe(0);
    expect(card(result({ call: null })).all("p").map((p) => p.text)).toContain(`${plain} “Fine.”`);
    expect(card(result({ call, problems: ["no"] })).find("examiner-line").length).toBe(0);
  });
});

describe("the result card shows `code` spans as code", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  const base = { status: "lost", summary: "", error: null, problems: [], stars: [], case_note: "", truncated: false, call: null, cases: [] };
  const card = (over: Partial<LevelResult>) => {
    const run = { ...base, ...over } as LevelResult;
    return asFake(outcomeCard(run, run));
  };
  const codes = (f: Fake) => f.all("code").map((c) => c.text);

  it("an error's friendly text, with the Line tag first and the second line kept", () => {
    const c = card({ status: "error", error: { line: 3, friendly: "Did you mean `move`?\nTry again.", traceback: "" } as LevelResult["error"] });
    const p = c.all("p")[0]!;
    expect((p.children[0] as Fake).attributes.get("class")).toBe("line-tag");
    expect(codes(c)).toEqual(["move"]);
    expect(p.text).toBe("Line 3Did you mean move?\nTry again.");
  });

  it("each problem", () => {
    const c = card({ status: "incomplete", problems: ["Use `for` here.", "Plain."] });
    expect(codes(c)).toEqual(["for"]);
    expect(c.all("li").map((li) => li.text)).toEqual(["Use for here.", "Plain."]);
  });

  it("what happened on an examiner's call", () => {
    const c = card({ status: "solved", call: { text: "f(1)", returned: null, wanted: null, first_step: 0, happened: "It called `f(1)`.", said: "Fine." } });
    expect(codes(c)).toEqual(["f(1)"]);
    expect(c.all("p")[0]!.text).toBe("It called f(1).");
  });

  it("a plain summary, with Solved! stripped", () => {
    const c = card({ status: "solved", summary: "Solved! A `while` loop ran." });
    expect(codes(c)).toEqual(["while"]);
    expect(c.all("p")[0]!.text).toBe("A while loop ran.");
  });
});

describe("callList: the examiner's calls in the Challenge panel", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  const calls = (...boards: number[]) => ({ function: "f", calls: boards.map((board, i) => ({ text: `f(${i})`, board })) });
  const boards = (n: number) => Array.from({ length: n }, () => ({})) as unknown as LevelInfo["boards"];
  const items = (nodes: HTMLElement[]) => asFake(nodes[1]!).all("li");

  it("is a sentence and a numbered list, one item per call in order", () => {
    const nodes = callList(calls(1, 2, 3), boards(3));
    expect(nodes.map((n) => asFake(n).tag)).toEqual(["p", "ol"]);
    expect(asFake(nodes[0]!).text).toBe("The examiner will call:");
    expect(asFake(nodes[1]!).attributes.get("class")).toBe("call-list");
    expect(items(nodes).map((li) => li.text)).toEqual(["f(0)", "f(1)", "f(2)"]);
    expect(items(nodes).every((li) => li.find("call-code").length === 1)).toBe(true);
  });

  it("names no board when there are no other boards, or each call has its own", () => {
    expect(items(callList(calls(1, 1, 1), boards(0))).map((li) => li.text)).toEqual(["f(0)", "f(1)", "f(2)"]);
    expect(items(callList(calls(1, 2), boards(2))).every((li) => li.find("muted").length === 0)).toBe(true);
  });

  it("names the board on every item when calls and boards differ", () => {
    expect(items(callList(calls(1, 1, 2), boards(2))).map((li) => li.text)).toEqual(["f(0) on board 1", "f(1) on board 1", "f(2) on board 2"]);
    expect(items(callList(calls(2, 1), boards(2))).map((li) => li.find("muted").length)).toEqual([1, 1]);
  });
});

describe("outcomeCard: the examiner's table of calls", () => {
  beforeEach(() => vi.stubGlobal("document", { ...fakeDocument, createElementNS: (_ns: string, tag: string) => fakeDocument.createElement(tag) })); // the star list draws svg icons
  afterEach(() => vi.unstubAllGlobals());

  type Call = { returned: string | null; wanted: string | null };
  const make = (over: Partial<LevelResult>): LevelResult =>
    ({ status: "solved", summary: "Solved! ok", error: null, problems: [], stars: [], case_note: "", truncated: false, call: null, cases: [], ...over }) as LevelResult;
  const aCase = (label: string, status: LevelResult["status"], call: Call | null) =>
    make({ status, label, call: call && { text: label, first_step: 0, happened: null, said: null, ...call } } as Partial<LevelResult>) as LevelResult["cases"][number];
  const three = [
    aCase("f(1)", "solved", { wanted: "2", returned: "2" }),
    aCase("f(2)", "lost", { wanted: "4", returned: "'4'" }),
    aCase("f(3)", "lost", { wanted: "6", returned: null }),
  ];
  const card = (run: LevelResult, shown: LevelResult = run, replay?: (i: number) => void) => asFake(outcomeCard(run, shown, [], true, replay));
  const rows = (c: Fake) => c.all("tbody")[0]!.all("tr");
  const cells = (row: Fake) => row.all("td").map((td) => td.text);

  it("has the head and one row per case, in order, after the details and before the stars", () => {
    const run = make({ status: "lost", cases: three, stars: [{ kind: "solved", earned: false, label: "s" }] });
    const c = card(run, three[1]);
    const table = c.find("calls")[0]!;
    expect(table.tag).toBe("table");
    expect(table.all("th").map((th) => th.text)).toEqual(["call", "wanted", "got", ""]);
    expect(rows(c).length).toBe(3);
    expect(rows(c).map((r) => r.all("button")[0]!.text)).toEqual(["f(1)", "f(2)", "f(3)"]);
    expect(cells(rows(c)[0]!).slice(1)).toEqual(["2", "2", "✓"]);
    expect(cells(rows(c)[1]!).slice(1)).toEqual(["4", "'4'", "✗"]);
    const order = c.children.map((child) => (typeof child === "string" ? "" : (child.attributes.get("class") ?? "")));
    expect(order.indexOf("calls")).toBeGreaterThan(-1);
    expect(order.indexOf("calls")).toBeLessThan(order.indexOf("stars"));
  });

  it("marks the case on show, the tick and the cross by the case's status", () => {
    const run = make({ cases: three });
    const c = card(run, three[2]);
    expect(rows(c).map((r) => r.attributes.get("class") ?? "")).toEqual(["", "", "picked"]);
    expect(rows(c).map((r) => r.all("td")[3]!.attributes.get("class"))).toEqual(["ok", "no", "no"]);
    expect(card(run).find("picked").length).toBe(0); // the run itself on show: no row picked
  });

  it("says no answer, in muted type, where a call did not finish; never None", () => {
    const c = card(make({ cases: three }), three[2]);
    const got = rows(c)[2]!.all("td")[2]!;
    expect(got.text).toBe("no answer");
    expect(got.find("muted").length).toBe(1);
  });

  it("leaves wanted and got empty where nothing is wanted or the case never ran", () => {
    const run = make({ cases: [three[0]!, aCase("f(2)", "lost", { wanted: null, returned: "3" }), aCase("f(3)", "lost", null)] });
    const c = card(run);
    expect(cells(rows(c)[1]!)).toEqual(["f(2)", "", "", "✗"]);
    expect(cells(rows(c)[2]!)).toEqual(["f(3)", "", "", "✗"]);
  });

  it("is not there with no cases, or when no case has an answer wanted", () => {
    expect(card(make({})).find("calls").length).toBe(0);
    const boardOnly = [aCase("f(1)", "solved", { wanted: null, returned: null }), aCase("f(2)", "lost", null)];
    expect(card(make({ cases: boardOnly })).find("calls").length).toBe(0);
  });

  it("shows on a solved run, on a failed one, and beside an error", () => {
    expect(card(make({ cases: three })).find("calls").length).toBe(1);
    expect(card(make({ status: "lost", cases: three })).find("calls").length).toBe(1);
    const error = { friendly: "oops", line: 1, traceback: "" } as LevelResult["error"];
    const c = card(make({ status: "error", error, cases: three }), make({ status: "error", error }));
    expect(c.find("error-detail").length).toBe(1);
    expect(c.find("calls").length).toBe(1);
  });

  it("replays the case whose button is clicked, and takes no replay without breaking", () => {
    const seen: number[] = [];
    const c = card(make({ cases: three }), three[0]!, (i) => seen.push(i));
    rows(c)[2]!.all("button")[0]!.fire("click");
    rows(c)[0]!.all("button")[0]!.fire("click");
    expect(seen).toEqual([2, 0]);
    expect(rows(c)[1]!.all("button")[0]!.attributes.get("title")).toBe("Replay f(2)");
    expect(() => rows(card(make({ cases: three })))[1]!.all("button")[0]!.fire("click")).not.toThrow();
  });

  it("still takes the two arguments alone", () => {
    const run = make({});
    expect(asFake(outcomeCard(run, run)).find("outcome-head").length).toBe(1);
  });
});
