import { describe, expect, it } from "vitest";
import { blankDraft, draftToLevelInfo, parseSquare, squareName, type Draft } from "./draft";
import { draftToLevelData, draftToYaml, ImportError, levelDataToDraft, parseLevelYaml, yamlToDraft } from "./levelData";

const FILE = `
id: ch99-l01
chapter: 99
title: The Test
trains: "Everything at once"
brief: Get there.
piece: pawn
map: |
  # S . G
  . X R .
  O T . $
  P . . .
legend:
  S: {tile: sign, text: "Beware: the \\"pit\\""}
  X: {tile: gate, question: "How many?", passphrase: "yes"}
  R: {tile: rune, text: "north-3"}
  O: pit
  T: {tile: timed_gate, every: 3}
  $: gem
  Z: {tile: gate, passphrase: "4"}
enemies:
  - {kind: patrol, route: [b1, d1], loop: true, clock: new_line}
  - {kind: rook, start: d3}
start: {facing: east, planks: 1}
api: [move, turn_left]
par: {lines: 3}
hints: ["a", "b"]
variants:
  - map: |
      # . . G
      . Z . .
      . . . .
      P . . .
lesson: ch99/ch99-l01.md
`;

const draft = (source = FILE) => yamlToDraft(source);

describe("reading a level file", () => {
  it("reads the map, tiles, details, start and goal", () => {
    const d = draft();
    expect([d.width, d.height]).toEqual([4, 4]);
    expect(d.start).toEqual([0, 0]);
    expect(d.goal).toEqual([3, 3]);
    expect(d.facing).toBe("east");
    expect(d.planks).toBe(1);
    expect(d.cells[3]![0]!.tile).toBe("wall");
    expect(d.cells[3]![1]).toMatchObject({ tile: "sign", text: 'Beware: the "pit"' });
    expect(d.cells[2]![1]).toMatchObject({ tile: "gate", question: "How many?", passphrase: "yes" });
    expect(d.cells[1]![1]).toMatchObject({ tile: "timed_gate", every: 3 });
    expect(d.cells[1]![3]!.tile).toBe("gem");
  });

  it("reads each enemy as the file says it, and nothing more", () => {
    const [patrol, rook] = draft().enemies;
    expect(patrol).toEqual({ kind: "patrol", start: [1, 0], route: [[1, 0], [3, 0]], loop: true, clock: "new_line" });
    expect(rook).toEqual({ kind: "rook", start: [3, 2] });
  });

  it("keeps the keys it doesn't edit, and the legend, as they were", () => {
    const { extra } = draft();
    expect(extra).toMatchObject({ chapter: 99, par: { lines: 3 }, hints: ["a", "b"], lesson: "ch99/ch99-l01.md" });
    expect(extra.variants).toHaveLength(1);
    expect(extra.legend).toMatchObject({ O: "pit", Z: { tile: "gate", passphrase: "4" } });
  });

  it("can be given its own id", () => {
    expect(yamlToDraft(FILE, { id: "my-copy" }).id).toBe("my-copy");
    expect(draft().id).toBe("ch99-l01");
  });

  it("reads a hidden goal as ? squares", () => {
    const d = yamlToDraft("id: a\ntitle: T\napi: [move]\nmap: |\n  ? . ?\n  P . .\n");
    expect(d.goal).toBeNull();
    expect(d.spots).toEqual([[0, 1], [2, 1]]);
  });
});

describe("a file the editor can't hold", () => {
  const bad = (map: string, more = "") => () => yamlToDraft(`id: a\ntitle: T\napi: []\n${more}map: |\n${map.replace(/^/gm, "  ")}\n`);

  it.each([
    ["no start", ". G\n. ."],
    ["two starts", "P P\n. G"],
    ["two goals", "P G\nG ."],
    ["ragged rows", "P . G\n. ."],
    ["a symbol with no meaning", "P Q G"],
  ])("refuses %s", (_name, map) => {
    expect(bad(map)).toThrow(ImportError);
  });

  it("refuses a board over the size limit it's given", () => {
    expect(() => yamlToDraft("id: a\ntitle: T\napi: []\nmap: |\n  P . . G\n", { maxSide: 3 })).toThrow(/at most 3/);
  });

  it("refuses an enemy or legend entry holding something the editor can't keep", () => {
    expect(bad("P G", "enemies: [{kind: rook, start: b1, speed: 3}]\n")).toThrow(/speed/);
    expect(bad("P G S", "legend: {S: {tile: sign, text: x, colour: red}}\n")).toThrow(/colour/);
  });

  it("refuses text that isn't YAML or isn't a level", () => {
    expect(() => yamlToDraft("a: [1, 2")).toThrow(ImportError);
    expect(() => yamlToDraft("- just\n- a list")).toThrow(ImportError);
    expect(() => yamlToDraft("title: no map here")).toThrow(/no map/);
  });
});

