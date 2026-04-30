# Synthetic Workflow Discovery Run — 2026-04-30

> Live runtime walkthrough of the **SALES ↔ EDITOR ↔ ADMIN** collaboration flow,
> driven through the actual UI in Chrome via `claude-in-chrome` MCP at
> `http://localhost:3000`. Production Supabase. Sentinel emails
> (`*-synthetic@texasbrains.com`) + cleanup script ran successfully — zero
> production residue.

## Setup

| User | Email | Role | DB id (gone after cleanup) |
|---|---|---|---|
| SALES | `test-sales-synthetic@texasbrains.com` | `SALES` | `86145b12-…` |
| EDITOR | `test-editor-synthetic@texasbrains.com` | `VIDEO_EDITOR` | `7cb00a8a-…` |
| ADMIN | `test-admin-synthetic@texasbrains.com` | `ADMIN` | `462263d9-…` |

Password (all three): `Synthetic-2026`. Hashed via `bcryptjs(12)` per `app/api/auth/set-password/route.ts:45`.

Cleanup verified: `users`, `contacts (email)`, `contacts (name)` all returned 0 rows after `node scripts/synthetic-workflow-cleanup.mjs --apply`.

## Executive Summary

- **3 CRITICAL bugs** found at runtime that the static-analysis audits missed.
- **5 HIGH findings** around session/UX state staleness + workflow gaps.
- **8 MEDIUM/LOW** UX & copy issues.
- **1 ARCHITECTURAL gap** (already documented in plan) — `projects ↔ edit_projects` has no FK link, ADMIN must manually create the bridge with no client_id reference.

## Findings

### CRITICAL

| # | Severity | Cat | File:Line | Finding |
|---|---|---|---|---|
| 1 | CRITICAL | BUG | `app/my-projects/PageClient.tsx:294` | **`/my-projects` "Create Project" button is dead.** `handleAdd` passes `clientId: ''` (empty string) to `createProjectAction`. DB FK rejects, action throws `{success:false}`, **modal stays open with zero feedback** — no toast, no console error. Tested: clicked twice, no row created. Modal also has no field for selecting a client, so even if FK were tolerated, the project would be orphaned. Also: `(user as any)?.userId` likely should be `.id` per the auth shape — second bug in same line. |
| 2 | CRITICAL | BUG | `app/clients/PageClient.tsx:117` (the `getClientsAction` filter) | **SALES users with zero Gmail-account assignments can CREATE contacts but never SEE them in `/clients`.** The list filters by `last_gmail_account_id IN accessible.gmail_account_ids`. A new contact has `last_gmail_account_id = null`, so it never matches. The contact exists in DB owned by the creating SALES user, but is invisible from their own UI until somebody emails them. Workflow-blocking for SALES users without inbox assignments. |
| 3 | CRITICAL | BUG | `app/projects/page.tsx` (right-panel detail) | **Editor assignment via the right panel SAVES to DB but the panel UI keeps showing "Unassigned".** Verified: `edit_projects.editor_id` updated correctly, but right-panel never re-fetches after the picker closes. Admin has no visual confirmation the assignment landed → likely to click again, possibly creating duplicate audit log entries. |

### HIGH

| # | Severity | Cat | File:Line | Finding |
|---|---|---|---|---|
| 4 | HIGH | BUG | `app/components/Sidebar.tsx` | **Sidebar persona doesn't refresh after a logout+login as a different user.** After SALES logged out and ADMIN logged in, sidebar still showed "[SYN] Sales Tester · 0 accounts · Sales" + SALES nav variant on `/dashboard`. Had to manually `POST /api/auth/refresh-session` from the console to fix. The new login DID set a new cookie (verified), so this is a client-side cache (likely module-state in Sidebar.tsx) that doesn't react to cookie changes. |
| 5 | HIGH | UX | `app/PageClient.tsx` (inbox) | **A SALES user with zero Gmail-account assignments sees a perpetual "Checking your inbox..." skeleton on `/`** with no "you have no accounts assigned, ask an admin" empty state. Skeleton just sits forever. |
| 6 | HIGH | BUG | `app/my-queue/PageClient.tsx` | **`/my-queue` shows misleading "0 jobs" during initial load** before data is fetched. Took 8s to update to "1 job" for our project. Should render skeleton or "—" until count is real. |
| 7 | HIGH | UX | `app/components/editor/EditorTodayView.tsx` (Today greeting) + `app/dashboard/PageClient.tsx:293` + `app/clients/[id]/PageClient.tsx:17` | **firstName extraction is broken for any name starting with `[` or special chars.** `firstName(full) = full.trim().split(/\s+/)[0]` returns `[SYN]` for "[SYN] Sales Tester". Affects: dashboard greeting ("Good evening, [SYN]"), contact detail header ("Owner: [SYN]"), editor Today greeting. Real users with parenthesised prefixes ("(External) Some Name") would hit it too. Should strip non-letter prefixes or use better tokenisation. |
| 8 | HIGH | BUG | `app/components/Sidebar.tsx` | **Editor sidebar shows "Jarvis AI" link**, but `/api/jarvis`, `/api/jarvis/agent`, `/api/jarvis/tts` all reject VIDEO_EDITOR (Phase 2 commit `a3bf0e5`). Clicking would yield a 403 spiral. Link should be hidden for that role. |

