// Level and lesson content, bundled as raw text at build time.
//
// The YAML is parsed here only to list levels and read titles; the engine
// (levels.parse_level) is what actually checks and interprets a level.
// Solutions are deliberately not bundled yet: M2's post-solve reveal adds them.
import { parse } from "yaml";

const levelFiles = import.meta.glob<string>("/levels/ch*/*.yaml", { query: "?raw", import: "default", eager: true });
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
  const listed = (parseYaml(Object.values(chapterFile)[0] ?? "[]") as Omit<Chapter, "levels">[]) ?? [];
  return listed.map((chapter) => ({ ...chapter, levels: levels.filter((level) => level.chapter === chapter.chapter) }));
}

export const levels = loadLevels();
export const chapters = loadChapters(levels);

export function findLevel(id: string): LevelSource | undefined {
  return levels.find((level) => level.id === id);
}

export function nextLevel(id: string): LevelSource | undefined {
  const index = levels.findIndex((level) => level.id === id);
  return index >= 0 ? levels[index + 1] : undefined;
}
