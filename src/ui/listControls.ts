// The row of filters and sort above a Free Play list (M4.4). Pure state plus a small view.
import { h } from "./dom";
import { DIFFICULTY_WORDS, tierName } from "./tags";

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

export function listState(listId: string): ListState {
  return { ...(remembered.get(listId) ?? { tier: null, difficulty: null, sort: "order" }) };
}

export function saveListState(listId: string, state: ListState): void {
  remembered.set(listId, { ...state });
}

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

function pick(label: string, options: Array<[string, string]>, current: string, onPick: (value: string) => void): HTMLElement {
  const select = h(
    "select",
    { onChange: () => onPick(select.value) },
    ...options.map(([value, text]) => h("option", { value, selected: value === current }, text)),
  );
  return h("label", {}, label, select);
}

/** The row: Tier and Difficulty filters, then Sort on the right. `onChange` gets the whole next state. */
export function listControls(tiers: string[], state: ListState, onChange: (next: ListState) => void): HTMLElement {
  const any: [string, string] = ["", "Any"];
  const tierOptions = tiers.map((t): [string, string] => [t, tierName(t)]);
  const difficultyOptions = DIFFICULTY_WORDS.map((w, i): [string, string] => [String(i + 1), w]);
  return h(
    "div",
    { class: "list-controls" },
    pick("Tier", [any, ...tierOptions], state.tier ?? "", (v) => onChange({ ...state, tier: v === "" ? null : v })),
    pick("Difficulty", [any, ...difficultyOptions], state.difficulty === null ? "" : String(state.difficulty), (v) =>
      onChange({ ...state, difficulty: v === "" ? null : Number(v) }),
    ),
    h("span", { class: "grow" }),
    pick("Sort", SORTS, state.sort, (v) => onChange({ ...state, sort: v as ListState["sort"] })),
  );
}
