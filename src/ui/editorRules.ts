// The level editor's Rules and Hints tabs (M4.3): what the player has to do, the limits on their code, par, the
// starter code, and the author's hints. Like the other tabs it builds plain DOM from the draft and reports every change
// through `ctx.change`; it judges nothing (the engine does, and what the player will read comes from it).
//
// Every change is an update of the draft as it is *now* (not the draft the panel was drawn from), and a control that
// changes what another shows (a radio and its number, a hint and the one after it) updates that itself, so the panel
// is only rebuilt for adding and removing a phrase, and a field being typed in never loses its focus.
import { readHints, readLimits, readObjectives, readPar, readSolution, readStarter, setHints, setLimits, setObjectives, setPar, setSolution, setStarter, type Count, type Objectives } from "../editor/rules";
import { h } from "./dom";
import { check, counter, field, numberInput, radio, textArea, textInput } from "./editorFields";
import type { PropsContext } from "./editorProps";

// -- the Rules tab -----------------------------------------------------------------------------------------------------

export function rulesFields(ctx: PropsContext): HTMLElement {
  return h("div", { class: "props-body" }, goalSection(ctx), limitsSection(ctx), parSection(ctx), h("section", { class: "rules-section" }, h("h3", {}, "What the player will read"), readAloud(ctx)));
}

function goalSection(ctx: PropsContext): HTMLElement {
  const objectives = readObjectives(ctx.draft);
  const edit = (change: (current: Objectives) => Partial<Objectives>, burst?: string, redraw?: boolean) =>
    ctx.change((d) => {
      const current = readObjectives(d);
      return setObjectives(d, { ...current, ...change(current) });
    }, burst, redraw);
  const phrases = objectives.say.map((phrase, i) =>
    h(
      "div",
      { class: "phrase" },
      textInput(phrase, (text) => edit((o) => ({ say: o.say.map((old, j) => (j === i ? text : old)) })), { "aria-label": `Phrase ${i + 1} to say` }),
      h("button", { class: "btn btn-small", "aria-label": `Remove phrase ${i + 1}`, onClick: () => edit((o) => ({ say: o.say.filter((_, j) => j !== i) }), undefined, true) }, "×"),
    ),
  );
  const counted = (label: string, group: "collect" | "capture") => {
    const value = objectives[group];
    const number = numberInput(typeof value === "number" ? value : undefined, 1, (n) => edit(() => ({ [group]: n ?? 1 })));
    number.disabled = typeof value !== "number";
    const choose = (next: Count) => {
      number.disabled = typeof next !== "number";
      number.value = typeof next === "number" ? String(next) : "";
      edit(() => ({ [group]: next }));
    };
    return h(
      "div",
      { class: "choice-row" },
      h("span", { class: "field-label" }, label),
      radio(group, "none", value === null, () => choose(null)),
      radio(group, "all", value === "all", () => choose("all")),
      radio(group, "at least", typeof value === "number", () => choose(1)),
      number,
    );
  };
  return h(
    "section",
    { class: "rules-section", "data-field": "objectives" },
    h("h3", {}, "The goal"),
    check("Reach the goal", objectives.reach, (reach) => edit(() => ({ reach }))),
    ...phrases,
    h("button", { class: "btn btn-small", onClick: () => edit((o) => ({ say: [...o.say, "Hello"] }), undefined, true) }, "+ Say a phrase"),
    counted("Collect gems", "collect"),
    counted("Capture enemies", "capture"),
    h("p", { class: "muted small" }, "Waypoints on the board always have to be crossed."),
  );
}

function limitsSection(ctx: PropsContext): HTMLElement {
  const { options } = ctx;
  const limits = readLimits(ctx.draft);
  const construct = (key: "require_nodes" | "ban_nodes", title: string) => {
    const summary = h("summary", {}, `${title} (${limits[key].length})`);
    const boxes = options.constructs.map(({ node, label }) => check(label, limits[key].includes(node), () => toggled()));
    const list = h("div", { class: "construct-list" }, ...boxes);
    const toggled = () => {
      const chosen = options.constructs.filter((_, i) => boxes[i]!.querySelector("input")!.checked).map((c) => c.node);
      summary.textContent = `${title} (${chosen.length})`;
      ctx.change((d) => setLimits(d, { [key]: chosen }));
    };
    return h("details", { open: limits[key].length > 0 }, summary, list);
  };
  const number = (value: number | null, on: (n: number | undefined) => void) => numberInput(value ?? undefined, 1, on);
  return h(
    "section",
    { class: "rules-section", "data-field": "constraints" },
    h("h3", {}, "Limits"),
    h(
      "div",
      { class: "field-row" },
      field("Most lines of code", number(limits.max_lines, (n) => ctx.change((d) => setLimits(d, { max_lines: n ?? null }), "max_lines"))),
      field("Most numbers", number(limits.max_numbers, (n) => ctx.change((d) => setLimits(d, { max_numbers: n ?? null }), "max_numbers")), "1 means one number, written once."),
    ),
    field("Comments required", numberInput(limits.min_comments || undefined, 0, (n) => ctx.change((d) => setLimits(d, { min_comments: n ?? 0 }), "min_comments"))),
    construct("require_nodes", "Must use"),
    construct("ban_nodes", "Not allowed"),
  );
}

