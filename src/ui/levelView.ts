// A level: the lesson and challenge on the left, the board in the middle, the
// code editor and what the program is doing on the right.
import type { EditorView } from "@codemirror/view";
import { nextLevel, type LevelSource } from "../content";
import { PythonHungError, StoppedError, type PyClient } from "../py/client";
import type { LevelInfo, LevelResult } from "../py/protocol";
import { BoardView, squareName } from "./board";
import { h } from "./dom";
import { clearMarks, createEditor, getCode, setActiveLine, setErrorLine, setMarks, type Mark } from "./editor";
import { renderLesson, type Lesson } from "./lesson";
import { Console, Inspector, noticeCard, outcomeCard } from "./panels";
import { callCompletion, KnownCalls } from "./completion";
import { icon, type IconName } from "./icons";
import { Player, buildFrames, controlStates } from "./playback";
import type { ReplPanel } from "./repl";
import type { SettingsDialog } from "./settingsDialog";
import { SPEEDS, settings } from "../settings";

export interface LevelContext {
  client: PyClient;
  repl: ReplPanel;
  settingsDialog: SettingsDialog;
  solved: Set<string>;
  drafts: Map<string, string>; // code per level, kept while the tab is open
  knownCalls: Map<string, KnownCalls>; // calls typed per level, for autocomplete (QA-003)
}

const AUTOPLAY_LIMIT = 150; // longer runs open at the end instead of playing

export function mountLevel(root: HTMLElement, context: LevelContext, source: LevelSource): () => void {
  const { client } = context;
  let level: LevelInfo | null = null;
  let board: BoardView | null = null;
  let player: Player | null = null;
  let lesson: Lesson | null = null;
  let running = false;
  let lastResult: LevelResult | null = null;
  let recordedCode: string | null = null; // the code the current (or last) recording was made from

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
  // Playback buttons (QA-005). Without a recording of the current code, Play and
  // the right arrows run it first; see controlStates in playback.ts.
  const control = (name: IconName, title: string, action: () => void) =>
    h("button", { class: "btn btn-icon", title, "aria-label": title, disabled: true, onClick: action }, icon(name));
  const toStart = control("toStart", "Back to the start", () => player?.seek(0));
  const back = control("stepBack", "Step back", () => player?.previous());
  const playPause = control("play", "Play", () => (player ? player.toggle() : void run("play")));
  const forward = control("stepForward", "Step forward", () => (player ? player.next() : void run("step")));
  const toEnd = control("toEnd", "Jump to the outcome", () => (player ? player.seek(player.last) : void run("end")));
  let playIcon: IconName = "play";
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
        h("div", { class: "subpanel subpanel-vars" }, h("h2", {}, "Variables"), inspector.element),
        h("div", { class: "subpanel subpanel-console" }, h("h2", {}, "Console"), consoleView.element),
      ),
    ),
  );

  const known = context.knownCalls.get(source.id) ?? new KnownCalls();
  context.knownCalls.set(source.id, known);
  const editor: EditorView = createEditor({
    parent: editorHost,
    extensions: callCompletion({ known, piece: () => level?.piece ?? null, api: () => level?.api ?? [] }),
    code: context.drafts.get(source.id) ?? String(source.data.starter ?? ""),
    onRun: () => void run(),
    onChange: (code) => {
      context.drafts.set(source.id, code);
      if (player && code !== recordedCode) dropRecording();
    },
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
      updateControls();
    } catch (error) {
      boardHost.replaceChildren(noticeCard("bad", "Python couldn't start", String(error)));
    }
  })();

  // -- running ----------------------------------------------------------------------
  /** Run the editor's code; then play it, show its first step, or jump to the end. */
  async function run(mode: "play" | "step" | "end" = "play"): Promise<void> {
    if (!level || !board || running) return;
    player?.dispose();
    player = null;
    lastResult = null;
    recordedCode = getCode(editor);
    board.show(level.start);
    clearMarks(editor);
    inspector.reset();
    consoleView.show([]);
    outcomeHost.replaceChildren(h("p", { class: "muted" }, "Running…"));
    running = true;
    updateControls();
    try {
      const result = await client.call("runLevel", { level: source.data, code: recordedCode });
      showResult(result, mode);
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

  /** The code changed since the last run: drop the recording, so the controls run the new code. */
  function dropRecording(): void {
    player?.dispose();
    player = null;
    const card = outcomeHost.querySelector(".outcome");
    if (card && !card.classList.contains("stale")) {
      card.classList.add("stale");
      card.append(h("p", { class: "stale-note small" }, "Your code has changed since this run. Press Play to run the new version."));
    }
    updateControls();
  }

  function showResult(result: LevelResult, mode: "play" | "step" | "end"): void {
    lastResult = result;
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
    const autoplay = last > 0 && last <= AUTOPLAY_LIMIT && result.status !== "timeout";
    if (mode === "step" && last > 0) player.next();
    else if (mode === "play" && autoplay) player.play();
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
    const state = controlStates({
      loaded: level !== null,
      running,
      recording: player ? { index: player.index, last: player.last, playing: player.playing } : null,
      failed: Boolean(lastResult?.error),
    });
    toStart.disabled = !state.toStart;
    back.disabled = !state.back;
    playPause.disabled = !state.play;
    forward.disabled = !state.forward;
    toEnd.disabled = !state.toEnd;
    const wanted: IconName = state.playing ? "pause" : "play";
    if (wanted !== playIcon) {
      playPause.replaceChildren(icon(wanted));
      playIcon = wanted;
    }
    for (const [button, title] of [
      [playPause, state.playTitle],
      [toEnd, state.toEndTitle],
    ] as const) {
      button.title = title;
      button.setAttribute("aria-label", title);
    }
    const recorded = player !== null && player.last > 0;
    slider.disabled = !recorded;
    if (player) {
      slider.max = String(player.last);
      slider.value = String(player.index);
      const line = player.frames[player.index]?.step?.line;
      stepLabel.textContent = recorded ? `Step ${player.index} of ${player.last}${line ? ` · line ${line}` : ""}` : "";
    } else {
      slider.value = "0";
      const changed = recordedCode !== null && !running && getCode(editor) !== recordedCode;
      stepLabel.textContent = changed ? "Code changed since the last run." : "";
    }
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
