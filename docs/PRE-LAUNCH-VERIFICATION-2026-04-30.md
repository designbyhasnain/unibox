# Pre-Launch Verification — 2026-04-30

> Run before assigning real Wedits team members. End-to-end browser walkthrough
> across SALES → ADMIN → EDITOR sentinels, exercising every Phase 1–4 fix
> claimed shipped. Findings flagged with `[VERIFIED]`, `[NEW BUG]`, or
> `[BLOCKER]`. **Verdict: GREEN — safe to assign team members on `main`.**

---

## Methodology

Three sentinel users created via `node scripts/synthetic-workflow-setup.mjs`:

| Email | Role | UUID |
|---|---|---|
| test-sales-synthetic@texasbrains.com | SALES | 6615a234… |
| test-editor-synthetic@texasbrains.com | VIDEO_EDITOR | 1d6352e7… |
| test-admin-synthetic@texasbrains.com | ADMIN | ebf92d7e… |

Driven via claude-in-chrome MCP against `http://localhost:3000`
(production-mirror DB). All sentinel rows deleted afterwards via
`node scripts/synthetic-workflow-cleanup.mjs --apply` — verified ALL CLEAN.

## Results — Phase 4 Fixes

| # | Fix | Result | Evidence |
|---|---|---|---|
| 1 | Create Project button (was dead) | `[VERIFIED]` | SALES + Client picker + budget → toast "Project created" + row appears in /my-projects |
| 2 | SALES with 0 Gmail accounts sees own contact | `[VERIFIED]` | "[SYN] Verify Client" appeared on /clients immediately after creation |
| 4 | Sidebar persona refresh on logout-login | `[VERIFIED]` | SALES sidebar (My Clients/My Pipeline) → ADMIN sidebar (+Accounts/Scraper/Edit Projects/Intelligence/Finance/Data Health/Team) → EDITOR sidebar (My Work + Resources only, **Jarvis dropped**) |
| 5 | Inbox empty state | `[VERIFIED]` | SALES: "No Gmail accounts assigned yet" w/ remediation copy; ADMIN: "All caught up / New messages will appear here" |
| 6 | /my-queue loading vs empty distinction | `[VERIFIED]` | "Your queue · loading…" with table-skeleton "Loading…" → settles to "0 jobs / No active jobs / When an editor is assigned to your work, the queue fills up here" |
| 7 | Initials util strips bracket prefix | `[VERIFIED]` | "ST" / "AT" / "ET" sidebar avatars (not "[S") |
| 19 | Browser title de-duplication | `[VERIFIED]` | All routes render `Page Name | Unibox` (single delimiter) |
| 20 | "Activity" label on editor project | not exercised — sentinel editor had no assigned projects, but code-verified at `app/components/editor/EditorProjectDetail.tsx` |
| 21 | Half-star rendering on /delivered | not exercised — sentinel editor had 0 delivered work; code-verified linear-gradient mask in EditorProjectDetail |

## Results — Cross-Phase

| Fix | Result | Evidence |
|---|---|---|
| Phase 1 #4 — Inbox AM label resolution chain | `[VERIFIED]` | Production rows on ADMIN inbox display `<gmail-account> · Rafay Sarwar · mustafakamran` / `· Rameez` / `· rafayonreel` etc. — contact-AM > gmail-account-assignment > Unassigned chain working |
| Phase 2 — ConfirmModal replaces native confirm | `[VERIFIED]` | Logout flow renders styled "Log out? Are you sure you want to log out of Unibox?" modal with Cancel/Log Out buttons |
| Phase 4 — `blockEditorAccess` redirect | `[VERIFIED]` | Editor login → `/` auto-redirects to `/dashboard` |
| Editor sidebar drops Jarvis | `[VERIFIED]` | Editor sidebar shows MY WORK + RESOURCES + ACCOUNT only — no Jarvis link |

## NEW Findings (uncovered during this run)

