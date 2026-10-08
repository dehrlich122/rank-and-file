// Draft <-> level file (M4.2). The editor reads and writes the same YAML as `levels/`
// (docs/ARCHITECTURE.md); nothing here is editor-only. Importing never judges a level (the engine does,
// through `loadLevel`): it only fails when a file can't be held as a draft at all, e.g. a map symbol
// with no meaning. Keys the editor doesn't edit are kept in `draft.extra` and written back as they were.
import { Document, isMap, isSeq, parse } from "yaml";
import type { Clock, Facing, Pos, TileKind } from "../py/protocol";
import { DETAIL_KEYS, floorCell, newId, parseSquare, squareName, type Cell, type Draft, type DraftEnemy } from "./draft";

type LevelData = Record<string, unknown>;

/** A file that can't become a draft; the message says why, in words for the player. */
export class ImportError extends Error {}

const EDITED_KEYS = ["id", "title", "trains", "brief", "piece", "map", "legend", "enemies", "start", "api"];
const FACINGS: Facing[] = ["north", "east", "south", "west"];
const ENEMY_KINDS = ["patrol", "chaser", "rook", "bishop"];
const ENEMY_KEYS = new Set(["kind", "start", "route", "loop", "clock", "armoured", "strategy"]);
const BUILTIN = new Set([".", "#", "P", "G", "?"]);

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

// -- import -------------------------------------------------------------------------------------------

/** A level's parsed YAML as a draft. `options.id` replaces the file's id (a copy needs its own). */
export function levelDataToDraft(data: unknown, options: { maxSide?: number; id?: string } = {}): Draft {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ImportError("A level is a set of keys and values, like title: and map:.");
  const file = data as LevelData;
  if (typeof file.map !== "string" || !file.map.trim()) throw new ImportError("This level has no map.");
  const legend = record(file.legend);
  const meaning = (symbol: string): Cell => {
    if (symbol === ".") return floorCell();
    if (symbol === "#") return { tile: "wall" };
    if (BUILTIN.has(symbol)) return floorCell(); // the start, the goal and ? are floor
    const raw = legend[symbol];
    if (raw === undefined) throw new ImportError(`The map uses ${symbol}, which the legend doesn't explain.`);
    const entry = typeof raw === "string" ? { tile: raw } : record(raw);
    const cell: Cell = { tile: entry.tile as TileKind, symbol };
    if (typeof entry.tile !== "string") throw new ImportError(`The legend entry for ${symbol} has no tile.`);
    for (const [key, value] of Object.entries(entry)) {
      if (key === "tile") continue;
      if (!(DETAIL_KEYS as readonly string[]).includes(key)) throw new ImportError(`The legend entry for ${symbol} has ${key}, which the editor can't keep.`);
      (cell as unknown as Record<string, unknown>)[key] = value;
    }
    return cell;
  };

  const rows = file.map
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.trim().split(/\s+/));
  const width = rows[0]!.length;
  const height = rows.length;
  if (rows.some((row) => row.length !== width)) throw new ImportError("Every row of the map must have the same number of squares.");
  if (options.maxSide !== undefined && Math.max(width, height) > options.maxSide) throw new ImportError(`A board is at most ${options.maxSide} squares along each side; this one is ${width} by ${height}.`);

  const cells: Cell[][] = Array.from({ length: height }, () => []);
  let start: Pos | null = null;
  let goal: Pos | null = null;
  const spots: Pos[] = [];
  rows.forEach((row, i) => {
    const y = height - 1 - i;
    row.forEach((symbol, x) => {
      cells[y]![x] = meaning(symbol);
      if (symbol === "P") {
        if (start) throw new ImportError("The map has more than one start square (P).");
        start = [x, y];
      } else if (symbol === "G") {
        if (goal) throw new ImportError("The map has more than one goal square (G).");
        goal = [x, y];
      } else if (symbol === "?") spots.push([x, y]);
    });
  });
  if (!start) throw new ImportError("The map needs a start square (P).");

  const begin = record(file.start);
  const facing = begin.facing ?? "north";
  if (!FACINGS.includes(facing as Facing)) throw new ImportError("The start must face north, east, south or west.");
  const planks = begin.planks ?? 0;
  if (typeof planks !== "number") throw new ImportError("The planks to start with must be a number.");

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(file)) if (!EDITED_KEYS.includes(key) || key === "legend") extra[key] = value;

  return {
    id: options.id ?? (text(file.id) || newId()),
    title: text(file.title, "Untitled level"),
    brief: text(file.brief),
    trains: text(file.trains),
    piece: text(file.piece, "pawn"),
    width,
    height,
    cells,
    start,
    facing: facing as Facing,
    planks,
    goal,
    spots,
    enemies: (Array.isArray(file.enemies) ? file.enemies : []).map(importEnemy),
    api: Array.isArray(file.api) ? file.api.map(String) : [],
    extra,
  };
}