describe("writing a level file", () => {
  it("writes the map top rank first, with the start, goal and ? squares", () => {
    const d = blankDraft(3, 2, "my-x");
    d.spots = [[1, 1]];
    d.goal = null;
    const { data } = draftToLevelData(d);
    expect(data.map).toBe(". ? .\nP . .\n");
    expect(data).toMatchObject({ id: "my-x", piece: "pawn", start: { facing: "north" }, api: ["move", "turn_left", "turn_right"] });
    expect(data).not.toHaveProperty("legend");
    expect(data).not.toHaveProperty("enemies");
    expect(data).not.toHaveProperty("chapter"); // an editor level has none
  });

  it("gives each different square its own legend symbol, and repeats one for equal squares", () => {
    const d = blankDraft(4, 1);
    d.goal = null;
    d.start = [0, 0];
    d.cells[0]![1] = { tile: "sign", text: "one" };
    d.cells[0]![2] = { tile: "sign", text: "two" };
    d.cells[0]![3] = { tile: "sign", text: "one" };
    const { data, squares } = draftToLevelData(d);
    const symbols = String(data.map).trim().split(" ");
    expect(symbols[1]).toBe(symbols[3]);
    expect(symbols[2]).not.toBe(symbols[1]);
    expect(squares[symbols[1]!]).toEqual(["b1", "d1"]);
    expect(squares[symbols[2]!]).toEqual(["c1"]);
  });

  it("writes a detail-less tile as its bare name, and a tile with details as a mapping", () => {
    const d = blankDraft(3, 1);
    d.goal = null;
    d.cells[0]![1] = { tile: "pit" };
    d.cells[0]![2] = { tile: "gate", passphrase: "open", question: "Well?" };
    expect(draftToLevelData(d).data.legend).toEqual({ O: "pit", X: { tile: "gate", passphrase: "open", question: "Well?" } });
  });

  it("writes only the enemy keys it has, and a patrol's start only when it isn't its first corner", () => {
    const d = blankDraft();
    d.enemies = [
      { kind: "patrol", start: [1, 1], route: [[1, 1], [4, 1]], loop: true },
      { kind: "patrol", start: [4, 1], route: [[1, 1], [4, 1]] },
      { kind: "rook", start: [5, 5] },
    ];
    expect(draftToLevelData(d).data.enemies).toEqual([
      { kind: "patrol", route: ["b2", "e2"], loop: true },
      { kind: "patrol", start: "e2", route: ["b2", "e2"] },
      { kind: "rook", start: "f6" },
    ]);
  });

  it("writes the start's planks only when there are some", () => {
    const d = blankDraft();
    expect(draftToLevelData(d).data.start).toEqual({ facing: "north" });
    d.planks = 2;
    expect(draftToLevelData(d).data.start).toEqual({ facing: "north", planks: 2 });
  });

  it("keeps the symbols the other boards use meaning what they meant", () => {
    const d = draft();
    // the editor adds a different gate where the file's `Z` gate isn't on the main map
    d.cells[0]![3] = { tile: "gate", passphrase: "new" };
    const { data } = draftToLevelData(d);
    const legend = data.legend as Record<string, unknown>;
    expect(legend.Z).toEqual({ tile: "gate", passphrase: "4" }); // still what the variant means
    const newSymbol = String(data.map).trim().split("\n")[3]!.split(" ")[3]!;
    expect(newSymbol).not.toBe("Z");
    expect(legend[newSymbol]).toEqual({ tile: "gate", passphrase: "new" });
    expect(data.variants).toEqual(d.extra.variants);
  });

  it("keeps a square's old symbol when it still means the same", () => {
    const rewritten = draftToLevelData(draft()).data;
    expect(rewritten.legend).toMatchObject({ S: { tile: "sign" }, X: { tile: "gate" }, R: { tile: "rune" }, O: "pit", T: { tile: "timed_gate", every: 3 }, $: "gem" });
  });

  it("writes the keys it doesn't edit after its own", () => {
    const data = draftToLevelData(draft()).data;
    expect(data).toMatchObject({ chapter: 99, par: { lines: 3 }, hints: ["a", "b"], lesson: "ch99/ch99-l01.md" });
    expect(Object.keys(data).indexOf("api")).toBeLessThan(Object.keys(data).indexOf("par"));
  });
});

