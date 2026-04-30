# UNIBOX — QA Readiness Report

> Four-persona evaluation of whether UNIBOX is ready for daily production use.
> Each persona reviewed the codebase + the runtime synthetic-workflow
> walkthrough output independently, looking only at what their role
> actually touches.
>
> **TL;DR — overall verdict**: **Conditionally Ready**. The CRM/inbox/sales
> loop is fit for daily use today. The editor workstation works for the core
> hand-off cycle. The cold-outreach surface ships but is risky to use without
> a Test Send + Preview step. The architecture is defensible for an 11-user
> internal tool but not enterprise-grade.

| Persona | Verdict | Confidence | Blockers |
|---|---|---|---|
| **VIDEO_EDITOR** | ✅ Ready | High | None — daily-job cycle works end-to-end |
| **SALES / Account Manager** | ✅ Ready | High | None for daily ops; bulk-ops gaps are quality-of-life |
| **Email Marketer / Outreach Operator** | ⚠️ Use with caution | Medium | No Test Send, no Preview-before-launch, no send-queue visibility |
| **System Architect / Eng Lead** | ✅ Ready (internal) / ❌ Not ready (enterprise) | High | No automated tests, no staging env, FK gap between projects/edit_projects, in-memory perf data |

This report is grounded in:
- 240+ findings from `docs/AUDIT-2026-04-30-GRAND-DISCOVERY.md` (static)
- 23 findings from `docs/SYNTHETIC-WORKFLOW-2026-04-30.md` (runtime)
- 4 phases of fixes shipped (~30 commits between `2ef18b6` and `c3f7dcd`)
- 5/5 smoke-test passing as of the doc's commit
- `tsc --noEmit` clean, `npm run lint` 0 warnings, `npm run build` 28s

---

## Persona 1 — VIDEO_EDITOR

> _"I show up Monday, I want to see what's on my plate, work on it, deliver,
> and prove I delivered. Don't make me hunt for things."_

### What this persona actually does in UNIBOX

| Step | Surface | Action |
|---|---|---|
| 1 | `/dashboard` (Today view) | See "today's job" + this-week calendar strip |
| 2 | `/my-queue` | Full assigned-project list, scoped to me |
| 3 | Project drawer | Read brief, check raw-data location, see admin's feedback |
| 4 | Project drawer → Upload cut | Paste cloud URL of latest cut |
| 5 | Project drawer → Send for review | Signal admin the cut is ready |
| 6 | `/revisions` | Inbox of admin feedback |
| 7 | `/delivered` | Portfolio of approved work + ratings |
| 8 | `/calendar` | Capacity / scheduling view |
| 9 | `/footage-library`, `/brand-guides` | Reference resources |

### What works ✅

- **Today view renders cleanly** for the editor (no more red "Couldn't load" toast — Phase 4 commit `af1a6dc`).
- **My Queue is properly scoped** — only projects where `editor_id = userId` (verified in `lib/projects/editorStats.ts:261-314` + synthetic run).
- **Project detail drawer opens on row click** with status pill, due date, progress, action buttons.
- **Upload cut works end-to-end** — URL paste → comment inserted in DB → `last_cut_url` updated → Activity feed shows the cut.
- **Send for review works** — comment inserted with timestamped author.
- **Delivered portfolio renders correctly** — turnaround days, revision count, rating with **half-star precision** (Phase 4 commit `b47be60` — 4.5 now displays as 4 full + 1 half stars).
- **Activity feed (formerly "Client Feedback") is correctly labelled** (Phase 4 commit `5757f2d`).
- **Sidebar is editor-scoped** — only the 7 surfaces that matter (Today, My Queue, Calendar, Revisions, Delivered, Footage Library, Brand Guides). Jarvis link removed since `/api/jarvis*` rejects editors (Phase 4 commit `a5ca08f`).
- **Browser title de-duplicated** ("My Queue" not "My Queue \| Unibox \| Unibox").

### What doesn't work / is missing ⚠️

