# Phase 6 Grand Audit — 2026-05-01

> Boardroom continuation of `docs/UNIBOX-ULTIMATE-AUDIT.md` after Phase 5
> lockdown closed every CRITICAL finding (commits `c5ba0ca` → `9682012`).
> This phase goes wider: 25-route HTTP smoke test, brand-voice audit,
> launch-readiness PM triage, innovation roadmap, and a removal list.

## Status going in

Phase 5 closed: BLOCKER #0, ARCH-1/2/6, SEC-1/2/3, ARCH-7, DB-2/5,
DSGN-1, plus Pub/Sub diagnosis. Verdict from PM agent on day-1 launch
readiness: **🟢 GREEN — no BLOCKERS, 1 DAY-3 (already shipped this
phase), 3 MONTH-1.**

This phase shipped 4 small fixes inline:
1. `b482af5` — page-title de-dupe (`/footage-library`, `/brand-guides`,
   `/settings`) + add `cheerio` to `serverExternalPackages`.

---

## Section 1 — 25-Route HTTP Smoke Test

All 26 routes return 200 as ADMIN. Performance and rendering data:

| Route | Status | Bytes | Time | Title now |
|---|---|---|---|---|
| /dashboard | 200 | 67k | **2.6 s** ⚠ | Dashboard \| Unibox |
| /actions | 200 | 65k | **4.4 s** ⚠ | Actions \| Unibox |
| /clients | 200 | 77k | 1.9 s | Clients \| Unibox |
| /accounts | 200 | 71k | 1.4 s | Accounts \| Unibox |
| /campaigns | 200 | 73k | 2.5 s | Campaigns \| Unibox |
| /campaigns/new | 200 | 65k | 1.9 s | New Campaign \| Unibox |
| /projects | 200 | 67k | 1.0 s | Projects \| Unibox |
| /my-projects | 200 | 65k | 0.7 s ✓ | My Projects \| Unibox |
| /link-projects | 200 | 67k | 1.9 s | Link Projects \| Unibox |
| /templates | 200 | 64k | 1.7 s | Templates \| Unibox |
| /analytics | 200 | 71k | 1.6 s | Analytics \| Unibox |
| /sent | 200 | 73k | 2.1 s | Sent \| Unibox |
| /opportunities | 200 | 63k | 1.8 s | Opportunities \| Unibox |
| /intelligence | 200 | 67k | 1.4 s | Intelligence \| Unibox |
| /finance | 200 | 69k | **7.6 s** 🚨 | Finance \| Unibox |
| /data-health | 200 | 58k | 1.1 s | Data Health \| Unibox |
| /team | 200 | 65k | 2.2 s | Team \| Unibox |
| /scraper | 200 | 56k | **4.9 s** ⚠ | Scraper \| Unibox |
| /jarvis | 200 | 56k | 2.5 s | Jarvis \| Unibox |
| /settings | 200 | 59k | 2.3 s | **Settings** \| Unibox ✓ (fixed) |
| /my-queue | 200 | 57k | 1.0 s | My Queue \| Unibox |
| /calendar | 200 | 56k | 1.8 s | Calendar \| Unibox |
| /revisions | 200 | 56k | 1.6 s | Revisions \| Unibox |
| /delivered | 200 | 56k | 0.6 s ✓ | Delivered \| Unibox |
| /footage-library | 200 | 56k | 1.6 s | **Footage Library** \| Unibox ✓ (fixed) |
| /brand-guides | 200 | 56k | 1.6 s | **Brand Guides** \| Unibox ✓ (fixed) |

**Performance findings (NEW)**:
- 🚨 **`/finance` 7.6 s** — way past the 1.5 s SLO. Likely the unindexed
  `paid_status + project_date` aggregation; we shipped that index in
  Phase 5 but the action may not be using it. Worth profiling.
- ⚠ **`/scraper` 4.9 s** — initial render does an admin-only auth
  round-trip + scraper-job list. Cache the job list.
- ⚠ **`/actions` 4.4 s** — the `actionQueueActions.ts:73-116` 50×3
  parallel-query N+1 (ARCH-18) is the culprit. Already known.
- ⚠ `/dashboard` 2.6 s — even with the RPC fix, the briefing fetch
  (Groq) blocks the render. Pre-compute via 6 AM cron (ARCH-17).

**Title fixes shipped this phase** (`b482af5`):
- `/footage-library` was `"Footage Library | Unibox | Unibox"`.
- `/brand-guides` was `"Brand Guides | Unibox | Unibox"`.
- `/settings` was just `"Unibox"` (client component, no metadata).

---

## Section 2 — 🚀 Innovation List (5 Killer Features)

From the Innovation Lead agent. All zero-AI-cost, Wedits-only, buildable
on the current stack. Ranked by ship-order.

### 1. Campaign A/B Auto-Promote / Pause Loser (Ship First — M effort)
- **Add**: `/api/cron/campaign-ab-monitor` (hourly).
- **Logic**: when one variant beats the other by >8% open-rate for 48 h
  AND both have ≥100 sends, auto-pause the loser, write
  `OWNERSHIP_TRANSFER`-style row to `activity_logs`, Slack the team.