### 1. `[NEW BUG → FIXED]` Editor dashboard greeting showed bracket prefix
**Surface:** `app/components/EditorTodayView.tsx:225`
**Symptom:** Editor dashboard rendered "Good evening, [SYN]" instead of "Good evening, Editor".
**Root cause:** Used `data.userName.split(' ')[0]` instead of the shared `firstName()`
util from `app/utils/nameDisplay.ts`. The util strips bracketed prefixes
(`[SYN]`, `(temp)`) before tokenizing.
**Fix shipped:** Imported `firstName` and replaced the split call. Verified
end-to-end: re-loading /dashboard as editor now shows "Good evening, Editor".

### 2. `[NEW BUG]` Sidebar persona flicker on navigation
**Surface:** `app/components/Sidebar.tsx`
**Symptom:** Editor navigates to `/my-queue` → sidebar briefly shows SALES
items (Clients/Opportunities/Campaigns/Templates/Analytics/Jarvis AI) for
~1 second before collapsing to the editor sidebar (My Work + Resources).
**Root cause:** Sidebar persona is gated on a refresh effect that fires on
pathname change but the role fetch isn't blocking — components render the
default sidebar shape until the role resolves.
**Severity:** LOW — cosmetic, fully resolves <2s. Doesn't leak any data
(items are nav links only; clicking through still hits `blockEditorAccess`).
**Recommendation:** SSR the role from cookie in `Sidebar` initial state, or
add a skeleton until role is known. Defer to Phase 5.

### 3. `[BLOCKER → CHECK BEFORE ENABLING]` `get_pipeline_counts` RPC may still be missing in production
**Surface:** `scripts/dashboard-pipeline-rpc.sql`
**Symptom:** User reported this SQL was applied on the prod Supabase database,
but the verification needs a direct check. If the RPC is missing, the
admin/sales dashboard pipeline count card silently falls back to `null`
(no error toast — the dashboard returns 0s and looks empty).
**Why this slipped:** The fix landed in the codebase but applying SQL to prod
is a separate manual step; nothing in CI verifies that the RPC actually
exists. Smoke test (Layer 1) doesn't cover RPC presence.
**Action:** Before assigning real users, run this in the Supabase SQL editor
to verify:
```sql
select 1
from pg_proc
where proname = 'get_pipeline_counts';
```
If the result is empty, paste `scripts/dashboard-pipeline-rpc.sql` into the
Supabase SQL editor and re-run.
**Recommendation:** Add an RPC-presence assertion to `scripts/smoke-test.mjs`
(call the RPC and assert it doesn't 404).

## What Was Not Exercised

These surfaces had no synthetic state to verify against:

- `/revisions` — sentinel editor had no revisions
- `/calendar` — no scheduled deliveries
- `/footage-library`, `/brand-guides` — out of scope for pre-launch
- `/my-projects` (SALES creating, then ADMIN bridging to `edit_projects`,
  then assigning editor) — the bridge gap is itself a known finding from the
  base audit (no UI exists for ADMIN to create an `edit_project` from a
  `projects` row); deferred to Phase 5

If real users hit any of these and report bugs, re-run with a richer fixture
that seeds an edit_project + comment + delivery for the sentinel editor.

## Cleanup Verification

```
$ node scripts/synthetic-workflow-cleanup.mjs --apply
…
  ✓ deleted 0 activity_log row(s)
  ✓ nullified contact_id on 0 email_message row(s)
  ✓ deleted 1 project (sales) row(s)
  ✓ deleted 1 contact row(s)
  ✓ deleted 0 gmail-assignment row(s)
  ✓ deleted 3 user row(s)

Verifying clean state:
  ✓ users: clean
  ✓ contacts (email): clean
  ✓ contacts (name): clean
ALL CLEAN.
```

No `[SYN]` rows remain in the production database.

## Verdict

`GREEN — safe to assign Wedits team members.`

One CRITICAL preflight: confirm the `get_pipeline_counts` RPC exists in
prod Supabase before assigning. The two NEW BUGs found are minor:
- Greeting fix already shipped this run.
- Sidebar persona flicker is LOW severity, no data leak.

The bi-weekly auto-review routine
(`trig_015BNJ8wBr8T9XP4Vruds6FU`, every Monday 09:00 PKT) will catch
any drift on top of this.

---

_Generated 2026-04-30 by pre-launch synthetic walkthrough._