| Severity | Issue | Impact |
|---|---|---|
| **MED** | "Upload cut" only accepts a URL paste — no real file upload, no Drive/Dropbox auth | Editor needs an external host for every cut. Friction. |
| **MED** | "Send for review" doesn't auto-advance progress to `IN_REVISION` | Admin must manually flip the state; cuts can sit invisible if admin misses the comment |
| **MED** | "Send for review" has no note prompt — uses hardcoded text | Editor can't say "v3 fixes audio sync" without leaving a separate comment |
| **LOW** | "Revisions" count on `/delivered` cards counts ALL comments, not just admin feedback | Inflated metric — own milestones get counted |
| **LOW** | "1 Issue" red badge in bottom-left of editor pages — unclear what it refers to | Persistent badge with no on-click context |
| **LOW** | Progress states have no validation (admin can flip `DONE → IN_PROGRESS`) | Audit trail gap; rare but possible |
| **LOW** | Comments aren't threaded or editable; no @mentions | Slower back-and-forth than Slack/Notion |
| **TBD** | Footage Library + Brand Guides pages exist but contain stub UI — content needs to be populated by admins | Editor can't actually use them yet |

### Persona-1 verdict

**✅ READY FOR DAILY USE.** A VIDEO_EDITOR can complete the canonical
"receive → work → upload → deliver" loop without leaving the app or
asking an admin for help. The 4 LOW + 4 MED issues above are
quality-of-life polish, not blockers.

### Top 3 next ships for editors

