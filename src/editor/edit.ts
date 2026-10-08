// The editor's changes to a draft (M4.2): paint, erase, place, move, resize. Each is a pure function that gives
// back a new draft, or says why it won't (`refused`), in words the status line can show. None of them judges the
// level: a wall under an enemy is allowed, and the engine's problem list says so (docs/M4/M4.2.md).
import type { Pos, TileKind } from "../py/protocol";
import { capitalise, FACINGS, floorCell, squareName, words, type Cell, type Draft, type DraftEnemy } from "./draft";

export type Edit = { draft: Draft; note: string } | { refused: string };

/** What a new tile starts with, by detail name, so a sign or gate is complete when it's placed. */
const STARTS_WITH: Record<string, string | number> = { text: "Edit me", passphrase: "open sesame", every: 4 };

const samePos = (a: Pos | null | undefined, b: Pos): boolean => !!a && a[0] === b[0] && a[1] === b[1];
const inside = (draft: Draft, [x, y]: Pos): boolean => x >= 0 && y >= 0 && x < draft.width && y < draft.height;

export function enemyAt(draft: Draft, pos: Pos): number {
  return draft.enemies.findIndex((enemy) => samePos(enemy.start, pos));
}

/** What is on a square besides its tile. */
export type Occupant = "start" | "goal" | "spot" | "enemy";
export function occupantOf(draft: Draft, pos: Pos): Occupant | null {
  if (samePos(draft.start, pos)) return "start";
  if (enemyAt(draft, pos) >= 0) return "enemy";
  if (samePos(draft.goal, pos)) return "goal";
  if (draft.spots.some((spot) => samePos(spot, pos))) return "spot";
  return null;
}

/** A square made to hold `cell`; the rest of the board is shared with the old draft. */
export function withCell(draft: Draft, [x, y]: Pos, cell: Cell): Draft {
  return { ...draft, cells: draft.cells.map((row, rowY) => (rowY === y ? row.map((old, colX) => (colX === x ? cell : old)) : row)) };
}

const done = (draft: Draft, note: string): Edit => ({ draft, note });
const refuse = (refused: string): Edit => ({ refused });
const label = (tile: TileKind): string => words(tile);

/** The draft with enemy `index` replaced. */
export function withEnemy(draft: Draft, index: number, enemy: DraftEnemy): Draft {
  return { ...draft, enemies: draft.enemies.map((old, i) => (i === index ? enemy : old)) };
}

/** A new tile of this kind with the details it needs (`needs`: the engine's list, from `editorOptions`). */
export function newCell(tile: TileKind, needs: string[]): Cell {
  const cell: Cell = { tile };
  for (const key of needs) (cell as unknown as Record<string, unknown>)[key] = STARTS_WITH[key] ?? "";
  return cell;
}

// -- the board ------------------------------------------------------------------------------------------

export function paint(draft: Draft, pos: Pos, tile: TileKind, needs: string[]): Edit {
  if (!inside(draft, pos)) return refuse("That's off the board.");
  const old = draft.cells[pos[1]]![pos[0]]!;
  if (tile === "floor") return old.tile === "floor" ? refuse(`${squareName(pos)} is already floor.`) : done(withCell(draft, pos, floorCell()), `Cleared ${squareName(pos)}.`);
  const here = occupantOf(draft, pos);
  if (here === "start" || here === "goal" || here === "spot") return refuse(`The ${here === "spot" ? "hidden goal" : here} is on ${squareName(pos)}: move it first.`);
  if (old.tile === tile) return refuse(`${squareName(pos)} is already a ${label(tile)}.`);
  return done(withCell(draft, pos, newCell(tile, needs)), capitalise(`${label(tile)} on ${squareName(pos)}.`));
}

/** Take away what's on a square: an enemy first, then a goal or hidden-goal mark, then the tile. */
export function erase(draft: Draft, pos: Pos): Edit {
  if (!inside(draft, pos)) return refuse("That's off the board.");
  const name = squareName(pos);
  const enemy = enemyAt(draft, pos);
  if (enemy >= 0) return removeEnemy(draft, enemy);
  if (samePos(draft.goal, pos)) return done({ ...draft, goal: null }, `Took the goal off ${name}.`);
  if (draft.spots.some((spot) => samePos(spot, pos))) return done({ ...draft, spots: draft.spots.filter((spot) => !samePos(spot, pos)) }, `Took the ? off ${name}.`);
  if (samePos(draft.start, pos)) return refuse("The start can't be erased: move it instead.");
  if (draft.cells[pos[1]]![pos[0]]!.tile === "floor") return refuse(`There's nothing on ${name}.`);
  return done(withCell(draft, pos, floorCell()), `Cleared ${name}.`);
}