function importEnemy(item: unknown, index: number): DraftEnemy {
  const where = `Enemy ${index + 1}`;
  const enemy = record(item);
  if (!ENEMY_KINDS.includes(enemy.kind as string)) throw new ImportError(`${where}: its kind must be patrol, chaser, rook or bishop.`);
  for (const key of Object.keys(enemy)) if (!ENEMY_KEYS.has(key)) throw new ImportError(`${where} has ${key}, which the editor can't keep.`);
  const square = (name: unknown): Pos => parseSquare(name) ?? fail(`${where}: ${JSON.stringify(name)} isn't a square; squares are named like b4.`);
  const route = enemy.route === undefined ? undefined : (Array.isArray(enemy.route) ? enemy.route : fail(`${where}: its route must be a list of squares.`)).map(square);
  const start = enemy.start !== undefined ? square(enemy.start) : (route?.[0] ?? fail(`${where}: it needs a start square.`));
  const result: DraftEnemy = { kind: enemy.kind as DraftEnemy["kind"], start };
  if (route) result.route = route;
  if (enemy.loop !== undefined) result.loop = enemy.loop as boolean;
  if (enemy.clock !== undefined) result.clock = enemy.clock as Clock;
  if (enemy.armoured !== undefined) result.armoured = enemy.armoured as boolean;
  if (enemy.strategy !== undefined) result.strategy = enemy.strategy as string;
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
  const details = DETAIL_KEYS.filter((key) => cell[key] !== undefined);
  return details.length ? { tile: cell.tile, ...Object.fromEntries(details.map((key) => [key, cell[key]])) } : cell.tile;
}

const keyOf = (entry: unknown): string => {
  const normal = typeof entry === "string" ? { tile: entry } : record(entry);
  return JSON.stringify(Object.keys(normal).sort().map((key) => [key, normal[key]]));
};

/** Every symbol a map text uses (split on spaces). */
const symbolsIn = (map: unknown): string[] => (typeof map === "string" ? map.split(/\s+/).filter(Boolean) : []);

export interface ExportedLevel {
  data: LevelData;
  /** The squares each legend symbol stands for, by name, so a problem the engine places at a symbol can be put on its squares. */
  squares: Record<string, string[]>;
}

