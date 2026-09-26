// A level: the lesson and challenge on the left, the board in the middle, the
// code editor and what the program is doing on the right.
import type { EditorView } from "codemirror";
import { nextLevel, type LevelSource } from "../content";
import { PythonHungError, StoppedError, type PyClient } from "../py/client";
import type { LevelInfo, LevelResult } from "../py/protocol";
import { BoardView, squareName } from "./board";
import { h } from "./dom";
import { clearMarks, createEditor, getCode, setActiveLine, setErrorLine, setMarks, type Mark } from "./editor";
import { renderLesson, type Lesson } from "./lesson";
import { Console, Inspector, noticeCard, outcomeCard } from "./panels";
import { Player, buildFrames } from "./playback";
import type { ReplPanel } from "./repl";
import type { SettingsDialog } from "./settingsDialog";
import { SPEEDS, settings } from "../settings";

export interface LevelContext {
  client: PyClient;
  repl: ReplPanel;
  settingsDialog: SettingsDialog;
  solved: Set<string>;
  drafts: Map<string, string>; // code per level, kept while the tab is open
}

const AUTOPLAY_LIMIT = 150; // longer runs open at the end instead of playing

export function mountLevel(root: HTMLElement, context: LevelContext, source: LevelSource): () => void {
  const { client } = context;
  let level: LevelInfo | null = null;
  let board: BoardView | null = null;
  let player: Player | null = null;
  let lesson: Lesson | null = null;
  let running = false;

  // -- left: Learn / Challenge ------------------------------------------------------
  const learnPanel = h("div", { class: "tab-panel" });
  const challengePanel = h("div", { class: "tab-panel", hidden: true }, h("p", { class: "muted" }, "Loading…"));
  const learnTab = h("button", { class: "tab active", onClick: () => showTab("learn") }, "Learn");
  const challengeTab = h("button", { class: "tab", onClick: () => showTab("challenge") }, "Challenge");
  const replDrawer = h("details", { class: "repl-drawer" }, h("summary", {}, "Scratch Python"), context.repl.element);

  lesson = renderLesson(source.lesson, { client, api: (source.data.api as string[]) ?? [] });
  learnPanel.append(
    h("p", { class: "trains" }, h("span", { class: "trains-label" }, "Trains"), source.trains),
    lesson.element,
    h("button", { class: "btn btn-primary", onClick: () => showTab("challenge") }, "Start the challenge →"),
  );

  function showTab(which: "learn" | "challenge"): void {
    learnPanel.hidden = which !== "learn";
    challengePanel.hidden = which !== "challenge";
    learnTab.classList.toggle("active", which === "learn");
    challengeTab.classList.toggle("active", which === "challenge");
  }

  // -- middle: board, playback controls, outcome -----------------------------------
  const boardHost = h("div", { class: "board-host" }, h("p", { class: "muted" }, "Setting up the board…"));
  const outcomeHost = h("div", { class: "outcome-host" });
  const slider = h("input", { type: "range", min: 0, max: 0, value: 0, class: "scrubber", "aria-label": "Playback position" });
  const stepLabel = h("span", { class: "step-label muted small" }, "");
  const speed = h(
    "select",
    { class: "speed", "aria-label": "Playback speed" },
    ...SPEEDS.map((value) => h("option", { value, selected: value === settings.get().speed }, `${value}×`)),
  );
  const control = (label: string, title: string, action: () => void) =>
    h("button", { class: "btn btn-icon", title, "aria-label": title, disabled: true, onClick: action }, label);
  const toStart = control("⏮", "Back to the start", () => player?.seek(0));
  const back = control("◀", "Step back", () => player?.previous());
  const playPause = control("▶", "Play", () => player?.toggle());
  const forward = control("▶|", "Step forward", () => player?.next());
  const toEnd = control("⏭", "Jump to the end", () => player?.seek(player.last));
  slider.addEventListener("input", () => player?.seek(Number(slider.value)));
  // The dropdown and the Settings menu are two views of one setting (QA-001, QA-006).
  speed.addEventListener("change", () => settings.set({ speed: Number(speed.value) }));
  const stopFollowingSettings = settings.subscribe((next) => {
    speed.value = String(next.speed);
    player?.setSpeed(next.speed);
  });
  // Opening Settings pauses playback, like a game's pause menu.
  const stopPausingOnSettings = context.settingsDialog.onOpen(() => player?.pause());

  // -- right: editor, run bar, variables and console -------------------------------
  const runButton = h("button", { class: "btn btn-primary", disabled: true, onClick: () => void run() }, "Run ▶");
  const stopButton = h("button", { class: "btn", disabled: true, onClick: () => stop() }, "Stop ■");
  const editorHost = h("div", { class: "editor" });
  const inspector = new Inspector();
  const consoleView = new Console();

  root.replaceChildren(
    h(
      "div",
      { class: "level", "data-level-id": source.id },
      h(
        "aside",
        { class: "panel level-left" },
        h("div", { class: "tabs", role: "tablist" }, learnTab, challengeTab),
        h("div", { class: "tab-scroll" }, learnPanel, challengePanel),
        replDrawer,
      ),
      h(
        "section",
        { class: "panel level-middle" },
        boardHost,
        h(
          "div",
          { class: "playback" },
          h("div", { class: "playback-buttons" }, toStart, back, playPause, forward, toEnd),
          slider,
          h("div", { class: "playback-meta" }, stepLabel, speed),
        ),
        outcomeHost,
      ),
      h(
        "section",
        { class: "panel level-right" },
        h("div", { class: "toolbar" }, runButton, stopButton, h("span", { class: "muted small toolbar-hint" }, "Ctrl+Enter runs")),
        editorHost,
        h("div", { class: "subpanel" }, h("h2", {}, "Variables"), inspector.element),
        h("div", { class: "subpanel" }, h("h2", {}, "Console"), consoleView.element),
      ),
    ),
  );

  const editor: EditorView = createEditor({
    parent: editorHost,
    code: context.drafts.get(source.id) ?? String(source.data.starter ?? ""),
    onRun: () => void run(),
    onChange: (code) => context.drafts.set(source.id, code),
    placeholder: `Write your code here, then press Run.\nYour pawn is called ${String(source.data.piece ?? "pawn")}.`,
  });
  inspector.reset();
  consoleView.show([]);

  // -- loading the level ------------------------------------------------------------
  void (async () => {
    try {
      await client.ready();
      const loaded = await client.call("loadLevel", { level: source.data });
      if (!loaded.ok) {
        boardHost.replaceChildren(noticeCard("bad", "This level file has a problem", loaded.error));
        return;
      }
      level = loaded.level;
      board = new BoardView(level);
      boardHost.replaceChildren(board.element);
      challengePanel.replaceChildren(...describeChallenge(level));
      runButton.disabled = false;
    } catch (error) {
      boardHost.replaceChildren(noticeCard("bad", "Python couldn't start", String(error)));
    }
  })();

  // -- running ----------------------------------------------------------------------
  async function run(): Promise<void> {
    if (!level || !board || running) return;
    player?.dispose();
    player = null;
    board.show(level.start);
    clearMarks(editor);
    inspector.reset();
    consoleView.show([]);
    outcomeHost.replaceChildren(h("p", { class: "muted" }, "Running…"));
    running = true;
    updateControls();
    try {
      const result = await client.call("runLevel", { level: source.data, code: getCode(editor) });
      showResult(result);
    } catch (error) {
      outcomeHost.replaceChildren(describeFailure(error));
    } finally {
      running = false;
      updateControls();
    }
  }

  function stop(): void {
    if (running) client.restart();
    else player?.pause();
  }

  function showResult(result: LevelResult): void {
    const marks: Mark[] = result.warnings.map((warning) => ({ ...warning, severity: "warning" }));
    if (result.error?.line) marks.push({ line: result.error.line, message: result.error.friendly, severity: "error" });
    setMarks(editor, marks);

    const frames = buildFrames(result);
    const last = frames.length - 1;
    slider.max = String(last);
    player = new Player(
      frames,
      (frame, index, { animate, durationMs }) => {
        if (animate && frame.step) board!.animate(frame.step.events, durationMs);
        else board!.show(frame.state);
        setActiveLine(editor, frame.step?.line ?? null);
        setErrorLine(editor, null);
        inspector.show(frame.step?.vars ?? null);
        consoleView.show(frame.log);
        if (index === last) finish(result, animate ? durationMs : 0);
        else outcomeHost.replaceChildren();
      },
      updateControls,
      settings.get().speed,
    );
    if (last > 0 && last <= AUTOPLAY_LIMIT && result.status !== "timeout") player.play();
    else player.seek(last);
  }

  function finish(result: LevelResult, afterMs: number): void {
    if (result.error) {
      setActiveLine(editor, null);
      setErrorLine(editor, result.error.line);
    }
    const actions: HTMLElement[] = [];
    if (result.status === "solved") {
      context.solved.add(source.id);
      const next = nextLevel(source.id);
      actions.push(
        next
          ? h("a", { class: "btn btn-primary btn-small", href: `#/level/${next.id}` }, "Next level →")
          : h("a", { class: "btn btn-primary btn-small", href: "#/" }, "Back to the levels"),
      );
      window.setTimeout(() => board?.setCelebrating(true), afterMs);
    }
    outcomeHost.replaceChildren(outcomeCard(result, actions));
  }

  function updateControls(): void {
    runButton.disabled = running || !level;
    runButton.textContent = running ? "Running…" : "Run ▶";
    stopButton.disabled = !running && !player?.playing;
    const ready = player !== null && player.last > 0;
    for (const button of [toStart, back, playPause, forward, toEnd]) button.disabled = !ready;
    if (player && ready) {
      toStart.disabled = back.disabled = player.index === 0;
      forward.disabled = toEnd.disabled = player.atEnd;
      playPause.textContent = player.playing ? "⏸" : "▶";
      playPause.title = player.playing ? "Pause" : player.atEnd ? "Replay" : "Play";
      slider.value = String(player.index);
      const line = player.frames[player.index]?.step?.line;
      stepLabel.textContent = `Step ${player.index} of ${player.last}${line ? ` · line ${line}` : ""}`;
    } else {
      stepLabel.textContent = "";
      slider.value = "0";
    }
    slider.disabled = !ready;
  }

  return () => {
    stopFollowingSettings();
    stopPausingOnSettings();
    player?.dispose();
    board?.dispose();
    lesson?.dispose();
    editor.destroy();
  };
}

