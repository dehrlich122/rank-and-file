// A level: the lesson and challenge on the left, the board in the middle, the
// code editor and what the program is doing on the right.
import type { EditorView } from "@codemirror/view";
import { codexChapters, nextLevel, type LevelSource } from "../content";
import { PythonHungError, StoppedError, type PyClient } from "../py/client";
import type { LevelInfo, LevelResult } from "../py/protocol";
import { BoardView, squareName } from "./board";
import { ChipTooltip, codexHover, renderCodex, type CodexLookup, type CodexView } from "./codex";
import { h } from "./dom";
import { clearMarks, createEditor, getCode, setActiveLine, setErrorLine, setMarks, type Mark } from "./editor";
import { renderLesson, type Lesson } from "./lesson";
import { Console, Inspector, noticeCard, outcomeCard } from "./panels";
import { callCompletion, KnownCalls } from "./completion";
import { HelpPanel } from "./help";
import { icon, type IconName } from "./icons";
import { Player, buildFrames, consoleAt, controlStates } from "./playback";
import type { ReplPanel } from "./repl";
import type { SettingsDialog } from "./settingsDialog";
import { progress } from "../progress";
import { SPEEDS, settings } from "../settings";

export interface LevelContext {
  client: PyClient;
  repl: ReplPanel;
  settingsDialog: SettingsDialog;
  knownCalls: Map<string, KnownCalls>; // calls typed per level, for autocomplete (QA-003)
}

const AUTOPLAY_LIMIT = 150; // longer runs open at the end instead of playing

