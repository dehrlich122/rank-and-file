// The app shell: top bar, Python status, settings, and switching between screens.
//
// Routes (in the URL hash):
//   #/                 level select
//   #/level/<id>       a level
//   #/harness          the raw Python harness from Milestone 0
import { chapters, findLevel } from "./content";
import { mountHarness } from "./harness";
import { PyClient, startPythonWorker, type ClientStatus } from "./py/client";
import { applyToDocument, settings } from "./settings";
import { h } from "./ui/dom";
import { icon } from "./ui/icons";
import { renderLevelSelect } from "./ui/levelSelect";
import { mountLevel, type LevelContext } from "./ui/levelView";
import { ReplPanel } from "./ui/repl";
import { SettingsDialog } from "./ui/settingsDialog";

export function startApp(root: HTMLElement): void {
  applyToDocument(settings.get());
  settings.subscribe(applyToDocument);

  const dialog = new SettingsDialog(settings);
  const status = h("span", { class: "status", "data-state": "loading" }, "Loading Python…");
  const settingsButton = h(
    "button",
    { class: "btn btn-small settings-button", title: "Settings (Esc)", "aria-haspopup": "dialog", onClick: () => dialog.open() },
    icon("settings"),
    "Settings",
  );
  const crumbs = h("nav", { class: "crumbs", "aria-label": "Where you are" });
  const main = h("main", { class: "screen" });
  root.replaceChildren(
    h(
      "div",
      { class: "app" },
      h("header", { class: "topbar" }, h("a", { class: "brand", href: "#/" }, "♟ Rank & File"), crumbs, status, settingsButton),
      main,
    ),
    dialog.element,
  );

  // Esc opens settings from anywhere, unless something else used that Esc
  // first (closing the autocomplete list or the search panel in the editor):
  // CodeMirror marks the keys it handles with preventDefault().
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || dialog.isOpen) return;
    event.preventDefault();
    dialog.open();
  });

  const client = new PyClient({ createWorker: startPythonWorker, onStatus: (next) => showStatus(status, next) });
  const context: LevelContext = {
    client,
    repl: new ReplPanel(client),
    settingsDialog: dialog,
    solved: new Set(),
    drafts: new Map(),
    knownCalls: new Map(),
  };
  let unmount: () => void = () => {};

  function route(): void {
    unmount();
    unmount = () => {};
    const hash = location.hash || "#/";
    const levelMatch = /^#\/level\/([\w-]+)$/.exec(hash);
    const source = levelMatch ? findLevel(levelMatch[1]!) : undefined;
    if (source) {
      const chapter = chapters.find((c) => c.chapter === source.chapter);
      const number = (chapter?.levels.indexOf(source) ?? -1) + 1;
      crumbs.replaceChildren(
        h("a", { href: "#/" }, chapter ? `Chapter ${chapter.chapter} · ${chapter.title}` : "Levels"),
        h("span", { class: "crumb-sep" }, "/"),
        h("span", {}, `${number}. ${source.title}`),
      );
      unmount = mountLevel(main, context, source);
      document.title = `${source.title} · Rank & File`;
    } else if (hash === "#/harness") {
      crumbs.replaceChildren(h("span", {}, "Python harness"));
      unmount = mountHarness(main, client);
      document.title = "Harness · Rank & File";
    } else {
      crumbs.replaceChildren();
      main.replaceChildren(renderLevelSelect(chapters, context.solved));
      document.title = "Rank & File";
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", route);
  route();
}

function showStatus(element: HTMLElement, status: ClientStatus): void {
  element.dataset.state = status.state;
  if (status.state === "loading") element.textContent = "Loading Python…";
  else if (status.state === "ready") element.textContent = `Python ${status.pythonVersion} ready`;
  else element.textContent = `Python failed to load: ${status.message}`;
  element.title = status.state === "ready" ? `Loaded in ${(status.loadMs / 1000).toFixed(1)} s` : "";
}
