// SessionStart hook (startup, clear): a fresh context starts from handoff.md (docs/WORKFLOW.md).
// It injects the Resume card and points to the `start-session` skill, which checks the card
// against the repo before the designer types "go". handoff.md is spoiler-free by rule, so its card is safe to show.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MAX = 8000;

/** The "## Resume card" section of handoff.md, or null when there is none. */
export function resumeCard(text) {
  const start = text.search(/^## Resume card\b/m);
  if (start < 0) return null;
  const rest = text.slice(start);
  const next = rest.slice(3).search(/^## /m);
  const card = (next < 0 ? rest : rest.slice(0, next + 3)).trim();
  return card.length > MAX ? `${card.slice(0, MAX)}\n[...cut; read handoff.md for the rest]` : card;
}

export function startContext(handoffText) {
  const lead = "[session-start] Rank & File. Before acting, run the `start-session` skill: it checks the Resume " +
    "card below against the repo and says what is waiting on the designer.";
  if (handoffText == null) return `${lead} (handoff.md is missing: ask the designer where things stand.)`;
  const card = resumeCard(handoffText);
  return card ? `${lead}\n\n${card}` : lead;
}

function main() {
  const handoff = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), "handoff.md");
  const text = existsSync(handoff) ? readFileSync(handoff, "utf8") : null;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: startContext(text) },
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`session-start failed: ${error?.message ?? error}\n`);
  }
}
