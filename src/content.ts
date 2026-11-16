// Level and lesson content, bundled as raw text at build time.
//
// The YAML is parsed here only to list levels and read titles; the engine
// (levels.parse_level) is what actually checks and interprets a level.
import { parse } from "yaml";
import type { CodexChapter } from "./py/protocol";
import { asDifficulty } from "./storage";

const levelFiles = import.meta.glob<string>("/levels/*/*.yaml", { query: "?raw", import: "default", eager: true });
const lessonFiles = import.meta.glob<string>("/lessons/**/*.md", { query: "?raw", import: "default", eager: true });
const chapterFile = import.meta.glob<string>("/levels/chapters.yaml", { query: "?raw", import: "default", eager: true });
const challengeFile = import.meta.glob<string>("/levels/challenges.yaml", { query: "?raw", import: "default", eager: true });

export interface LevelSource {
  id: string;
  chapter: number;
  title: string;
  trains: string;
  mastery: boolean; // the chapter's optional mastery challenge (M3.2)
  lesson: string; // Markdown
  data: Record<string, unknown>; // the parsed YAML, sent to the engine as-is
  set?: string; // a challenge's Free Play set (M4.4); its chapter is 0 and it has no lesson
  difficulty?: number; // 1 to 5 (pass, try, raise, assert, while True:), when the level has one (M4.4)
}

/** A Free Play challenge set (M4.4, levels/challenges.yaml): its levels, in id order. */
export interface ChallengeSet {
  set: string;
  title: string;
  tier: string;
  summary: string;
  levels: LevelSource[];
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
export const parseYaml = (text: string): unknown => parse(text, { version: "1.1" });

function loadLevels(): LevelSource[] {
  return Object.entries(levelFiles)
    .map(([path, text]) => {
      const data = parseYaml(text) as Record<string, unknown>;
      const lessonPath = `/lessons/${String(data.lesson)}`;
      const set = typeof data.set === "string" ? data.set : undefined; // a challenge: no chapter, no lesson (M4.4)
      const difficulty = asDifficulty(data.difficulty);
      return {
        id: String(data.id),
        chapter: set ? 0 : Number(data.chapter),
        title: String(data.title),
        trains: String(data.trains ?? ""),
        mastery: data.mastery === true,
        lesson: set ? "" : (lessonFiles[lessonPath] ?? `*Lesson file ${lessonPath} is missing (level file ${path}).*`),
        data,
        ...(set ? { set } : {}),
        ...(difficulty ? { difficulty } : {}),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function loadChapters(levels: LevelSource[]): Chapter[] {
  const listed = (parseYaml(Object.values(chapterFile)[0] ?? "[]") as Array<Omit<Chapter, "levels" | "curriculum"> & { curriculum?: boolean }>) ?? [];
  return listed.map((chapter) => ({
    ...chapter,
    curriculum: chapter.curriculum !== false,
    levels: levels.filter((level) => !level.set && level.chapter === chapter.chapter),
  }));
}

function loadChallengeSets(levels: LevelSource[]): ChallengeSet[] {
  const listed = (parseYaml(Object.values(challengeFile)[0] ?? "[]") as Array<Omit<ChallengeSet, "levels">> | null) ?? [];
  return listed.map((set) => ({ ...set, levels: levels.filter((level) => level.set === set.set) }));
}

/** "Chapter 1 · First Moves"; a chapter outside the curriculum is just its title. */
export function chapterName(chapter: Chapter): string {
  return chapter.curriculum ? `Chapter ${chapter.chapter} · ${chapter.title}` : chapter.title;
}

const levels = loadLevels();
export const chapters = loadChapters(levels);
export const challengeSets = loadChallengeSets(levels);

/** The curriculum's tiers in play order: what the Tier filter of My levels and Shared with me offers. */
export const curriculumTiers = (): string[] => [...new Set(chapters.filter((c) => c.curriculum).map((c) => c.tier))];

/** The Free Play set a challenge belongs to (M4.4). */
export const challengeSetOf = (level: LevelSource): ChallengeSet | undefined => challengeSets.find((set) => set.set === level.set);

/** Whether a tier has a challenge set, so the places that point to Free Play only do so where there is something there. */
export const tierHasChallenges = (tier: string, sets: ChallengeSet[] = challengeSets): boolean => sets.some((set) => set.tier === tier);

/** The chapters a challenge says it draws on (`draws_on`: chapter numbers): the curriculum chapters that exist, in the order given. */
export function drawnChapters(numbers: unknown): Chapter[] {
  return (Array.isArray(numbers) ? numbers : []).flatMap((number) => chapters.find((c) => c.curriculum && c.chapter === number) ?? []);
}

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
  const entry = (curriculum: boolean, chapter: number, tier: string, list: LevelSource[]): CodexChapter => ({
    curriculum,
    chapter,
    tier,
    levels: list.map((level) => ({ id: level.id, data: level.data, lesson: level.lesson })),
  });
  return chapters.flatMap((chapter, i) => {
    const own = entry(chapter.curriculum, chapter.chapter, chapter.tier, chapter.levels);
    // a tier's challenge sets come straight after its last curriculum chapter, so their Codex counts the whole tier (M4.4)
    const lastOfTier = chapter.curriculum && !chapters.slice(i + 1).some((later) => later.curriculum && later.tier === chapter.tier);
    if (!lastOfTier) return [own];
    return [own, ...challengeSets.filter((set) => set.tier === chapter.tier).map((set) => entry(false, 0, set.tier, set.levels))];
  });
}

/** A level's name where another screen mentions it: "1.4 The Password", or "Testing ground: Clockwork" outside the curriculum. */
export function levelLabel(id: string): string {
  for (const chapter of chapters) {
    const index = chapter.levels.findIndex((level) => level.id === id);
    const level = chapter.levels[index];
    if (level) return chapter.curriculum ? `${chapter.chapter}.${index + 1} ${level.title}` : `${chapter.title}: ${level.title}`;
  }
  for (const set of challengeSets) {
    const level = set.levels.find((l) => l.id === id);
    if (level) return `${set.title}: ${level.title}`;
  }
  return id;
}

/** The challenge after `id` in its set (M4.4), or undefined after the last. */
export function nextChallenge(id: string): LevelSource | undefined {
  const set = challengeSets.find((s) => s.levels.some((level) => level.id === id));
  return set?.levels[set.levels.findIndex((level) => level.id === id) + 1];
}

/** The level after `id` in play order (chapters.yaml), within the curriculum only. */
export function nextLevel(id: string): LevelSource | undefined {
  const curriculum = chapters.filter((chapter) => chapter.curriculum).flatMap((chapter) => chapter.levels);
  const index = curriculum.findIndex((level) => level.id === id);
  return index >= 0 ? curriculum[index + 1] : undefined;
}
