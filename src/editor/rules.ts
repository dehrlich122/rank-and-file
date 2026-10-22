// The rules around a board (M4.3): objectives, limits, par, hints and starter code, as views over `draft.extra`.
//
// They are keys of the level file the editor otherwise leaves alone, so a draft keeps them exactly as the file had
// them; these functions read them into something a form can show, and write a change back as the file would say it
// (a default is left out, so a level with no rules still exports without the keys). Nothing here judges a rule: whether
// "collect all" makes sense on a board with no gems is the engine's to say. Items the form doesn't know stay where they were.
import type { Draft } from "./draft";

/** How many of something an objective asks for: nothing, every one, or at least this many. */
export type Count = null | "all" | number;

export interface Objectives {
  reach: boolean; // end the program on the goal
  waypoints: boolean; // listed explicitly (the engine requires the board's waypoints either way)
  say: string[]; // phrases to print
  collect: Count; // gems
  capture: Count; // enemies
  other: unknown[]; // anything else the file lists, kept as it was
}

const DEFAULT_OBJECTIVES = ["reach_goal"];

const isCount = (value: unknown): value is "all" | number => value === "all" || (typeof value === "number" && Number.isInteger(value) && value >= 1);

function withExtra(draft: Draft, key: string, value: unknown): Draft {
  const { [key]: _old, ...rest } = draft.extra;
  return { ...draft, extra: value === undefined ? rest : { ...rest, [key]: value } };
}

// -- objectives --------------------------------------------------------------------------------------------------------

export function readObjectives(draft: Draft): Objectives {
  const items = Array.isArray(draft.extra.objectives) ? draft.extra.objectives : DEFAULT_OBJECTIVES;
  const result: Objectives = { reach: false, waypoints: false, say: [], collect: null, capture: null, other: [] };
  for (const item of items) {
    if (item === "reach_goal") result.reach = true;
    else if (item === "waypoints") result.waypoints = true;
    else if (item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 1) {
      const [[kind, value]] = Object.entries(item) as [[string, unknown]];
      if (kind === "say" && typeof value === "string") result.say.push(value);
      else if ((kind === "collect" || kind === "capture") && isCount(value) && result[kind] === null) result[kind] = value;
      else result.other.push(item);
    } else result.other.push(item);
  }
  return result;
}

/** The draft with these objectives. The default (reach the goal, and nothing else) is written as no key at all. */
export function setObjectives(draft: Draft, objectives: Objectives): Draft {
  const items: unknown[] = [];
  if (objectives.reach) items.push("reach_goal");
  if (objectives.waypoints) items.push("waypoints");
  for (const phrase of objectives.say) items.push({ say: phrase });
  if (objectives.collect !== null) items.push({ collect: objectives.collect });
  if (objectives.capture !== null) items.push({ capture: objectives.capture });
  items.push(...objectives.other);
  const isDefault = items.length === 1 && items[0] === "reach_goal";
  return withExtra(draft, "objectives", isDefault ? undefined : items);
}

// -- limits (the file's `constraints`) ---------------------------------------------------------------------------------

export interface Limits {
  max_lines: number | null;
  max_numbers: number | null;
  min_comments: number;
  require_nodes: string[];
  ban_nodes: string[];
}

const positive = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const names = (value: unknown): string[] => (Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : []);

export function readLimits(draft: Draft): Limits {
  const c = (draft.extra.constraints ?? {}) as Record<string, unknown>;
  return {
    max_lines: positive(c.max_lines),
    max_numbers: positive(c.max_numbers),
    min_comments: positive(c.min_comments) ?? 0,
    require_nodes: names(c.require_nodes),
    ban_nodes: names(c.ban_nodes),
  };
}

/** The draft with some limits changed; a limit that is off (empty, zero, no constructs) isn't written. */
export function setLimits(draft: Draft, change: Partial<Limits>): Draft {
  const old = (draft.extra.constraints && typeof draft.extra.constraints === "object" && !Array.isArray(draft.extra.constraints) ? draft.extra.constraints : {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...old };
  for (const [key, value] of Object.entries(change)) {
    const off = value === null || value === undefined || value === 0 || (Array.isArray(value) && value.length === 0);
    if (off) delete next[key];
    else next[key] = value;
  }
  return withExtra(draft, "constraints", Object.keys(next).length ? next : undefined);
}

// -- par ---------------------------------------------------------------------------------------------------------------

export function readPar(draft: Draft): number | null {
  return positive((draft.extra.par as Record<string, unknown> | undefined)?.lines);
}

/** The draft with this par (lines of code), or none. */
export function setPar(draft: Draft, lines: number | null | undefined): Draft {
  const old = (draft.extra.par && typeof draft.extra.par === "object" && !Array.isArray(draft.extra.par) ? draft.extra.par : {}) as Record<string, unknown>;
  const { lines: _lines, ...rest } = old;
  const next = lines ? { ...rest, lines } : rest;
  return withExtra(draft, "par", Object.keys(next).length ? next : undefined);
}

// -- hints and starter code --------------------------------------------------------------------------------------------

/** The three tiers' texts, "" where there is none. */
export function readHints(draft: Draft): [string, string, string] {
  const hints = Array.isArray(draft.extra.hints) ? draft.extra.hints.map(String) : [];
  return [hints[0] ?? "", hints[1] ?? "", hints[2] ?? ""];
}

/** The draft with these hints. They open one at a time in order, so a tier after an empty one is not kept. */
export function setHints(draft: Draft, tiers: string[]): Draft {
  const kept: string[] = [];
  for (const tier of tiers) {
    if (!tier.trim()) break;
    kept.push(tier);
  }
  return withExtra(draft, "hints", kept.length ? kept : undefined);
}

export const readStarter = (draft: Draft): string => (typeof draft.extra.starter === "string" ? draft.extra.starter : "");

export function setStarter(draft: Draft, code: string): Draft {
  return withExtra(draft, "starter", code.trim() ? code : undefined);
}

// -- the author's solution ---------------------------------------------------------------------------------------------

export const readSolution = (draft: Draft): string => (typeof draft.extra.solution === "string" ? draft.extra.solution : "");

/** The draft keeping this code as the level's solution; null or blank code takes it away. */
export function setSolution(draft: Draft, code: string | null): Draft {
  return withExtra(draft, "solution", code?.trim() ? code : undefined);
}
