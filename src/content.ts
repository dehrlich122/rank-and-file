// Level and lesson content, bundled as raw text at build time.
//
// The YAML is parsed here only to list levels and read titles; the engine
// (levels.parse_level) is what actually checks and interprets a level.
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

const levels = loadLevels();
export const chapters = loadChapters(levels);

export function findLevel(id: string): LevelSource | undefined {
  return levels.find((level) => level.id === id);
}

// Reference solutions and their notes (M2's idiomatic-solution comparison).
// They're loaded lazily: each is its own small file, fetched only when the
// player asks to compare after solving (or gives up), and never part of the
// main bundle. The naive attempts are for the level checker only.
const solutionFiles = import.meta.glob<string>(["/solutions/ch*/*.py", "!/solutions/**/*.naive*.py"], { query: "?raw", import: "default" });
const noteFiles = import.meta.glob<string>("/solutions/ch*/*.md", { query: "?raw", import: "default" });

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

export function nextLevel(id: string): LevelSource | undefined {
  const index = levels.findIndex((level) => level.id === id);
  return index >= 0 ? levels[index + 1] : undefined;
}