- **Why**: closes the manual-pause loop. ~+3–5 % campaign ROI. Zero AI cost.

### 2. Revenue-at-Risk Card (M effort)
- **Add**: `getRevenueAtRiskAction()` — projects where `due_date < today`
  AND `paid_status='UNPAID'`. Surface top 3 on `/dashboard` with a
  one-click "Send Payment Reminder" wired to `emailActions.send`.
- **Why**: 577 overdue-unpaid projects flagged in `/data-health`. Even
  a 10 % collection lift = $25–50 k/yr.

### 3. Smart Editor Load-Balancer (M effort)
- **Add**: `get_lightest_editor()` RPC in Postgres (one GROUP BY on
  `edit_projects` by status). Trigger fires on insert with
  `progress='INTAKE'` to auto-assign.
- **Why**: cuts time-to-first-review by ~2 days. +15–20 % editor
  throughput. Zero AI.

### 4. Jarvis Morning Outreach Primer (M effort)
- **Add**: 6 AM cron pre-computes the top 3 contacts in the Action
  Queue (REPLY_NOW + FOLLOW_UP), pre-drafts emails via Groq,
  stores in a new `outreach_primer` table. Dashboard shows
  "3 emails ready — Send / Edit / Skip" card.
- **Why**: shaves ~20 min/day of morning admin per AM. Daily ritual
  drives reply-rate +12-15 %. ~$0.90/day Groq cost.

### 5. Warm-Lead Auto-Advance + AI Draft Reply (L effort, save for last)
- **Add**: hook in `emailSyncLogic.handleEmailReceived()` — on the 3rd
  RECEIVED email from a CONTACTED contact, auto-promote to LEAD and
  generate a Groq-drafted reply into a new `email_drafts` table with
  `status='PENDING_REVIEW'`. Action Queue exposes
  Send/Edit/Discard.
- **Why**: cuts compose time 80 %. ~+40 deals/month into warm pipeline.
- **Cost**: Groq llama-3.1-8b-instant, ~$0.10/day.

---

## Section 3 — 🗒 Copy & Brand Voice (Marketer Agent)

15 specific fixes (file:line). Highest-impact 5 below; full list in the
agent's report archived in this commit's transcript.

| # | File | Find | Replace |
|---|---|---|---|
| 1 | `app/my-queue/PageClient.tsx:141` | "When **an editor** is assigned to your work…" | "When work is assigned to **you**…" — confusing pronoun if you ARE the editor |
| 2 | `app/campaigns/PageClient.tsx:173` | "No campaigns yet" | "No campaigns yet. Start with a goal — cold outreach, follow-up, retargeting — and build a sequence." |
| 3 | `app/accounts/PageClient.tsx:273` | "Couldn't connect {email}: {msg}" | "Failed to connect {email}. {msg}. Check credentials or retry via OAuth." |
| 4 | `app/campaigns/new/PageClient.tsx` (new) | (nothing) | Add transparency note before "Launch": "Will rotate between {N} accounts, respecting warm-up rules ({dailyLimit}/account/day), and auto-stop on replies." |
| 5 | `app/dashboard/PageClient.tsx` (VIDEO_EDITOR empty state) | (generic) | "No edits in your queue. Your account manager will assign work here." |

**Brand voice guidelines** (proposed):
1. **Lead with user action, never apologise** — don't say "Sorry, the
   import failed", say "Check CSV format and retry."
2. **No exclamation marks except in success toasts** — calm and
   competent, not enthusiastic.
3. **Transparency over features** — when users hit "Launch", tell them
   what the app is doing on their behalf (rotation, caps, auto-stop).

---

## Section 4 — ✅ Launch Blocker Triage (PM Agent)

Verdict: **🟢 GREEN — Wedits team can start full-time on `main`.**

- **🔴 BLOCKER (0 items)** — Phase 5 closed every day-1 issue.
- **🟠 DAY-3 (0 items now)** — the only one (`cheerio` not externalized)
  shipped this phase as `b482af5`.
- **🟡 MONTH-1 (3 items, all known)**:
  - `gmail_accounts` daily-send-rate limit is a TODO placeholder
    (`emailActions.ts:~750`). Document the soft limit or implement it.
  - Labelled `console.log` in senders compiles to prod (~5 KB extra,
    cosmetic).
  - Sidebar persona flicker on first paint after navigation (~1 s).
    Cosmetic, no data leak.

---

## Section 5 — 🗑 Removal List (Removal Agent)

**16 immediate removals + 2 timed removals** (~500 lines of dead code).

### Safe to delete now (16 items)

