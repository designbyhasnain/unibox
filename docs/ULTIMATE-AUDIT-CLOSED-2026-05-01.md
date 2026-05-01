# UNIBOX Ultimate Audit — Closure Summary

> Generated 2026-05-01 after Phase 5/6/7/8 completed. This is the closing
> document for the multi-phase audit that began with `docs/UNIBOX-ULTIMATE-AUDIT.md`
> on 2026-04-30. **All BLOCKER + CRITICAL findings closed. All HIGH
> security findings closed. Most MED items closed.** App is GREEN for
> Wedits' team to start full-time on `main`.

---

## The Journey

| Phase | When | Headline | Commits |
|---|---|---|---|
| **Phase 5 — Lockdown** | 2026-04-30 | 12 critical findings closed | `c5ba0ca`–`9682012` |
| **Phase 6 — Grand Audit** | 2026-04-30 | 95 findings catalogued | `e01eac2`, `13340b0`, `1bcd1fa` |
| **Phase 7 — Launch Overhaul** | 2026-05-01 | 9 priorities shipped | `6ee68d1`–`2c7cda7` |
| **Phase 8 — Final Hardening** | 2026-05-01 | OWASP MEDs + index pruning + voice round 2 | `d080be2` |

Total: **~25 commits, ~3,500 lines deleted, ~2,000 lines added.**

---

## Headline Numbers

| Metric | Before | After |
|---|---|---|
| ADMIN/ACCOUNT_MANAGER users | 15 | **3** (real humans only) |
| Privilege-escalation surfaces | 2 (`/api/migrate` + `migrationHelpers.ts`) | **0** (deleted) |
| Auto-admin path on OAuth callback | Implicit (historical helper) | Hard-pinned `'SALES'` invariant |
| Extension API key storage | Plaintext + non-constant-time eq | **SHA-256 hash** + constant-time HMAC compare |
| Unsubscribe token forgery surface | base64(email) — anyone can unsubscribe anyone | **HMAC-SHA256 signed** (legacy fallback for in-the-wild links) |
| Webhook retry pipeline | Dormant — failures silently dropped | Live — failures queued, 2-min cron retries |
| Orphan `email_messages.contact_id` rows | 16,559 | **0** |
| `projects_backup_20260329` dead-weight table | 3,282 rows / 1.7 MB | **dropped** |
| `email_messages` indexes | 25 (~190 MB redundant) | **18** |
| `get_pipeline_counts` RPC | Missing in prod (silent slow path) | Deployed (398 ms vs ~3 s fallback) |
| `get_finance_summary` RPC | Timed out at 120 s | v2 with single CTE + 60 s cache |
| `/actions` query count | 50 × 3 N+1 = 150 round-trips | **1 batched query** + 30 s cache |
| Page-title bugs | 3 (`Footage Library | Unibox | Unibox` etc.) | **0** |
| Server-only discipline | 7 services missing the import | **All 7 fixed** |
| `useDialogShell` modal coverage | 5 modals (2 missing) | **All 7 modals** |
| `set-password` token compare | Plaintext (legacy) | **SHA-256 hash** |
| Brand voice sweep | Generic "X failed" | Action-oriented + remediation |

---

## Closed Findings — by category

### 🛡 Security (CRITICAL → all closed)

- **SEC-1** Extension API keys plaintext → hashed (Phase 7)
- **SEC-2** `/api/extension/clients` no RBAC → `applyContactScope` filter (Phase 7)
- **SEC-3** Unsubscribe token forgery → HMAC-SHA256 (Phase 7)
- **SEC-6** `/api/extension/clients` POST auto-assigns to caller without inbox check → editor 403, scope check (Phase 7)
- **SEC-11** Phone-match last-7 → last-10 digits (Phase 7)
- **set-password** raw plaintext token compare → SHA-256 hashed (Phase 8) — *regression caught during final pass*
- **Privilege escalation** via `/api/migrate` + `migrationHelpers.ts` → both deleted (Phase 7)
- **Login rate-limit** verified still in place (Phase 1, no regression)

### 💾 Database

- **BLOCKER #0** `get_pipeline_counts` RPC missing → deployed (Phase 5)
- **DB-1** Stale planner statistics on contacts/projects/email_messages (NEVER analyzed) → VACUUM ANALYZE'd (Phase 7)
- **DB-2** 16,559 orphan `email_messages.contact_id` rows → 186 re-linked, 16,373 NULLed (Phase 5)
- **DB-3** RLS unexpectedly enabled on 26 tables (CLAUDE.md said no-RLS) → documented, no code change needed (service-role bypasses RLS)
- **DB-4** `email_messages` over-indexed (25 → 18) → dropped 7 redundant (Phase 8)
- **DB-5** `projects_backup_20260329` dead weight → dropped (Phase 5)
- **ARCH-1** 7 services missing `import 'server-only'` → all fixed (Phase 5)
- **ARCH-7** `webhook_events` retry pipeline dormant → wired via failure-path insert (Phase 5)

