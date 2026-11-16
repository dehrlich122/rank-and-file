// The app shell: top bar, Python status, settings, and switching between screens.
//
// Routes (in the URL hash):
//   #/                 the start menu
//   #/lessons[/<n>]    the Lessons directory, with chapter n open
//   #/promotion/<tier> the promotion ceremony (M3.7)
//   #/level/<id>       a level
//   #/editor           My levels: the levels made in the editor (M4.2)
//   #/editor/<id>      the level editor
//   #/editor/<id>/play test-play: the level opened in the real level screen
//   #/play/<code>      a level someone shared, opened from its link (M4.3)
//   #/shared/<id>      a shared level already kept in this browser ("Shared with me")
//   #/free             Free Play's hub (M4.4)
//   #/free/<section>   one of its pages: challenges, shared, sandbox, skins (My levels stays at #/editor)
//   #/challenge/<id>   a challenge from a Free Play set (M4.4)
//   #/harness          the raw Python harness from Milestone 0
//   #/styleguide       the look at every size, in both themes (M3.7)
import { challengeSetOf, chapterName, chapters, findLevel } from "./content";
import { drafts } from "./editor/drafts";
import { readSolution, setSolution } from "./editor/rules";
import { testPlaySource } from "./editor/starts";
import { mountHarness } from "./harness";
import { unlockedPieces } from "./promotion";
import { progress } from "./progress";
import { PyClient, startPythonWorker, type ClientStatus } from "./py/client";
import { applyToDocument, settings } from "./settings";
import { sharedLevels, sharedProgress } from "./share/shared";
import { sound } from "./sound";
import { authorSolution } from "./ui/compare";
import { h } from "./ui/dom";
import { icon } from "./ui/icons";
import { mountEditor } from "./ui/editorScreen";
import { mountEditorList } from "./ui/editorList";
import { mountLessons } from "./ui/lessonsMenu";
import { freePage, freeSectionName, mountFreePlay } from "./ui/freePlay";
import { mountSandbox, resetSandbox } from "./ui/sandboxScreen";
import { mountSkins } from "./ui/skinsScreen";
import { challengeHost, sharedHost, testPlayHost } from "./ui/levelHost";
import { mountLevel, type LevelContext } from "./ui/levelView";
import { mountPromotion } from "./ui/promotionScreen";
import { ReplPanel } from "./ui/repl";
import { SettingsDialog } from "./ui/settingsDialog";
import { openShared, sharedProblem, sharedSource } from "./ui/sharedLevel";
import { mountTitle } from "./ui/titleScreen";
import { mountStyleguide } from "./ui/styleguide";

