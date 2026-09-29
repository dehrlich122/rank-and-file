// Level and lesson content, bundled as raw text at build time.
//
// The YAML is parsed here only to list levels and read titles; the engine
// (levels.parse_level) is what actually checks and interprets a level.
import { parse } from "yaml";
import type { CodexChapter } from "./py/protocol";

const levelFiles = import.meta.glob<string>("/levels/*/*.yaml", { query: "?raw", import: "default", eager: true });
const lessonFiles = import.meta.glob<string>("/lessons/**/*.md", { query: "?raw", import: "default", eager: true });
const chapterFile = import.meta.glob<string>("/levels/chapters.yaml", { query: "?raw", import: "default", eager: true });

export interface LevelSource {
  id: string;
  chapter: number;
  title: string;
  trains: string;
  lesson: string; // Markdown
  data: Record<string, unknown>; // the parsed YAML, sent to the engine as-is
}

export interface Chapter {
  chapter: number;
  title: string;
  tier: string;
  summary: string;
  curriculum: boolean; // false for the Testing ground: not numbered, never "next"
  levels: LevelSource[];
}

// YAML 1.1 matches PyYAML, which the level checker uses, so both sides read
// every level file the same way.
const parseYaml = (text: string): unknown => parse(text, { version: "1.1" });

function loadLevels(): LevelSource[] {
  return Object.entries(levelFiles)
    .map(([path, text]) => {
      const data = parseYaml(text) as Record<string, unknown>;
      const lessonPath = `/lessons/${String(data.lesson)}`;
      return {
        id: String(data.id),
        chapter: Number(data.chapter),
        title: String(data.title),
        trains: String(data.trains),
        lesson: lessonFiles[lessonPath] ?? `*Lesson file ${lessonPath} is missing (level file ${path}).*`,
        data,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function loadChapters(levels: LevelSource[]): Chapter[] {
  const listed = (parseYaml(Object.values(chapterFile)[0] ?? "[]") as Array<Omit<Chapter, "levels" | "curriculum"> & { curriculum?: boolean }>) ?? [];
  return listed.map((chapter) => ({
    ...chapter,
    curriculum: chapter.curriculum !== false,
    levels: levels.filter((level) => level.chapter === chapter.chapter),
  }));
}

/** "Chapter 1 · First Moves"; a chapter outside the curriculum is just its title. */
export function chapterName(chapter: Chapter): string {
  return chapter.curriculum ? `Chapter ${chapter.chapter} · ${chapter.title}` : chapter.title;
}

const levels = loadLevels();
export const chapters = loadChapters(levels);

export function findLevel(id: string): LevelSource | undefined {
  return levels.find((level) => level.id === id);
}

// Reference solutions and their notes (M2's idiomatic-solution comparison).
// They're loaded lazily: each is its own small file, fetched only when the
// player asks to compare after solving (or gives up), and never part of the
// main bundle. The naive attempts are for the level checker only.
const solutionFiles = import.meta.glob<string>(["/solutions/*/*.py", "!/solutions/**/*.naive*.py"], { query: "?raw", import: "default" });
const noteFiles = import.meta.glob<string>("/solutions/*/*.md", { query: "?raw", import: "default" });

export interface Solution {
  code: string;
  note: string; // Markdown: why it's written this way
}

/** A level's idiomatic solution and its note, or null if it has none. */
export async function loadSolution(id: string): Promise<Solution | null> {
  const load = (files: Record<string, () => Promise<string>>, extension: string) =>
    Object.entries(files).find(([path]) => path.endsWith(`/${id}${extension}`))?.[1]();
  const [code, note] = await Promise.all([load(solutionFiles, ".py"), load(noteFiles, ".md")]);
  return code === undefined ? null : { code, note: note ?? "" };
}

/**
 * Every chapter's levels and lessons, in play order: what the engine needs to
 * work out which functions a level's Codex lists (codex.history, docs/Codex.md).
 */
export function codexChapters(): CodexChapter[] {
  return chapters.map((chapter) => ({
    curriculum: chapter.curriculum,
    levels: chapter.levels.map((level) => ({ id: level.id, data: level.data, lesson: level.lesson })),
  }));
}

/** A level's name where another screen mentions it: "1.4 The Password", or "Testing ground: Clockwork" outside the curriculum. */
export function levelLabel(id: string): string {
  for (const chapter of chapters) {
    const index = chapter.levels.findIndex((level) => level.id === id);
    const level = chapter.levels[index];
    if (level) return chapter.curriculum ? `${chapter.chapter}.${index + 1} ${level.title}` : `${chapter.title}: ${level.title}`;
  }
  return id;
}

/** The level after `id` in play order (chapters.yaml), within the curriculum only. */
export function nextLevel(id: string): LevelSource | undefined {
  const curriculum = chapters.filter((chapter) => chapter.curriculum).flatMap((chapter) => chapter.levels);
  const index = curriculum.findIndex((level) => level.id === id);
  return index >= 0 ? curriculum[index + 1] : undefined;
}