### MEDIUM

| # | Severity | Cat | File:Line | Finding |
|---|---|---|---|---|
| 9 | MEDIUM | ARCH | n/a (schema gap) | **`projects ↔ edit_projects` has no FK relationship.** Confirmed at runtime: the right-panel "Client name" on `/projects` is a free-text field, not a contact picker. Even if ADMIN creates an edit_project for the right client by typing the name, there's no link back to `contacts.id`. Sales-side reporting and editor-side reporting are siloed forever. Documented in plan; runtime confirms it. |
| 10 | MEDIUM | UX | `app/projects/page.tsx` (header copy) | **Header copy "exclusively designed for our Wedits team. This behind-the-scenes hub is where we work our editing magic and bring dreams to life."** hardcodes "Wedits" — violates the white-label-ready constraint the user set in Phase 2. |
| 11 | MEDIUM | BUG | `app/components/editor/EditorTodayView.tsx` | **A red "Couldn't load dashboard data. Check your connection. Retry" toast persisted on the editor's Today page** even though the project card rendered correctly underneath it. Some background fetch is failing silently and surfacing an alarming retry button despite the page actually working. |
| 12 | MEDIUM | UX | `app/components/AddLeadModal.tsx` | **STATUS dropdown in `New Client` modal is missing `CONTACTED` and `WARM_LEAD` options** that exist in the Prisma `PipelineStage` enum (`COLD_LEAD, CONTACTED, WARM_LEAD, LEAD, OFFER_ACCEPTED, CLOSED, NOT_INTERESTED`). User can only pick Lead / Cold Lead / Offer Accepted / Closed / Not Interested — two stages are unreachable from the create flow. |
| 13 | MEDIUM | UX | `app/components/AddLeadModal.tsx` (account_manager dropdown) | **Account Manager dropdown shows all 22 user names client-side** to a SALES user. The Phase 1 mass-assignment guard (commit `2ef18b6`) makes the *server* reject SALES picking another user, but the client still leaks the full team roster. Either filter the list to `[Auto-assign (me)]` only for SALES, or skip rendering the dropdown for non-admins. |
| 14 | MEDIUM | UX | `lib/projects/editorStats.ts:707` | **`sendForReviewAction` accepts an optional `note` parameter, but the UI never asks for one.** The "Send for review" button immediately posts a hardcoded comment ("🚀 Sent for review — latest cut is ready for the admin to review."), with no prompt for context. Editor can't say "this version fixes the audio sync" without leaving a separate comment. |
| 15 | MEDIUM | UX | `lib/projects/editorStats.ts` (uploadCut + send for review) | **Upload cut + Send for review never advance `progress` from `IN_PROGRESS`.** Editor's signals are comment-only; admin must manually transition to `IN_REVISION` or `APPROVED`. Workflow has no automatic state advancement. |

### LOW / POLISH

