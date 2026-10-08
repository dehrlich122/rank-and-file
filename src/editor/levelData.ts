// Draft <-> level file (M4.2). The editor reads and writes the same YAML as `levels/`
// (docs/ARCHITECTURE.md); nothing here is editor-only. Importing never judges a level (the engine does,
// through `loadLevel`): it only fails when a file can't be held as a draft at all, e.g. a map symbol
// with no meaning. Keys the editor doesn't edit are kept in `draft.extra` and written back as they were.
//
// A level's other boards (`variants`, M4.3) are boards of the draft like the first. A file gives a board its own
// legend entries and, optionally, its own enemies (without them it has the level's); the draft just holds each board's
// squares and enemies, and writing assigns legend symbols to every board together, so no overrides are needed.
import { Document, isMap, isSeq } from "yaml";
import { parseYaml } from "../content";
import type { Facing, Pos, TileKind } from "../py/protocol";
import { asRecord } from "../storage";
import { boardOf } from "./boards";
import { copyKeys, DETAIL_KEYS, ENEMY_KINDS, FACINGS, floorCell, newId, parseSquare, PLAIN_ENEMY_KEYS, squareName, type Cell, type Draft, type DraftBoard, type DraftEnemy } from "./draft";

type LevelData = Record<string, unknown>;

/** A file that can't become a draft; the message says why, in words for the player. */
export class ImportError extends Error {}

const EDITED_KEYS = ["id", "title", "trains", "brief", "piece", "map", "legend", "enemies", "start", "api", "variants"];
const ENEMY_KEYS = new Set(["kind", "start", "route", ...PLAIN_ENEMY_KEYS]);
const VARIANT_KEYS = new Set(["map", "legend", "enemies"]);
const BUILTIN = new Set([".", "#", "P", "G", "?"]);

const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

/** A legend entry as a mapping: `pit` is `{tile: pit}`. */
const normalEntry = (raw: unknown): Record<string, unknown> => (typeof raw === "string" ? { tile: raw } : asRecord(raw));

// -- import -------------------------------------------------------------------------------------------

interface ReadBoard extends DraftBoard {
  spots: Pos[];
}

/** One map as a board. `where` names the board in messages ("" for the first, "Board 2" for the others). */
function readBoard(mapText: unknown, legend: Record<string, unknown>, maxSide: number | undefined, where: string): ReadBoard {
  const say = (message: string) => new ImportError(where ? `${where}: ${message}` : message);
  if (typeof mapText !== "string" || !mapText.trim()) throw say(where ? "this board has no map." : "This level has no map.");
  const meaning = (symbol: string): Cell => {
    if (symbol === ".") return floorCell();
    if (symbol === "#") return { tile: "wall" };
    if (BUILTIN.has(symbol)) return floorCell(); // the start, the goal and ? are floor
    if (legend[symbol] === undefined) throw say(`The map uses ${symbol}, which the legend doesn't explain.`);
    const { tile, ...details } = normalEntry(legend[symbol]);
    if (typeof tile !== "string") throw say(`The legend entry for ${symbol} has no tile.`);
    for (const key of Object.keys(details)) if (!(DETAIL_KEYS as readonly string[]).includes(key)) throw say(`The legend entry for ${symbol} has ${key}, which the editor can't keep.`);
    const cell: Cell = { tile: tile as TileKind, symbol };
    copyKeys(details, cell, DETAIL_KEYS);
    return cell;
  };

  const rows = mapText
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.trim().split(/\s+/));
  const width = rows[0]!.length;
  const height = rows.length;
  if (rows.some((row) => row.length !== width)) throw say("Every row of the map must have the same number of squares.");
  if (maxSide !== undefined && Math.max(width, height) > maxSide) throw say(`A board is at most ${maxSide} squares along each side; this one is ${width} by ${height}.`);

  const cells: Cell[][] = Array.from({ length: height }, () => []);
  let start: Pos | null = null;
  let goal: Pos | null = null;
  const spots: Pos[] = [];
  rows.forEach((row, i) => {
    const y = height - 1 - i;
    row.forEach((symbol, x) => {
      cells[y]![x] = meaning(symbol);
      if (symbol === "P") {
        if (start) throw say("The map has more than one start square (P).");
        start = [x, y];
      } else if (symbol === "G") {
        if (goal) throw say("The map has more than one goal square (G).");
        goal = [x, y];
      } else if (symbol === "?") spots.push([x, y]);
    });
  });
  if (!start) throw say("The map needs a start square (P).");
  return { width, height, cells, start, goal, spots, enemies: [] };
}

