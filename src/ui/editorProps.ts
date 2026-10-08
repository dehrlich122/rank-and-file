// The level editor's properties panel (M4.2): the Level, Square and Enemy tabs, and the Problems list.
// It builds plain DOM from the draft, and reports every change through `change`; it never judges anything
// (the engine does, and its problem arrives here already placed).
import { squareName, type Cell, type Draft, type DraftEnemy } from "../editor/draft";
import { removeCorner, removeEnemy } from "../editor/edit";
import type { Problem } from "../editor/problems";
import type { Clock, EditorOptions, Pos } from "../py/protocol";
import { h } from "./dom";

export type Selection = { kind: "square"; pos: Pos } | { kind: "enemy"; index: number } | null;
export type Tab = "level" | "square" | "enemy";

export interface PropsContext {
  draft: Draft;
  options: EditorOptions;
  selection: Selection;
  tab: Tab;
  problem: Problem | null;
  checking: boolean; // the problem shown is for an older draft
  change(next: Draft, burst?: string): void; // a change made in the panel: typing in a field is one undo step
  select(selection: Selection): void;
  say(text: string): void;
  setTab(tab: Tab): void;
  goTo(problem: Problem): void;
}

const TABS: Array<[Tab, string]> = [
  ["level", "Level"],
  ["square", "Square"],
  ["enemy", "Enemy"],
];

export function renderProps(ctx: PropsContext): HTMLElement {
  const tabs = h(
    "div",
    { class: "tabs", role: "tablist", "aria-label": "Properties" },
    ...TABS.map(([id, label]) =>
      h("button", { class: `tab${ctx.tab === id ? " active" : ""}`, role: "tab", "aria-selected": String(ctx.tab === id), onClick: () => ctx.setTab(id) }, label),
    ),
  );
  const body = ctx.tab === "level" ? levelFields(ctx) : ctx.tab === "square" ? squareFields(ctx) : enemyFields(ctx);
  return h("div", { class: "props" }, tabs, h("div", { class: "props-scroll", role: "tabpanel" }, body, problems(ctx)));
}

// -- fields -------------------------------------------------------------------------------------------------

const field = (label: string, control: HTMLElement, note?: string, name?: string) =>
  h("label", { class: "field", "data-field": name }, h("span", { class: "field-label" }, label), control, note ? h("span", { class: "muted small" }, note) : null);

function textInput(value: string, on: (value: string) => void, attrs: Record<string, string> = {}): HTMLInputElement {
  const input = h("input", { type: "text", value, ...attrs });
  input.addEventListener("input", () => on(input.value));
  return input;
}

function textArea(value: string, rows: number, on: (value: string) => void): HTMLTextAreaElement {
  const area = h("textarea", { rows: String(rows) }, value);
  area.addEventListener("input", () => on(area.value));
  return area;
}

function numberInput(value: number | undefined, min: number, on: (value: number | undefined) => void): HTMLInputElement {
  const input = h("input", { type: "number", min: String(min), value: value === undefined ? "" : String(value) });
  input.addEventListener("input", () => on(input.value === "" ? undefined : Number(input.value)));
  return input;
}

function select(value: string, choices: string[], on: (value: string) => void): HTMLSelectElement {
  const box = h("select", {}, ...choices.map((choice) => h("option", { value: choice, selected: choice === value }, choice)));
  box.addEventListener("change", () => on(box.value));
  return box;
}

function check(label: Node | string, on: boolean, change: (on: boolean) => void): HTMLElement {
  const input = h("input", { type: "checkbox", checked: on });
  input.addEventListener("change", () => change(input.checked));
  return h("label", { class: "check" }, input, label);
}

// -- the Level tab ----------------------------------------------------------------------------------------------

