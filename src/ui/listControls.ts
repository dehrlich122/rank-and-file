// The row of filters and sort above a Free Play list (M4.4), and the small things the lists' rows share.
import { h } from "./dom";
import { DIFFICULTY_WORDS, tierLabel } from "./tags";

export interface ListState {
  /** null = any */
  tier: string | null;
  /** 1-5, null = any */
  difficulty: number | null;
  sort: "order" | "easiest" | "hardest";
}

const SORTS: Array<[ListState["sort"], string]> = [
  ["order", "In order"],
  ["easiest", "Easiest first"],
  ["hardest", "Hardest first"],
];

// Remembered per list for this visit only; nothing is stored.
const remembered = new Map<string, ListState>();

/** Filter by tier and difficulty, then sort. Stable; an item without a difficulty goes last in both sorts. */
export function applyList<T>(items: T[], state: ListState, read: (item: T) => { tier: string | null; difficulty: number | null }): T[] {
  const kept = items.filter((item) => {
    const { tier, difficulty } = read(item);
    return (state.tier === null || tier === state.tier) && (state.difficulty === null || difficulty === state.difficulty);
  });
  if (state.sort === "order") return kept;
  const sign = state.sort === "easiest" ? 1 : -1;
  return kept.sort((a, b) => {
    const x = read(a).difficulty;
    const y = read(b).difficulty;
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return sign * (x - y);
  });
}

function pick(label: string, options: Array<[string, string]>, current: string, onPick: (value: string) => void): { label: HTMLElement; select: HTMLSelectElement } {
  const select = h(
    "select",
    { onChange: () => onPick(select.value) },
    ...options.map(([value, text]) => h("option", { value, selected: value === current }, text)),
  );
  return { label: h("label", {}, label, select), select };
}

/**
 * The filter and sort row of the list `listId`: Tier and Difficulty filters, then Sort on the right, remembered for
 * this visit. `onChange` runs after each change, to redraw the list from `state()`.
 */
export function listControls(listId: string, tiers: string[], onChange: () => void): { element: HTMLElement; state: () => ListState; show: (on: boolean) => void; clear: () => void } {
  let state: ListState = remembered.get(listId) ?? { tier: null, difficulty: null, sort: "order" };
  const set = (change: Partial<ListState>): void => {
    state = { ...state, ...change };
    remembered.set(listId, state);
    onChange();
  };
  const any: [string, string] = ["", "Any"];
  const tier = pick("Tier", [any, ...tiers.map((t): [string, string] => [t, tierLabel(t)])], state.tier ?? "", (v) => set({ tier: v === "" ? null : v }));
  const difficulty = pick("Difficulty", [any, ...DIFFICULTY_WORDS.map((w, i): [string, string] => [String(i + 1), w])], state.difficulty === null ? "" : String(state.difficulty), (v) =>
    set({ difficulty: v === "" ? null : Number(v) }),
  );
  const sort = pick("Sort", SORTS, state.sort, (v) => set({ sort: v as ListState["sort"] }));
  const element = h("div", { class: "list-controls-host" }, h("div", { class: "list-controls" }, tier.label, difficulty.label, h("span", { class: "grow" }), sort.label));
  return {
    element,
    state: () => state,
    /** The row is there only while its list has something in it (QA-049). */
    show: (on) => void (element.hidden = !on),
    /** Tier and Difficulty back to any; the sort stays. */
    clear: () => {
      tier.select.value = "";
      difficulty.select.value = "";
      set({ tier: null, difficulty: null });
    },
  };
}

/** What a list says when its filters leave nothing, with the way out. */
export const noMatchRow = (clear: () => void): HTMLElement =>
  h("li", { class: "muted" }, "No levels match these filters. ", h("button", { class: "btn btn-small", onClick: clear }, "Clear filters"));

/** A level's stars as a list row shows them: "★★☆", or "not solved yet". */
export const starsText = (stars: number): string => (stars > 0 ? "★".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars)) : "not solved yet");
export const boardsText = (boards: number): string => `${boards} ${boards === 1 ? "board" : "boards"}`;