| # | Severity | Cat | File:Line | Finding |
|---|---|---|---|---|
| 16 | LOW | COPY | `app/clients/PageClient.tsx` (empty state) + `+ Add client` button | **Terminology drift**: empty state copy says `+ New` button, actual button is `+ Add client`. Modal title is `New Client`, page header is `0 clients`, default stage is `Lead`. Pick "Lead" or "Client" and stick to one. |
| 17 | LOW | UX | `app/components/Sidebar.tsx` | **No client-detail "+ Add project" CTA on `/clients/[id]`.** Projects tab shows `(0)` count but no add affordance — user has to leave to `/my-projects`, which on top of being broken (#1) doesn't even have a client picker. |
| 18 | LOW | UX | `app/clients/[id]/PageClient.tsx` (KPI tiles) | **"Days Silent: 0" is misleading for a brand-new contact with no email history.** Should render `—` or "New" until there's at least one email to anchor against. |
| 19 | LOW | UX | various editor pages | **Browser title duplicated `\| Unibox \| Unibox`** on `/my-queue` ("My Queue \| Unibox \| Unibox") and `/delivered` ("Delivered \| Unibox \| Unibox"). Some layout double-suffixes the metadata template. |
| 20 | LOW | UX | EditorProjectDetail panel | **Comments section labelled "CLIENT FEEDBACK"** even though comments are authored by editor + admin (no client-facing UI exists today, per the no-customer-facing constraint). Misnomer. Should be "PROJECT COMMENTS" or "ACTIVITY". |
| 21 | LOW | UX | `app/delivered/PageClient.tsx` (rating stars) | **5 stars all filled for a 4.5 rating** — no half-star or partial rendering. Misrepresents the actual value. |
| 22 | LOW | UX | `app/delivered/PageClient.tsx` ("revisions" count) | **Card shows "Revisions: 2"** but the underlying count is `project_comments.length`. Our 2 comments were "uploaded cut" + "sent for review" — milestones, not revisions. Counting all comments as revisions inflates the metric. |
| 23 | LOW | UX | `app/components/editor/EditorTodayView.tsx` (footer) | **Bottom-left "1 Issue" badge** with red dot was visible on the editor Today page — unclear what issue it refers to. Persistent badge with no on-click context. |

## Workflow Round-Trip — what worked

Despite the bugs, the **happy path through DB-direct bypass succeeded**:

1. ✓ SALES login (`/api/auth/login`) — works, AES-GCM cookie issued.
2. ✓ Add client modal opens, validates, hits `createClientAction` → contact created in DB.
3. ✗ SALES `/clients` list never shows the new contact (Finding #2).
4. ✓ Direct nav to `/clients/[id]` works; contact-detail page renders.
5. ✗ `/my-projects` "Create Project" button silently fails (Finding #1) — bypassed via direct DB insert.
6. ✓ ADMIN login + role-aware sidebar variants (after `refresh-session` workaround).
7. ✓ ADMIN `/clients?search=[SYN]` finds the contact.
8. ✓ ADMIN `/projects` "+ New" creates an `edit_project` with default fields.
9. ✗ Editor picker dropdown saves to DB but UI shows stale "Unassigned" (Finding #3).
10. ✓ EDITOR login + `/my-queue` correctly scoped to assigned editor (after 8s load).
11. ✓ EDITOR Today view + project card renders correctly (with red "Couldn't load" toast bug).
12. ✓ Upload cut: URL paste form → `📹 New cut uploaded` comment inserted, `last_cut_url` saved.
13. ✓ Send for review: `🚀 Sent for review` comment inserted (with hardcoded text).
14. ✓ ADMIN-side progress transition (via DB) → `/delivered` correctly shows the project with completion stats.

## Top 5 Highest-Leverage Fixes

1. **Wire `/my-projects` Create Project to a real flow** (Finding #1) — add a Client picker to the modal, send a non-empty `clientId`, surface errors via `useUndoToast`. Currently the page is **non-functional** for the entire SALES role.

2. **Fix SALES contact visibility** (Finding #2) — change `getClientsAction` so SALES users with no Gmail assignments can still see contacts they own (`account_manager_id = userId`), not just contacts whose `last_gmail_account_id` is in their assigned set. One-line fallback in the query.

3. **Make the right-panel re-fetch after edits** (Finding #3) — the editor-picker save returns the new value but the panel doesn't refresh state. Add an optimistic update on close OR re-fetch the row after every field write.

4. **Sidebar persona reactive to cookie/role change** (Finding #4) — Sidebar.tsx caches user data in module state. Invalidate or re-fetch on visibilitychange / page-level navigation event. Or call `/api/auth/refresh-session` automatically on `/dashboard` mount.

5. **Add the missing `projects → edit_projects` bridge** (Finding #9) — either: (a) add an `edit_projects.sales_project_id` FK + a "Promote to edit job" action on `projects`, or (b) add a "Client" picker (referencing `contacts.id`) to the right-panel on `/projects` so editor work has provenance back to a real contact. Without this, sales reporting and delivery reporting are forever siloed.

## Top 5 Workflow Enhancements (not bugs)

1. **Auto-promote `progress` to `IN_REVISION` when "Send for review" fires** — currently the editor's review signal is comment-only; admins must remember to flip the state. Most editor UIs assume the signal IS the transition.

2. **Note prompt on "Send for review"** — surface a small textarea so editors can leave context ("v2 — fixed audio sync at 1:24").

3. **Half-star rendering on `/delivered`** — replace the all-or-nothing star map with a partial-fill SVG so 4.5 displays correctly. Aesthetic but ships a clearer signal.

4. **"You have no Gmail accounts assigned" empty state** for SALES users on `/` (inbox) — replaces the perpetual loading skeleton with an actionable "ask an admin to assign you accounts" message + a link to /team.

5. **Consolidate Lead vs Client terminology** — modal says "New Client", button says "+ Add client", default stage is "Lead", page header is "X clients". Pick one ("Contact" is probably the most accurate since it covers both pre- and post-close states) and align across the surface.

## Cleanup Verification

```
node scripts/synthetic-workflow-cleanup.mjs --apply
   ✓ deleted 2 project_comment row(s)
   ✓ deleted 1 edit_project row(s)
   ✓ deleted 0 activity_log row(s)
   ✓ nullified contact_id on 0 email_message row(s)
   ✓ deleted 1 project (sales) row(s)
   ✓ deleted 1 contact row(s)
   ✓ deleted 0 gmail-assignment row(s)
   ✓ deleted 3 user row(s)
ALL CLEAN.
```

Production state restored.