describe("YAML", () => {
  it("round-trips a level through its own text", () => {
    const first = draft();
    const again = yamlToDraft(draftToYaml(first));
    expect(draftToLevelData(again).data).toEqual(draftToLevelData(first).data);
    expect(draftToLevelInfo(again)).toEqual(draftToLevelInfo(first));
  });

  it("writes the map as a block and each enemy, the start and each legend entry on one line", () => {
    const text = draftToYaml(draft());
    expect(text).toMatch(/^map: \|\n {2}# S \. G\n/m);
    expect(text).toMatch(/^start: \{ facing: east, planks: 1 \}$/m);
    expect(text).toMatch(/^ {2}- \{ kind: rook, start: d3 \}$/m);
    expect(text).toMatch(/^ {2}O: pit$/m);
  });

  it("quotes the words YAML 1.1 would read as something else", () => {
    const d = blankDraft(3, 1);
    d.goal = null;
    d.cells[0]![1] = { tile: "gate", passphrase: "yes" };
    d.cells[0]![2] = { tile: "gate", passphrase: "4", question: "Is it 4?" };
    const back = yamlToDraft(draftToYaml(d));
    expect(back.cells[0]![1]!.passphrase).toBe("yes");
    expect(back.cells[0]![2]!.passphrase).toBe("4");
    expect(parseLevelYaml("a: yes\nb: 'yes'")).toEqual({ a: true, b: "yes" }); // why it matters
  });

  it("round-trips text with colons, quotes and leading symbols", () => {
    const d: Draft = blankDraft(3, 1);
    d.goal = null;
    d.cells[0]![1] = { tile: "sign", text: `- "quoted": it's #1 & more: yes` };
    expect(yamlToDraft(draftToYaml(d)).cells[0]![1]!.text).toBe(`- "quoted": it's #1 & more: yes`);
    d.title = "Yes: no?";
    d.brief = "Two\nlines";
    const back = yamlToDraft(draftToYaml(d));
    expect([back.title, back.brief]).toEqual(["Yes: no?", "Two\nlines"]);
  });
});

describe("what the board draws", () => {
  it("lists tiles, texts and enemies like the engine does", () => {
    const info = draftToLevelInfo(draft());
    expect(info.tiles[3]![0]).toBe("wall"); // y = 3 is the top rank
    expect(info.signs).toEqual([{ pos: [1, 3], text: 'Beware: the "pit"' }]);
    expect(info.runes).toEqual([{ pos: [2, 2], text: "north-3" }]);
    expect(info.questions).toEqual([{ pos: [1, 2], text: "How many?" }]);
    expect(info.timed_gates.map(({ pos, every, open, clock }) => ({ pos, every, open, clock }))).toEqual([{ pos: [1, 1], every: 3, open: 2, clock: "action" }]);
    expect(info.start.opened).toEqual([[1, 1]]); // a timed gate starts open
    expect(info.enemies[0]).toEqual({ kind: "patrol", route: [[1, 0], [3, 0]], loop: true, clock: "new_line", armoured: false });
    expect(info.enemies[1]).toEqual({ kind: "rook", route: [[3, 2]], loop: false, clock: "action", armoured: false });
    expect(info.start).toMatchObject({ pos: [0, 0], facing: "east", planks: 1, enemies: [[1, 0], [3, 2]] });
    expect(info.goal).toEqual([3, 3]);
  });

  it("sorts hidden-goal squares by file, then rank, as the engine does", () => {
    const d = blankDraft(3, 3);
    d.goal = null;
    d.spots = [[2, 0], [0, 2], [0, 1]];
    expect(draftToLevelInfo(d).goal_spots).toEqual([[0, 1], [0, 2], [2, 0]]);
  });
});

describe("squares", () => {
  it("are named like a chessboard", () => {
    expect(squareName([1, 3])).toBe("b4");
    expect(parseSquare("b4")).toEqual([1, 3]);
    expect(parseSquare("k12")).toEqual([10, 11]);
    for (const bad of ["", "b", "4b", "b0", "B4", 4, null]) expect(parseSquare(bad)).toBeNull();
  });
});

describe("importing parsed data directly", () => {
  it("accepts the parsed object, as the app's level content has it", () => {
    expect(levelDataToDraft(parseLevelYaml(FILE)).title).toBe("The Test");
  });
});
