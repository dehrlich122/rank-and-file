// The Learn phase: a short Markdown lesson whose ```python run``` blocks become
// small editors you can run in place, each with its own mini board.
import { marked, type Token, type TokensList } from "marked";
import type { EditorView } from "codemirror";
import { PythonHungError, type PyClient } from "../py/client";
import type { LevelInfo, LevelResult } from "../py/protocol";
import { BoardView } from "./board";
import { h } from "./dom";
import { createEditor, getCode, setActiveLine, setErrorLine } from "./editor";
import { errorCard } from "./panels";
import { Player, buildFrames } from "./playback";
import { settings } from "../settings";

export interface LessonContext {
  client: PyClient;
  api: string[]; // the level's abilities; snippets can use exactly these
}

export interface Lesson {
  element: HTMLElement;
  dispose(): void;
}

export function renderLesson(markdown: string, context: LessonContext): Lesson {
  const element = h("div", { class: "lesson" });
  const snippets: Snippet[] = [];
  let sandbox: Promise<LevelInfo> | null = null;
  const loadSandbox = () =>
    (sandbox ??= context.client.ready().then(() => context.client.call("loadSandbox", { api: context.api })));

  const tokens = marked.lexer(markdown);
  let pending: Token[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    const list = Object.assign([...pending], { links: tokens.links }) as TokensList;
    // Lessons are our own trusted content, so rendering their HTML is fine.
    element.insertAdjacentHTML("beforeend", marked.parser(list));
    pending = [];
  };
  for (const token of tokens) {
    if (token.type === "code" && /^python run\b/.test(token.lang ?? "")) {
      flush();
      const snippet = new Snippet(token.text, context, loadSandbox);
      snippets.push(snippet);
      element.append(snippet.element);
    } else {
      pending.push(token);
    }
  }
  flush();

  return { element, dispose: () => snippets.forEach((snippet) => snippet.dispose()) };
}

class Snippet {
  readonly element: HTMLElement;
  private readonly editor: EditorView;
  private readonly boardHost = h("div", { class: "snippet-board" });
  private readonly status = h("span", { class: "snippet-status muted small" });
  private readonly output = h("pre", { class: "snippet-output", hidden: true });
  private readonly errorHost = h("div", {});
  private readonly runButton: HTMLButtonElement;
  private board: BoardView | null = null;
  private player: Player | null = null;

  constructor(
    code: string,
    private readonly context: LessonContext,
    private readonly loadSandbox: () => Promise<LevelInfo>,
  ) {
    const editorHost = h("div", { class: "snippet-editor" });
    this.runButton = h("button", { class: "btn btn-small btn-primary", onClick: () => void this.run() }, "Run ▶");
    this.element = h(
      "div",
      { class: "snippet" },
      editorHost,
      h(
        "div",
        { class: "snippet-row" },
        h("div", { class: "snippet-bar" }, this.runButton, this.status, this.output, this.errorHost),
        this.boardHost,
      ),
    );
    this.editor = createEditor({ parent: editorHost, code: code.trimEnd(), compact: true, onRun: () => void this.run() });
    void this.loadSandbox().then(
      (level) => this.showBoard(level),
      () => {},
    );
  }

  private showBoard(level: LevelInfo): BoardView {
    if (!this.board) {
      this.board = new BoardView(level, { mini: true });
      this.boardHost.replaceChildren(this.board.element);
    }
    return this.board;
  }

  async run(): Promise<void> {
    this.player?.dispose();
    this.runButton.disabled = true;
    this.status.textContent = "Running…";
    this.errorHost.replaceChildren();
    setErrorLine(this.editor, null);
    try {
      const level = await this.loadSandbox();
      const board = this.showBoard(level);
      const result = await this.context.client.call("runSandbox", { code: getCode(this.editor), api: this.context.api });
      this.play(result, board);
    } catch (error) {
      this.status.textContent =
        error instanceof PythonHungError ? "Stopped: it was still running after 3 seconds." : `Something went wrong: ${String(error)}`;
    } finally {
      this.runButton.disabled = false;
    }
  }

  private play(result: LevelResult, board: BoardView): void {
    const frames = buildFrames(result);
    const last = frames.length - 1;
    this.player = new Player(frames, (frame, index, { animate, durationMs }) => {
      if (animate && frame.step) board.animate(frame.step.events, durationMs);
      else board.show(frame.state);
      setActiveLine(this.editor, frame.step?.line ?? null);
      this.output.textContent = frame.output;
      this.output.hidden = frame.output === "";
      if (index === last) this.finish(result);
      else this.status.textContent = `Line ${frame.step?.line ?? "–"}`;
    }, undefined, settings.get().speed);
    if (last > 0 && last <= 150) this.player.play();
    else this.player.seek(last);
  }

  private finish(result: LevelResult): void {
    setActiveLine(this.editor, null);
    if (result.error) {
      this.status.textContent = result.status === "timeout" ? "⏱ Stopped" : "✗ Python stopped";
      setErrorLine(this.editor, result.error.line);
      this.errorHost.replaceChildren(errorCard(result.error));
    } else {
      this.status.textContent = "✓ Finished";
    }
  }

  dispose(): void {
    this.player?.dispose();
    this.board?.dispose();
    this.editor.destroy();
  }
}
