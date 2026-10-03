// The start menu (M3.7): the neon title. A chrome logo over a synthwave sunset, a rank of enemy chess pieces
// standing against the sun, and the player's piece under the menu. Keyboard first: the arrow keys move the
// selection and Enter opens it. With reduced motion the sky, the floor, the blink and the glitches stop.
import { wornPiece } from "../promotion";
import { settings } from "../settings";
import { h } from "./dom";
import { enemy, hero, type EnemyKind, type Skin } from "./sprites";
import { svg } from "./sprites/svg";
import { VOICE } from "./voice";

const RANK: EnemyKind[] = ["rook", "bishop", "rook", "bishop", "bishop", "rook", "bishop", "rook"];

interface Entry {
  label: string;
  /** What choosing it does; missing means it isn't built yet. */
  open?: () => void;
}

/** Mount the title in `main`. Returns what to call to leave it. */
export function mountTitle(main: HTMLElement, options: { lessons: () => void; settings: () => void }): () => void {
  const entries: Entry[] = [
    { label: VOICE.menu[0], open: options.lessons },
    { label: VOICE.menu[1] }, // Free Play (M4.x)
    { label: VOICE.menu[2] }, // Level Editor (M4)
    { label: VOICE.menu[3], open: options.settings },
  ];
  let selected = 0;
  const note = h("p", { class: "ts-note", "aria-live": "polite" }, "↑ ↓ to choose, Enter to open");
  const rows = entries.map((entry, i) => {
    const row = h(
      "li",
      { class: `ts-item${entry.open ? "" : " soon"}`, role: "menuitem", "aria-disabled": entry.open ? undefined : "true" },
      h("span", { class: "ts-cursor", "aria-hidden": "true" }, "▶"),
      h("span", {}, entry.label),
      entry.open ? null : h("span", { class: "ts-tag" }, VOICE.comingSoon),
    );
    row.addEventListener("click", () => {
      selected = i;
      paint();
      choose();
    });
    return row;
  });
  const paint = () => rows.forEach((row, i) => row.classList.toggle("selected", i === selected));
  const choose = () => {
    const entry = entries[selected]!;
    if (entry.open) entry.open();
    else note.textContent = `${entry.label}: ${VOICE.comingSoon}`;
  };

  // the enemy rank on the horizon, in front of the sun: broken wire, each glitching on its own beat
  const rank = svg("svg", { viewBox: `0 0 ${RANK.length * 64} 64`, class: "ts-rank", "aria-hidden": "true" }, ...RANK.map((kind, i) => svg("g", { transform: `translate(${i * 64 + 32} 32)` }, enemy(kind, "live", (i * 1.3) % 5, true))));
  // the piece under the menu follows Settings → Piece, which can change while the menu is up
  const heroArt = svg("svg", { viewBox: "-38 -38 76 76", class: "ts-hero", role: "img" });
  const drawHero = () => {
    const skin: Skin = wornPiece();
    heroArt.setAttribute("aria-label", `Your piece: the ${skin}`);
    heroArt.replaceChildren(hero(skin, skin === "knight" ? "east" : "south"));
  };
  drawHero();
  const stopSettings = settings.subscribe(drawHero);
  const scene = h(
    "section",
    { class: "title-scene", "aria-label": "Start menu" },
    h("div", { class: "ts-sky", "aria-hidden": "true" }, h("div", { class: "ts-sun" }), rank, h("div", { class: "ts-floor" }), h("div", { class: "ts-vhs" })),
    h(
      "div",
      { class: "ts-body" },
      h("h1", { class: "ts-logo", "aria-label": "Rank and File" }, h("span", { class: "ts-logo-text", "data-text": "RANK & FILE" }, "RANK & FILE")),
      h("p", { class: "ts-sub" }, VOICE.subtitle),
      h("ul", { class: "ts-menu", role: "menu" }, ...rows),
      note,
      h("div", { class: "ts-hero-slot" }, heroArt),
    ),
  );
  paint();
  main.replaceChildren(scene);

  // The keys work as soon as the screen is up, so listen on the page. A dialog or the editor takes them first.
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
    if (event.key === "ArrowDown") selected = (selected + 1) % entries.length;
    else if (event.key === "ArrowUp") selected = (selected + entries.length - 1) % entries.length;
    else if (event.key === "Enter") choose();
    else return;
    event.preventDefault();
    paint();
  };
  document.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener("keydown", onKey);
    stopSettings();
  };
}
