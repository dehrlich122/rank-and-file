// The app shell: top bar, Python status, settings, and switching between screens.
//
// Routes (in the URL hash):
//   #/                 the start menu
//   #/lessons[/<n>]    the Lessons directory, with chapter n open
//   #/promotion/<tier> the promotion ceremony (M3.7)
//   #/level/<id>       a level
//   #/harness          the raw Python harness from Milestone 0
//   #/styleguide       the look at every size, in both themes (M3.7)
import { chapterName, chapters, findLevel } from "./content";
import { mountHarness } from "./harness";
import { unlockedPieces, wornPiece } from "./promotion";
import { progress } from "./progress";
import { PyClient, startPythonWorker, type ClientStatus } from "./py/client";
import { applyToDocument, settings } from "./settings";
import { h } from "./ui/dom";
import { icon } from "./ui/icons";
import { mountLessons } from "./ui/lessonsMenu";
import { mountLevel, type LevelContext } from "./ui/levelView";
import { mountPromotion } from "./ui/promotionScreen";
import { ReplPanel } from "./ui/repl";
import { SettingsDialog } from "./ui/settingsDialog";
import { mountTitle } from "./ui/titleScreen";
import { mountStyleguide } from "./ui/styleguide";

export function startApp(root: HTMLElement): void {
  applyToDocument(settings.get());
  settings.subscribe(applyToDocument);

  const dialog = new SettingsDialog(
    settings,
    () => {
      progress.reset();
      context.knownCalls.clear();
      route(); // redraw the screen from the cleared progress
    },
    () => unlockedPieces(progress),
  );
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
  // CodeMirror marks the keys it handles with preventDefault(). With a dialog
  // open (Settings, or the solution comparison), Esc closes that instead.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    dialog.open();
  });

  const client = new PyClient({ createWorker: startPythonWorker, onStatus: (next) => showStatus(status, next) });
  const context: LevelContext = {
    client,
    repl: new ReplPanel(client),
    settingsDialog: dialog,
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
        h("a", { href: "#/lessons" }, "Lessons"),
        h("span", { class: "crumb-sep" }, "/"),
        h("a", { href: chapter ? `#/lessons/${chapter.chapter}` : "#/lessons" }, chapter ? chapterName(chapter) : "Levels"),
        h("span", { class: "crumb-sep" }, "/"),
        h("span", {}, `${number}. ${source.title}`),
      );
      unmount = mountLevel(main, context, source);
      document.title = `${source.title} · Rank & File`;
    } else if (hash === "#/harness") {
      crumbs.replaceChildren(h("span", {}, "Python harness"));
      unmount = mountHarness(main, client);
      document.title = "Harness · Rank & File";
    } else if (hash === "#/styleguide") {
      crumbs.replaceChildren(h("span", {}, "Style guide"));
      unmount = mountStyleguide(main);
      document.title = "Style guide · Rank & File";
    } else if (/^#\/lessons(\/\d+)?$/.test(hash)) {
      const focus = /\/(\d+)$/.exec(hash)?.[1];
      crumbs.replaceChildren(h("span", {}, "Lessons"));
      unmount = mountLessons(main, chapters, progress, client, focus === undefined ? undefined : Number(focus));
      document.title = "Lessons · Rank & File";
    } else if (/^#\/promotion\/\w+$/.test(hash)) {
      crumbs.replaceChildren(h("span", {}, "Promotion"));
      unmount = mountPromotion(main, hash.slice("#/promotion/".length), progress, settings);
      document.title = "Promotion · Rank & File";
    } else {
      crumbs.replaceChildren();
      unmount = mountTitle(main, { skin: wornPiece(progress), lessons: () => (location.hash = "#/lessons"), settings: () => dialog.open() });
      document.title = "Rank & File";
    }
    // every screen eases in (the CSS skips it with reduced motion)
    main.classList.remove("screen-in");
    void main.offsetWidth;
    main.classList.add("screen-in");
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
