---
name: start-session
description: Start a Rank & File orchestrator session from handoff.md. Use at the beginning of a session or after /clear, when the SessionStart hook has shown the Resume card, before doing anything else.
---

# Start a session

The SessionStart hook has put the Resume card in your context. It is a snapshot: check it before acting on it.

1. **Read** the card. If it was cut short, read the top of `handoff.md`. Read the "Gotchas that still bite" below
   it only when the next action touches what they are about.
2. **Check it against the repo**, in one go:
   - `git status --short --branch`, `git log --oneline -5`, `git worktree list`
   - `gh pr list --state open`
   - the dev server: `Get-NetTCPConnection -LocalPort 5173 -State Listen`
3. **Say where things stand,** in ten lines or fewer:
   - the milestone, phase and branch, and whether the card matched the repo (name every mismatch)
   - anything in flight or left over (worktrees, unmerged agent branches, uncommitted work)
   - **what is waiting on the designer**
   - the next action
4. **Then carry on or wait:**
   - The designer said only "go" (or the run mode is autonomous and nothing waits on them): carry on from the
     card's next action under `docs/WORKFLOW.md`.
   - The designer asked for the plan first, or asked for something else: do that.
   - A standing order in the card says to stop (a pause before a milestone, a gate): stop there and say so.
5. You are the orchestrator: you coordinate. Development and review go to agents (`docs/WORKFLOW.md`, "Who does
   what" and "Choosing the level").
