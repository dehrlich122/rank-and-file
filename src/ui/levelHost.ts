// How the level screen is opened (M4.4-0). `mountLevel` is one screen for every kind of level; a LevelHost says everything
// that differs between kinds, so the screen reads the host and has no branch of its own per kind. A new kind of level is
// one more builder here.
import { nextChallenge, nextLevel } from "../content";
import { progress as curriculumProgress, ProgressStore } from "../progress";
import { openRemix, sharedProgress } from "../share/shared";
import type { SolutionSource } from "./compare";
import { h } from "./dom";
import { authorSolution, sharedBanner, sharedFrame } from "./sharedLevel";

/**
 * What differs between the kinds of level the screen opens.
 *
 * A lesson level is the curriculum's own: its lesson, the curriculum's progress and reference solution, crowns and promotions.
 *
 * Test-play (M4.2) is a level from the editor: no lesson, nothing saved, and a way back. It plays as a player would see the
 * level (its hints, its stars, the offer of a solution once one is kept), with a progress store of its own that is gone when
 * the screen is.
 *
 * A shared level (M4.3, someone else's level opened from a link) is outside the curriculum like test-play (no lesson, no next
 * level, no crown or promotion, the Codex counts the curriculum and then its own abilities), but it is played for real: its
 * stars, hints and code are saved, in the shared levels' own store, and a banner offers a remix.
 */
export interface LevelHost {
  kind: "lesson" | "testPlay" | "shared" | "challenge";
  progress: ProgressStore; // where stars, hints and code are kept
  solution: SolutionSource | null | undefined; // undefined: the curriculum's reference by id (HelpPanel's default); null: none offered
  learn: boolean; // the Learn tab (a lesson); without it the screen opens on the Challenge tab
  curriculum: boolean; // counts toward crowns and promotions; its Codex is the curriculum's own
  frame?: (layout: HTMLElement) => HTMLElement; // wraps the screen (a shared level's banner)
  back?: { href: string; label: string }; // a toolbar link before Run (test-play's "← Editor")
  codes?: { get(id: string): string | undefined; set(id: string, code: string): void }; // code kept outside progress (test-play: this session only)
  solvedActions?: (code: string) => HTMLElement[]; // offered on a solved card before the help's (test-play's Keep)
  onward(id: string): { href: string; label: string }; // the solved card's primary link
}

/** A level of the curriculum: its lesson, the curriculum's progress and reference solution, on to the next level. */
export function lessonHost(): LevelHost {
  return {
    kind: "lesson",
    progress: curriculumProgress,
    solution: undefined,
    learn: true,
    curriculum: true,
    onward: (id) => {
      const next = nextLevel(id);
      return next ? { href: `#/level/${next.id}`, label: "Next level →" } : { href: "#/lessons", label: "Back to Lessons" };
    },
  };
}

const testCodes = new Map<string, string>(); // the code typed in a test-play, kept for the session only

/**
 * A level from the editor, test-played. `back` is the editor's address; `keep` lets the author keep the code that solved the
 * level as its solution, and `kept` says what is kept now. `solution` is what a player would be offered: the author's, if one
 * was kept before the screen opened, otherwise nothing.
 */
export function testPlayHost(options: { back: string; keep: (code: string) => void; kept: () => string; solution: SolutionSource | null }): LevelHost {
  return {
    kind: "testPlay",
    progress: new ProgressStore(null),
    solution: options.solution,
    learn: false,
    curriculum: false,
    back: { href: options.back, label: "← Editor" },
    codes: { get: (id) => testCodes.get(id), set: (id, code) => void testCodes.set(id, code) },
    solvedActions: (code) => [keepSolution(options.keep, options.kept, code)],
    onward: () => ({ href: options.back, label: "← Back to the editor" }),
  };
}

/**
 * A challenge from a Free Play set (M4.4): no lesson (the Codex counts the whole tier, since content.codexChapters puts its
 * set after the tier's last chapter), the curriculum's progress (challenge ids can't clash with a chapter's) and reference
 * solutions, no crown or promotion, on to the next challenge in the set.
 */
export function challengeHost(): LevelHost {
  return {
    kind: "challenge",
    progress: curriculumProgress,
    solution: undefined,
    learn: false,
    curriculum: false,
    onward: (id) => {
      const next = nextChallenge(id);
      return next ? { href: `#/challenge/${next.id}`, label: "Next challenge →" } : { href: "#/free/challenges", label: "Back to Free Play" };
    },
  };
}

/** Someone else's level, kept in this browser: progress of its own, the author's solution if they gave one, a banner with Remix. */
export function sharedHost(data: Record<string, unknown>): LevelHost {
  return {
    kind: "shared",
    progress: sharedProgress,
    solution: authorSolution(data),
    learn: false,
    curriculum: false,
    frame: (layout) => sharedFrame(sharedBanner(() => openRemix(data)), layout),
    onward: () => ({ href: "#/editor", label: "← Shared with me" }), // the list lives on the My levels page
  };
}

/** In test-play, after a solved run: keep the code that solved it as the level's solution (shown to players after three failed runs). */
function keepSolution(keep: (code: string) => void, kept: () => string, code: string): HTMLElement {
  const group = h("div", { class: "keep-solution" });
  const done = (text: string) => group.replaceChildren(h("p", { class: "small", role: "status" }, text));
  if (kept() === code) done("This is the level's solution.");
  else
    group.replaceChildren(
      h("button", { class: "btn btn-small", onClick: () => (keep(code), done("Kept as the level's solution.")) }, "Keep this as the level's solution"),
      h("p", { class: "muted small" }, "It is shown to players after three failed runs."),
    );
  return group;
}