### 🚀 Performance

- **/finance** 7.6s → 60 s in-memory cache + v2 RPC (single CTE) (Phase 7)
- **/actions** 4.4s → 1 batched query + 30 s cache (Phase 7)
- **/dashboard** 2.6s → already on `get_pipeline_counts` RPC after Phase 5 BLOCKER fix
- **email_messages** writes faster — 7 fewer index targets (Phase 8)
- **Sidebar persona flicker** → skeleton during role-resolve (Phase 7)

### 🎨 UX / Design

- **DSGN-1** AccountSettingsModal + DownloadExtensionModal missing `useDialogShell` → migrated (Phase 5)
- **Account Settings hydration** — modal opening blank → props + localStorage seed (Phase 5)
- **EditorTodayView greeting** "[SYN]" → uses shared `firstName()` util (Phase 5)
- **Page title de-dup** (`Footage Library | Unibox | Unibox`) → fixed (Phase 6)
- **Brand voice** 9 of 15 Marketer findings shipped (Phase 7+8); rest are in `app/components/AnalyticsCharts.tsx` (35 hardcoded hex — deferred)

### 🚀 Innovation

- **A/B Auto-Promote** — service + cron route + QStash schedule (Phases 7+8)
- **Avatar honesty UI** — Gmail vs Gravatar role-aware copy on persona modal (Phase 7)

### 🗑 Removal

- 7 orphan files / TODOs / env vars / npm pkg removed (Phase 7)
- `puppeteer` devDep dropped
- `DEFAULT_USER_ID` / `NEXTAUTH_URL` env vars removed
- `docs/ACTION-PAGE-REDESIGN.md` (stale) deleted

---

## What's still open (low priority — defer to next cycle)

- **Marketer fixes 6, 7, 9, 10, 11, 14, 15** — non-critical empty states + tooltip copy. Spreadsheet for the team to triage at their own pace.
- **AnalyticsCharts hex-color migration** (~17 instances) — needs new tokens (`--urgent` orange) added to globals.css; nontrivial design work.
- **`email_messages` VACUUM** — table is 1 GB and timed out within the pooler window. Needs an off-hours maintenance window with elevated timeout.
- **Move 6 one-off scripts to `scripts/oneoffs/`** — cosmetic.
- **Drop legacy plaintext `users.extension_api_key` column** — scheduled 2026-06-01 (30-day transition).
- **Drop legacy single-part unsubscribe tokens** — scheduled 2026-07-30 (90-day transition).

None of these block launch. The team can start using `main` today.

---

## Permanent infrastructure additions (Phase 5–8)

- **`scripts/smoke-test.mjs`** — pre-push HTTP-level invariants check.
- **`scripts/synthetic-workflow-setup.mjs` + `cleanup.mjs`** — sentinel users for browser testing.
- **`scripts/repair-orphan-emails.mjs`** — reusable orphan fixer.
- **`scripts/diagnose-finance.mjs`, `diagnose-bloat.mjs`** — perf timing harnesses.
- **`scripts/vacuum-analyze-hot-tables.mjs`** — manual DB maintenance.
- **`scripts/inspect-email-messages-indexes.mjs`** — index audit.
- **`scripts/drop-redundant-email-indexes.mjs`** — applied + saved for future audits.
- **`scripts/downgrade-admins.mjs`** — applied; reusable when new auto-admins appear.
- **`src/lib/extensionAuth.ts`** — hashApiKey + authenticateExtension + applyContactScope helpers.
- **A/B Auto-Promote cron** (`/api/cron/ab-auto-promote`) — wired to QStash hourly.
- **Bi-weekly auto-review routine** (`trig_015BNJ8wBr8T9XP4Vruds6FU`) — scheduled remote agent that opens a draft PR every other Monday with new findings.

---

## Verdict

🟢 **GREEN. Ship it.**

- Zero CRITICAL findings open.
- Zero BLOCKERs open.
- Audit chain: ULTIMATE-AUDIT (95 findings) → PHASE5-LOCKDOWN (closed 12) → PHASE6 (audit + 4 fixes) → PHASE7 (9 priorities) → PHASE8 (this doc).
- Bi-weekly auto-review routine guards against regression.
- Pre-push smoke test catches the 5 historical break-cases.
- 30-day legacy fallback windows give the team a graceful migration off plaintext API keys + unsigned unsubscribe tokens.

The Wedits team can start full-time on `main` today. Anything that breaks
in week 1 will be caught either by the smoke test (HTTP invariants), the
bi-weekly auto-review (codebase drift), or the on-demand synthetic
walkthrough (UX regressions).

---

_Generated 2026-05-01. Closing document for the Ultimate Audit cycle started 2026-04-30._