function levelFields(ctx: PropsContext): HTMLElement {
  const { draft, options } = ctx;
  const abilities = options.pieces[draft.piece] ?? [];
  return h(
    "div",
    { class: "props-body" },
    field("Title", textInput(draft.title, (title) => ctx.change({ ...draft, title }, "title")), undefined, "title"),
    field("Brief", textArea(draft.brief, 3, (brief) => ctx.change({ ...draft, brief }, "brief")), "What the player is asked to do.", "brief"),
    field("What it trains", textInput(draft.trains, (trains) => ctx.change({ ...draft, trains }, "trains")), "A few words, shown above the challenge.", "trains"),
    h(
      "fieldset",
      { class: "field", "data-field": "api" },
      h("legend", { class: "field-label" }, "The pawn can"),
      h(
        "div",
        { class: "checks" },
        ...abilities.map((name) =>
          check(h("code", {}, name), draft.api.includes(name), (on) => ctx.change({ ...draft, api: abilities.filter((a) => (a === name ? on : draft.api.includes(a))) })),
        ),
      ),
    ),
    h(
      "div",
      { class: "field-row" },
      field("Starts facing", select(draft.facing, options.facings, (facing) => ctx.change({ ...draft, facing: facing as Draft["facing"] })), undefined, "start"),
      field("Planks to start with", numberInput(draft.planks, 0, (planks) => ctx.change({ ...draft, planks: planks ?? 0 }, "planks"))),
    ),
  );
}

// -- the Square tab ------------------------------------------------------------------------------------------------

const DETAIL_LABELS: Record<string, Record<string, string>> = {
  sign: { text: "Words on the sign" },
  rune: { text: "What the rune says" },
  gate: { passphrase: "The answer that opens it", question: "What the guard asks (optional)" },
  timed_gate: { every: "Opens and shuts every … ticks", open: "Open for … of those ticks", clock: "Ticks with" },
};
const DETAIL_ORDER = ["text", "passphrase", "question", "every", "open", "clock"];
const DETAIL_NOTES: Record<string, string> = {
  text: "Shown before the run, and read by the pawn.",
  passphrase: "Printing exactly this next to the gate opens it. It is never shown to the player.",
  question: "Leave empty and the guard simply waits for the passphrase.",
};

function squareFields(ctx: PropsContext): HTMLElement {
  const { draft, options, selection } = ctx;
  if (selection?.kind !== "square") return h("div", { class: "props-body" }, h("p", { class: "muted" }, "Choose the Select tool and click a square to see what can be set on it."));
  const [x, y] = selection.pos;
  const cell = draft.cells[y]?.[x];
  if (!cell) return h("div", { class: "props-body" }, h("p", { class: "muted" }, "That square is off the board now."));
  const rule = options.tiles[cell.tile] ?? { needs: [], may: [] };
  const keys = [...rule.needs, ...rule.may].sort((a, b) => DETAIL_ORDER.indexOf(a) - DETAIL_ORDER.indexOf(b));
  const set = (key: keyof Cell, value: string | number | undefined, burst?: string) => {
    const next: Cell = { ...cell };
    if (value === undefined || (value === "" && rule.may.includes(key))) delete next[key];
    else (next as unknown as Record<string, unknown>)[key] = value;
    ctx.change({ ...draft, cells: draft.cells.map((row, rowY) => (rowY === y ? row.map((old, colX) => (colX === x ? next : old)) : row)) }, burst ?? `square:${squareName(selection.pos)}:${key}`);
  };
  const controls = keys.map((key) => {
    const label = DETAIL_LABELS[cell.tile]?.[key] ?? key;
    const k = key as keyof Cell;
    const value = cell[k];
    if (key === "every" || key === "open") return field(label, numberInput(value as number | undefined, 1, (n) => set(k, n)), undefined, key);
    if (key === "clock") return field(label, select((value as string | undefined) ?? options.timed_gate.clock, options.clocks, (c) => set(k, c as Clock)), undefined, key);
    if (key === "text") return field(label, textArea((value as string | undefined) ?? "", 3, (t) => set(k, t)), DETAIL_NOTES[key], key);
    return field(label, textInput((value as string | undefined) ?? "", (t) => set(k, t)), DETAIL_NOTES[key], key);
  });
  return h(
    "div",
    { class: "props-body" },
    h("p", { class: "props-what" }, h("strong", {}, squareName(selection.pos)), ` · ${cell.tile.replace("_", " ")}`),
    ...(controls.length ? controls : [h("p", { class: "muted" }, "Nothing else can be set on this one.")]),
  );
}

// -- the Enemy tab --------------------------------------------------------------------------------------------------

