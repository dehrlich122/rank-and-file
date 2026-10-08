// Lessons (M3.7): a directory, not a long page. Chapter folders under tier headings, inside a HUD frame, with a
// detail pane for the selected level. Nothing is locked. On load the folder holding the next unsolved level is
// the only one open (and that level is selected); folders the player opens by hand are remembered.
import type { Chapter } from "../content";
import type { PyClient } from "../py/client";
import type { LevelInfo } from "../py/protocol";
import type { ProgressStore } from "../progress";
import { lastChapterOf, PROMOTIONS, tierCleared } from "../promotion";
import { sound } from "../sound";
import { asRecord, browserStorage, readJson, writeJson } from "../storage";
import { BoardView } from "./board";
import { h } from "./dom";
import { icon } from "./icons";
import { crown } from "./sprites";
import { svg } from "./svg";
import { folderName, tierName, VOICE } from "./voice";

/** The tag on a chapter's optional mastery challenge (M3.2): on its row, and in its Challenge panel. */
export const masteryTag = () => h("span", { class: "mastery-tag" }, "Mastery · optional");

const FOLDERS_KEY = "rank-and-file:folders"; // the chapters the player opened by hand

type Level = Chapter["levels"][number];

/** The level to play next: the first unsolved core level in play order, else the first unsolved mastery one. */
function nextUnsolved(chapters: Chapter[], progress: ProgressStore): Level | undefined {
  const levels = chapters.filter((c) => c.curriculum).flatMap((c) => c.levels);
  return levels.find((l) => !l.mastery && !progress.solved(l.id)) ?? levels.find((l) => !progress.solved(l.id));
}

const stars = (n: number) => [0, 1, 2].map((i) => icon(i < n ? "star" : "starOutline"));

/** The chapter's victory symbol: a wire crown, with a lit jewel once the mastery challenge is done too. */
const crownIcon = (mastered: boolean) => svg("svg", { viewBox: "-32 -26 64 44", width: 26, height: 18, class: "crown-icon", "aria-hidden": "true" }, crown(mastered));

/** The chapters the player opened by hand, from storage. */
function openedByHand(): Set<number> {
  const { open } = asRecord(readJson(browserStorage(), FOLDERS_KEY));
  return new Set(Array.isArray(open) ? open.filter((n): n is number => typeof n === "number") : []);
}

