// M4.4 step 1 (design prototype): free play's hub, the challenge lists, the tier and difficulty tags, a challenge's
// "Draws on" chips, the Sandbox and the Skins gallery.
//   /design/free-play.html
// Static: nothing here opens or runs anything. It draws the new pieces with their real classes (src/free.css) in both
// themes, to judge them before they are built into the game. Dev-only. The challenge titles are placeholders.
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "../src/styles.css";
import "../src/chrome.css";
import "../src/free.css";
import "./free-play.css";
import { chapterName, chapters } from "../src/content";
import { h } from "../src/ui/dom";
import { hero } from "../src/ui/sprites";
import { svg } from "../src/ui/svg";

if (new URLSearchParams(location.search).has("still")) document.documentElement.dataset.still = "";

const node = (n: SVGElement) => n as unknown as Node;
const KEYWORDS = ["pass", "try", "raise", "assert", "while True:"];

// -- the tags --------------------------------------------------------------------------------------

/** Take A (picked): the keyword in the code font, then five pips filled up to the step. */
function diffTag(step: number): HTMLElement {
  return h(
    "span",
    { class: "diff-tag", "data-step": String(step), role: "img", "aria-label": `Difficulty ${step} of 5: ${KEYWORDS[step - 1]}` },
    h("code", {}, KEYWORDS[step - 1]!),
    h("span", { class: "diff-pips", "aria-hidden": "true" }, ...[1, 2, 3, 4, 5].map((n) => h("span", { class: `diff-pip${n <= step ? " on" : ""}` }))),
  );
}

/** Take B (not picked): a rising meter, like signal bars, with the keyword under it. */
function meterTag(step: number): HTMLElement {
  return h(
    "span",
    { class: "meter-tag", "data-step": String(step) },
    h("span", { class: "meter-bars", "aria-hidden": "true" }, ...[1, 2, 3, 4, 5].map((n) => h("span", { class: `meter-bar${n <= step ? " on" : ""}`, style: `height: ${4 + n * 3}px` }))),
    h("code", {}, KEYWORDS[step - 1]!),
  );
}

const tierTag = (tier: string) => h("span", { class: "tier-tag", title: `Needs what the ${tier} tier teaches` }, "♟ ", tier.charAt(0).toUpperCase() + tier.slice(1));

function tagsPane(): HTMLElement {
  const row = (label: string, ...items: HTMLElement[]) => h("div", { class: "tag-row" }, h("span", { class: "pane-sub" }, label), ...items);
  return h(
    "div",
    { class: "stack" },
    row("A · keyword + pips (picked)", ...[1, 2, 3, 4, 5].map(diffTag)),
    row("A · step 5 with Animations reduced: stripes, no pulse", h("span", { class: "reduced-demo" }, diffTag(5))),
    row("B · meter (not picked: the bars read as signal or volume, and are small)", ...[1, 2, 3, 4, 5].map(meterTag)),
    row("Tier tags", tierTag("pawn"), tierTag("knight")),
  );
}

// -- the hub ---------------------------------------------------------------------------------------

function hub(): HTMLElement {
  const row = (glyph: string, title: string, line: string, count: string) =>
    h("li", {}, h("a", { class: "fp-row", href: "#" }, h("span", { class: "fp-glyph", "aria-hidden": "true" }, glyph), h("span", { class: "fp-text" }, h("strong", {}, title), h("span", { class: "muted small" }, line)), h("span", { class: "fp-count" }, count)));
  return h(
    "div",
    { class: "free-play" },
    h("h1", { class: "free-title" }, "Free Play"),
    h("p", { class: "muted" }, "No lessons here: puzzles that mix what you've learned, levels you made or were sent, and a board to try things on."),
    h(
      "div",
      { class: "hud-frame" },
      h(
        "ul",
        { class: "fp-rows" },
        row("♟", "Challenges", "Each tier's mastery set: puzzles that mix its chapters", "0 of 6 solved"),
        row("✎", "My levels", "Levels you made in the editor", "2 levels"),
        row("⇄", "Shared with me", "Levels others sent you, by link or code", "3 levels"),
        row("▢", "Sandbox", "An open board with every ability you've met", ""),
        row("◆", "Skins", "The looks your promotions unlocked", "1 of 2"),
      ),
    ),
  );
}

// -- a list: filters, a set and its challenges -----------------------------------------------------------

function controls(): HTMLElement {
  const select = (label: string, ...options: string[]) => h("label", {}, label, h("select", {}, ...options.map((o) => h("option", {}, o))));
  return h(
    "div",
    { class: "list-controls" },
    select("Tier", "Any", "Pawn", "Knight"),
    select("Difficulty", "Any", ...KEYWORDS),
    h("span", { class: "grow" }),
    select("Sort", "In order", "Easiest first", "Hardest first"),
  );
}

const PAWN = chapters.filter((c) => c.curriculum && c.tier === "pawn");
const short = (n: number) => PAWN.find((c) => c.chapter === n)?.title ?? `Chapter ${n}`;