function enemyFields(ctx: PropsContext): HTMLElement {
  const { draft, options, selection } = ctx;
  const index = selection?.kind === "enemy" ? selection.index : -1;
  const enemy = draft.enemies[index];
  if (!enemy) return h("div", { class: "props-body" }, h("p", { class: "muted" }, "Choose the Select tool and click an enemy to change it, or pick an enemy from the palette and click a square to add one."));
  const keys = options.enemies[enemy.kind] ?? [];
  const update = (next: DraftEnemy, burst?: string) => ctx.change({ ...draft, enemies: draft.enemies.map((old, i) => (i === index ? next : old)) }, burst);
  const flag = (key: "loop" | "armoured", label: string) => (keys.includes(key) ? check(label, enemy[key] === true, (on) => update(withoutKey(enemy, key, on ? true : undefined))) : null);
  const route = enemy.route ?? [];
  return h(
    "div",
    { class: "props-body" },
    h("p", { class: "props-what" }, h("strong", {}, `Enemy ${index + 1}`), ` · ${enemy.kind} on ${squareName(enemy.start)}`),
    h(
      "div",
      { class: "field-row" },
      field("Kind", select(enemy.kind, Object.keys(options.enemies), (kind) => update(changeKind(enemy, kind as DraftEnemy["kind"], options)))),
      keys.includes("clock") ? field("Ticks with", select(enemy.clock ?? "action", options.clocks, (clock) => update({ ...enemy, clock: clock as Clock }))) : null,
    ),
    h("div", { class: "checks" }, flag("loop", "Loops round"), flag("armoured", "Armoured (can't be captured)")),
    keys.includes("route")
      ? h(
          "div",
          { class: "field" },
          h("span", { class: "field-label" }, "Route"),
          route.length > 1
            ? h(
                "ol",
                { class: "ed-route" },
                ...route.map((corner, i) =>
                  h(
                    "li",
                    {},
                    h("code", {}, squareName(corner)),
                    i === 0 ? " start" : h("button", { class: "btn btn-small", "aria-label": `Remove the corner on ${squareName(corner)}`, onClick: () => applyEdit(ctx, removeCorner(draft, index, i)) }, "×"),
                  ),
                ),
              )
            : h("p", { class: "muted small" }, "No route: it stands guard."),
          h("p", { class: "muted small" }, "Pick the Route tool and click squares to add corners. A route runs straight along a rank or file."),
        )
      : null,
    h("button", { class: "btn btn-small btn-danger", onClick: () => applyEdit(ctx, removeEnemy(draft, index), { kind: "square", pos: enemy.start }) }, "Remove this enemy"),
  );
}

function applyEdit(ctx: PropsContext, edit: ReturnType<typeof removeEnemy>, then?: Selection): void {
  if ("refused" in edit) return ctx.say(edit.refused);
  ctx.change(edit.draft);
  ctx.say(edit.note);
  if (then) ctx.select(then);
}

/** A copy of the enemy without `key`, or with it set. */
function withoutKey(enemy: DraftEnemy, key: "loop" | "armoured", value: true | undefined): DraftEnemy {
  const next = { ...enemy };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/** Another kind keeps only the keys that kind takes. */
function changeKind(enemy: DraftEnemy, kind: DraftEnemy["kind"], options: EditorOptions): DraftEnemy {
  const takes = new Set(options.enemies[kind] ?? []);
  const next: DraftEnemy = { kind, start: enemy.start };
  for (const key of ["route", "loop", "clock", "armoured", "strategy"] as const) if (takes.has(key) && enemy[key] !== undefined) Object.assign(next, { [key]: enemy[key] });
  return next;
}

// -- problems -------------------------------------------------------------------------------------------------------

function problems(ctx: PropsContext): HTMLElement {
  const { problem } = ctx;
  return h(
    "section",
    { class: "ed-problems", "aria-label": "Problems" },
    h("h3", { class: "pal-title" }, `Problems (${problem ? 1 : 0})`, ctx.checking ? h("span", { class: "muted" }, " · checking…") : null),
    problem
      ? h(
          "ul",
          {},
          h(
            "li",
            {},
            h(
              "button",
              { class: "problem-link", onClick: () => ctx.goTo(problem) },
              h("span", { class: "problem-badge", "aria-hidden": "true" }, "!"),
              h("span", {}, problem.squares[0] ? h("strong", {}, `${squareName(problem.squares[0])} `) : null, problem.message),
            ),
          ),
        )
      : h("p", { class: "muted small" }, "None. The engine accepts this level."),
  );
}
