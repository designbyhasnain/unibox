# UNIBOX-ULTIMATE-AUDIT.md — Grand Boardroom Audit, 2026-04-30

> 12-persona deep-scan covering security, architecture, database, UX,
> business workflows, and operations. Builds on top of Phase 1-4 (already
> shipped: see commits `db53b9e`, `b49211a`, `28d5107`, `c3f7dcd`,
> `68cae22`, `24d7f7a`). **Findings here are NEW — anything Phase 1-4
> already fixed is omitted.** End of doc has 10 questions for the user.

---

## Executive Summary

**1 BLOCKER, 8 CRITICAL, 23 HIGH, 38 MED, 25 LOW = 95 new findings.**

The app is fundamentally stable — no auth bypass, no data corruption, no
broken core workflow. But four categories show drift:

1. **Extension API surface (CRITICAL)** — the Chrome-extension
   endpoints (`/api/ext/*`, `/api/extension/*`) escaped Phase 1 hardening.
   API keys are stored in plaintext, lookup is unsanitized, the GET
   `/api/extension/clients` returns the full workspace contact set
   ignoring RBAC, and unsubscribe tokens are unsigned base64 of the
   email — anyone can unsubscribe anyone.

2. **`server-only` discipline broke down (CRITICAL)** — 7 services in
   `src/services/` that read the DB or env are missing
   `import 'server-only'`. Critical Rule #8 in CLAUDE.md exists for a
   reason: one transitive client-side import away from leaking
   `SUPABASE_SERVICE_ROLE_KEY`.

3. **Database invariants drifted from CLAUDE.md (HIGH)** — the
   `get_pipeline_counts` RPC the dashboard depends on does not exist in
   production. RLS is enabled on 26 tables, contradicting the documented
   "trust service-role, no RLS" pattern. 16,559 `email_messages` rows
   point at deleted contacts. There are 13 ADMIN users on a 29-user
   team (CLAUDE.md says 11) — both head-count drift and privilege
   creep.

4. **Design-system rot is creeping (MED)** — 35+ hardcoded hex colors
   slipped into recently-touched components (AnalyticsCharts, QuickActions,
   ActionCard); two modals (AccountSettingsModal,
   DownloadExtensionModal) bypass `useDialogShell` and lose the
   focus-trap / Esc-to-close / a11y guarantees.

The single must-fix-before-anyone-trusts-the-data finding is **#0 below**.

---

## #0 — BLOCKER (deploy this before anything else)

### Apply `get_pipeline_counts` RPC to production Supabase

`scripts/dashboard-pipeline-rpc.sql` was committed last week with the
intent of being applied via the Supabase SQL editor. **Verified
2026-04-30 against the live DB: the function does not exist.** The app
silently falls back to the slow per-stage `Promise.all` path, so the
dashboard still renders — but every admin/sales dashboard load is
~250-400 ms slower than it should be, and the two named indexes the
SQL would create are missing.

Action: paste `scripts/dashboard-pipeline-rpc.sql` into the Supabase SQL
editor. Idempotent; safe to re-run. The `CREATE INDEX CONCURRENTLY`
statements have to run one at a time outside a transaction.

(Note: the indexes named in the SQL file are functionally PRESENT under
different names — `idx_contacts_pipeline_stage` etc. — so the index
gap is cosmetic. The RPC is the real blocker.)

---

## 🎩 CEO — Business & Workflow Findings

### HIGH

- **CEO-1** **13 ADMIN users on an 11-person team** (`users` query, `count(*) where role in ('ADMIN','ACCOUNT_MANAGER') = 15`). Almost everyone has full data access. Either CLAUDE.md is stale (team grew) or roles weren't downgraded after onboarding. Decide and tighten.
- **CEO-2** **Dashboard shows -70 sent / -54 leads / -24 replies vs yesterday** in fresh prod data — every KPI delta in the red. Either Phase 4's 9-day window is normalizing across a holiday, or send volume actually fell. Worth a one-time spot-check before the team panics.
- **CEO-3** **Conversion funnel is bottlenecked at Cold→Contacted→Warm.** Live snapshot: Cold 2,495 / Contacted 8,447 / **Warm: 2**. That's a near-zero conversion. Either the auto-transition rule in `src/services/pipelineLogic.ts` is broken (warm-lead detection misfiring) or the team isn't manually advancing. Cold + Contacted hold 82% of the contact base.