/** A level's parsed YAML as a draft. `options.id` replaces the file's id (a copy needs its own). */
export function levelDataToDraft(data: unknown, options: { maxSide?: number; id?: string } = {}): Draft {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ImportError("A level is a set of keys and values, like title: and map:.");
  const file = data as LevelData;
  const legend = asRecord(file.legend);
  const first = readBoard(file.map, legend, options.maxSide, "");
  const enemies = (Array.isArray(file.enemies) ? file.enemies : []).map((item, i) => importEnemy(item, i));

  if (file.variants !== undefined && !Array.isArray(file.variants)) throw new ImportError("The other boards (variants) must be a list.");
  const boards = ((file.variants as unknown[] | undefined) ?? []).map((item, i): DraftBoard => {
    const where = `Board ${i + 2}`;
    const variant = asRecord(item);
    for (const key of Object.keys(variant)) if (!VARIANT_KEYS.has(key)) throw new ImportError(`${where} has ${key}, which the editor can't keep.`);
    const { spots, ...board } = readBoard(variant.map, { ...legend, ...asRecord(variant.legend) }, options.maxSide, where);
    if (spots.length) throw new ImportError(`${where} has ? squares: only the first board can have them.`);
    if (variant.enemies !== undefined && !Array.isArray(variant.enemies)) throw new ImportError(`${where}: its enemies must be a list.`);
    // a board with no `enemies` of its own has the level's
    return { ...board, enemies: Array.isArray(variant.enemies) ? variant.enemies.map((enemy, j) => importEnemy(enemy, j, `${where}, `)) : enemies.map((enemy) => ({ ...enemy })) };
  });

  const begin = asRecord(file.start);
  const facing = begin.facing ?? "north";
  if (!FACINGS.includes(facing as Facing)) throw new ImportError("The start must face north, east, south or west.");
  const planks = begin.planks ?? 0;
  if (typeof planks !== "number") throw new ImportError("The planks to start with must be a number.");

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(file)) if (!EDITED_KEYS.includes(key)) extra[key] = value;

  return {
    id: options.id ?? (text(file.id) || newId()),
    title: text(file.title, "Untitled level"),
    brief: text(file.brief),
    trains: text(file.trains),
    piece: text(file.piece, "pawn"),
    ...first,
    enemies,
    boards,
    facing: facing as Facing,
    planks,
    api: Array.isArray(file.api) ? file.api.map(String) : [],
    extra,
  };
}

function importEnemy(item: unknown, index: number, prefix = ""): DraftEnemy {
  const where = `${prefix}Enemy ${index + 1}`;
  const enemy = asRecord(item);
  if (!ENEMY_KINDS.includes(enemy.kind as DraftEnemy["kind"])) throw new ImportError(`${where}: its kind must be ${ENEMY_KINDS.slice(0, -1).join(", ")} or ${ENEMY_KINDS.at(-1)}.`);
  for (const key of Object.keys(enemy)) if (!ENEMY_KEYS.has(key)) throw new ImportError(`${where} has ${key}, which the editor can't keep.`);
  const square = (name: unknown): Pos => parseSquare(name) ?? fail(`${where}: ${JSON.stringify(name)} isn't a square; squares are named like b4.`);
  const route = enemy.route === undefined ? undefined : (Array.isArray(enemy.route) ? enemy.route : fail(`${where}: its route must be a list of squares.`)).map(square);
  const start = enemy.start !== undefined ? square(enemy.start) : (route?.[0] ?? fail(`${where}: it needs a start square.`));
  const result: DraftEnemy = { kind: enemy.kind as DraftEnemy["kind"], start };
  if (route) result.route = route;
  copyKeys(enemy, result, PLAIN_ENEMY_KEYS);
  return result;
}

function fail(message: string): never {
  throw new ImportError(message);
}

// -- export ---------------------------------------------------------------------------------------------

/** What each tile's legend symbol looks like first, in the repo's own style. */
const PREFERRED: Partial<Record<TileKind, string>> = { sign: "S", rune: "R", gate: "X", timed_gate: "T", pit: "O", waypoint: "W", gem: "$", plank: "L" };
const POOL = "ABCDEFHIJKMNQSTUVXYZabcdefghijklmnopqrstuvwxyz0123456789@%&*+=~";

/** A cell's legend entry: the bare tile name when it has no details, else `{tile, ...details}`. */
function entryOf(cell: Cell): string | Record<string, unknown> {
  const entry: Record<string, unknown> = { tile: cell.tile };
  copyKeys(cell, entry, DETAIL_KEYS);
  return Object.keys(entry).length > 1 ? entry : cell.tile;
}

