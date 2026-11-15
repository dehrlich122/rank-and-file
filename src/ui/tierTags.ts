// A level's tier where the engine has to work it out (M4.4, request `levelTags`): the levels of the editor and the
// levels others shared, on their list rows (My levels, Shared with me) and on the Challenge panel.
import { codexChapters } from "../content";
import type { PyClient } from "../py/client";
import { h } from "./dom";
import { difficultyTag, problemTag, tierTag } from "./tags";

/** What the engine said about a level's tier: `refused` when it would not open the level at all. */
interface TierAnswer {
  tier: string | null;
  refused: boolean;
}

const NO_ANSWER: TierAnswer = { tier: null, refused: false };

// The engine's answers by level content, for this visit: coming back to a list, or opening a level from one, asks
// nothing again. Editing a level makes new content, so the oldest answers go once there are many.
const known = new Map<string, TierAnswer>();
const MOST_KNOWN = 300;

async function fetchTier(client: PyClient, data: unknown, key: string): Promise<TierAnswer> {
  try {
    await client.ready();
    const { tier, refused } = await client.call("levelTags", { level: data, chapters: codexChapters() });
    if (known.size >= MOST_KNOWN) known.delete(known.keys().next().value!);
    known.set(key, { tier, refused });
    return { tier, refused };
  } catch {
    return NO_ANSWER; // it couldn't be asked (Python stopped, hung or failed): no tier, and nothing remembered
  }
}

/** The engine's tier for a level. Never throws: a level that couldn't be asked about has no tier. */
export function askTier(client: PyClient, data: unknown): Promise<TierAnswer> {
  const key = JSON.stringify(data);
  const before = known.get(key);
  return before ? Promise.resolve(before) : fetchTier(client, data, key);
}

const tierTagsOf = ({ tier, refused }: TierAnswer): HTMLElement[] => (refused ? [problemTag()] : tier ? [tierTag(tier)] : []);

/**
 * The tier tags of a list's rows, asked once per level and never waited for: a row is drawn at once with its
 * difficulty tag, the room for the tier tag kept, and gets the tier tag when the answer comes (at once, when the
 * level was asked about before). A level the engine refuses gets the "has problems" mark in its place (QA-046); a
 * level that couldn't be asked about leaves the place empty. With a Tier filter on (`filtering`) an answer redraws
 * the list instead (`redraw`).
 */
export function tierTags(client: PyClient, filtering: () => boolean, redraw: () => void) {
  const answers = new Map<string, TierAnswer>();
  const asked = new Set<string>();
  const slots = new Map<string, HTMLElement>();
  let stopped = false;
  return {
    /** Ask for this level's tier, once. `data` builds the level's data. Call it before drawing the level's row. */
    ask(id: string, data: () => unknown): void {
      if (asked.has(id)) return;
      asked.add(id);
      const level = data();
      const key = JSON.stringify(level);
      const before = known.get(key);
      if (before) return void answers.set(id, before);
      void fetchTier(client, level, key).then((found) => {
        if (stopped) return;
        answers.set(id, found);
        if (filtering()) redraw();
        else slots.get(id)?.replaceChildren(...tierTagsOf(found));
      });
    },
    tier: (id: string): string | null => answers.get(id)?.tier ?? null,
    /** The tags cell of a row: a fixed place for the tier tag, then one for the difficulty tag, so no row's tags move. */
    slot(id: string, difficulty: number | null): HTMLElement {
      const tier = h("span", { class: "tags-tier" }, ...tierTagsOf(answers.get(id) ?? NO_ANSWER));
      slots.set(id, tier);
      return h("span", { class: "tags tags-fixed" }, tier, h("span", { class: "tags-diff" }, ...(difficulty ? [difficultyTag(difficulty)] : [])));
    },
    stop: (): void => void (stopped = true),
  };
}