### MED

- **CEO-4** No KPI for **email-bounce rate** or **reply-time-to-first-response** on the dashboard. Both are leading indicators for sender-reputation drift; with 77 connected accounts, you should see them.
- **CEO-5** No surface for **revenue-per-AM leaderboard** even though `projects.account_manager_id` is the credit field (per Critical Rule #16). Easy win.

---

## 🏛 CTO / ARCHITECT — Codebase Findings

30 findings from the architect agent's full sweep. Highest-impact below.

### CRITICAL

- **ARCH-1** **7 services in `src/services/` missing `import 'server-only'`** despite reading the DB or env: `aiSummaryService`, `accountHealthService`, `accountRotationService`, `tokenRefreshService`, `trackingService`, `emailClassificationService`, `salesAutomationService`. Risk: accidental client-side bundling could leak `SUPABASE_SERVICE_ROLE_KEY`. Critical Rule #8 in CLAUDE.md says "Never remove `import 'server-only'`" — these never had it.
- **ARCH-2** **Stale TODOs at the top of `gmailSenderService.ts:1` and `manualEmailService.ts:1`** — "Add `import 'server-only'` after running npm install". The package has been installed since 2026-04-20. Add the import; remove the TODOs.
- **ARCH-3** **Missing `cheerio` from `serverExternalPackages` in `next.config.js`.** `leadScraperService.ts` imports it; without the externalize, it'll bundle into the client side of any client component that transitively imports the service.
- **ARCH-4** **`src/services/emailSyncLogic.ts:24-35` has `ownEmailsCache` that never invalidates on new account creation** — the cache is loaded once at server start; adding a Gmail account means the new owner's address is treated as external until restart.
- **ARCH-5** **`src/actions/templateActions.ts:59` does `as unknown as TemplateData[]`** — a double cast that defeats TS. Indicates schema/RPC return drift. Fix the type, not the cast.

### HIGH

- **ARCH-6** **`projects_backup_20260329` table sitting in production.** ~3.3k rows, 1.7 MB. ~1 month old. Drop after confirmation.
- **ARCH-7** **`webhook_events` table is empty after 4 weeks.** Either Pub/Sub silently degraded to poll-only, or retention is too aggressive. Investigate.
- **ARCH-8** **`email_messages` is over-indexed: 25 indexes** on a 1 GB / 107k-row table. Three overlapping (`idx_email_messages_inbox`, `_inbox_v2`, `_inbox_optimization`). Prune.
- **ARCH-9** **`src/actions/emailActions.ts` is 1,386 lines** — handles compose, send, sync, mark-read, search, thread-fetch, mime-parse. Refactor into 4-5 focused files.
- **ARCH-10** **30+ `console.log` statements in `campaignProcessorService.ts` not stripped in prod** — Next compiler config only strips bare `.log`, not labeled `[Campaign]` ones. Wrap or remove.
- **ARCH-11** **Local `ensureAdmin()` in `scraperActions.ts:8-17`** duplicates `requireAdmin()` from `accessControl.ts`. One source of role-check truth.
- **ARCH-12** **Heavy `any[]` typing in `campaignProcessorService.ts`** — `stop_for_company`, `schedule_days` and friends are unsigned. Bite the bullet and define interfaces.
- **ARCH-13** **`dailyBriefingService.ts` has 10× `as any` casts** for filter/map/reduce on known shapes. Type the Groq response + briefing structure.

### MED

- **ARCH-14** **Orphan server actions: `editorAssignmentActions.ts`, `projectMetadataActions.ts`** — zero imports. Delete or wire up.
- **ARCH-15** **Orphan service: `templateMiningService.ts`** — zero imports. CLAUDE.md says it's the weekly Monday 3 AM cron, but the cron route doesn't import it. Verify and either wire up or document why it's separate.
- **ARCH-16** **No unified email-sync dispatcher.** `emailSyncLogic`, `gmailSyncService`, `manualEmailService` all have separate `handleEmailSent`/`handleEmailReceived` style entry points. Webhook + cron + IMAP each re-implement account-routing.
- **ARCH-17** **`dailyBriefingService` calls Groq on every dashboard cold-start with 12s timeout.** CLAUDE.md recommends pre-computing into `jarvis_briefings` via 6 AM cron — never implemented.
- **ARCH-18** **`actionQueueActions.ts:73-116` does 50 contacts × 3 parallel queries = 150 round-trips.** Batch to one `IN (...)` query or an RPC.
- **ARCH-19** **Two duplicate `summary` entry points** — `aiSummaryService.generateAIRelationshipSummary` and `summaryActions.ts:92#generateAISummaryAction`. Pick one.
- **ARCH-20** **`accessControl.ts` `requireAdmin` vs `roleGate.ts` `requireAdminAccess` vs `scraperActions.ts` `ensureAdmin`** — three role-check patterns with inconsistent error messages.
- **ARCH-21** **Date-format / name-parse helpers duplicated between `app/utils/helpers.ts` and `lib/projects/editorStats.ts`.** Consolidate to `src/utils/dateFormatters.ts`.
- **ARCH-22** **`accountActions.ts:241-247` fires `syncGmailEmails` without awaiting** — silent failure on crash, no observability. Wrap in try/catch and log to `webhook_events` or a dedicated `sync_attempts` table.

### LOW

- **ARCH-23** **`templateActions.ts:26-64`** doesn't return the standard `{ success, data, error }` envelope — UI must handle two shapes.
- **ARCH-24** **Pipeline-counts fallback in `dashboardActions.ts:160-175`** — once the RPC is deployed (BLOCKER #0), remove the fallback so future drift fails loudly.
- **ARCH-25** Stale CLAUDE.md entries: `pipelineLogic.ts`, `JarvisDailyBriefing.tsx`, `RevenueChart.tsx`, `RevenueBarChart.tsx`, `automationActions.ts`, `relationshipActions.ts` — orphans documented as orphans. Just delete.
- **ARCH-26** Orphan one-shot scripts in `scripts/`: `dedupe-edit-projects.mjs`, `dry-run-csv-*.mjs`, `execute-csv-upsert.mjs`, `inspect-owner.mjs`, `list-db-dup-keys.mjs`. Move to `scripts/oneoffs/`.

---

## 🛡 HACKER — Security Findings (Phase 5 audit)

15 findings. **Three CRITICALs all sit on the Chrome extension API surface
which Phase 1 didn't cover.**

### CRITICAL

- **SEC-1** **Extension API keys stored plaintext + comparison not constant-time.** `app/api/ext/add-lead/route.ts:29` does `eq('extension_api_key', apiKey)` against the unhashed `users.extension_api_key`. Backups, logs, replicas all leak the keys. **Fix:** SHA-256 hash at rest (mirror Phase 1's invitation-token hashing pattern), constant-time HMAC compare, support rotation.
- **SEC-2** **`GET /api/extension/clients` returns the full workspace contact set** (`app/api/extension/clients/route.ts:9-36`). No `getAccessibleGmailAccountIds` filter. A SALES user with one assigned inbox can dump every contact in the company via the extension. **Fix:** apply the same RBAC chain `getClientsAction` uses.
- **SEC-3** **Unsubscribe token is unsigned base64 of the email** (`app/api/unsubscribe/route.ts:6-22`). Anyone can craft a token for any email and globally unsubscribe them. Unsubscription is irreversible. **Fix:** sign with `HMAC-SHA256(email, ENCRYPTION_KEY)`, validate signature on decode.

### HIGH

- **SEC-4** `/api/ext/add-lead` and `/api/ext/check-duplicate` query contacts via `ILIKE` with no per-key rate limit — full DB enumeration in 1k requests. (Phase 2 added IP rate limit on `/api/auth/login` only.)
- **SEC-5** Avatar + persona uploads check `file.type` (client-supplied) but not magic bytes. Attacker uploads `malware.exe` as `image/jpeg`, served back as a public Supabase URL with attacker-chosen `Content-Type`. Add a `file-type` library check on the first 512 bytes.
- **SEC-6** `app/api/ext/add-lead/route.ts:73` auto-assigns the new contact's `account_manager_id` to the calling user — no check that the calling user owns the inbox the lead came from. Cross-AM lead theft.
- **SEC-7** `/api/track` and `/api/track/click` are unauthenticated, no rate limit, and trackingIds (32 hex) can be enumerated to read open/click metadata. Add per-IP rate limit (10 req/min).
- **SEC-8** `src/services/leadScraperService.ts:99` does `redirect: 'follow'` with no max-hop limit. Redirect-chain SSRF amplification. Set `redirect: 'manual'` and bound to 3 hops.
- **SEC-9** `previewCSVImportAction` (`src/actions/importActions.ts:26-70`) accepts unbounded row counts; `.in('email', emails)` with 100k items will hang or DoS the DB. Cap at 1k rows preview, batch `.in()` to chunks of 500.

### MED

- **SEC-10** `app/api/ext/check-duplicate` returns `relationship_health, reply_speed_hours, total_emails_sent, open_count, estimated_value` for any contact regardless of caller's RBAC scope — competitor-relationship intel leak. Filter by `account_manager_id` or admin.
- **SEC-11** Phone-match in extension uses `ILIKE %{last 7 digits}%` — false-positive risk; collisions across customers. Tighten to ≥10-digit match.
- **SEC-12** `useRealtimeInbox` channel name doesn't include `userId` — if RLS is ever disabled on the realtime channel, all users get every change. Add `session.userId` to channel hash.
- **SEC-13** Custom in-memory CRC32 implementation in `app/api/extension/download/route.ts:6-58` for ZIP signing — replace with `node:zlib.crc32` or skip; the ZIP isn't HMAC-signed, so integrity isn't guaranteed anyway.
- **SEC-14** Avatar filename pattern `${Date.now()}-${random.slice(2,8)}.${ext}` has a non-zero collision probability for two uploads in the same millisecond. Use a UUID.
- **SEC-15** Unsubscribe email isn't `.toLowerCase().trim()`-normalized before upsert; mixed-case emails bypass.

---

## 💾 DBA — Database Findings

(Full report inline in the DBA agent output. Highlights below.)

### CRITICAL

- **DB-1** **`get_pipeline_counts` RPC missing in production.** See #0.

### HIGH

- **DB-2** **16,559 orphan `email_messages.contact_id` rows** (~15% of all inbox rows). Either contacts were hard-deleted without nulling FK, or contacts were merged. NULL them or re-link.
- **DB-3** **RLS is ENABLED on 26 tables with 5 policies on hot tables** (contacts, projects, email_messages, gmail_accounts, etc.). CLAUDE.md says the app uses the "no-RLS, trust service-role" pattern — the live DB contradicts. The app keeps working because service-role bypasses RLS, but anyone who routes a query through `NEXT_PUBLIC_SUPABASE_ANON_KEY` will silently get zero rows. Audit `src/lib/supabase-client.ts` callers.

### MED

- **DB-4** `email_messages` over-indexed (25 indexes, 3 overlapping). Prune.
- **DB-5** `projects_backup_20260329` left around. ~3.3k rows / 1.7 MB. Drop after confirming nothing references it.

### LOW

- **DB-6** Five named indexes from `dashboard-pipeline-rpc.sql` don't exist by their named identifiers, but functional equivalents exist under different names. Either rename or accept and skip the `CREATE INDEX` portion of the SQL.
- **DB-7** Enum drift: clean. `users.role`, `gmail_accounts.status`, `connection_method`, `pipeline_stage`, `paid_status` all conform.
- **DB-8** `webhook_events` table is empty for 4 weeks. Could mean Pub/Sub watches expired silently. Run `node scripts/setup-qstash-schedules.ts` to confirm watch-renewal cron is scheduled, and check Gmail API watch status for one account.

---

## 🎨 DESIGNER — UX & Visual Findings

25 findings. Top patterns:

### HIGH

- **DSGN-1** **AccountSettingsModal + DownloadExtensionModal don't use `useDialogShell`** — no focus trap, no Esc-to-close, no body scroll lock, no `role="dialog"`. A11y regression. (AccountSettingsModal hydration was fixed in `68cae22`, but the dialog-shell gap remains.)
- **DSGN-2** **`AnalyticsCharts.tsx` has ~17 hardcoded hex colors** (`#9aa0a6`, `#202124`, `#1e8e3e`, `#1a73e8`, `#6366f1`, etc.) — Material Design grays, not the app's oklch token set. Migrate to tokens or extend the palette.
- **DSGN-3** **`QuickActions.tsx` is fully off-system** — modal overlay `rgba(0,0,0,.3)`, modal bg `#fff`, headers `#111`, hardcoded `'DM Sans'` font (not in design system), padding/colors inline. In light mode it's correct by accident; in dark mode it stays light. Refactor.
- **DSGN-4** **`ActionCard.tsx` uses hardcoded orange** `#EA580C` / `#D97706` for the urgency dot — there's no orange in the token set. Either add a `--urgent` token or reuse `--warn`.

### MED

- **DSGN-5** Form-field padding/border-radius drifts across `/clients`, `/clients/[id]`, `/campaigns/new`. Some use `borderRadius: 6`, others `8`, others `10`. Standardize via CSS class.
- **DSGN-6** `/jarvis` page has no `PageLoader` while fetching — every other admin page does (`/actions`, `/data-health`, `/finance`, `/intelligence`, `/analytics`).
- **DSGN-7** `Sidebar.tsx:347` hardcoded white `#fff` on logout button — should use a semantic token.
- **DSGN-8** `InboxComponents.tsx:153` hardcoded white `#fff` for avatar text — semantic intent fine, but not tokenized.

### LOW

- **DSGN-9** `ABTestingChart` likely has the same hardcoded-hex issue as `AnalyticsCharts` (parent lazy-loads it; not yet verified).
- **DSGN-10** No global empty-state component — six surfaces re-implement the icon-+-title-+-helper-text pattern by hand.
- **DSGN-11** No global confirm-modal-with-typed-confirmation component. `ConfirmModal` is close but two destructive flows (delete contact, delete campaign) still use native `window.confirm()`.

---

## 🔬 SQA — Test & Regression Findings

### HIGH

- **SQA-1** **Zero unit tests exist** (`package.json` has no `test` script, no `__tests__` or `*.test.ts` anywhere). The smoke test in `scripts/smoke-test.mjs` covers 5 HTTP-level invariants but that's it.
- **SQA-2** **No regression test for the AM resolution chain** (the contact-AM > gmail-account-assignment > Unassigned chain Phase 1 fixed). One refactor away from breaking silently.

### MED

- **SQA-3** Smoke test tests `getCurrentUserAction` round-trip but not the modal hydration fix from `68cae22` — add a check that the API returns `name`, `email`, `avatarUrl` fields populated.
- **SQA-4** No CI workflow visible — pre-push smoke test relies on the developer remembering. Add a `.github/workflows/smoke.yml` that runs the suite on PR.

### LOW

- **SQA-5** Pre-push routine in `docs/CONTINUOUS-IMPROVEMENT-LOOP.md` recommends `node scripts/synthetic-workflow-cleanup.mjs --apply` before push, but the cleanup script doesn't have a `--check` mode that fails CI if sentinels exist. Add one.

---

## 📊 SALES HEAD — CRM Workflow Findings

### HIGH

- **SALES-1** **No "transfer client to another AM" UI** — only `transferContactAction` server action exists (Critical Rule #14 chokepoint). The team has to call the action via a script. Build a contact-detail dropdown with the eight `OwnershipTransferSource` options.
- **SALES-2** **Pipeline stage advance is implicit only** — `src/services/emailSyncLogic.ts` auto-transitions on email events. There's no manual "advance to next stage" button on `/clients/[id]`. Sales reps want explicit control alongside auto-rules.

### MED

- **SALES-3** Action queue (`/actions`) types are: `REPLY_NOW`, `FOLLOW_UP`, `WIN_BACK`, `NEW_LEAD`, `STALE`. Missing `CHASE_PAYMENT` for overdue unpaid projects (data-health shows 577 overdue unpaid).
- **SALES-4** No "snooze" for actions — if a rep can't act on a `REPLY_NOW` until tomorrow, it stays urgent and clutters today's queue.

---

## 📨 EMAIL MARKETER — Campaign Findings

### MED

- **EM-1** Campaign A/B variant winner is shown in `/analytics`, but there's no auto-promote-winner action — the rep has to manually pause the loser. Wire it.
- **EM-2** No deliverability score per account on the campaigns page. With 77 accounts and rotating sends, marketers need to see "this domain is at 4% bounce, throttle".
- **EM-3** Unsubscribe link shape (after the SEC-3 fix) should be customizable per campaign. Currently hardcoded.

### LOW

- **EM-4** Spintax + placeholder docs (`src/utils/spintax.ts`) have no UI hint in the compose box. Marketers don't know they exist.

---

## 🎬 EDITOR — Video Workstation Findings

### MED

- **EDIT-1** `/my-queue` empty state copy says "When an editor is assigned to your work" — confusing if you ARE the editor. Should be "When work is assigned to you".
- **EDIT-2** No "blockers" surface on the editor sidebar — `EditorTodayView` has a "Blockers" card, but no dedicated `/blockers` page to triage them at scale.
- **EDIT-3** The recently-shipped `firstName()` util fix to `EditorTodayView` (commit `b49211a`) means greetings work, but the **same `userName.split(' ')[0]` pattern likely exists in 4-5 other places** (e.g. compose-modal greeting). Sweep.

### LOW

- **EDIT-4** `/calendar`, `/footage-library`, `/brand-guides` — pre-launch verification flagged these as "not exercised". Ship a synthetic-workflow extension that seeds an `edit_project` + revisions + delivery.

---

## 🔧 DEVOPS — Operations Findings

### HIGH

- **OPS-1** **Smoke test layer doesn't catch RPC drift** — `get_pipeline_counts` was missing for weeks before the pre-launch verification flagged it. Add an RPC-presence assertion to `scripts/smoke-test.mjs` that calls the RPC and asserts non-error.
- **OPS-2** **`webhook_events` empty for 4 weeks** signals Pub/Sub may be silently broken. Add a heartbeat alert: if `count(webhook_events) where created_at > now()-1day` is zero, alert Slack.

### MED

- **OPS-3** `vercel.json` has function `maxDuration: 30s` for most cron routes. `/api/cron/sync-imap` syncs IMAP for up to 5 accounts; if any account is slow (e.g. raff.eu@filmsbyrafay.com which is currently `ETIMEDOUT`), the cron times out. Bump to 60s.
- **OPS-4** No log-aggregation surface — perf monitor in `/data-health` is in-memory ring buffer, lost on every deploy.

---

## 🧠 PRIVACY — Data Handling Findings

### MED

- **PRIV-1** Contacts table holds 13,305 rows with `email`, `phone`, full names. No GDPR export action visible. If a lead asks "what do you have on me?", the team has to write a script.
- **PRIV-2** Campaign analytics retain `contact_id` for all `email_messages` indefinitely — no retention policy. Consider TTL of ~24 months.

---

## 🏥 ACCOUNT MANAGER (UX) — Productivity Findings

### LOW

- **AM-1** Sidebar avatar tooltip doesn't show role + email — clicking the avatar opens settings, but a hover preview would help disambiguate which account is logged in (especially on shared dev machines).
- **AM-2** No keyboard shortcut surface — `c` for compose works. Adding `g i` (go to inbox), `g d` (dashboard), `g c` (clients) would be a 30-min ergonomic win.

---

## 10 Questions for the User

These are the decisions that block the next phase of work. Pick one or
many — I'll ship.

1. **Apply the `get_pipeline_counts` RPC + dashboard indexes to production now?** (BLOCKER #0). I have the SQL ready; one-paste-and-go in the Supabase SQL editor.
2. **Add `import 'server-only'` to the 7 services missing it** (ARCH-1). 5 minutes; closes a real client-side leak path.
3. **Hash extension API keys + add per-key rate limit + apply RBAC to `/api/extension/clients`?** (SEC-1, SEC-2, SEC-4 — all CRITICAL on the extension surface). ~2 hours.
4. **Sign unsubscribe tokens with HMAC?** (SEC-3 — anyone-can-unsubscribe-anyone). 30 min.
5. **Trim ADMIN role from accounts that don't need it.** (CEO-1 — 13 admins on a 29-user team.) Tell me which 8 should stay ADMIN; I'll downgrade the rest.
6. **Repair 16,559 orphan `email_messages.contact_id` rows** (DB-2) — NULL them, re-link by `from_email` matching, or leave alone?
7. **Investigate the empty `webhook_events` table** (ARCH-7, OPS-2) — confirm Gmail Pub/Sub is still firing? Or accept that we're in pure-poll mode?
8. **Drop `projects_backup_20260329`?** (DB-5, ARCH-6). 3.3k rows / 1.7 MB. Created 2026-03-29.
9. **Add `useDialogShell` to AccountSettingsModal + DownloadExtensionModal** (DSGN-1)? 30 min. Restores Esc-to-close and a11y.
10. **Build a "transfer contact" UI** at `/clients/[id]` to replace the SQL-script workflow (SALES-1)? The chokepoint server action already exists; just needs the dropdown.

---

## Methodology

- **4 parallel agents** dispatched for codebase research:
  - Architect (CTO persona) — service/action sprawl, dead code, perf
  - Hacker — security beyond Phase 1, especially extension API surface
  - DBA — schema, indexes, RPC, orphans, RLS state on live prod DB
  - Designer/UX — token compliance, modal consistency, theme drift
- **Live DB probes** — confirmed RPC missing, table sizes, role distribution, orphan-row counts.
- **Browser walkthrough** — `/dashboard` rendered with real data (Jarvis briefing, KPI sparklines, pipeline funnel via fallback path); `/clients` started but extension disconnected before completion.
- **Pre-existing audits read first** — `docs/AUDIT-2026-04-30-GRAND-DISCOVERY.md`, `docs/SYNTHETIC-WORKFLOW-2026-04-30.md`, `docs/PRE-LAUNCH-VERIFICATION-2026-04-30.md` so this audit only contains NEW findings.

---

_Generated 2026-04-30 by the 12-persona Grand Audit. Prior audit cycles: AUDIT-2026-04-30-GRAND-DISCOVERY (180 findings, Phase 1-4 shipped 60 fixes), SYNTHETIC-WORKFLOW-2026-04-30 (23 runtime findings), PRE-LAUNCH-VERIFICATION-2026-04-30 (4-persona QA verdict)._