const keyOf = (entry: unknown): string => {
  const normal = normalEntry(entry);
  return JSON.stringify(Object.keys(normal).sort().map((key) => [key, normal[key]]));
};

/** The draft in the level file's shape, ready for `loadLevel` or for YAML. */
export function draftToLevelData(draft: Draft): LevelData {
  const taken = new Set<string>(BUILTIN);
  const bound = new Map<string, string>(); // an entry's key -> its symbol
  const legend: Record<string, unknown> = {};

  const symbolFor = (cell: Cell): string => {
    if (cell.tile === "floor") return ".";
    if (cell.tile === "wall") return "#";
    const entry = entryOf(cell);
    const key = keyOf(entry);
    let symbol = bound.get(key);
    if (!symbol) {
      const candidates = [cell.symbol, PREFERRED[cell.tile], ...POOL];
      symbol = candidates.find((c): c is string => c !== undefined && !taken.has(c)) ?? fail("This level uses more different squares than the editor has symbols for.");
      taken.add(symbol);
      bound.set(key, symbol);
      legend[symbol] = entry;
    }
    return symbol;
  };

  const same = (a: Pos | null, x: number, y: number) => a !== null && a[0] === x && a[1] === y;
  const mapOf = (board: DraftBoard, spots: Pos[]): string => {
    const rows: string[] = [];
    for (let y = board.height - 1; y >= 0; y--) {
      rows.push(
        board.cells[y]!.map((cell, x) => {
          if (same(board.start, x, y)) return "P";
          if (same(board.goal, x, y)) return "G";
          if (spots.some((spot) => same(spot, x, y))) return "?";
          return symbolFor(cell);
        }).join(" "),
      );
    }
    return `${rows.join("\n")}\n`;
  };

  // every board in turn, so a symbol means the same thing on all of them
  const map = mapOf(boardOf(draft), draft.spots);
  const variants = draft.boards.map((board) => {
    const variant: Record<string, unknown> = { map: mapOf(board, []) };
    // a board with no `enemies` key has the level's, so a board that has none says so when the level has some
    if (board.enemies.length || draft.enemies.length) variant.enemies = board.enemies.map(exportEnemy);
    return variant;
  });

  const data: LevelData = { id: draft.id, title: draft.title };
  if (draft.trains) data.trains = draft.trains;
  if (draft.brief) data.brief = draft.brief;
  data.piece = draft.piece;
  data.map = map;
  if (Object.keys(legend).length) data.legend = legend;
  if (draft.enemies.length) data.enemies = draft.enemies.map(exportEnemy);
  data.start = draft.planks ? { facing: draft.facing, planks: draft.planks } : { facing: draft.facing };
  data.api = draft.api;
  if (variants.length) data.variants = variants;
  Object.assign(data, draft.extra);
  return data;
}

function exportEnemy(enemy: DraftEnemy): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: enemy.kind };
  const first = enemy.route?.[0];
  if (!first || first[0] !== enemy.start[0] || first[1] !== enemy.start[1]) out.start = squareName(enemy.start);
  if (enemy.route) out.route = enemy.route.map(squareName);
  copyKeys(enemy, out, PLAIN_ENEMY_KEYS);
  return out;
}

// -- YAML -----------------------------------------------------------------------------------------------

/** The draft as a level file's text: the map as a block, and each enemy, legend entry and the start on one line. */
export function draftToYaml(draft: Draft): string {
  const doc = new Document(draftToLevelData(draft), { version: "1.1" });
  const flow = (node: unknown) => {
    if (isMap(node)) node.flow = true;
  };
  flow(doc.get("start", true));
  const enemies = doc.get("enemies", true);
  if (isSeq(enemies)) enemies.items.forEach(flow);
  const variants = doc.get("variants", true);
  if (isSeq(variants)) {
    for (const variant of variants.items) {
      const own = isMap(variant) ? variant.get("enemies", true) : null;
      if (isSeq(own)) own.items.forEach(flow);
    }
  }
  const legend = doc.get("legend", true);
  if (isMap(legend)) legend.items.forEach((pair) => flow(pair.value));
  return doc.toString({ lineWidth: 0 });
}

/** A level file's text as a draft (see `levelDataToDraft`). Read as YAML 1.1, like the checker, so "yes" and "no" survive. */
export function yamlToDraft(source: string, options: { maxSide?: number; id?: string } = {}): Draft {
  let data: unknown;
  try {
    data = parseYaml(source);
  } catch (error) {
    throw new ImportError(`This isn't readable YAML: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
  return levelDataToDraft(data, options);
}
