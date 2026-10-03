// The player's UI settings: one small store that every screen reads when it's
// created and listens to for changes. Saved in localStorage (see storage.ts).
import { asRecord, browserStorage, readJson, writeJson, type StorageLike } from "./storage";

type Theme = "system" | "light" | "dark";
type Motion = "system" | "full" | "reduced";
export type CodeSize = "small" | "medium" | "large" | "x-large";
type CodePanel = "right" | "bottom" | "left";

export interface Settings {
  speed: number; // playback speed multiplier
  theme: Theme;
  codeSize: CodeSize;
  motion: Motion; // animations
  codePanel: CodePanel; // where a level's code column sits (wide screens only)
  wrapLines: boolean; // long lines of code wrap instead of running off the side
}

export const SPEEDS = [0.5, 1, 2, 4] as const;
export const CODE_SIZES: Record<CodeSize, number> = { small: 13, medium: 15, large: 17, "x-large": 20 };
export const DEFAULTS: Settings = { speed: 1, theme: "dark", codeSize: "medium", motion: "system", codePanel: "right", wrapLines: true };

const STORAGE_KEY = "rank-and-file:settings";
const THEMES: readonly Theme[] = ["system", "light", "dark"];
const MOTIONS: readonly Motion[] = ["system", "full", "reduced"];
const CODE_PANELS: readonly CodePanel[] = ["right", "bottom", "left"];

export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<(settings: Settings) => void>();

  constructor(private readonly storage: StorageLike | null = browserStorage()) {
    this.value = sanitize(readJson(storage, STORAGE_KEY));
  }

  get(): Settings {
    return this.value;
  }

  set(changes: Partial<Settings>): void {
    const next = sanitize({ ...this.value, ...changes });
    if (JSON.stringify(next) === JSON.stringify(this.value)) return;
    this.value = next;
    writeJson(this.storage, STORAGE_KEY, next);
    for (const listener of this.listeners) listener(next);
  }

  /** Call `listener` on every change. Returns a function that stops listening. */
  subscribe(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Apply the settings that live in CSS: theme, animations, code text size and layout. */
export function applyToDocument(settings: Settings, root: HTMLElement = document.documentElement): void {
  if (settings.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  if (settings.motion === "system") delete root.dataset.motion;
  else root.dataset.motion = settings.motion;
  if (settings.codePanel === "right") delete root.dataset.codePanel;
  else root.dataset.codePanel = settings.codePanel;
  root.style.setProperty("--code-size", `${CODE_SIZES[settings.codeSize]}px`);
}

/** Keep only known values; anything missing or unrecognised falls back to its default. */
export function sanitize(raw: unknown): Settings {
  const input = asRecord(raw);
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    speed: pick(input.speed, SPEEDS as readonly number[], DEFAULTS.speed),
    theme: pick(input.theme, THEMES, DEFAULTS.theme),
    codeSize: pick(input.codeSize, Object.keys(CODE_SIZES) as CodeSize[], DEFAULTS.codeSize),
    motion: pick(input.motion, MOTIONS, DEFAULTS.motion),
    codePanel: pick(input.codePanel, CODE_PANELS, DEFAULTS.codePanel),
    wrapLines: pick(input.wrapLines, [true, false], DEFAULTS.wrapLines),
  };
}

/** The app-wide settings. */
export const settings = new SettingsStore();
