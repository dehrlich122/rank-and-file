// M4.1 step 0: the sound sheet. Every effect with its takes, and the music, to listen to and choose from.
// Dev-only: the game plays the takes that get picked.   /design/sound.html
import "../src/styles.css";
import "../src/chrome.css";
import "./sound.css";
import { h } from "../src/ui/dom";
import { EFFECTS, type SoundName } from "../src/sound/effects";

const GROUPS: Array<[string, SoundName[]]> = [
  ["On the board", ["move", "turn_left", "turn_right", "bump", "gate_open", "guard", "pick_up", "bridge", "capture", "read", "lost", "fall", "crush", "waypoint"]],
  ["Run outcomes", ["complete", "star", "run_lost", "error"]],
  ["Menus and moments", ["menu_move", "menu_choose", "hint", "crown", "promotion"]],
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let effectsVolume = 0.35;

function out(): { ctx: AudioContext; master: GainNode } {
  if (!ctx || !master) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  master.gain.value = effectsVolume;
  return { ctx, master };
}

const picks: Record<string, number> = {};
const summary = h("textarea", { readonly: true, "aria-label": "Your picks" });
const refresh = () => {
  summary.value = GROUPS.flatMap(([, names]) => names)
    .map((name) => `${name}: ${EFFECTS[name][picks[name] ?? 0]!.label}${picks[name] === undefined ? " (default: first take)" : ""}`)
    .join("\n");
};

function row(name: SoundName): HTMLElement {
  const takes = EFFECTS[name].map((take, i) => {
    const radio = h("input", { type: "radio", name: `pick-${name}`, "aria-label": `Pick ${take.label} for ${name}`, onChange: () => { picks[name] = i; refresh(); } });
    const play = h("button", { class: "btn btn-small", onClick: () => { const o = out(); take.play(o.ctx, o.master, o.ctx.currentTime + 0.02); } }, `▶ ${take.label}`);
    return h("span", { class: "take" }, radio, play);
  });
  return h("div", { class: "sound-row" }, h("code", {}, name), h("div", { class: "takes" }, ...takes));
}

// the music, if public/audio/elysium.mp3 is there yet
const audio = new Audio(`${import.meta.env.BASE_URL}audio/elysium.mp3`);
audio.loop = true;
audio.volume = 0.25;
const musicNote = h("span", { class: "muted small" }, "");
audio.addEventListener("error", () => (musicNote.textContent = "no music file yet (public/audio/elysium.mp3)"));
const slider = (value: number, onInput: (v: number) => void) => {
  const input = h("input", { type: "range", min: 0, max: 100, value: Math.round(value * 100) }) as HTMLInputElement;
  const text = h("span", { class: "small" }, `${input.value}%`);
  input.addEventListener("input", () => { text.textContent = `${input.value}%`; onInput(Number(input.value) / 100); });
  return [input, text];
};

const controls = h(
  "div",
  { class: "controls" },
  h("label", {}, "Music", ...slider(0.25, (v) => (audio.volume = v))),
  h("div", {}, h("button", { class: "btn btn-small", onClick: () => (audio.paused ? void audio.play() : audio.pause()) }, "▶ / ⏸ music"), " ", musicNote),
  h("label", {}, "Effects", ...slider(effectsVolume, (v) => { effectsVolume = v; if (master) master.gain.value = v; })),
);

document.getElementById("app")!.append(
  h(
    "main",
    { class: "sound-sheet" },
    h("h1", {}, "Sound sheet"),
    h("p", { class: "muted" }, "Click a take to hear it. Tick the one you want for each sound (the first is the default). The sliders start at the proposed Quiet levels. Then send me the list at the bottom."),
    controls,
    ...GROUPS.flatMap(([title, names]) => [h("h2", {}, title), ...names.map(row)]),
    h("h2", {}, "Your picks"),
    summary,
  ),
);
refresh();
