# UNIBOX Continuous Improvement Loop

> How quality stays high without anyone remembering to look. Three layers,
> each catching different classes of regression.

## Layer 1 — Pre-push smoke test (manual, ~3 seconds)

**File:** `scripts/smoke-test.mjs`
**When to run:** Before every `git push origin main`. Pair with `npx tsc --noEmit && npm run lint && npm run build`.
**What it verifies:** five HTTP-level invariants that have historically broken silently:

```
✓ login round-trip — AES-GCM cookie set (Phase 1 commit d0283a2)
✓ refresh-session returns valid role — Phase 4 commit af1a6dc
✓ /api/perf/log accepts a sample — Phase 2 perf monitor still wired
✓ gmail webhook rejects unauth callers — Phase 1 commit e1601ff
✓ login rate-limits after ≤11 bad attempts — Phase 2 commit dd44cfe
```

**Setup**: requires the synthetic-workflow sentinel users to exist. Run
`node scripts/synthetic-workflow-setup.mjs` once if they're not there;
clean up with `--apply` when done.

```bash
# Full pre-push routine
node scripts/synthetic-workflow-setup.mjs
node scripts/smoke-test.mjs
node scripts/synthetic-workflow-cleanup.mjs --apply
npx tsc --noEmit && npm run lint && npm run build
git push origin main
```

If any smoke test fails, **don't push** — the regression is one of the
five things the static audits couldn't catch and the live app needs it.

## Layer 2 — Bi-weekly auto-review routine (scheduled, autonomous)

**Routine ID:** `trig_015BNJ8wBr8T9XP4Vruds6FU`
**Schedule:** Every Monday 09:00 PKT (`0 4 * * 1` UTC)
**Manage:** https://claude.ai/code/routines/trig_015BNJ8wBr8T9XP4Vruds6FU

A fresh remote agent boots up a clean checkout of `main` and:

1. Reads `CLAUDE.md`, `docs/AUDIT-2026-04-30-GRAND-DISCOVERY.md`, and
   `docs/SYNTHETIC-WORKFLOW-2026-04-30.md` to establish ground truth.
2. Counts commits in the last 14 days. If <5, exits silently — quiet
   weeks produce no PR.
3. Runs `npm install` + `tsc --noEmit` + `npm run lint` + `npm run build`.
4. Reviews the codebase across 4 lenses (Inbox, CRM, Campaigns, Admin/
   Editor/Dashboard).
5. Lists REGRESSIONS (anything Phase 1-4 fixed that broke again) and NEW
   findings.
6. Opens a **draft PR** titled `Auto-review {DATE} — N findings, {ok|attention} status`.
7. Never auto-merges, never pushes to main.

**You triage**: open the draft PR, decide what's actually worth shipping,
implement what you pick or close the rest. Frequent close-without-merge
is fine — the routine's job is surfacing, not deciding.

## Layer 3 — Live workflow walkthrough (on-demand, when stakes are high)

**Files:** `scripts/synthetic-workflow-{setup,cleanup}.mjs`
**Doc:** `docs/SYNTHETIC-WORKFLOW-2026-04-30.md`
**When to run:** Before a major release, after a big architectural change,
or when a user reports a runtime issue the smoke test missed.

The walkthrough is browser-driven (claude-in-chrome MCP) and exercises
the full SALES → ADMIN → EDITOR → delivery cycle through the actual UI.
It catches things the smoke test can't:

- Modal hygiene (focus trap, body scroll lock, Esc, autofocus)
- Empty states + loading states + transition states
- Cross-page wiring (links that go nowhere)
- Visual rendering bugs (e.g., 4.5 stars rendered as 5)
- Workflow gaps (action that saves to DB but UI shows stale state)

The first run produced 23 findings (3 CRITICAL, 5 HIGH, 7 MEDIUM, 8 LOW).
Of those, 14 have shipped through Phase 4. Re-run anytime via
`node scripts/synthetic-workflow-setup.mjs`, drive the browser, then
`node scripts/synthetic-workflow-cleanup.mjs --apply`.

## What gets caught at each layer

| Failure class | Layer 1 | Layer 2 | Layer 3 |
|---|---|---|---|
| Critical security regression (RBAC bypass, auth break) | ✓ | ✓ | ✓ |
| Performance regression (perf monitor stops sampling) | ✓ | — | ✓ |
| Build / type / lint break | — | ✓ | — |
| Static-analysis findings (dead code, missing handlers) | — | ✓ | — |
| Modal/UX/cross-page wiring | — | partial | ✓ |
| Live-render bugs (stars, skeletons, off-by-one counts) | — | — | ✓ |
| Workflow state-machine gaps | — | — | ✓ |

## Future improvements

When the next bi-weekly review opens a PR, consider adding to this loop:

- **CLAUDE.md drift detector** — scripted check that compares CLAUDE.md
  claims (lint status, build cmd, route count, etc.) against `package.json`
  / `vercel.json` / actual route map. Auto-update on drift, fail otherwise.
- **Schema drift detector** — `prisma db pull` vs `prisma/schema.prisma`,
  flag diffs.
- **Sentinel cleanup safety net** — a daily one-shot routine that runs
  `synthetic-workflow-cleanup.mjs --apply` and confirms zero residue.
- **Observability hooks** — Slack/email when the auto-review opens a PR
  with `attention` status (build broken or critical regression). Currently
  it just sits as a draft PR until someone visits GitHub.

Add any of these by talking to the orchestrator (this Claude session) —
each is a 5–15 minute job once the user signals priority.

---

_Last updated: Phase 4 + smoke-test layer. See git log for the latest commits in the loop._