function describeChallenge(level: LevelInfo): HTMLElement[] {
  const parts: HTMLElement[] = [
    h("h2", { class: "challenge-title" }, level.title),
    h("p", { class: "trains" }, h("span", { class: "trains-label" }, "Trains"), level.trains),
  ];
  if (level.brief) parts.push(h("p", {}, level.brief));

  const goals: HTMLElement[] = [];
  if (level.objectives.reach_goal && level.goal) goals.push(h("li", {}, `Reach the goal on ${squareName(level.goal)}.`));
  for (const phrase of level.objectives.say) {
    const fromSign = level.signs.some((sign) => sign.text.includes(phrase));
    goals.push(h("li", {}, fromSign ? "Say the phrase from the signpost: print it, exactly as written." : `Say "${phrase}" (print it).`));
  }
  level.tiles.forEach((row, y) =>
    row.forEach((tile, x) => {
      if (tile === "gate") goals.push(h("li", {}, `Get past the locked gate on ${squareName([x, y])}. A guard keeps it shut.`));
    }),
  );
  if (goals.length) parts.push(h("h3", {}, "Goal"), h("ul", { class: "objectives" }, ...goals));

  for (const sign of level.signs) {
    parts.push(h("blockquote", { class: "sign-text" }, h("span", { class: "muted small" }, `Signpost on ${squareName(sign.pos)}`), sign.text));
  }

  const rules: string[] = [];
  const { max_lines, min_comments, require_nodes, ban_nodes } = level.constraints;
  if (max_lines !== null) rules.push(`At most ${max_lines} ${max_lines === 1 ? "line" : "lines"} of code. Blank lines and comments don't count.`);
  if (min_comments) rules.push(`At least ${min_comments} ${min_comments === 1 ? "comment" : "comments"} (a note starting with #).`);
  for (const node of require_nodes) rules.push(`Must use: ${node}`);
  for (const node of ban_nodes) rules.push(`Not allowed: ${node}`);
  if (rules.length) parts.push(h("h3", {}, "Rules"), h("ul", { class: "rules" }, ...rules.map((rule) => h("li", {}, rule))));

  parts.push(
    h("h3", {}, `Your ${level.piece} knows`),
    h("p", { class: "abilities" }, ...level.api.map((name) => h("code", {}, `${level.piece}.${name}`))),
  );
  return parts;
}

function describeFailure(error: unknown): HTMLElement {
  if (error instanceof PythonHungError) {
    return noticeCard(
      "bad",
      "Stopped",
      "Your program was still busy after 3 seconds, so Python was stopped and restarted. It's ready again: fix the code and press Run.",
    );
  }
  if (error instanceof StoppedError) return noticeCard("warn", "Stopped", "You stopped the program.");
  return noticeCard("bad", "Something went wrong", String(error));
}