export function startApp(root: HTMLElement): void {
  applyToDocument(settings.get());
  settings.subscribe(applyToDocument);

  const dialog = new SettingsDialog(
    settings,
    () => {
      progress.reset();
      sharedProgress.reset(); // shared levels' stars, hints and code; the levels themselves stay (M4.3)
      settings.set({ piece: "pawn" }); // the skins are locked again (QA-052)
      resetSandbox(); // the Sandbox starts from its default code again (QA-057)
      context.knownCalls.clear();
      route(); // redraw the screen from the cleared progress
    },
    () => unlockedPieces(progress),
  );
  sound.start(); // music and effects begin at the first click or key press
  const muteButton = h("button", { class: "btn btn-small mute-button", onClick: () => settings.set({ muted: !settings.get().muted }) });
  let painted: boolean | undefined; // volume changes reach this too, and the icon only changes with muting
  const paintMute = () => {
    const { muted } = settings.get();
    if (muted === painted) return;
    painted = muted;
    const label = muted ? "Sound is off. Turn it on" : "Sound is on. Mute it";
    muteButton.classList.toggle("muted", muted);
    muteButton.setAttribute("aria-label", label);
    muteButton.title = label;
    muteButton.replaceChildren(icon(muted ? "soundMuted" : "sound"));
  };
  paintMute();
  settings.subscribe(paintMute);
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
      h("header", { class: "topbar" }, h("a", { class: "brand", href: "#/" }, "♟ Rank & File"), crumbs, status, muteButton, settingsButton),
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

  /** Put keyboard and screen-reader focus on the screen's heading, so a new screen starts at its top. */
  function focusHeading(): void {
    const heading = main.querySelector<HTMLElement>("h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  /** The crumbs of a page under Free Play: Free Play (a link unless it is the page), the section it is in (a link), then the page's own parts. */
  function freeCrumbs(section: { name: string; href: string } | null, ...rest: Array<string | HTMLElement>): void {
    const sep = () => h("span", { class: "crumb-sep" }, "/");
    const home = section || rest.length ? h("a", { href: "#/free" }, "Free Play") : h("span", {}, "Free Play");
    const trail = [home, ...(section ? [h("a", { href: section.href }, section.name)] : []), ...rest.map((part) => (typeof part === "string" ? h("span", {}, part) : part))];
    crumbs.replaceChildren(...trail.flatMap((part, i) => (i ? [sep(), part] : [part])));
  }
  const MY_LEVELS = { name: freeSectionName("levels"), href: "#/editor" };
  const SHARED = { name: freeSectionName("shared"), href: "#/free/shared" };

  /** A level someone else made, on the level screen: kept in this browser, with progress of its own. */
  function showShared(data: Record<string, unknown>): () => void {
    const source = sharedSource(data);
    freeCrumbs(SHARED, source.title);
    document.title = `${source.title} · Shared level · Rank & File`;
    return mountLevel(main, context, source, sharedHost(data));
  }

  /** A level that can't be opened: a plain page that says why, with the way back. */
  function showSharedProblem(reason: string): void {
    freeCrumbs(SHARED);
    main.replaceChildren(sharedProblem(reason));
    focusHeading();
    document.title = "This level can't be opened · Rank & File";
  }

  /** A link's code: decoded, checked by the engine, kept, and only then opened. A level that fails any of that never opens. */
  function openSharedCode(code: string): () => void {
    freeCrumbs(SHARED);
    main.replaceChildren(h("div", { class: "editor-missing" }, h("p", { class: "muted", role: "status" }, "Opening the level…")));
    document.title = "Opening a level · Rank & File";
    let cancelled = false; // the player went elsewhere while the code was being checked
    let unmountLevel = () => {};
    const check = async (data: Record<string, unknown>) => {
      await client.ready();
      return client.call("loadLevel", { level: data });
    };
    const keep = (data: Record<string, unknown>) => {
      if (!cancelled) sharedLevels.keep(data);
    };
    void openShared(code, { check, keep }).then((opening) => {
      if (cancelled) return;
      if (opening.ok) unmountLevel = showShared(opening.data);
      else showSharedProblem(opening.reason);
    });
    return () => {
      cancelled = true;
      unmountLevel();
    };
  }

  function route(): void {
    unmount();
    unmount = () => {};
    const hash = location.hash || "#/";
    const levelMatch = /^#\/level\/([\w-]+)$/.exec(hash);
    const source = levelMatch ? findLevel(levelMatch[1]!) : undefined;
    if (source?.set) return void location.replace(`#/challenge/${source.id}`); // a challenge has its own screen (M4.4)
    const challengeMatch = /^#\/challenge\/([\w-]+)$/.exec(hash);
    const challenge = challengeMatch ? findLevel(challengeMatch[1]!) : undefined;
    const freeMatch = /^#\/free(?:\/(.*))?$/.exec(hash);
    const section = freeMatch?.[1] === undefined ? null : freePage(freeMatch[1]);
    if (freeMatch?.[1] !== undefined) {
      // an unknown page goes to the hub, and extra path after a page to that page (QA-056); Back still works
      const canonical = section ? `#/free/${section}` : "#/free";
      if (hash !== canonical) return void location.replace(canonical);
    }
    const playMatch = /^#\/play\/(.+)$/.exec(hash);
    const sharedMatch = /^#\/shared\/([\w-]+)$/.exec(hash);
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
    } else if (challenge?.set) {
      const set = challengeSetOf(challenge);
      const number = (set?.levels.indexOf(challenge) ?? -1) + 1;
      freeCrumbs({ name: set?.title ?? "Challenges", href: "#/free/challenges" }, `${number}. ${challenge.title}`);
      unmount = mountLevel(main, context, challenge, challengeHost());
      document.title = `${challenge.title} · Free Play · Rank & File`;
    } else if (freeMatch) {
      const name = section && freeSectionName(section);
      freeCrumbs(null, ...(name ? [name] : []));
      unmount = section === "sandbox" ? mountSandbox(main, client) : section === "skins" ? mountSkins(main) : mountFreePlay(main, section, client);
      focusHeading();
      document.title = `${name ? `${name} · ` : ""}Free Play · Rank & File`;
    } else if (playMatch) {
      unmount = openSharedCode(playMatch[1]!);
    } else if (sharedMatch) {
      const data = sharedLevels.get(sharedMatch[1]!);
      if (data) {
        sharedLevels.keep(data); // opening it again moves it to the top of "Shared with me"
        unmount = showShared(data);
      } else showSharedProblem("This shared level isn't in this browser any more.");
    } else if (hash === "#/editor") {
      freeCrumbs(null, "My levels");
      unmount = mountEditorList(main, client);
      focusHeading();
      document.title = "My levels · Rank & File";
    } else if (/^#\/editor\/[\w-]+\/play$/.test(hash)) {
      const id = hash.split("/")[2]!;
      const draft = drafts.load(id);
      if (!draft) return void (location.hash = "#/editor");
      freeCrumbs(MY_LEVELS, h("a", { href: `#/editor/${id}` }, draft.title), "Test-play");
      const kept = () => {
        const saved = drafts.load(id);
        return saved ? readSolution(saved) : "";
      };
      const keep = (code: string) => {
        const saved = drafts.load(id);
        if (saved) drafts.save(setSolution(saved, code));
      };
      // as a player of the shared level will see it: the offer exists only if a solution was kept before this screen opened
      const solution = kept() ? authorSolution(kept) : null;
      unmount = mountLevel(main, context, testPlaySource(draft), testPlayHost({ back: `#/editor/${id}`, keep, kept, solution }));
      document.title = `${draft.title} · Test-play · Rank & File`;
    } else if (/^#\/editor\/[\w-]+$/.test(hash)) {
      const name = h("span", {}, "Editing");
      freeCrumbs(MY_LEVELS, name);
      unmount = mountEditor(main, client, hash.slice("#/editor/".length), (title) => {
        name.textContent = title;
        document.title = `${title} · Editor · Rank & File`;
      });
    } else if (hash === "#/harness") {
      crumbs.replaceChildren(h("span", {}, "Python harness"));
      unmount = mountHarness(main, client);
      document.title = "Harness · Rank & File";
    } else if (hash === "#/styleguide") {
      crumbs.replaceChildren(h("span", {}, "Style guide"));
      unmount = mountStyleguide(main);
      focusHeading();
      document.title = "Style guide · Rank & File";
    } else if (/^#\/lessons(\/\d+)?$/.test(hash)) {
      const focus = /\/(\d+)$/.exec(hash)?.[1];
      crumbs.replaceChildren(h("span", {}, "Lessons"));
      unmount = mountLessons(main, chapters, progress, client, focus === undefined ? undefined : Number(focus));
      focusHeading();
      document.title = "Lessons · Rank & File";
    } else if (/^#\/promotion\/\w+$/.test(hash)) {
      crumbs.replaceChildren(h("span", {}, "Promotion"));
      unmount = mountPromotion(main, hash.slice("#/promotion/".length), progress, settings);
      focusHeading();
      document.title = "Promotion · Rank & File";
    } else {
      crumbs.replaceChildren();
      unmount = mountTitle(main, { lessons: () => (location.hash = "#/lessons"), freePlay: () => (location.hash = "#/free"), editor: () => (location.hash = "#/editor"), settings: () => dialog.open() });
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