// -- the start, the goal and hidden-goal squares ---------------------------------------------------------------

/** The start, the goal and ? squares stand on floor: putting one on a tile clears the tile. */
function onFloor(draft: Draft, pos: Pos): Draft {
  return draft.cells[pos[1]]![pos[0]]!.tile === "floor" ? draft : withCell(draft, pos, floorCell());
}

export function placeStart(draft: Draft, pos: Pos): Edit {
  if (!inside(draft, pos)) return refuse("That's off the board.");
  if (samePos(draft.start, pos)) return refuse("The start is already there.");
  if (samePos(draft.goal, pos) || draft.spots.some((spot) => samePos(spot, pos))) return refuse(`${squareName(pos)} is the goal: the start needs another square.`);
  return done({ ...onFloor(draft, pos), start: pos }, `Start on ${squareName(pos)}.`);
}

/** A goal replaces any hidden-goal squares: a level has one or the other. */
export function placeGoal(draft: Draft, pos: Pos): Edit {
  if (!inside(draft, pos)) return refuse("That's off the board.");
  if (samePos(draft.goal, pos)) return refuse("The goal is already there.");
  if (samePos(draft.start, pos)) return refuse(`${squareName(pos)} is the start: the goal needs another square.`);
  const dropped = draft.spots.length ? " The ? squares are gone: a level has a goal or hidden-goal squares, not both." : "";
  return done({ ...onFloor(draft, pos), goal: pos, spots: [] }, `Goal on ${squareName(pos)}.${dropped}`);
}

/** A ? square, which a hidden goal might be on; a second one on the same square takes it away. */
export function toggleSpot(draft: Draft, pos: Pos): Edit {
  if (!inside(draft, pos)) return refuse("That's off the board.");
  if (draft.spots.some((spot) => samePos(spot, pos))) return done({ ...draft, spots: draft.spots.filter((spot) => !samePos(spot, pos)) }, `Took the ? off ${squareName(pos)}.`);
  if (samePos(draft.start, pos)) return refuse(`${squareName(pos)} is the start: a hidden goal needs another square.`);
  const dropped = draft.goal ? " The goal is gone: a level has a goal or hidden-goal squares, not both." : "";
  return done({ ...onFloor(draft, pos), goal: null, spots: [...draft.spots, pos] }, `? on ${squareName(pos)}.${dropped}`);
}

export function rotateStart(draft: Draft): Edit {
  const facing = FACINGS[(FACINGS.indexOf(draft.facing) + 1) % FACINGS.length]!;
  return done({ ...draft, facing }, `The start faces ${facing}.`);
}

// -- enemies ----------------------------------------------------------------------------------------------

export function placeEnemy(draft: Draft, pos: Pos, kind: DraftEnemy["kind"]): Edit {
  if (!inside(draft, pos)) return refuse("That's off the board.");
  if (enemyAt(draft, pos) >= 0) return refuse(`There's already an enemy on ${squareName(pos)}.`);
  return done({ ...draft, enemies: [...draft.enemies, { kind, start: pos }] }, capitalise(`${kind} on ${squareName(pos)}.`));
}

export function removeEnemy(draft: Draft, index: number): Edit {
  const enemy = draft.enemies[index];
  if (!enemy) return refuse("There's no such enemy.");
  return done({ ...draft, enemies: draft.enemies.filter((_, i) => i !== index) }, `Took the ${enemy.kind} off ${squareName(enemy.start)}.`);
}

/** Move an enemy; a patrol takes its whole route along, and stays put if any corner would leave the board. */
export function moveEnemy(draft: Draft, index: number, to: Pos): Edit {
  const enemy = draft.enemies[index];
  if (!enemy) return refuse("There's no such enemy.");
  if (!inside(draft, to)) return refuse("That's off the board.");
  if (samePos(enemy.start, to)) return refuse("It's already there.");
  if (enemyAt(draft, to) >= 0) return refuse(`There's already an enemy on ${squareName(to)}.`);
  const [dx, dy] = [to[0] - enemy.start[0], to[1] - enemy.start[1]];
  const shift = ([x, y]: Pos): Pos => [x + dx, y + dy];
  const route = enemy.route?.map(shift);
  if (route?.some((corner) => !inside(draft, corner))) return refuse("Its route would leave the board.");
  const moved: DraftEnemy = { ...enemy, start: to, ...(route ? { route } : {}) };
  return done(withEnemy(draft, index, moved), `Moved the ${enemy.kind} to ${squareName(to)}.`);
}