function challengesPage(): HTMLElement {
  const row = (n: number, title: string, step: number, draws: number[], stars: number) =>
    h(
      "li",
      {},
      h(
        "a",
        { class: "ch-row", href: "#" },
        h("span", { class: "lrow-num" }, stars ? "✓" : String(n)),
        h("span", { class: "lrow-text" }, h("strong", {}, title), h("span", { class: "muted small" }, `Draws on ${draws.map(short).join(" · ")}`)),
        h("span", { class: "tags" }, diffTag(step)),
        stars ? h("span", { class: "card-stars" }, "★".repeat(stars) + "☆".repeat(3 - stars)) : h("span", { class: "card-stars muted" }, "☆☆☆"),
      ),
    );
  return h(
    "div",
    { class: "free-play" },
    h("h1", { class: "free-title" }, "Challenges"),
    controls(),
    h("div", { class: "set-head" }, h("h2", {}, "The Last Rank"), tierTag("pawn"), h("span", { class: "muted small" }, "Six puzzles that mix the Pawn tier's chapters. No lessons; the Codex has everything.")),
    h(
      "ul",
      { class: "ch-rows" },
      row(1, "Sample challenge one", 2, [3, 4], 3),
      row(2, "Sample challenge two", 2, [2, 4], 0),
      row(3, "Sample challenge three", 3, [4, 5], 0),
      row(4, "Sample challenge four", 3, [5, 6], 0),
      row(5, "Sample challenge five", 4, [3, 5, 6], 0),
      row(6, "Sample challenge six", 5, [4, 5, 6], 0),
    ),
  );
}

// -- a challenge's screen: the Challenge tab, no Learn tab -----------------------------------------------

function challengeTab(): HTMLElement {
  const chip = (n: number) => h("a", { class: "chapter-chip", href: "#", title: chapterName(PAWN.find((c) => c.chapter === n)!) }, short(n));
  return h(
    "div",
    { class: "panel challenge-mock" },
    h("div", { class: "tabs" }, h("button", { class: "tab active" }, "Challenge"), h("button", { class: "tab" }, "Codex")),
    h("h2", {}, "Sample challenge five"),
    h("div", { class: "tags" }, tierTag("pawn"), diffTag(4)),
    h("p", {}, "The brief goes here: what the board asks, never how to answer it."),
    h("div", { class: "draws-on" }, h("span", { class: "draws-on-label" }, "Draws on"), chip(3), chip(5), chip(6)),
    h("p", { class: "muted small" }, "Goals, rules, stars and hints follow, as on any level."),
  );
}

function sandboxAndSkins(): HTMLElement {
  const skin = (name: string, skinId: "pawn" | "knight", state: string, worn: boolean, locked: boolean) => {
    const art = svg("svg", { viewBox: "-38 -38 76 76", width: 120, height: 120, "aria-hidden": "true" }, hero(skinId, skinId === "knight" ? "east" : "south"));
    return h(
      "div",
      { class: `skin-card${worn ? " worn" : ""}${locked ? " locked" : ""}` },
      h("div", { class: "skin-art" }, node(art)),
      h("strong", {}, name),
      h("span", { class: "muted small" }, state),
      h("button", { class: "btn btn-small", disabled: locked || worn }, worn ? "Worn" : "Wear it"),
    );
  };
  return h(
    "div",
    { class: "pane-pair" },
    h("div", { class: "free-play" }, h("h1", { class: "free-title" }, "Sandbox"), h("p", { class: "muted" }, "Every ability you've met, on an open board. No goal, no stars: try things."), h("div", { class: "sandbox-mock panel" }, "the lesson snippets' runnable editor and board, larger")),
    h("div", { class: "free-play" }, h("h1", { class: "free-title" }, "Skins"), h("div", { class: "skins" }, skin("Pawn", "pawn", "Yours from the start", true, false), skin("Charger", "knight", "Unlocked by the Pawn tier's promotion", false, true))),
  );
}

// -- the sheet -------------------------------------------------------------------------------------

const pane = (scheme: "dark" | "light", name: string, ...children: HTMLElement[]) => h("div", { class: "pane", "data-scheme": scheme }, h("p", { class: "pane-name" }, name), ...children);

document.getElementById("sheet")!.append(
  h(
    "header",
    { class: "sheet-head" },
    h("h1", {}, "Free Play: the hub, challenges and tags"),
    h("p", {}, "M4.4's screens on their real classes (src/free.css). The hub is a directory like Lessons; each row opens its own page. A difficulty tag is its keyword plus five pips, so it reads without colour; step 5 pulses once every 2 s, and shows stripes with Animations reduced. Tags appear in lists and the Challenge panel, never on the board."),
  ),
  pane("dark", "Tags · dark", tagsPane()),
  pane("light", "Tags · light", tagsPane()),
  pane("dark", "The hub · dark", hub()),
  pane("light", "Challenges, with the filter and sort row · light", challengesPage()),
  pane("dark", "A challenge's Challenge tab · dark", challengeTab()),
  pane("light", "Sandbox and Skins · light", sandboxAndSkins()),
);
