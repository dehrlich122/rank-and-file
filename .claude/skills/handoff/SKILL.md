---
name: handoff
description: End a Rank & File orchestrator session cleanly so the next one can start from handoff.md. Use when the context guard asks for a handoff, when the designer says to hand off or wrap up, or before a /clear.
---

# Handoff

The next session knows only `handoff.md`, `CLAUDE.md` and the memory index. Leave the repo and the Resume card so
that it can carry on without asking.

1. **Agents.** If an agent you spawned is still running, either wait for its report or record it under "In
   flight" (what it is doing, its branch and worktree, what to do with its report).
2. **The tree.** `git status --short --branch` and `git worktree list`.
   - Finished work that is uncommitted: `npm run check` (judge it by its exit code), then commit named files with
     the attribution line.
   - Unfinished work: leave it uncommitted and say exactly what it is in the card.
   - Worktrees that are merged: remove them (branches are kept).
3. **The ledger.** Every package that came back this session has its row in the milestone doc.
4. **Rewrite the Resume card** at the top of `handoff.md` to this template, at most about 40 lines. Rewrite; do not
   append. History belongs in git, the milestone docs and `docs/QA.md`.

   ```
   ## Resume card

   - **Updated:** <date>, by <model> (attribution line: `<the line>`). **Run mode:** <gated | autonomous, and who said so>
   - **Where things stand:** <milestone and phase; branch at sha; pushed or not; tree clean, or what is uncommitted and why>
   - **Open PRs:** <number, base, what it waits for | none>
   - **In flight:** <agents still running: WP, branch, worktree, what to do with the report | none>
   - **Work packages:** <a table: WP, level, status, branch, last commit; only this milestone's>
   - **Next action:** <numbered steps, the first one doable without asking anything>
   - **Waiting on the designer:** <decisions and tests only they can do | nothing>
   - **Standing orders:** <pauses and limits still in force, each with who said it and when>
   ```

   Below the card keep only **Gotchas that still bite**: things a new session would get wrong. Delete a gotcha
   once its cause is gone.
5. **No spoilers** in the card: no solution code, hints, notes or passphrases. Levels by concept and mechanic only.
6. **Memory.** If a milestone's state changed (a PR opened or merged, a designer decision), update the
   `project-status` memory and its line in `MEMORY.md`.
7. Print the next action in one or two lines, and end the turn with **HANDOFF READY**. The designer then types
   `/clear` and `go`.
