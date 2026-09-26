// The player's UI settings: one small store that every screen reads when it's
// created and listens to for changes. Saved in localStorage when the browser
// allows it; if it doesn't (private mode, blocked storage), the defaults apply
// and changes last until the tab is closed.

export type Theme = "system" | "light" | "dark";
export type Motion = "system" | "full" | "reduced";
export type CodeSize = "small" | "medium" | "large" | "x-large";
export type CodePanel = "right" | "bottom" | "left";

export interface Settings {
  speed: number; // playback speed multiplier
  theme: Theme;
  codeSize: CodeSize;
  motion: Motion; // animations
  codePanel: CodePanel; // where a level's code column sits (wide screens only)
}

export const SPEEDS = [0.5, 1, 2, 4] as const;
export const CODE_SIZES: Record<CodeSize, number> = { small: 13, medium: 15, large: 17, "x-large": 20 };
export const DEFAULTS: Settings = { speed: 1, theme: "system", codeSize: "medium", motion: "system", codePanel: "right" };

const STORAGE_KEY = "rank-and-file:settings";
const THEMES: readonly Theme[] = ["system", "light", "dark"];
const MOTIONS: readonly Motion[] = ["system", "full", "reduced"];
const CODE_PANELS: readonly CodePanel[] = ["right", "bottom", "left"];

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<(settings: Settings) => void>();

  constructor(private readonly storage: StorageLike | null = browserStorage()) {
    this.value = sanitize(readJson(storage));
  }

  get(): Settings {
    return this.value;
  }

  set(changes: Partial<Settings>): void {
    const next = sanitize({ ...this.value, ...changes });
    if (JSON.stringify(next) === JSON.stringify(this.value)) return;
    this.value = next;
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage full or blocked: keep the setting for this session anyway
    }
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
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    speed: pick(input.speed, SPEEDS as readonly number[], DEFAULTS.speed),
    theme: pick(input.theme, THEMES, DEFAULTS.theme),
    codeSize: pick(input.codeSize, Object.keys(CODE_SIZES) as CodeSize[], DEFAULTS.codeSize),
    motion: pick(input.motion, MOTIONS, DEFAULTS.motion),
    codePanel: pick(input.codePanel, CODE_PANELS, DEFAULTS.codePanel),
  };
}

function readJson(storage: StorageLike | null): unknown {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // some browsers throw just for touching localStorage when it's blocked
  }
}

/** The app-wide settings. */
export const settings = new SettingsStore();