1. **Auto-advance progress on Send for Review** — `IN_PROGRESS → IN_REVISION` automatically. (Audit MEDIUM #15.)
2. **Note prompt on Send for Review** — small inline textarea like Upload Cut already has. Action already accepts the param. (Audit MEDIUM #14.)
3. **Investigate the "1 Issue" badge** — surface what it refers to, or remove if dead.

---

## Persona 2 — SALES / ACCOUNT_MANAGER

> _"I live in the inbox. Every reply that lands is a deal that could close
> or die. I need to triage fast, draft, send, log it, move on."_

### What this persona actually does in UNIBOX

| Step | Surface | Action |
|---|---|---|
| 1 | `/` (Inbox) | Triage incoming replies across all assigned Gmail accounts |
| 2 | Email detail | Read thread, see contact intelligence sidecar |
| 3 | Inline reply / Compose | Draft + send |
| 4 | `/clients` | See all leads/clients I own; filter by stage / activity |
| 5 | `/clients/[id]` | Single contact deep view: emails, projects, activity timeline |
| 6 | `/opportunities` | Pipeline kanban; drag deals between stages |
| 7 | `/my-projects` | Track projects I closed; mark paid |
| 8 | `/dashboard` | Daily KPIs + Jarvis briefing |
| 9 | `/jarvis` | Ask the AI assistant questions |

### What works ✅

- **Auth + session integrity** — AES-GCM cookies (Phase 1 `d0283a2`), null-role login rejected (Phase 1 `844506d`), role-based sidebar updates on path change (Phase 4 `af1a6dc`).
- **Inbox renders correctly** with real KPI trends (no fake sparklines, no `+12% vs yesterday` lies — Phase 2 `848b16a`).
- **Empty state for SALES with 0 Gmail accounts** is now actionable ("ask an admin to assign you Gmail accounts" — Phase 4 `af1a6dc`) instead of perpetual skeleton.
- **`/clients` filter popover wired** with stage / last-contact / has-unpaid filters (Phase 3 `468d129`).
- **Bulk delete on `/clients`** works with `requireType="delete N"` confirmation for ≥10 contacts (Phase 3 `468d129`).
- **Add Lead modal** is hardened: focus trap + body lock + Esc + autofocus (Phase 3 `53f9d40`), all 7 PipelineStage options exposed (Phase 4 `c55724d`), AM dropdown hidden for SALES so the team roster doesn't leak (Phase 4 `c55724d`).
- **Contact creation works for SALES with zero Gmail assignments** — they can now SEE the contact they just created (Phase 4 `b4cb7b7`, fixing a Phase 1 over-correction).
- **`/opportunities` DnD wired with `@dnd-kit`** + `KeyboardSensor` for a11y + optimistic update + revert on failure (Phase 2 `549112c`, Phase 3 `eefd737`).
- **Card click → contact detail** wired (Phase 3 `eefd737`).
- **Dashboard need-reply rows + top-closer rows** link to `/clients/[id]` (Phase 3 `eefd737`).
- **`/my-projects` Create Project button works** with a real Client picker; was completely dead before Phase 4 `12b1c30`.
- **Cross-page wiring**: contact-detail Projects tab has "+ New project for this client" → `/my-projects?clientId=…` auto-opens the modal pre-filled (Phase 4 `955f17c`).
- **Inline Reply preserves typed body on send failure** (Phase 3 `9eb222f`) and saves drafts per `thread_id` to localStorage (Phase 3).
- **All native `alert()` and `confirm()` calls swept** to project-styled toast/modal (Phase 2 `6b49b92`, `e8e73f8`).
- **Editor sidebar persona** ("Owner: Sales" not "Owner: [SYN]") for any name with bracketed prefixes (Phase 4 `a5ca08f`).

### What doesn't work / is missing ⚠️

| Severity | Issue | Impact |
|---|---|---|
| **MED** | No bulk reassign-owner / bulk enroll-in-campaign on `/clients` | Sales-Head wishlist; manual loop today |
| **MED** | No saved smart-lists ("warm leads not emailed in 7d") | Power users would save hours |
| **LOW** | Contact-detail activity log not paginated; projects tab has no `<tfoot>` totals | Long-history clients lose audit clarity |
| **LOW** | OwnerPicker uses native `<select>` — no role badge, no search, no confirm before transfer | Minor UX nit |
| **LOW** | Lead vs Client terminology drift — modal says "New Client", default stage is "Lead", page header is "X clients" | Cognitive friction |
| **LOW** | `Days Silent: 0` is misleading for brand-new contacts (should be `—`) | Tiny |
| **TBD** | Manual bridge to editor work — when sales closes a deal, admin must manually create the `edit_project` row (no FK link) | Operational friction; works but ugly |

### Persona-2 verdict

**✅ READY FOR DAILY USE.** The inbox-to-pipeline-to-paid loop is intact
end-to-end. The Phase 4 fixes closed every CRITICAL and HIGH issue from
the synthetic walkthrough. The remaining items are bulk-ops convenience
features and architectural polish, not daily blockers.

### Top 3 next ships for sales

1. **Bulk reassign owner + bulk enroll-in-campaign** on `/clients` (deferred from Phase 3 — backend already supports `bulkTransferContactAction`, just needs UI wiring).
2. **Saved smart-lists** — chip row above `/clients` ("My hot leads", "Replied this week", "Stale >14d"). New `client_saved_views` table or localStorage MVP.
3. **Resolve the projects ↔ edit_projects FK gap** — either add `edit_projects.sales_project_id` FK + a "Promote to edit job" action, or add a contact-id picker in the right-panel of `/projects` so editor work has provenance back to a real contact.

---

## Persona 3 — EMAIL MARKETER / OUTREACH OPERATOR

> _"I'm running 5,000 cold emails this week across 60 inboxes. If
> {{first_name}} breaks, I burn the whole list. I need to see exactly
> what each prospect will receive before I press launch."_

### What this persona actually does in UNIBOX

| Step | Surface | Action |
|---|---|---|
| 1 | `/scraper` (admin) | Find new prospects from public sources |
| 2 | `/clients` | Import / triage scraped leads |
| 3 | `/templates` | Pick or write a starter template |
| 4 | `/campaigns/new` | Build sequence, A/B variants, schedule |
| 5 | Launch | Enroll contacts, kick off |
| 6 | `/campaigns/[id]` | Monitor: open/reply/bounce/unsub rates |
| 7 | A/B tab | Decide winner, kill loser |
| 8 | `/analytics` | Cross-campaign trends |

### What works ✅

- **Campaign CRUD works** — list, create, detail, archive (Phase 2 `e8e73f8` confirmation modal for delete).
- **A/B variant editing exists** with weight slider, subject + body separately.
- **Scraper reaches public sites + scores leads Hot/Warm/Lukewarm/Cold** via cheerio (described in CLAUDE.md, not exercised in synthetic run).
- **Templates are mineable from sent emails** via weekly Monday 3 AM cron (`/api/mine-templates`), now using zero-cost Llama 3.1 8B (Phase 2 `d7202ca`).
- **Fake "12% reply rate" formula on templates killed** (Phase 4 `a5cff71`) — was always 12% regardless of actual performance, completely misleading.
- **Hardcoded `[3,4,5,5,6,6,7]` sparklines on `/campaigns` list killed** (Phase 4 `a5cff71`).
- **"Delivered" KPI on campaign detail killed** (was secretly the same value as Sent — Phase 4 `a5cff71`).
- **Campaign delete uses styled ConfirmModal** instead of native `confirm()` (Phase 2 `e8e73f8`).
- **Send infrastructure**: `campaign_send_queue` + 3-phase processor (enqueue → send → subsequence) + account rotation + warmup mode all exist server-side and run on QStash schedule.
- **Per-account daily send caps in DB** (`gmail_accounts.sent_count_today`, schedule_start_time/end_time on campaigns).
- **Diagnose action** logs structured warnings/issues; result now goes through showInfo/showError instead of `alert(...)` (Phase 2 `e8e73f8`).

### What doesn't work / is missing ⚠️

| Severity | Issue | Impact |
|---|---|---|
| **🔴 HIGH** | **No Review/Preview step before Launch** | Operator launches blind. A typo in `{{first_name}}` or a broken spintax block could hit 5,000 inboxes before anyone notices. |
| **🔴 HIGH** | **No Test Send to self** | Same risk. Industry-standard cold outreach tools (Lemlist, Smartlead, Apollo) all require a test send before launch. |
| **🔴 HIGH** | **No live placeholder/spintax preview against a sample contact** | Operator can't see "what does Hannah Park's email actually look like?" without launching. |
| **MED** | **No Send Queue UI** — `campaign_send_queue` table exists, has zero visualization | Operator can't answer "when does the next email go out?" or "are we throttled today?" without psql. |
| **MED** | **A/B variant has no statistical-significance threshold** — "winner" is a single boolean, no sample-size gate | Decisions made on noise, not signal. |
| **MED** | **Schedule editor only has 11 timezones** | Doesn't cover mid-Asia, Tokyo, Berlin, Toronto. |
| **MED** | Campaign creation has no auto-pause guidance when daily cap >100 on a fresh inbox | Deliverability risk; Gmail flags new accounts at high rates. |
| **LOW** | Diagnose results dumped to console (now toast, but not full inline panel) | Non-dev users can't see the issue list. |
| **LOW** | Templates "More" icon button is dead | Annoying but not blocking. |
| **LOW** | Schedule timezone hint missing on `datetime-local` picker | "9 AM" assumed PKT may run at UTC. |

### Persona-3 verdict

**⚠️ USABLE BUT RISKY.** A confident operator can launch a campaign and
the send infrastructure will execute it correctly. The **risk surface is
on the human side, not the engine side**: there is no safety net between
"I think this template is good" and "5,000 contacts get the email."
Industry-standard guardrails (Test Send, Live Preview, Review checklist)
are missing.

**Recommendation**: gate campaigns >100 contacts behind a "you must Test
Send and view Preview before launching" workflow until those features
ship. For internal-only Wedits team running modest volumes (verified per
their AI cost = zero stance), the risk is contained but real.

### Top 3 next ships for outreach

1. **Test Send to self** — single button on `/campaigns/[id]` Steps tab. Sends the current step (with sample placeholders resolved) to `getCurrentUserAction().email`. ~30 minutes of work.
2. **Review/Preview step in `/campaigns/new`** — a 4th panel before Launch. Shows total contact count, first-send time in PKT, daily cap split ("23/day × 5 days"), sample-contact rendered preview with `{{placeholders}}` and spintax resolved. ~2-3 hours.
3. **Send Queue tab on `/campaigns/[id]`** — `campaign_send_queue` query showing next-send-at, position, account-rotation slot. ~1-2 hours.

---

## Persona 4 — SYSTEM ARCHITECT / ENGINEERING LEAD

> _"I don't care if it 'works' — I care whether it'll still work in 6
> months under 3× users, after 5 hires touch the codebase, when a CVE
> drops in our deps, and after a power failure in a Vercel region."_

### Code health ✅

| Check | Status | Notes |
|---|---|---|
| `tsc --noEmit` | ✅ 0 errors | Strict mode passes |
| `npm run lint` | ✅ 0 warnings | ESLint 9 flat config (`eslint.config.mjs`) |
| `npm run build` | ✅ 28s | Next.js 16, Turbopack default, 35+ routes |
| Build masking removed | ✅ | Vercel uses `next build --experimental-build-mode=compile`, NOT `next build \|\| true` (CLAUDE.md drift fixed Phase 1) |
| Per-fix commit hygiene | ✅ | ~30 commits across 4 phases, each with detailed messages + co-author attribution |
| Pre-push smoke test | ✅ | `scripts/smoke-test.mjs` 5/5 invariants verified |

### Security posture ✅ (with caveats)

| Layer | Status | Phase shipped |
|---|---|---|
| Session encryption: AES-256-GCM (auth tag) | ✅ | Phase 1 `d0283a2` (was AES-CBC, malleable) |
| OIDC JWT verification on Gmail webhook | ✅ | Phase 1 `e1601ff` (was completely unauthenticated) |
| Login null-role rejected (no default to ADMIN) | ✅ | Phase 1 `844506d`, Google OAuth `fc3ddb4` |
| Invitation tokens hashed at rest (SHA-256) | ✅ | Phase 1 `e9cb263` |
| `getClientsAction` SALES leak closed | ✅ | Phase 1 `2ef18b6`, Phase 4 follow-up `b4cb7b7` |
| Login rate limit (10/15min/IP) | ✅ | Phase 2 `dd44cfe` |
| `/api/track/click` open redirect closed | ✅ | Phase 2 `6da51f0` |
| `/api/extension/download` requires session | ✅ | Phase 2 `6da51f0` |
| `/api/ext/*` CORS locked to `chrome-extension://` | ✅ | Phase 2 `6da51f0` |
| `listUsersAction` no longer ships password column | ✅ | Phase 2 `dd44cfe` |
| DOMPurify on email body + template render | ✅ | Phase 2 `082395e` |
| 18 missing `blockEditorAccess` calls added | ✅ | Phase 2 `a3bf0e5` |
| IP whitelist (Pakistan ISPs) | ⚠️ Brittle | Hardcoded; broad `/16` ranges; not infinitely scalable but acceptable for internal tool |
| No CSP header | ❌ Open | `next.config.js` doesn't set Content-Security-Policy |
| No HSTS header | ❌ Open | Same |
| No automated security scanning in CI | ❌ Open | No GitHub Actions, no Snyk/Dependabot configured |

### Performance ✅

- **Dashboard P50 < 1s SLO instrumented** — `usePerfMonitor` hook + `/api/perf/log` ring buffer + `/data-health` Performance panel with sparkline (Phase 2 `16dc656`).
- **Pipeline N+1 collapsed** — `get_pipeline_counts(p_user_id)` RPC saves ~300-500ms (Phase 2 `1340f55`); falls back to parallel `Promise.all` if RPC isn't deployed.
- **6 missing indexes added** to schema + SQL migration script (`scripts/dashboard-pipeline-rpc.sql`).
- **Console.log stripped in production** via `next.config.js` compiler.
- **Heavy server packages externalised** (`@prisma/client`, `googleapis`, `nodemailer`, `imapflow`, `mailparser`).
- ⚠️ Perf monitor data is **in-memory ring buffer per lambda**. Cold starts wipe it. Acceptable for current scale; would need Vercel Speed Insights or a real telemetry sink for 10× users.

### Architecture ⚠️

| Concern | Status | Risk |
|---|---|---|
| Local dev = Production Supabase | ⚠️ Known | No staging environment; every test touches prod data |
| 22 Prisma models with `@@map` snake_case | ✅ | Hand-maintained but consistent |
| `Role` enum has only `ADMIN, SALES`; `ACCOUNT_MANAGER` + `VIDEO_EDITOR` stored as raw strings | ⚠️ Drift risk | Should migrate; tracked as P3 in audit |
| `projects` ↔ `edit_projects` no FK link | ❌ Architectural debt | Sales-side and editor-side are silos; manual bridge required |
| No row-level security in Supabase (service-role bypass) | ⚠️ Defense-in-depth gap | All RBAC is in app code; if a server action ever forgot the filter, no DB-level safety net |
| Cookie-baked role, stale until refresh | ✅ Mitigated Phase 4 | `Sidebar` now refreshes on path change + visibility |
| 3 separate `createClient()` instances (track, cron-cleanup, invite-accept) | ⚠️ Minor | Connection-pool fragmentation; flagged in audit, not yet consolidated |
| `force-dynamic` at root layout cascades to every page | ⚠️ | No ISR/static benefit; flagged as P2 in audit |

### Testability ❌ — biggest gap

| Item | Status | Impact |
|---|---|---|
| Unit tests | ❌ None | No `jest`/`vitest` in `package.json` |
| Integration tests | ❌ None | No API route tests |
| E2E tests | ❌ None (just the synthetic-workflow script) | Browser-driven walkthrough is manual |
| Pre-push smoke test | ✅ | 5 invariants — better than nothing |
| Schema migration tests | ❌ None | Prisma migrations applied directly to prod |

**This is the single biggest red flag for enterprise readiness.** Every
phase of fixes shipped with `tsc + lint + build` as the only gate. Real
behavior validation has been ad-hoc (synthetic walkthrough + smoke
test). For an 11-user internal tool, this is acceptable. For 50+ users
or paying customers, this is not.

### Observability ⚠️

| Item | Status |
|---|---|
| Performance monitor live in `/data-health` | ✅ p50/p95/max + sparkline + SLO badges |
| Server logs (Vercel function logs) | ✅ Default |
| Error reporting (Sentry, Datadog) | ❌ Not wired |
| Alerting (PagerDuty, Slack) | ❌ Not wired |
| Audit log (`activity_logs`) | ⚠️ Sparse — most actions don't write to it |
| Metric dashboard outside the app | ❌ — perf data lives in `/data-health` only |

### CI / Deploy ⚠️

- ✅ Vercel auto-deploy on push to `main` (no PR gate) — fast iteration, no review checkpoint
- ✅ Bi-weekly auto-review routine scheduled (`trig_015BNJ8wBr8T9XP4Vruds6FU`) — opens **draft PRs only**, never merges
- ❌ No GitHub Actions / no CI pipeline
- ❌ No staging environment
- ❌ No automated rollback (manual via Vercel UI)

### Continuous improvement ✅

The 3-layer system (`docs/CONTINUOUS-IMPROVEMENT-LOOP.md`) is real and operating:

1. **Pre-push smoke test** (`scripts/smoke-test.mjs`) — 5 invariants verified in ~3 seconds.
2. **Bi-weekly auto-review** — autonomous code-review agent opens draft PRs Mondays at 9 AM PKT.
3. **On-demand synthetic walkthrough** — browser-driven E2E with sentinel cleanup.

This is a stronger continuous-improvement story than most internal tools have.

### Persona-4 verdict

**For internal Wedits use (~11 users, controlled environment, IP-whitelisted): ✅ READY.** The engineering hygiene is defensible: clean build, security baseline closed, performance instrumented, continuous improvement loop running.

**For enterprise / paying-customer use: ❌ NOT READY.** The blockers are:
1. **No automated test suite** — every change ships on `tsc + lint + build` pass
2. **No staging environment** — local dev = production DB
3. **`projects ↔ edit_projects` FK gap** — sales/delivery reporting siloed
4. **No CSP/HSTS, no security scanning in CI**
5. **No error reporting (Sentry/Datadog) or alerting**

### Top 3 next ships for engineering

1. **Add Vitest + Playwright + a minimum 20-test smoke suite** — focus on the auth chain, RBAC enforcement, and the 3 CRITICAL paths from the synthetic-workflow run.
2. **Spin up a staging Supabase project** with the production schema; flip `NEXT_PUBLIC_SUPABASE_URL` per environment. Eliminates the local-dev-touches-prod risk.
3. **Wire Sentry** (or alternative) — start with `@sentry/nextjs` + the existing perf monitor's structure. ~30 min and you have real prod error reporting.

---

## Cross-cutting findings

### What's worked extremely well across all 4 personas

- **Per-fix commit discipline** — every change has a focused message with audit cross-reference; reverting a single regression is trivial.
- **Audit doc as ground truth** — `docs/AUDIT-2026-04-30-GRAND-DISCOVERY.md` is the canonical reference; all subsequent work cites it.
- **Phase-based delivery** — 4 phases of work, each shipping with `tsc + build` clean and an updated CLAUDE.md.
- **Synthetic-workflow-as-code** — the setup + cleanup scripts let any future Claude session re-run the same walkthrough without setup friction.

### What still needs to happen (consolidated)

| Priority | Item | Personas affected |
|---|---|---|
| **P1** | Test Send + Preview-before-launch on campaigns | Email Marketer (HIGH risk surface) |
| **P1** | Auto-advance progress on Send for Review | Editor (workflow gap) |
| **P1** | Vitest + Playwright smoke suite | All — biggest engineering gap |
| **P1** | Staging Supabase env | All — biggest infra gap |
| **P2** | Bulk reassign + bulk enroll on `/clients` | Sales (Sales Head wishlist) |
| **P2** | Saved smart-lists on `/clients` | Sales |
| **P2** | Send Queue UI on `/campaigns/[id]` | Email Marketer |
| **P2** | A/B significance threshold | Email Marketer |
| **P2** | `projects ↔ edit_projects` FK link | Sales + Editor + Architect |
| **P3** | Note prompt on Send for Review | Editor |
| **P3** | OwnerPicker search + role badge + confirm | Sales |
| **P3** | Sentry / error reporting wiring | Architect |
| **P3** | CSP + HSTS headers | Architect |
| **P3** | Migrate `Role` enum to include `ACCOUNT_MANAGER` + `VIDEO_EDITOR` | Architect |

---

## Final readiness matrix

| Dimension | Score | Justification |
|---|---|---|
| **Functional correctness** | 8/10 | Core loops work; 3 CRITICAL bugs fixed; 23-finding synthetic walkthrough closed 18 |
| **Security posture** | 8/10 | All HIGH/CRITICAL closed; CSP/HSTS still open; IP whitelist brittle but acceptable |
| **Performance** | 7/10 | Dashboard sub-1s SLO instrumented; pipeline N+1 fixed; in-memory perf store fine for current scale |
| **UX polish** | 7/10 | Modal hygiene baseline shipped; bulk-ops gaps remain; terminology drift in places |
| **Engineering hygiene** | 8/10 | Clean build, per-fix commits, continuous-improvement loop running |
| **Testability** | 3/10 | No automated test suite; smoke test is 5 invariants only |
| **Operability** | 5/10 | No staging, no Sentry, no PR-review gate, but auto-review fires bi-weekly |
| **Documentation** | 9/10 | CLAUDE.md current, audit doc detailed, synthetic-workflow doc + improvement-loop doc + this readiness doc |

**Weighted overall**: **READY for daily internal use at the current 11-user scale**. Not ready for external customers or 5×+ growth without the P1 items above.

---

## Pre-launch checklist (for the user)

Before announcing UNIBOX as "ready" to the Wedits team:

- [ ] Run `node scripts/synthetic-workflow-setup.mjs && node scripts/smoke-test.mjs && node scripts/synthetic-workflow-cleanup.mjs --apply` — verify 5/5 invariants pass against current production deploy.
- [ ] Set `GMAIL_WEBHOOK_AUDIENCE` (and optionally `GMAIL_WEBHOOK_SERVICE_ACCOUNT_EMAIL`) in Vercel env (still pending from Phase 1 — without it, real Gmail webhooks fall back to the 2-min retry cron).
- [ ] Apply `scripts/dashboard-pipeline-rpc.sql` in Supabase SQL editor (already done per user confirmation).
- [ ] Brief the team on the one-time forced re-login required by the AES-GCM session migration (already happened on first deploy).
- [ ] Inform the email-marketing operator: **do not launch any campaign with >50 recipients without manually previewing the resolved email body for at least one contact** until Test Send + Preview ship. Keep daily caps ≤50/account on fresh inboxes.
- [ ] Schedule the next P1 sprint: Test Send + Preview, Vitest harness, staging Supabase.

---

_Compiled: Phase 4 complete. Last commit referenced: `c3f7dcd` (continuous-improvement loop infra). 4 personas, 1 verdict: ready for the role you actually have._
