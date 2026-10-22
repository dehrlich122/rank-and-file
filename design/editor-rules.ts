// M4.3 step 1 (design prototype): the level editor's rules, other boards, the solvability check and sharing.
//   /design/editor-rules.html
// Static: nothing here edits anything. It draws the new pieces with the editor's real classes (src/editor.css)
// around a sample board, in both themes, to judge them before they are built into the game. Dev-only.
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "../src/styles.css";
import "../src/chrome.css";
import "../src/editor.css";
import "./editor-rules.css";
import type { Pos } from "../src/py/protocol";
import { BoardView } from "../src/ui/board";
import { h } from "../src/ui/dom";
import { squareName as name } from "../src/editor/draft";
import { LEVEL } from "../src/ui/styleguideSample";
import { M, S } from "../src/ui/sprites/floor";
import { svg } from "../src/ui/svg";

if (new URLSearchParams(location.search).has("still")) document.documentElement.dataset.still = "";

const node = (n: SVGElement) => n as unknown as Node;
const level = LEVEL;
const CURSOR: Pos = [3, 3];
const corner = ([x, y]: Pos): [number, number] => [M + x * S, (level.height - 1 - y) * S];

// -- the board column ---------------------------------------------------------------------------------

function boardRow(active: number, problemOn?: number): HTMLElement {
  const tab = (n: number) =>
    h(
      "button",
      { class: "board-tab", "aria-pressed": String(n === active) },
      `Board ${n}`,
      n === problemOn ? h("span", { class: "problem-badge", "aria-hidden": "true" }, "!") : null,
      n === problemOn ? h("span", { class: "sr-only" }, " has a problem") : null,
    );
  return h(
    "div",
    { class: "board-row", role: "group", "aria-label": "Boards" },
    h("span", { class: "field-label" }, "Boards"),
    tab(1),
    tab(2),
    tab(3),
    h("button", { class: "btn btn-small" }, "+ Add a board"),
    h("span", { class: "grow" }),
    h("button", { class: "btn btn-small btn-danger" }, "Remove this board"),
  );
}

function board(): HTMLElement {
  const view = new BoardView(level, { skin: "pawn" });
  const [x, y] = corner(CURSOR);
  view.element.append(svg("rect", { x: x + 3, y: y + 3, width: S - 6, height: S - 6, class: "ed-cursor" }));
  return h("div", { class: "ed-board" }, node(view.element));
}

const status = () => h("p", { class: "ed-status", "aria-live": "polite" }, h("strong", {}, `${name(CURSOR)} `), "floor · Enter paints · you are editing board 2 of 3");

// -- the properties tabs ------------------------------------------------------------------------------

const TABS = ["Level", "Rules", "Hints", "Square", "Enemy"];
const tabs = (active: string) =>
  h("div", { class: "tabs", role: "tablist" }, ...TABS.map((t) => h("button", { class: `tab${t === active ? " active" : ""}`, role: "tab", "aria-selected": String(t === active) }, t)));

const field = (label: string, control: HTMLElement, note?: string) => h("label", { class: "field" }, h("span", { class: "field-label" }, label), control, note ? h("span", { class: "muted small" }, note) : null);
const input = (value: string, type = "text") => h("input", { type, value });
const area = (value: string, rows: number) => h("textarea", { rows: String(rows), value }, value);
const radio = (group: string, label: string, on: boolean) => h("label", { class: "check" }, h("input", { type: "radio", name: group, checked: on }), label);
const box = (label: string, on: boolean) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: on }), label);

const CONSTRUCTS = ["a for loop", "a while loop", "a break statement", "a continue statement", "an if statement", "a function definition (def)", "a function call", "a variable assignment (=)", "an update like += or -=", "an f-string with a value inside its braces", "a try/except block", "an import"];