/** Mount Lessons in `main`, with `focus` (a chapter number from the URL) open. Returns what to call to leave it. */
export function mountLessons(main: HTMLElement, chapters: Chapter[], progress: ProgressStore, client: PyClient, focus?: number): () => void {
  const storage = browserStorage();
  const remembered = openedByHand();
  const next = nextUnsolved(chapters, progress);
  const startOpen = new Set<number>([...remembered, ...(focus !== undefined ? [focus] : next ? [next.chapter] : [])]);
  let selected: Level | undefined = (focus !== undefined ? chapters.find((c) => c.chapter === focus)?.levels[0] : undefined) ?? next ?? chapters[0]?.levels[0];
  const boards = new Map<string, Promise<LevelInfo | null>>();
  let board: BoardView | undefined;
  let leaving = false; // set on unmount, so a board that loads late isn't built on a screen that has gone

  const crumbs = h("nav", { class: "lcrumbs", "aria-label": "Lessons path" });
  const detail = h("aside", { class: "detail", "aria-label": "Selected level" });
  // what a screen reader hears when the selection changes: the level's name, not the whole pane again
  const announce = h("p", { class: "sr-only", role: "status" });
  const rowOf = new Map<string, HTMLElement>();

  const chapterOf = (level: Level) => chapters.find((c) => c.chapter === level.chapter)!;
  const numberOf = (level: Level) => chapterOf(level).levels.indexOf(level) + 1;

  function showCrumbs(): void {
    const chapter = selected ? chapterOf(selected) : undefined;
    crumbs.replaceChildren(
      h("a", { href: "#/" }, "Start"),
      h("span", {}, "/"),
      h("span", {}, VOICE.lessons),
      ...(chapter && selected ? [h("span", {}, "/"), h("span", {}, folderName(chapter.curriculum ? chapter.chapter : 0, chapter.title)), h("span", {}, "/"), h("span", {}, selected.title)] : []),
    );
  }

  /** A level's board for the detail pane: loaded once, from the engine. */
  function boardFor(level: Level): Promise<LevelInfo | null> {
    let loaded = boards.get(level.id);
    if (!loaded) {
      loaded = client.call("loadLevel", { level: level.data }).then(
        (result) => (result.ok ? result.level : null),
        () => null,
      );
      boards.set(level.id, loaded);
    }
    return loaded;
  }

  function showDetail(): void {
    board?.dispose();
    board = undefined;
    if (!selected) return detail.replaceChildren();
    const level = selected;
    const { stars: best, helped } = progress.level(level.id);
    const boardHost = h("div", { class: "detail-board" });
    const number = chapterOf(level).curriculum ? ` ${level.chapter}.${numberOf(level)}` : "";
    detail.replaceChildren(
      h("p", { class: "detail-kicker" }, `${VOICE.detail}${number}`),
      h("h2", {}, level.title, level.mastery ? masteryTag() : null),
      h("p", { class: "muted" }, level.trains),
      boardHost,
      h("div", { class: "detail-stars" }, best > 0 ? h("span", { class: "detail-best", "aria-hidden": "true" }, "Best: ") : null, ...(best > 0 ? [...stars(best), h("span", { class: "sr-only" }, `Best: ${best} of 3 stars`)] : []), helped && best === 0 ? h("span", { class: "muted small" }, "Solution seen") : null),
      h("div", { class: "detail-actions" }, h("a", { class: "btn btn-primary", href: `#/level/${level.id}` }, icon("play"), best > 0 ? "Replay this level" : "Run this level")),
    );
    void boardFor(level).then((info) => {
      if (!info || leaving || selected !== level) return;
      board = new BoardView(info, { mini: true });
      boardHost.replaceChildren(board.element);
    });
  }

  function select(level: Level): void {
    selected = level;
    for (const [id, row] of rowOf) {
      row.classList.toggle("selected", id === level.id);
      if (id === level.id) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
    announce.textContent = `${level.title}${level.mastery ? ", optional mastery challenge" : ""}`;
    showCrumbs();
    showDetail();
  }

  /** Open the level itself. */
  function open(level: Level): void {
    sound.play("menu_choose");
    location.hash = `#/level/${level.id}`;
  }

  function row(level: Level, index: number): HTMLElement {
    const { stars: best, helped } = progress.level(level.id);
    const solved = best > 0;
    const element = h(
      "li",
      { class: `lrow${solved ? " solved" : ""}${selected === level ? " selected" : ""}`, tabindex: "0", "data-level-id": level.id, "aria-current": selected === level ? "true" : undefined },
      h("span", { class: "lrow-num" }, solved ? "✓" : String(index + 1)),
      h("span", { class: "lrow-text" }, h("strong", {}, level.title, level.mastery ? masteryTag() : null), h("span", { class: "muted small" }, level.trains)),
      solved ? h("span", { class: "card-stars", title: `${best} of 3 stars` }, ...stars(best), h("span", { class: "sr-only" }, `${best} of 3 stars`)) : helped ? h("span", { class: "card-tag muted small" }, "Solution seen") : null,
    );
    element.addEventListener("mousedown", () => selected !== level && sound.play("menu_move")); // before the click's focus selects it
    element.addEventListener("click", () => select(level));
    element.addEventListener("focus", () => selected !== level && select(level)); // arriving by keyboard selects too
    element.addEventListener("dblclick", () => open(level));
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter") open(level);
      else if (event.key === " ") {
        event.preventDefault();
        select(level);
      }
    });
    rowOf.set(level.id, element);
    return element;
  }

  function folder(chapter: Chapter): HTMLElement {
    const core = chapter.levels.filter((l) => !l.mastery);
    const done = core.filter((l) => progress.solved(l.id)).length;
    const cleared = chapter.curriculum && core.length > 0 && done === core.length;
    const mastered = cleared && chapter.levels.some((l) => l.mastery && progress.solved(l.id));
    const open = startOpen.has(chapter.chapter);
    // the crown gets a short flourish the first time it is shown, and is still afterwards
    const fresh = cleared && !progress.hasSeen("crown", chapter.chapter);
    if (cleared) progress.markSeen("crown", chapter.chapter);
    if (fresh) sound.play("crown", 0.3);
    const promotion = lastChapterOf(chapter.tier) === chapter ? PROMOTIONS.find((p) => p.tier === chapter.tier && tierCleared(p.tier, progress)) : undefined;
    const head = h(
      "button",
      { class: "folder-head", "aria-expanded": String(open), title: chapter.summary },
      h("span", { class: "folder-caret", "aria-hidden": "true" }, "▸"),
      h("span", { class: "folder-title" }, folderName(chapter.curriculum ? chapter.chapter : 0, chapter.title)),
      cleared ? h("span", { class: `victory${fresh ? " fresh" : ""}`, title: mastered ? "Chapter cleared, mastery done" : "Chapter cleared" }, crownIcon(mastered), h("span", {}, mastered ? "mastered" : "cleared")) : null,
      h("span", { class: "segments", role: "img", "aria-label": `${done} of ${core.length} levels solved` }, ...chapter.levels.map((l) => h("span", { class: `seg${progress.solved(l.id) ? " on" : ""}${l.mastery ? " mastery" : ""}` }))),
    );
    const inner = h("div", { class: "folder-inner" }, promotion ? h("a", { class: "promo-link", href: `#/promotion/${promotion.tier}` }, `★ ${promotion.headline}: watch again`) : null, h("ol", { class: "lrows" }, ...chapter.levels.map((l, i) => row(l, i))));
    inner.inert = !open; // a closed folder's rows can't be tabbed to
    const element = h("div", { class: `folder${open ? " open" : ""}${cleared ? " cleared" : ""}`, "data-chapter": String(chapter.chapter) }, head, h("div", { class: "folder-slide" }, inner));
    head.addEventListener("click", () => {
      sound.play("menu_choose");
      const nowOpen = element.classList.toggle("open");
      inner.inert = !nowOpen;
      head.setAttribute("aria-expanded", String(nowOpen));
      if (nowOpen) remembered.add(chapter.chapter);
      else remembered.delete(chapter.chapter);
      writeJson(storage, FOLDERS_KEY, { open: [...remembered] });
    });
    return element;
  }

  // the folders, under a heading for each tier in play order, and the Testing ground last
  const tiers: string[] = [];
  for (const c of chapters.filter((c) => c.curriculum)) if (!tiers.includes(c.tier)) tiers.push(c.tier);
  const outside = chapters.filter((c) => !c.curriculum);
  const explorer = h(
    "div",
    { class: "hud-frame" },
    ...tiers.flatMap((tier, i) => [h("h2", { class: "tier-head" }, tierName(tier, i + 1)), ...chapters.filter((c) => c.curriculum && c.tier === tier).map(folder)]),
    ...(outside.length ? [h("h2", { class: "tier-head" }, VOICE.outside), ...outside.map(folder)] : []),
  );
  // arrow keys move through the folder heads and the rows of open folders; Right and Left open and close a folder
  explorer.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    if (!target.matches(".folder-head, .lrow")) return;
    const list = [...explorer.querySelectorAll<HTMLElement>(".folder-head, .folder.open .promo-link, .folder.open .lrow")];
    const at = list.indexOf(target);
    const isHead = target.matches(".folder-head");
    const isOpen = target.closest(".folder")?.classList.contains("open") ?? false;
    let next: HTMLElement | undefined;
    if (event.key === "ArrowDown") next = list[at + 1];
    else if (event.key === "ArrowUp") next = list[at - 1];
    else if (event.key === "Home") next = list[0];
    else if (event.key === "End") next = list.at(-1);
    else if (event.key === "ArrowRight" && isHead) {
      if (!isOpen) target.click();
      else next = list[at + 1];
    } else if (event.key === "ArrowLeft") {
      if (isHead && isOpen) target.click();
      else if (!isHead) next = target.closest(".folder")?.querySelector<HTMLElement>(".folder-head") ?? undefined;
    } else return;
    event.preventDefault();
    if (next) sound.play("menu_move");
    next?.focus();
  });
  showCrumbs();
  showDetail();
  const foot = h(
    "p",
    { class: "muted small lessons-foot" },
    "Your progress and code are saved in this browser. Settings → Reset progress starts over. ",
    h("a", { href: "#/harness" }, "Python harness"),
    " · ",
    h("a", { href: "#/styleguide" }, "Style guide"),
  );
  main.replaceChildren(
    h(
      "section",
      { class: "lessons" },
      h("h1", { class: "lessons-title" }, VOICE.lessons),
      h("p", { class: "muted" }, "Every level teaches one idea with a short lesson you can run, then gives you a puzzle that needs it."),
      crumbs,
      announce,
      h("div", { class: "lessons-cols" }, explorer, detail),
      foot,
    ),
  );
  if (selected) rowOf.get(selected.id)?.scrollIntoView?.({ block: "center" });
  return () => {
    leaving = true;
    board?.dispose();
  };
}