/** Add a corner to a patrol's route, in a straight line along a rank or file from the last one. */
export function extendRoute(draft: Draft, index: number, pos: Pos): Edit {
  const enemy = draft.enemies[index];
  if (!enemy) return refuse("Choose a patrol first.");
  if (enemy.kind !== "patrol") return refuse(`Only a patrol walks a route; a ${enemy.kind} doesn't.`);
  if (!inside(draft, pos)) return refuse("That's off the board.");
  const route = enemy.route?.length ? enemy.route : [enemy.start];
  const last = route[route.length - 1]!;
  if (samePos(last, pos)) return refuse("The route is already there.");
  if (last[0] !== pos[0] && last[1] !== pos[1]) return refuse("A route runs straight along a rank or file.");
  return done(withEnemy(draft, index, { ...enemy, route: [...route, pos] }), `Route corner on ${squareName(pos)}.`);
}

/** Drop a corner from a patrol's route (the first corner is where the patrol starts: drop the route to change that). */
export function removeCorner(draft: Draft, index: number, corner: number): Edit {
  const enemy = draft.enemies[index];
  const route = enemy?.route;
  if (!enemy || !route || corner < 1 || corner >= route.length) return refuse("There's no such corner.");
  const rest = route.filter((_, i) => i !== corner);
  const next: DraftEnemy = { ...enemy };
  if (rest.length > 1) next.route = rest;
  else delete next.route; // a patrol with no corner to walk to stands guard
  return done(withEnemy(draft, index, next), "Took a corner off the route.");
}

// -- many squares -------------------------------------------------------------------------------------------

/** Every square in the rectangle between two corners. */
export function rectangle(a: Pos, b: Pos): Pos[] {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return Array.from({ length: (y1 - y0 + 1) * (x1 - x0 + 1) }, (_, i): Pos => [x0 + (i % (x1 - x0 + 1)), y0 + Math.floor(i / (x1 - x0 + 1))]);
}

/** Apply a change to each square in a rectangle, skipping the squares it refuses. */
export function fill(draft: Draft, a: Pos, b: Pos, apply: (draft: Draft, pos: Pos) => Edit): Edit {
  let next = draft;
  let changed = 0;
  for (const pos of rectangle(a, b)) {
    const edit = apply(next, pos);
    if ("refused" in edit) continue;
    next = edit.draft;
    changed++;
  }
  if (!changed) return refuse("Nothing there to change.");
  return done(next, `Changed ${changed} ${changed === 1 ? "square" : "squares"}.`);
}

/** Every tile, enemy and ? square gone; the start and the goal stay where they are. */
export function clearBoard(draft: Draft): Draft {
  return { ...draft, cells: draft.cells.map((row) => row.map(floorCell)), enemies: [], spots: [] };
}

// -- size ---------------------------------------------------------------------------------------------------

/** The board at a new size, from the bottom left: squares are added to the right and the top, and lost from them. `lost` says what a smaller board drops. */
export function resize(draft: Draft, width: number, height: number): { draft: Draft; lost: string[] } {
  const lost: string[] = [];
  const out = ([x, y]: Pos) => x >= width || y >= height;
  const cells = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => draft.cells[y]?.[x] ?? floorCell()));
  const things = draft.cells.flat().filter((cell, i) => cell.tile !== "floor" && out([i % draft.width, Math.floor(i / draft.width)])).length;
  if (things) lost.push(`${things} ${things === 1 ? "square with something on it" : "squares with something on them"}`);
  let start = draft.start;
  if (out(start)) {
    start = [Math.min(start[0], width - 1), Math.min(start[1], height - 1)];
    lost.push(`the start moves to ${squareName(start)}`);
  }
  const goal = draft.goal && out(draft.goal) ? null : draft.goal;
  if (draft.goal && !goal) lost.push(`the goal on ${squareName(draft.goal)}`);
  const spots = draft.spots.filter((spot) => !out(spot));
  if (spots.length < draft.spots.length) lost.push(`${draft.spots.length - spots.length} of the ? squares`);
  const enemies = draft.enemies.filter((enemy) => ![enemy.start, ...(enemy.route ?? [])].some(out));
  for (const enemy of draft.enemies) if (!enemies.includes(enemy)) lost.push(`the ${enemy.kind} on ${squareName(enemy.start)}`);
  return { draft: { ...draft, width, height, cells, start, goal, spots, enemies }, lost };
}