function rulesTab(): HTMLElement {
  return h(
    "div",
    { class: "props-body" },
    h(
      "section",
      { class: "rules-section" },
      h("h3", {}, "The goal"),
      box("Reach the goal", true),
      h("div", { class: "phrase" }, input("open sesame"), h("button", { class: "btn btn-small", "aria-label": "Remove this phrase" }, "×")),
      h("button", { class: "btn btn-small" }, "+ Say a phrase"),
      h("div", { class: "choice-row" }, h("span", { class: "field-label" }, "Collect gems"), radio("collect", "none", false), radio("collect", "all", true), radio("collect", "at least", false), input("2", "number")),
      h("div", { class: "choice-row" }, h("span", { class: "field-label" }, "Capture enemies"), radio("capture", "none", true), radio("capture", "all", false), radio("capture", "at least", false), input("1", "number")),
      h("p", { class: "muted small" }, "Waypoints on the board always have to be crossed."),
    ),
    h(
      "section",
      { class: "rules-section" },
      h("h3", {}, "Limits"),
      h("div", { class: "field-row" }, field("Most lines of code", input("6", "number")), field("Most numbers", input("", "number"), "1 means one number, written once.")),
      field("Comments required", input("0", "number")),
      h("details", {}, h("summary", {}, "Must use (1)"), h("div", { class: "construct-list" }, ...CONSTRUCTS.map((c, i) => box(c, i === 1)))),
      h("details", {}, h("summary", {}, "Not allowed (0)"), h("div", { class: "construct-list" }, ...CONSTRUCTS.map((c) => box(c, false)))),
    ),
    h(
      "section",
      { class: "rules-section" },
      h("h3", {}, "Par and starter code"),
      h("div", { class: "field-row" }, field("Par (lines of code)", input("4", "number"), "Meeting it earns the second star."), h("div", { class: "field" }, h("span", { class: "field-label" }, "From your solution"), h("button", { class: "btn btn-small" }, "Use my solution's 4 lines"))),
      field("Starter code", area("# Walk to the beacon.\n", 2), "What the player's editor begins with. Optional."),
    ),
    h(
      "section",
      { class: "rules-section" },
      h("h3", {}, "Your solution"),
      h("p", { class: "small" }, h("strong", {}, "Kept: 4 lines. "), "It travels with the level when you share it, and is shown after three failed runs."),
      h("button", { class: "btn btn-small" }, "Remove it"),
    ),
    h(
      "section",
      { class: "rules-section" },
      h("h3", {}, "What the player will read"),
      h("ul", { class: "read-aloud small" }, h("li", {}, "Reach the goal on e6."), h("li", {}, 'Say "open sesame" (print it).'), h("li", {}, "At most 6 lines of code. Blank lines and comments don't count; two statements on one line count as two."), h("li", {}, "Must use a while loop."), h("li", {}, "Use 4 lines of code or fewer (par).")),
    ),
  );
}

function hintsTab(): HTMLElement {
  const tier = (n: number, title: string, about: string, value: string) =>
    h("div", { class: "field" }, h("span", { class: "field-label" }, `${n}. ${title}`), area(value, 3), h("span", { class: "muted small counter" }, `${value.length} of 600`), h("span", { class: "muted small" }, about));
  return h(
    "div",
    { class: "props-body" },
    h("p", { class: "muted small hints-note" }, "Players open hints one at a time. Opening the first costs the level's third star. Put code in `backticks`."),
    tier(1, "A nudge", "Where to look, without saying what to do.", "Look at what is ahead of the pawn before each step."),
    tier(2, "How it works, in words", "Explain the idea. Don't tell them to wait or turn on the spot.", "A `while` loop repeats while its condition holds. Ask `look()` what's ahead and stop when it says `wall`."),
    tier(3, "Show the code", "A partial example on a different board is kind.", ""),
  );
}

function problems(count: number): HTMLElement {
  return h(
    "section",
    { class: "ed-problems", "aria-label": "Problems" },
    h("h3", { class: "pal-title" }, `Problems (${count})`),
    count
      ? h("ul", {}, h("li", {}, h("button", { class: "problem-link" }, h("span", { class: "problem-badge", "aria-hidden": "true" }, "!"), h("span", {}, h("strong", {}, "Board 3 "), "variant 2: the map needs a start square (P)"))))
      : h("p", { class: "muted small" }, "None. The engine accepts this level."),
  );
}

// -- the solvability check ----------------------------------------------------------------------------

const MARK = { ok: "✓", none: "✗", gave: "?", skip: "–" } as const;
const row = (mark: keyof typeof MARK, text: string) => h("li", {}, h("span", { class: "solve-mark", "aria-hidden": "true" }, MARK[mark]), h("span", {}, text));