/** The draft in the level file's shape, ready for `loadLevel` or for YAML. */
export function draftToLevelData(draft: Draft): ExportedLevel {
  const oldLegend = record(draft.extra.legend);
  const { legend: _legend, ...extra } = draft.extra;
  // symbols other boards (variants) use mean what the file said; the editor keeps clear of them
  const reserved = new Set((Array.isArray(extra.variants) ? extra.variants : []).flatMap((variant) => symbolsIn(record(variant).map)).filter((symbol) => symbol in oldLegend));
  const taken = new Set<string>([...BUILTIN, ...reserved]);
  const bound = new Map<string, string>(); // an entry's key -> its symbol
  const legend: Record<string, unknown> = {};
  for (const symbol of reserved) {
    legend[symbol] = oldLegend[symbol];
    if (!bound.has(keyOf(oldLegend[symbol]))) bound.set(keyOf(oldLegend[symbol]), symbol);
  }
  const squares: Record<string, string[]> = {};

  const symbolFor = (cell: Cell): string => {
    if (cell.tile === "floor") return ".";
    if (cell.tile === "wall") return "#";
    const entry = entryOf(cell);
    const key = keyOf(entry);
    let symbol = bound.get(key);
    if (!symbol) {
      const candidates = [cell.symbol, PREFERRED[cell.tile], ...POOL];
      symbol = candidates.find((c): c is string => c !== undefined && !taken.has(c)) ?? fail("This board uses more different squares than the editor has symbols for.");
      taken.add(symbol);
      bound.set(key, symbol);
      legend[symbol] = entry;
    }
    return symbol;
  };

  const same = (a: Pos | null, x: number, y: number) => a !== null && a[0] === x && a[1] === y;
  const rows: string[] = [];
  for (let y = draft.height - 1; y >= 0; y--) {
    rows.push(
      draft.cells[y]!.map((cell, x) => {
        if (same(draft.start, x, y)) return "P";
        if (same(draft.goal, x, y)) return "G";
        if (draft.spots.some((spot) => same(spot, x, y))) return "?";
        const symbol = symbolFor(cell);
        if (symbol !== "." && symbol !== "#") (squares[symbol] ??= []).push(squareName([x, y]));
        return symbol;
      }).join(" "),
    );
  }

  const data: LevelData = { id: draft.id, title: draft.title };
  if (draft.trains) data.trains = draft.trains;
  if (draft.brief) data.brief = draft.brief;
  data.piece = draft.piece;
  data.map = `${rows.join("\n")}\n`;
  if (Object.keys(legend).length) data.legend = legend;
  if (draft.enemies.length) data.enemies = draft.enemies.map(exportEnemy);
  data.start = draft.planks ? { facing: draft.facing, planks: draft.planks } : { facing: draft.facing };
  data.api = draft.api;
  Object.assign(data, extra);
  return { data, squares };
}

function exportEnemy(enemy: DraftEnemy): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: enemy.kind };
  const first = enemy.route?.[0];
  if (!first || first[0] !== enemy.start[0] || first[1] !== enemy.start[1]) out.start = squareName(enemy.start);
  if (enemy.route) out.route = enemy.route.map(squareName);
  if (enemy.loop !== undefined) out.loop = enemy.loop;
  if (enemy.clock !== undefined) out.clock = enemy.clock;
  if (enemy.armoured !== undefined) out.armoured = enemy.armoured;
  if (enemy.strategy !== undefined) out.strategy = enemy.strategy;
  return out;
}

// -- YAML -----------------------------------------------------------------------------------------------

/** YAML 1.1, the way the engine's checker and `content.ts` read level files, so "yes" and "no" survive. */
export const parseLevelYaml = (source: string): unknown => parse(source, { version: "1.1" });

/** The draft as a level file's text: the map as a block, and each enemy, legend entry and the start on one line. */
export function draftToYaml(draft: Draft): string {
  const { data } = draftToLevelData(draft);
  const doc = new Document(data, { version: "1.1" });
  const flow = (node: unknown) => {
    if (isMap(node)) node.flow = true;
  };
  flow(doc.get("start", true));
  const enemies = doc.get("enemies", true);
  if (isSeq(enemies)) enemies.items.forEach(flow);
  const legend = doc.get("legend", true);
  if (isMap(legend)) legend.items.forEach((pair) => flow(pair.value));
  return doc.toString({ lineWidth: 0 });
}

/** A level file's text as a draft (see `levelDataToDraft`). */
export function yamlToDraft(source: string, options: { maxSide?: number; id?: string } = {}): Draft {
  let data: unknown;
  try {
    data = parseLevelYaml(source);
  } catch (error) {
    throw new ImportError(`This isn't readable YAML: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
  return levelDataToDraft(data, options);
}
