// The voice of the chrome (M3.7, docs/M3/M3.7.md "The voice guide"): terse, 80s terminal. It is used for titles,
// headings, the menu and the big moments only. Teaching text (lessons, hints, errors, the Codex, tooltips) stays plain,
// and so does any label someone clicks.
export const VOICE = {
  lessons: "Lessons",
  outside: "Off the grid",
  subtitle: "rank_and_file()",
  menu: { lessons: "Lessons", freePlay: "Free Play", levelEditor: "Level Editor", settings: "Settings" },
  comingSoon: "coming soon",
  complete: "Run complete",
  lost: "Run lost",
  detail: "Level",
} as const;

/** "Tier 1 · Pawn" for the first of `order` tiers, and so on. */
export const tierName = (tier: string, order: number): string => `Tier ${order} · ${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;

/** A chapter folder's name: "02 · Counting Steps"; outside the curriculum, just its title. */
export const folderName = (n: number, title: string): string => (n ? `${String(n).padStart(2, "0")} · ${title}` : title);