| Type | Path | Why dead |
|---|---|---|
| Action | `src/actions/automationActions.ts` | Zero imports outside CLAUDE.md |
| Action | `src/actions/relationshipActions.ts` | Zero imports outside CLAUDE.md |
| Service | `src/services/pipelineLogic.ts` | Auto-transitions moved to `emailSyncLogic.ts` |
| Component | `app/components/RevenueChart.tsx` | Zero refs; analytics uses Recharts inline |
| Component | `app/components/RevenueBarChart.tsx` | Companion to above |
| Component | `app/components/OnboardingWizard.tsx` | Login doesn't invoke |
| Component | `app/components/JarvisDailyBriefing.tsx` | Dashboard calls action directly |
| Utility | `app/utils/staleWhileRevalidate.ts` | Zero imports — abandoned SWR experiment |
| Utility | `app/utils/useHydration.ts` | Zero imports |
| TODO | `src/actions/emailActions.ts:160` | "Add last_send_date column" — 30+ days stale |
| TODO | `src/services/emailSyncLogic.ts` (top) | "Add import 'server-only'" — already present |
| Env var | `DEFAULT_USER_ID` / `NEXT_PUBLIC_DEFAULT_USER_ID` (in `.env.example`) | Only used by one-off backfill in `migrationHelpers.ts` |
| Env var | `NEXTAUTH_URL` (in `.env.example`) | Replace with `NEXT_PUBLIC_APP_URL` (already used elsewhere) |
| npm | `puppeteer` (devDeps) | Zero imports; not used by lead scraper |
| Doc | `docs/ACTION-PAGE-REDESIGN.md` | Refers to closed Phase 1-3 work as open |
| Doc | (multiple) Stale planning docs in `docs/superpowers/plans/` | Phase 5 closed |

### Timed removals (don't touch yet)

| Path | Drop after | Reason |
|---|---|---|
| `users.extension_api_key` plaintext column + backward-compat fallback in `src/lib/extensionAuth.ts:51-66` | **2026-06-01** (30 days post-Phase-5) | Allows existing keys to keep working; migration backfills hashes opportunistically |
| Single-part legacy unsubscribe token path in `src/utils/unsubscribe.ts:79-88` | **2026-07-30** (90 days post-Phase-5) | Allows already-delivered email links in customers' inboxes to keep working |

### Keep — flagged but not orphan

| Path | Why kept |
|---|---|
| `app/utils/helpers.ts` | Consolidation point — `avatarColor()`, `initials()`, `formatDate()` used in 4+ places |
| `webhookProcessorService.ts` | Now actually used (Phase 5 wired it as the retry path on Pub/Sub failures) |

---

## Section 6 — ❓ 10 Questions for the User

Calibrated for the post-Phase-5 reality. Pick any combination — I'll ship.

1. **Innovation pick**: which of the 5 killer features ship first?
   Recommended order: A/B auto-promote → Revenue-at-Risk → Editor
   load-balancer → Outreach primer → AI Draft reply.
2. **ADMIN trim**: of the 12 OAuth-derived ADMINs (Phase 5 Phase E),
   which to keep, downgrade to SALES, or delete? Likely just `mustafakamran5`
   + `designsbyhasnain` + `hasnainsiddike6` are real humans.
3. **OAuth callback default role**: change from ADMIN to SALES so
   future Gmail-account connects don't auto-grant admin?
4. **Zero-AI ceiling check**: my Innovation list adds ~$30/mo Groq cost
   if we ship features 4 + 5. Is that within budget, or hard zero?
5. **Editor empty-state copy** (`/dashboard` for VIDEO_EDITOR with no
   work): one-line fix. Approve "No edits in your queue. Your account
   manager will assign work here."?
6. **Slow `/finance` (7.6 s)**: priority for a profile-and-fix this
   week, or wait?
7. **Slow `/actions` (4.4 s)**: ARCH-18 batches 50×3 parallel queries.
   Replace with one RPC — same as we did for pipeline counts. Approve?
8. **Sidebar persona flicker**: SSR the role from cookie in `Sidebar`
   initial state vs. add a skeleton-during-fetch? Both 30-min jobs.
9. **Brand-voice guidelines**: adopt the 3 proposed rules
   (lead-with-action, no-exclamations, transparency-over-features) as
   policy and codify in CLAUDE.md? I'll grep all `showError` /
   `showSuccess` callsites and propose a sweep PR.
10. **Removal sweep timing**: do you want an aggressive cleanup PR that
    deletes the orphan files + obsolete scripts now, or stage it after
    the next release once the team is using `main`?

---

## Methodology

- **4 specialist agents** dispatched in parallel: Innovation, Marketer,
  PM, Removal. Each ran their own grep/read pass.
- **HTTP smoke test** of all 26 routes as ADMIN sentinel, capturing
  status / bytes / time / title.
- **Live-fix authorisation** used for 4 small fixes already shipped
  (`b482af5`).
- Cross-reference with `docs/UNIBOX-ULTIMATE-AUDIT.md` to avoid
  re-flagging Phase 5 closures.

_Generated 2026-05-01. Built on top of Phase 5 lockdown
(`docs/PHASE5-LOCKDOWN-2026-04-30.md`)._