function parSection(ctx: PropsContext): HTMLElement {
  const { draft, options } = ctx;
  const starter = textArea(readStarter(draft), 3, (code) => ctx.change((d) => setStarter(d, code), "starter"));
  const par = readPar(draft);
  const lines = readSolution(draft) ? ctx.solutionLines : null;
  return h(
    "section",
    { class: "rules-section" },
    h("h3", {}, "Par and starter code"),
    field("Par (lines of code)", numberInput(par ?? undefined, 1, (n) => ctx.change((d) => setPar(d, n), "par")), "Meeting it earns the second star.", "par"),
    lines !== null && lines !== par ? h("button", { class: "btn btn-small", onClick: () => ctx.change((d) => setPar(d, lines), undefined, true) }, `Use my solution's ${lines} lines`) : null,
    solutionBlock(ctx),
    h("div", { class: "field", "data-field": "starter" }, h("span", { class: "field-label" }, "Starter code"), starter, counter(starter, options.limits.starter ?? 2000), h("span", { class: "muted small" }, "What the player's editor begins with. Optional.")),
  );
}

/** The solution the author kept in test-play, with its length as the engine counts it. */
function solutionBlock(ctx: PropsContext): HTMLElement {
  const kept = readSolution(ctx.draft) !== "";
  return h(
    "div",
    { class: "field", "data-field": "solution" },
    h("span", { class: "field-label" }, "Your solution"),
    kept
      ? h(
          "div",
          { class: "field-row" },
          h("span", {}, ctx.solutionLines === null ? "Kept: counting…" : `Kept: ${ctx.solutionLines} ${ctx.solutionLines === 1 ? "line" : "lines"}`),
          h("button", { class: "btn btn-small", onClick: () => ctx.change((d) => setSolution(d, null), undefined, true) }, "Remove"),
        )
      : h("span", { class: "muted small" }, "Solve the level in test-play and press \"Keep this as the level's solution\". Players are offered it after three failed runs."),
  );
}

/** The goals, rules and stars as the player will read them, worded by the engine. Redrawn whenever its verdict arrives. */
export function readAloud(ctx: PropsContext): HTMLElement {
  const { info } = ctx;
  if (!info) return h("div", { class: "rules-read" }, h("p", { class: "muted small" }, ctx.checking ? "Checking the level…" : "Once the engine accepts the level, what the player will read appears here."));
  const group = (title: string, items: string[]) => (items.length ? [h("h4", { class: "muted small" }, title), h("ul", { class: "read-aloud small" }, ...items.map((item) => h("li", {}, item)))] : []);
  return h("div", { class: "rules-read" }, ...group("Goal", info.goals), ...group("Rules", info.rules), ...group("Stars", info.stars));
}

// -- the Hints tab -----------------------------------------------------------------------------------------------------

const TIERS = [
  ["A nudge", "Where to look, without saying what to do."],
  ["How it works, in words", "Explain the idea. Don't tell the player to wait or turn on the spot."],
  ["Show the code", "A partial example, on a different board if you can."],
] as const;

export function hintsFields(ctx: PropsContext): HTMLElement {
  const limit = ctx.options.limits.hint ?? 600;
  const tiers = readHints(ctx.draft);
  const areas: HTMLTextAreaElement[] = [];
  const notes: HTMLElement[] = [];
  // a hint opens only after the one before it, so a tier waits until the one above has words
  const sync = () =>
    TIERS.forEach(([, about], i) => {
      const waiting = i > 0 && !areas[i - 1]!.value.trim();
      areas[i]!.disabled = waiting;
      notes[i]!.textContent = waiting ? `Write hint ${i} first: hints open in order.` : about;
    });
  // the words on screen are the source: a hint after an empty one isn't kept in the draft, but stays here until it can be
  const edit = (i: number) => {
    sync();
    ctx.change((d) => setHints(d, areas.map((area) => area.value)), `hint:${i}`);
  };
  const rows = TIERS.map(([title, about], i) => {
    const area = textArea(tiers[i]!, 3, () => edit(i));
    const note = h("span", { class: "muted small" }, about);
    areas.push(area);
    notes.push(note);
    return h("div", { class: "field" }, h("span", { class: "field-label" }, `${i + 1}. ${title}`), area, counter(area, limit), note);
  });
  sync();
  return h("div", { class: "props-body", "data-field": "hints" }, h("p", { class: "muted small hints-note" }, "Players open hints one at a time. Opening the first costs the level's third star. Put code in `backticks`."), ...rows);
}