export function mountLevel(root: HTMLElement, context: LevelContext, source: LevelSource): () => void {
  const { client } = context;
  let level: LevelInfo | null = null;
  let board: BoardView | null = null;
  let caseBoard: BoardView | null = null; // the board of the case being replayed (M2), shown instead
  const shownBoard = () => caseBoard ?? board;
  let runResult: LevelResult | null = null; // the last run as a whole: its verdict, stars and cases
  let player: Player | null = null;
  let lesson: Lesson | null = null;
  let help: HelpPanel | null = null;
  let running = false;
  let lastResult: LevelResult | null = null; // the recording on show: the run itself, or one of its cases
  let recordedCode: string | null = null; // the code the current (or last) recording was made from
  let codex: CodexView | null = null; // the Codex tab, and the entries hover tooltips use, once the engine has sent them

  // -- left: Learn / Challenge / Codex ----------------------------------------------
  const learnPanel = h("div", { class: "tab-panel" });
  const challengePanel = h("div", { class: "tab-panel", hidden: true }, h("p", { class: "muted" }, "Loading…"));
  const codexPanel = h("div", { class: "tab-panel", hidden: true }, h("p", { class: "muted" }, "Loading…"));
  const learnTab = h("button", { class: "tab active", onClick: () => showTab("learn") }, "Learn");
  const challengeTab = h("button", { class: "tab", onClick: () => showTab("challenge") }, "Challenge");
  const codexTab = h("button", { class: "tab", onClick: () => showTab("codex") }, "Codex");
  const replDrawer = h("details", { class: "repl-drawer" }, h("summary", {}, "Scratch Python"), context.repl.element);

  lesson = renderLesson(source.lesson, {
    client,
    api: (source.data.api as string[] | undefined) ?? [],
    board: source.data.lesson_board,
    codex: () => codex,
  });
  learnPanel.append(h("p", { class: "trains" }, h("span", { class: "trains-label" }, "Trains"), source.trains), lesson.element);

  // The lesson is paged, one step per runnable snippet (QA-010). The pager sits
  // at the bottom of the panel, outside the scrolling area.
  const stepBack = h("button", { class: "btn btn-small", onClick: () => goToStep(lesson!.step - 1) }, "← Back");
  const stepCount = h("span", { class: "muted small" });
  const stepNext = h("button", { class: "btn btn-small btn-primary", onClick: () => nextStep() });
  const pager = h("div", { class: "lesson-pager" }, stepBack, stepCount, stepNext);
  const tabScroll = h("div", { class: "tab-scroll" }, learnPanel, challengePanel, codexPanel);

  function goToStep(step: number): void {
    lesson!.show(step);
    tabScroll.scrollTop = 0;
    updatePager();
  }

  function nextStep(): void {
    if (lesson!.step < lesson!.stepCount - 1) goToStep(lesson!.step + 1);
    else showTab("challenge");
  }

  function updatePager(): void {
    const { step, stepCount: total } = lesson!;
    const last = step === total - 1;
    stepBack.hidden = total === 1;
    stepBack.disabled = step === 0;
    stepCount.hidden = total === 1;
    stepCount.textContent = `Step ${step + 1} of ${total}`;
    stepNext.textContent = last ? "Start the challenge →" : "Next →";
  }
  updatePager();

  function showTab(which: "learn" | "challenge" | "codex"): void {
    learnPanel.hidden = which !== "learn";
    challengePanel.hidden = which !== "challenge";
    codexPanel.hidden = which !== "codex";
    pager.hidden = which !== "learn";
    learnTab.classList.toggle("active", which === "learn");
    challengeTab.classList.toggle("active", which === "challenge");
    codexTab.classList.toggle("active", which === "codex");
  }

  /** A chip in the Challenge panel was clicked: open its Codex entry. */
  function openCodexEntry(name: string): void {
    showTab("codex");
    codex?.show(name);
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
  // So are the Wrap button above the editor and Wrap long lines (QA-015).
  const wrapToggle = h(
    "button",
    {
      class: "btn btn-small btn-toggle",
      title: "Wrap long lines",
      "aria-pressed": String(settings.get().wrapLines),
      onClick: () => settings.set({ wrapLines: !settings.get().wrapLines }),
    },
    icon("wrap"),
    "Wrap",
  );
  const stopFollowingSettings = settings.subscribe((next) => {
    speed.value = String(next.speed);
    player?.setSpeed(next.speed);
    wrapToggle.setAttribute("aria-pressed", String(next.wrapLines));
    placePlayback();
  });
  // Opening Settings pauses playback, like a game's pause menu.
  const stopPausingOnSettings = context.settingsDialog.onOpen(() => player?.pause());

  // -- right: editor, run bar, variables and console -------------------------------
  const runButton = h("button", { class: "btn btn-primary", disabled: true, onClick: () => void run() }, "Run ▶");
  const stopButton = h("button", { class: "btn", disabled: true, onClick: () => stop() }, "Stop ■");
  const editorHost = h("div", { class: "editor" });
  const inspector = new Inspector();
  const consoleView = new Console();

  // The Learn/Challenge panel can collapse to a strip (QA-011, QA-013). Only the
  // panel changes: the board and the code stay exactly where they are. It's
  // hidden, not rebuilt, so the lesson step, snippet runs and Scratch Python
  // survive. Collapsed lasts for this level only.
  const collapseButton = h(
    "button",
    { class: "btn btn-icon panel-toggle", title: "Hide the lesson panel", "aria-label": "Hide the lesson panel", onClick: () => setCollapsed(true) },
    icon("collapsePanel"),
  );
  const expandStrip = h(
    "button",
    { class: "expand-strip", title: "Show the lesson panel", "aria-label": "Show the lesson panel", onClick: () => setCollapsed(false) },
    icon("expandPanel"),
    h("span", { class: "expand-label" }, "Learn · Challenge · Codex"),
  );
  const playbackBar = h(
    "div",
    { class: "playback" },
    h("div", { class: "playback-buttons" }, toStart, back, playPause, forward, toEnd),
    slider,
    h("div", { class: "playback-meta" }, stepLabel, speed),
  );
  const middlePanel = h("section", { class: "panel level-middle" }, boardHost);
  const playbackSlot = h("div", { class: "code-info-playback" });
  const codeInfo = h(
    "div",
    { class: "code-info" },
    playbackSlot,
    h("div", { class: "subpanel subpanel-vars" }, h("h2", {}, "Variables"), inspector.element),
    h("div", { class: "subpanel subpanel-console" }, h("h2", {}, "Console"), consoleView.element),
  );
  const layout = h(
    "div",
    { class: "level", "data-level-id": source.id },
    h(
      "aside",
      { class: "panel level-left" },
      h("div", { class: "tabs", role: "tablist" }, learnTab, challengeTab, codexTab, collapseButton),
      tabScroll,
      pager,
      replDrawer,
      expandStrip,
    ),
      middlePanel,
      h(
        "section",
        { class: "panel level-right" },
        h("div", { class: "toolbar" }, runButton, stopButton, h("span", { class: "muted small toolbar-hint" }, "Ctrl+Enter runs"), wrapToggle),
        editorHost,
        codeInfo,
      ),
  );
  root.replaceChildren(layout);
  const chipTooltip = new ChipTooltip(layout); // inside the level screen, so it goes when the screen does

  // With the code at the bottom, the playback bar and outcome card sit beside
  // the editor with Variables and Console, so the board has its row to itself
  // (QA-012). They're moved, not rebuilt, so playback survives the switch.
  // Narrow windows keep the code-panel layout's default (see styles.css).
  const wideScreen = window.matchMedia("(min-width: 1181px)");
  function placePlayback(): void {
    const besideCode = settings.get().codePanel === "bottom" && wideScreen.matches;
    const target = besideCode ? playbackSlot : middlePanel;
    if (playbackBar.parentElement !== target) target.append(playbackBar, outcomeHost); // only move when it changes
  }
  placePlayback();
  wideScreen.addEventListener("change", placePlayback);

  function setCollapsed(collapsed: boolean): void {
    layout.classList.toggle("learn-collapsed", collapsed);
    (collapsed ? expandStrip : collapseButton).focus();
  }

  const known = context.knownCalls.get(source.id) ?? new KnownCalls();
  context.knownCalls.set(source.id, known);
  const editor: EditorView = createEditor({
    parent: editorHost,
    extensions: [...callCompletion({ known, piece: () => level?.piece ?? null, api: () => level?.api ?? [] }), codexHover(() => codex)],
    code: progress.level(source.id).code ?? String(source.data.starter ?? ""),
    onRun: () => void run(),
    onChange: (code) => {
      progress.update(source.id, { code });
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
      if (level.boards.length) previewBoard(0); // the tabs for its other boards (M3.2)
      else boardHost.replaceChildren(board.element);
      help = new HelpPanel(source.id, level.hints, () => getCode(editor));
      challengePanel.replaceChildren(...describeChallenge(level, openCodexEntry, chipTooltip, () => codex), help.element);
      updateControls();
      // Scratch Python gets a stand-in for this level's piece, and its tooltips follow this level's Codex.
      context.repl.setLevel({ piece: level.piece, api: level.api, codex: () => codex });
      void loadCodex(level);
    } catch (error) {
      boardHost.replaceChildren(noticeCard("bad", "Python couldn't start", String(error)));
    }
  })();

  /** The Codex tab and the hover tooltips: everything taught so far (docs/Codex.md). */
  async function loadCodex(loaded: LevelInfo): Promise<void> {
    try {
      const entries = await client.call("codex", { levelId: source.id, chapters: codexChapters() });
      codex = renderCodex(entries, loaded.piece);
      codexPanel.replaceChildren(codex.element);
    } catch (error) {
      codexPanel.replaceChildren(noticeCard("bad", "The Codex couldn't load", String(error)));
    }
  }

  // -- running ----------------------------------------------------------------------
  /** Run the editor's code; then play it, show its first step, or jump to the end. */
  async function run(mode: "play" | "step" | "end" = "play"): Promise<void> {
    if (!level || !board || running) return;
    lastResult = null;
    runResult = null;
    recordedCode = getCode(editor);
    resetStage();
    clearMarks(editor);
    inspector.reset();
    consoleView.show([]);
    outcomeHost.replaceChildren(h("p", { class: "muted" }, "Running…"));
    running = true;
    updateControls();
    try {
      const { hints: hintsUsed, solutionSeen } = progress.level(source.id);
      const result = await client.call("runLevel", { level: source.data, code: recordedCode, hintsUsed, solutionSeen });
      runResult = result;
      help?.recordRun(result); // once per run, here rather than in playback, which can reach the end many times
      showCase(result.case, mode);
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

  /** Play the last run: its recording, or with several cases (M2) case number `index`, on that case's board. */
  function showCase(index: number, mode: "play" | "step" | "end"): void {
    if (!runResult) return;
    if (runResult.cases.length) showCaseBoard(runResult, index);
    playRecording(runResult.cases[index] ?? runResult, mode);
  }

  function playRecording(result: LevelResult, mode: "play" | "step" | "end"): void {
    player?.dispose(); // a replay started during another must stop the first
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
        if (animate && frame.step) shownBoard()!.animate(frame.step.events, durationMs);
        else shownBoard()!.show(frame.state);
        setActiveLine(editor, frame.step?.line ?? null);
        setErrorLine(editor, null);
        inspector.show(frame.step?.vars ?? null);
        consoleView.show(consoleAt(frame));
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
    // The verdict and what's on offer follow the run as a whole; the details
    // come from the recording on show (the run, or one of its cases).
    const run = runResult ?? result;
    const actions: HTMLElement[] = [];
    const offer = help?.outcomeAction(run, recordedCode ?? "", showHelp);
    if (offer) actions.push(offer);
    if (run.status === "solved") {
      const next = nextLevel(source.id);
      actions.push(
        next
          ? h("a", { class: "btn btn-primary btn-small", href: `#/level/${next.id}` }, "Next level →")
          : h("a", { class: "btn btn-primary btn-small", href: "#/" }, "Back to the levels"),
      );
      window.setTimeout(() => shownBoard()?.setCelebrating(true), afterMs);
    }
    outcomeHost.replaceChildren(outcomeCard(run, result, actions));
  }

  // -- several cases (M2): a hidden goal's ? squares, other maps ------------------------
  // A run comes back with every case's result. The board shows the case being
  // replayed (its goal, and ✓ or ✗ on each ? square), and a row of buttons
  // above it replays any other case. A level with other maps (M3.2) shows the
  // row before a run too, as tabs: each one shows its board.
  function showCaseBoard(run: LevelResult, index: number): void {
    caseBoard?.dispose();
    // ✓ or ✗ on each ? square: whether the code reached a goal hidden there.
    const spots = new Map(run.cases.flatMap((c) => (c.level.goal ? [[squareName(c.level.goal), c.status === "solved"] as const] : [])));
    caseBoard = new BoardView(run.cases[index]!.level, { spots });
    const labels = run.cases.map((c, i) => `${level?.boards.length ? `Board ${i + 1}` : c.label} ${c.status === "solved" ? "✓" : "✗"}`);
    boardHost.replaceChildren(caseRow(labels, index, (i) => showCase(i, "play")), caseBoard.element);
  }

  /** Before a run, on a level with other maps: show board `index`, as it starts. */
  function previewBoard(index: number): void {
    if (!level || !board) return;
    caseBoard?.dispose();
    caseBoard = index > 0 ? new BoardView(level.boards[index]!) : null;
    const labels = level.boards.map((_, i) => `Board ${i + 1}`);
    boardHost.replaceChildren(caseRow(labels, index, previewBoard), (caseBoard ?? board).element);
  }

  /** The row above the board: one button per case, `selected` pressed. */
  function caseRow(labels: string[], selected: number, pick: (index: number) => void): HTMLElement {
    const title = level?.case_title ?? "";
    const buttons = labels.map((text, i) =>
      h("button", { class: "btn btn-small btn-toggle", "aria-pressed": String(i === selected), onClick: () => pick(i) }, text),
    );
    return h("div", { class: "case-row", role: "group", "aria-label": title }, h("span", { class: "muted small" }, `${title}:`), ...buttons);
  }

  /** No recording, and the level's own board at the start: before every run. */
  function resetStage(): void {
    player?.dispose();
    player = null;
    if (level?.boards.length) previewBoard(0);
    else if (caseBoard && board) {
      caseBoard.dispose();
      caseBoard = null;
      boardHost.replaceChildren(board.element);
    }
    if (level) board?.show(level.start);
  }

  /** Opens the Challenge panel at the help (expanding a collapsed panel). */
  function showHelp(): void {
    if (layout.classList.contains("learn-collapsed")) setCollapsed(false);
    showTab("challenge");
    help?.focus();
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
    wideScreen.removeEventListener("change", placePlayback);
    stopPausingOnSettings();
    player?.dispose();
    board?.dispose();
    caseBoard?.dispose();
    lesson?.dispose();
    editor.destroy();
    context.repl.setLevel(null); // so Scratch Python doesn't keep this screen alive
  };
}

function describeChallenge(level: LevelInfo, openEntry: (name: string) => void, tooltip: ChipTooltip, codex: () => CodexLookup | null): HTMLElement[] {
  const parts: HTMLElement[] = [
    h("h2", { class: "challenge-title" }, level.title),
    h("p", { class: "trains" }, h("span", { class: "trains-label" }, "Trains"), level.trains),
  ];
  if (level.mastery) {
    parts.push(
      h("p", { class: "mastery-note" }, h("span", { class: "mastery-tag" }, "Mastery · optional"), " A harder challenge for the whole chapter, played for par."),
    );
  }
  if (level.brief) parts.push(h("p", {}, level.brief));

  // The goals and rules come worded from the engine (Level.describe), which owns
  // every player-facing description of the game's rules.
  const list = (className: string, items: string[]) => h("ul", { class: className }, ...items.map((item) => h("li", {}, item)));
  if (level.goals.length) parts.push(h("h3", {}, "Goal"), list("objectives", level.goals));
  for (const sign of level.signs) {
    parts.push(h("blockquote", { class: "sign-text" }, h("span", { class: "muted small" }, `Signpost on ${squareName(sign.pos)}`), sign.text));
  }
  if (level.obstacles.length) parts.push(h("h3", {}, "Obstacles"), list("obstacles", level.obstacles));
  if (level.rules.length) parts.push(h("h3", {}, "Rules"), list("rules", level.rules));
  parts.push(h("h3", {}, "Stars"), list("star-goals", level.stars));

  // Each ability is a way into the Codex: hover for its entry, click to open it there.
  const chip = (name: string) => {
    const button = h("button", { class: "codex-chip", onClick: () => openEntry(name) }, h("code", {}, name));
    tooltip.attach(button, () => codex()?.entries.get(name));
    return button;
  };
  parts.push(
    h("h3", {}, `Your ${level.piece} knows`),
    h("p", { class: "abilities" }, ...level.api.map((name) => chip(`${level.piece}.${name}`))),
  );
  return parts;
}

function describeFailure(error: unknown): HTMLElement {
  if (error instanceof PythonHungError) {
    return noticeCard(
      "bad",
      "Stopped",
      `Your program was still busy after ${error.timeoutMs / 1000} seconds, so Python was stopped and restarted. It's ready again: fix the code and press Run.`,
    );
  }
  if (error instanceof StoppedError) return noticeCard("warn", "Stopped", "You stopped the program.");
  return noticeCard("bad", "Something went wrong", String(error));
}