function solveBox(state: "idle" | "searching" | "done" | "stale" | "single"): HTMLElement {
  const intro = h("p", { class: "muted small" }, "Tries moves, turns, waits, captures and planks on each board. It can't read runes or loop, so it can't judge a program.");
  const body: Array<HTMLElement | null> = [h("h3", { class: "pal-title" }, "Can it be solved?")];
  if (state === "idle") body.push(intro, h("div", { class: "solve-actions" }, h("button", { class: "btn btn-small" }, "Check")));
  if (state === "searching")
    body.push(h("p", { class: "small", role: "status" }, "Searching board 2 of 3 · 45,000 positions so far"), h("div", { class: "solve-bar", "aria-hidden": "true" }, h("span")), h("div", { class: "solve-actions" }, h("button", { class: "btn btn-small" }, "Cancel")));
  if (state === "single")
    body.push(h("ul", { class: "solve-results", role: "status" }, row("ok", "A route exists: plain calls do it in 6 lines. A loop might do it in fewer.")), h("div", { class: "solve-actions" }, h("button", { class: "btn btn-small" }, "Check again")));
  if (state === "done" || state === "stale") {
    if (state === "stale") body.push(h("p", { class: "small stale-note" }, "This answer is for an older version of the level."));
    body.push(
      h(
        "ul",
        { class: "solve-results", role: "status", style: state === "stale" ? "opacity:.55" : "" },
        row("ok", "Board 1: a route exists, 6 lines of plain calls."),
        row("ok", "Board 2: a route exists, 8 lines of plain calls."),
        row("none", "Board 3: no route found. Every move, turn, wait, capture and plank was tried."),
      ),
      h("p", { class: "muted small" }, "Each board can be solved on its own. That doesn't show one program can solve them all: your own solution, from test-play, does."),
      h("div", { class: "solve-actions" }, h("button", { class: "btn btn-small" }, "Check again")),
    );
  }
  return h("section", { class: "solve-box", "aria-label": "Solvability" }, ...body);
}

function otherOutcomes(): HTMLElement {
  return h(
    "section",
    { class: "solve-box" },
    h("h3", { class: "pal-title" }, "Other answers it can give"),
    h(
      "ul",
      { class: "solve-results" },
      row("gave", "Board 2: gave up after 200,000 positions. It might be solvable; try fewer gems or enemies."),
      row("skip", "Board 1: can't judge. Some obstacles tick with your code's lines, which depends on how it is written."),
    ),
  );
}

// -- the Share dialog ---------------------------------------------------------------------------------

function shareDialog(ready: boolean): HTMLElement {
  const line = (mark: keyof typeof MARK, text: string, action?: HTMLElement) => h("li", {}, h("span", { class: "solve-mark", "aria-hidden": "true" }, MARK[mark]), h("span", {}, text), action ?? h("span"));
  return h(
    "div",
    { class: "share-dialog static-dialog", role: "dialog", "aria-label": "Share this level" },
    h("div", { class: "dialog-head" }, h("h2", {}, "Share this level"), h("button", { class: "btn btn-small" }, "Close")),
    h(
      "ul",
      { class: "share-checks" },
      line("ok", "The engine accepts the level."),
      line("ok", "Your solution solves all 3 boards in 4 lines."),
      ready ? line("ok", "Par (4 lines) is within reach of your solution.") : line("none", "Par is 3 lines, but your solution needs 4.", h("button", { class: "btn btn-small" }, "Set par to 4")),
    ),
    h("p", { class: "muted small" }, "What travels: the title, boards, rules, hints and your solution. Nothing else: no name, nothing from your browser. The part of a link after # is never sent to a server."),
    h(
      "div",
      { class: `share-out${ready ? "" : " blocked"}` },
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Link"), h("div", { class: "share-copy" }, h("input", { type: "text", readonly: true, disabled: !ready, value: "https://dehrlich122.github.io/rank-and-file/#/play/rf1.eNqNk0FPwzAMhf9K..." }), h("button", { class: "btn btn-small", disabled: !ready }, "Copy"))),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Code, to paste into My levels"), h("div", { class: "share-copy" }, h("textarea", { rows: "2", readonly: true, disabled: !ready }, "rf1.eNqNk0FPwzAMhf9K..."), h("button", { class: "btn btn-small", disabled: !ready }, "Copy"))),
      h("div", {}, h("button", { class: "btn btn-small", disabled: !ready }, "Download a .yaml file")),
    ),
  );
}

// -- test-play, a shared level, Shared with me ----------------------------------------------------------

function solvedCard(): HTMLElement {
  return h(
    "div",
    { class: "outcome outcome-good" },
    h("div", { class: "outcome-head" }, h("strong", {}, "Run complete"), h("span", {}, "★★☆")),
    h("p", {}, "Solved on all 3 boards, with 4 lines of code."),
    h("div", { class: "keep-solution" }, h("button", { class: "btn btn-small btn-primary" }, "Keep this as the level's solution"), h("span", { class: "muted small" }, " It is shown to players after three failed runs.")),
    h("div", { class: "keep-solution" }, h("a", { class: "btn btn-small btn-primary", href: "#" }, "← Back to the editor")),
  );
}

function sharedBanner(): HTMLElement {
  return h(
    "div",
    { class: "shared-banner panel" },
    h("strong", {}, "Shared level"),
    h("span", { class: "muted small" }, "Made by someone else. Your stars and hints are kept here, apart from the lessons."),
    h("span", { class: "grow" }),
    h("a", { class: "btn btn-small", href: "#" }, "Open in the editor"),
  );
}

function myLevelsPage(): HTMLElement {
  const mine = (title: string, meta: string) =>
    h("li", { class: "my-level panel" }, h("a", { class: "my-level-open", href: "#" }, h("strong", {}, title), h("span", { class: "muted small" }, ` · ${meta}`)), h("button", { class: "btn btn-small" }, "Duplicate"), h("button", { class: "btn btn-small" }, "Export"), h("button", { class: "btn btn-small" }, "Delete"));
  const shared = (title: string, meta: string) =>
    h("li", { class: "my-level panel" }, h("a", { class: "my-level-open", href: "#" }, h("strong", {}, title), h("span", { class: "muted small" }, ` · ${meta}`)), h("button", { class: "btn btn-small" }, "Remix"), h("button", { class: "btn btn-small" }, "Remove"));
  return h(
    "div",
    { class: "editor-list" },
    h("h1", {}, "My levels"),
    h("div", { class: "toolbar" }, h("button", { class: "btn btn-primary" }, "New level"), h("button", { class: "btn" }, "Import a .yaml file"), h("button", { class: "btn" }, "Open a link or code")),
    h("ul", { class: "my-levels" }, mine("Cross the Courtyard", "8 × 8 · edited today")),
    h("h2", { class: "my-levels-title" }, "Shared with me"),
    h("ul", { class: "my-levels" }, shared("The Long Corridor", "★★★ · 3 boards"), shared("Mind the Rooks", "not solved yet · 1 board")),
  );
}

// -- the sheet ----------------------------------------------------------------------------------------

const pane = (scheme: "dark" | "light", name: string, ...children: Array<HTMLElement | null>) =>
  h("div", { class: "pane level-editor", "data-scheme": scheme }, h("p", { class: "pane-name" }, name), ...children);

const root = document.getElementById("sheet")!;
root.append(
  h(
    "header",
    { class: "sheet-head" },
    h("h1", {}, "Level editor: rules, check and sharing"),
    h("p", {}, "The M4.3 additions to the M4.2 editor (Take A), on the real classes. Five tabs; a board switcher above the board; the solvability check under Problems; a Share dialog; a Keep button on test-play's solved card; a shared level's banner; Shared with me on the My levels page. Static mock-ups; the palette and toolbar are as in M4.2."),
  ),
  pane("dark", "Rules tab · board switcher (a problem on board 3) · dark", h("div", { class: "pane-grid" }, h("div", { class: "ed-middle" }, boardRow(2, 3), board(), status()), h("aside", { class: "ed-right" }, tabs("Rules"), h("div", { class: "props-scroll" }, rulesTab(), problems(1), solveBox("idle"))))),
  pane("light", "Hints tab · the check running · light", h("div", { class: "pane-grid" }, h("div", { class: "ed-middle" }, boardRow(1), board(), status()), h("aside", { class: "ed-right" }, tabs("Hints"), h("div", { class: "props-scroll" }, hintsTab(), problems(0), solveBox("searching"))))),
  pane(
    "dark",
    "The check's answers · dark",
    h("div", { class: "pane-pair" }, h("div", { class: "stack" }, h("p", { class: "pane-sub" }, "Several boards"), solveBox("done"), h("p", { class: "pane-sub" }, "After the level changed"), solveBox("stale")), h("div", { class: "stack" }, h("p", { class: "pane-sub" }, "One board"), solveBox("single"), otherOutcomes())),
  ),
  pane("light", "Share · blocked, then ready · light", h("div", { class: "pane-pair" }, shareDialog(false), shareDialog(true))),
  pane("dark", "Test-play's solved card · a shared level · My levels · dark", h("div", { class: "pane-pair" }, h("div", { class: "stack" }, h("p", { class: "pane-sub" }, "Test-play, a solved run"), solvedCard(), h("p", { class: "pane-sub" }, "On a shared level's screen"), sharedBanner()), myLevelsPage())),
);
