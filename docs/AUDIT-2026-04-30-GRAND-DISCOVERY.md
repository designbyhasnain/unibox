# UNIBOX — Grand Discovery Audit (2026-04-30)

> Multi-lens audit synthesised from four parallel passes: **Security/Hacker**, **Performance/CTO**, **Functional/SQA**, **Designer/Designer-CEO**. Evidence is from real diagnostics on `main @ 30db5dc` — `npx tsc --noEmit` (clean), `npm run lint` (0 warnings), `npm run build` (28s, 35 static pages), `npm outdated`, and code reads of every critical file.
>
> No fictional persona dialogue. Each finding is `[severity] file:line — issue → proposed fix`.

---

## 0. Executive Summary

| Lens | Findings | Critical | High | Medium | Low/Polish |
|------|----------|----------|------|--------|------------|
| Security & RBAC | 67 | 12 | 21 | 21 | 13 |
| Performance & Infra | 39 | 0 | 9 | 14 | 16 |
| Functional / SQA / UX | 62 | — | — | — | — (BUG 23, UX 19, A11Y 7, POLISH 13) |
| Schema / Drift | 12 | — | — | — | — |
| **Total** | **180** | | | | |

### Reality check on the codebase

- **`tsc --noEmit` is clean.** Strict mode passes.
- **`npm run lint` exits 0** with the ESLint 9 flat config (commit `f4bda8e`). CLAUDE.md note 9 ("ESLint broken on Next 16") is **stale**.
- **`vercel.json` build command is `next build --experimental-build-mode=compile`**, not `next build || true`. CLAUDE.md is wrong about this too.
- **`npm run build` succeeded in 28s** with 35 routes, of which one (`/api/ping`) opts into edge runtime intentionally — the build warning is benign.
- **No test runner.** No `jest` / `vitest` / `playwright` in `package.json`. **All quality is manual eyeballing**, which is how the dashboard's hardcoded fake-data + missing RBAC checks survived.

### What's secretly broken right now

1. **`getClientsAction` leaks the entire workspace's contact list** to a SALES user with zero Gmail assignments (`src/actions/clientActions.ts:139-176`).
2. **The Gmail Pub/Sub webhook trusts spoofed payloads** — no OIDC JWT verification (`app/api/webhooks/gmail/route.ts:1-54`).
3. **Login defaults a null role to `'ADMIN'`** (`app/api/auth/login/route.ts:39-45`) — silent privilege escalation for any DB row with a NULL role.
4. **Session cookies are AES-CBC without HMAC** (`src/lib/auth.ts:77-101`) — malleable. Should be AES-GCM (already in `encryption.ts`).
5. **Invitation tokens are stored plaintext + returned in `listInvitesAction`** to admin browsers (`inviteActions.ts:91, 134`) — DB read = account takeover.
6. **The dashboard renders fake hardcoded data alongside real data** — KPI sparklines (`[3,4,4,6,5,7,8,7,9]`), "+X vs yesterday" deltas (calculated as `0.12 × today`), "12 hours ago" string (literal), revenue bar fallback (`[42,12],[51,18]…`).
7. **`/opportunities` advertises "drag cards between stages" but no DnD is wired.**
8. **8 concurrent `setInterval` polls** + dashboard fires 3 server actions back-to-back including a Groq LLM call on cold start = the 3-second dashboard delay.

---

## 1. CRITICAL SECURITY FINDINGS (12)

> These are immediate fix-before-launch issues. RBAC bypasses, malleable session, missing webhook verification.

```
[CRITICAL] src/actions/clientActions.ts:139-176 — getClientsAction: SALES with empty accessible[] falls to admin branch returning ALL workspace contacts
[CRITICAL] src/actions/clientActions.ts:11-45 — ensureContactAction: no blockEditorAccess, no RBAC; SALES/EDITOR can read+create any contact
[CRITICAL] src/actions/clientActions.ts:62-106 — createClientAction: missing blockEditorAccess; payload.account_manager_id allowed for SALES (mass assignment)
[CRITICAL] src/actions/clientActions.ts:247-303 — checkDuplicateAction: no editor block, no scoping; reveals contacts cross-team via RPC fallback
[CRITICAL] src/actions/emailActions.ts:1358-1368 — searchContactsForComposeAction: no RBAC; returns name+email+company for ANY contact globally
[CRITICAL] src/actions/summaryActions.ts:91-159 — generateAISummaryAction: emails fetched via .or() with NO accessible-account filter; cross-account body leak
[CRITICAL] src/actions/emailActions.ts:599-617 — markClientEmailsAsReadAction: NO ensureAuthenticated guard before scanning email_messages
[CRITICAL] src/lib/auth.ts:77-101 — Session AES-256-CBC without integrity (no HMAC); ciphertext malleable. Confirmed.
[CRITICAL] src/lib/auth.ts:7-18 — Insecure dev-fallback secret if NODE_ENV !== 'production'; preview/staging deploys decryptable by anyone with code access
[CRITICAL] app/api/webhooks/gmail/route.ts:1-54 — No OIDC JWT verification on Pub/Sub push; any caller triggers syncAccountHistory by spoofed payload
[CRITICAL] src/actions/inviteActions.ts:91-103, 128-150 — Invitation tokens stored plaintext in invitations.token AND returned via listInvitesAction; DB read = ATO
[CRITICAL] app/api/auth/login/route.ts:39-45 — Default role 'ADMIN' on null user.role accidentally promotes any null-role user to admin
```

## 2. HIGH SEVERITY SECURITY (21)

```
[HIGH] proxy.ts:6-65 — Hardcoded IP whitelist with broad /16 ISP prefixes (39.32-39.61, 111.88, 192.168) — anyone on those ISPs bypasses gate
[HIGH] proxy.ts:72-78 — getClientIP takes leftmost x-forwarded-for; spoofable if any non-Vercel proxy fronts the app
[HIGH] proxy.ts:91-98 — 403 page echoes user-supplied IP into HTML unescaped (reflected XSS)
[HIGH] app/api/sync/poll/route.ts:30-60 — Authenticated-only; SALES/EDITOR triggers sync of ALL ACTIVE accounts workspace-wide (no RBAC)
[HIGH] app/api/auth/login/route.ts:6-50 — No rate limiting / lockout on bcrypt verification; password brute-force trivial
[HIGH] app/api/track/click/route.ts:27-37 — Open redirect: redirects to user-supplied http(s) URL with no domain allowlist; phishing vector
[HIGH] app/api/extension/download/route.ts:75-87 — No auth on extension binary download; reads chrome-extension/ from disk for any caller
[HIGH] app/api/ext/add-lead/route.ts — CORS Allow-Origin: *; stolen extension key works from any origin
[HIGH] app/api/ext/check-duplicate/route.ts — CORS *; key-bearing requests leak full client intelligence to any site
[HIGH] src/actions/userManagementActions.ts:9-50 — listUsersAction: select('*') from users returns hashed password column AND extension_api_key to admin browser
[HIGH] src/actions/userManagementActions.ts:99-115 — updateUserRoleAction lets ACCOUNT_MANAGER promote any user to ADMIN; no audit log row
[HIGH] src/actions/userManagementActions.ts:221-243 — setUserPasswordAction lets admin silently rewrite any user's password; no notification, no audit
[HIGH] src/actions/accountActions.ts:300 — removeAccountAction select('*') pulls encrypted refresh_token into action memory unnecessarily
[HIGH] src/actions/contactDetailActions.ts:34-72 — getContactDetailAction fallback uses ILIKE on email with no gmail_account_id filter; cross-AM email leak
[HIGH] src/actions/emailActions.ts:880-947 — getThreadMessagesAction queries thread_id then filters in-memory; entire thread loaded before access check
[HIGH] src/actions/clientActions.ts:13 — ensureContactAction writes contacts.account_manager_id without recordOwnershipChange (Rule #14 violation)
[HIGH] src/actions/importActions.ts:88-104 — importCSVAction inserts account_manager_id per row; no recordOwnershipChange audit (Rule #14)
[HIGH] src/actions/campaignActions.ts:1311-1357 — importLeadsFromCSVAction inserts contacts directly; no recordOwnershipChange audit
[HIGH] src/actions/scraperActions.ts:218-263 — bulk scraper enrolment inserts without recordOwnershipChange (Rule #14)
[HIGH] src/actions/projectActions.ts:464-493 — unlinkContactProjectsAction zeroes contact totals workspace-wide for admin; no audit
[HIGH] app/api/auth/refresh-session/route.ts:15-29 — POST endpoint mutates session cookie with no body or CSRF token; relies solely on SameSite cookie
```

## 3. MEDIUM SEVERITY SECURITY (21)

```
[MEDIUM] src/actions/dashboardActions.ts:7-244 — getSalesDashboardAction missing blockEditorAccess (defense-in-depth)
[MEDIUM] src/actions/analyticsActions.ts:47-61 — getAnalyticsDataAction missing blockEditorAccess
[MEDIUM] src/actions/templateActions.ts:26-64 — getTemplatesAction returns is_shared templates to all users including editors
[MEDIUM] src/actions/templateActions.ts:131,176 — Admin override checks role==='ADMIN' string only; ACCOUNT_MANAGER excluded (inconsistent with isAdmin())
[MEDIUM] src/actions/dataHealthActions.ts:6-10 — Local requireAdmin reimplemented; drift risk vs utils/accessControl.requireAdmin
[MEDIUM] src/actions/jarvisActions.ts:71-209 — suggestReplyAction loads contact financials/AM name with no contact-ownership check (only thread Gmail RBAC)
[MEDIUM] src/actions/contactDetailActions.ts:75-79 — Projects subquery missing ownerFilter; SALES sees all linked projects regardless of project owner
[MEDIUM] app/api/jarvis/route.ts:5-9 — No editor/RBAC gate; VIDEO_EDITOR can call Jarvis chat + business-data tools
[MEDIUM] app/api/jarvis/agent/route.ts:5-21 — No editor block on autonomous agent endpoint
[MEDIUM] app/api/jarvis/tts/route.ts:7-18 — No editor gate; editors can drain ElevenLabs credits
[MEDIUM] app/api/sync/route.ts:46-51 — Returns 403 'Access denied' vs 404 — leaks account existence
[MEDIUM] app/clients/[id]/PageClient.tsx:327 — dangerouslySetInnerHTML strips only <script> via regex; allows on* attrs and javascript: URLs (XSS in email body)
[MEDIUM] app/components/TemplatePickerModal.tsx:185 — dangerouslySetInnerHTML on previewTemplate.body without DOMPurify
[MEDIUM] app/api/migrate/route.ts:5-13 — POST runs destructive migration with no rate limit, idempotency, or transaction
[MEDIUM] app/api/backfill-email-types/route.ts:12-16 — Admin auth fine but unbounded loop; long-running, no QStash signing
[MEDIUM] src/actions/userManagementActions.ts:169-216 — deleteUserAction does 7 reassignments without a transaction
[MEDIUM] src/actions/inviteActions.ts:114, 221 — Invitation URL falls back to http://localhost:3000 if NEXT_PUBLIC_APP_URL unset
[MEDIUM] src/actions/scraperActions.ts:8-17 — ensureAdmin DB lookup not cached; race vs role demotion mid-job
[MEDIUM] src/utils/encryption.ts:20-23 — Validates key length only; no entropy check; weak hex keys (all zeros) accepted
[MEDIUM] src/actions/jarvisActions.ts:299-333 — verifyKnowledgeAction lets any admin rewrite shared knowledge with no per-write actor attribution
[MEDIUM] src/actions/projectActions.ts:308-357 — createProjectAction does not verify clientId is owned by caller; SALES can create project under another team's contact
```

## 4. PERFORMANCE FINDINGS

### Top wins (would shave > 500ms each)

```
[HIGH] src/actions/dashboardActions.ts:73-80 — Pipeline stage counts run 7 sequential head:true count queries (true N+1) — replace with one GROUP BY RPC
[HIGH] src/actions/actionQueueActions.ts:73-116 — Reply-Now validator does N+1 per candidate (50 contacts × up to 3 queries = 150 round-trips)
[HIGH] src/services/dailyBriefingService.ts:35-58 — Every cold-start dashboard load calls Groq with 12s timeout; in-memory cache evaporates per lambda — precompute via 6 AM cron
[HIGH] app/dashboard/PageClient.tsx:60-84 — Dashboard fires getCurrentUser+getSalesDashboard in parallel, then getDailyBriefing separately (sequential rounds)
[HIGH] src/actions/dashboardActions.ts:35-185 — getSalesDashboardAction issues 12+ sequential supabase calls; most are independent — fold into Promise.all
[HIGH] src/actions/intelligenceActions.ts:66-71 — getPricingAnalyticsAction scans all 1,117 projects + extra contacts query for topClientIds (no limit, no RPC)
[HIGH] src/actions/jarvisActions.ts:144-157 — suggestReplyAction always re-aggregates contact financials despite contacts.total_revenue/total_projects already pre-aggregated
[HIGH] app/components/Sidebar.tsx:104-106 — 60s actionQueue badge poll triggers up to 150 sub-queries; 11 users × 1440 min = ~39,600 queries/day for a count
[HIGH] app/PageClient.tsx:271-278 + useMailbox.ts:576 + useRealtimeInbox.ts:185 — 3 overlapping pollers on the inbox view
```

### Schema gaps (missing indexes)

```
[MEDIUM] schema.prisma:149-200 — contacts: missing @@index([pipelineStage]) — dashboard pipeline-counts loop scans
[MEDIUM] schema.prisma:149-200 — contacts: missing @@index([accountManagerId, pipelineStage]) — actionQueue + needReply hot path
[MEDIUM] schema.prisma:299-347 — email_messages: missing @@index([contactId, sentAt(desc)]) — actionQueue thread lookup
[MEDIUM] schema.prisma:349-383 — projects: missing @@index([paidStatus, projectDate]) — finance + intelligence dashboards
[MEDIUM] schema.prisma:349-383 — projects: missing @@index([dueDate]) — overdue queries
[MEDIUM] schema.prisma:385-403 — activity_logs: missing @@index([contactId, createdAt(desc)]) — ownership transfer history queries
[MEDIUM] schema.prisma:772-848 — edit_projects: missing @@index([userId, dueDate]) — editor briefing hot query
[MEDIUM] missing pg_trgm GIN indexes on email_messages.from_email/to_email/subject/snippet for ILIKE queries (search, mark-not-interested)
```

### Sub-500ms wins / cleanup

```
[MEDIUM] src/actions/emailActions.ts:50-105 — resolveAccountManagers issues up to 4 sequential round-trips; combine with one join
[MEDIUM] src/actions/emailActions.ts:386-424 — getInboxWithCountsAction calls get_inbox_page RPC twice (once for counts) — cache counts in 30s memory map
[MEDIUM] src/actions/dashboardActions.ts:140-144 — today/week/month outreach counts → 3 separate queries → collapse with one GROUP BY date_trunc
[MEDIUM] src/actions/contactDetailActions.ts:20-72 — ILIKE fallback runs without trigram index; 250K+ email_messages → seq scan
[MEDIUM] src/actions/emailActions.ts:1109-1121 — markAsNotInterestedAction full-table ILIKE UPDATE
[MEDIUM] src/actions/emailActions.ts:1276 — Search OR clause needs pg_trgm GIN or tsvector
[MEDIUM] src/hooks/useRealtimeInbox.ts:62-113 — Polling fallback runs even when Realtime SUBSCRIBED — duplicate work
[MEDIUM] app/intelligence/PageClient.tsx:140 — 30s setInterval re-renders entire page just for relative-time labels
[MEDIUM] app/accounts/PageClient.tsx:235 — 5s SYNCING poll never backs off
[LOW] 3 places re-create Supabase client outside src/lib/supabase.ts (track, cron/cleanup-tracking, invite/accept) — fragments connection pool
[LOW] schema.prisma — Role enum still missing ACCOUNT_MANAGER + VIDEO_EDITOR; DB stores them as raw strings (silent type drift)
[LOW] app/layout.tsx:15 — `force-dynamic` at root cascades to every page; should live on individual page wrappers
[LOW] vercel.json:19-49 — 60s function cap will time out on full-account Gmail backfill or template mining over 200+ contacts
[LOW] src/actions/emailActions.ts is 1368 lines — refactor into 4-5 focused files
```

### Dashboard 3-second diagnosis

| Step | Time | Cause |
|------|------|-------|
| 1 | ~1.2s | `getDailyBriefingAction` cold-start Groq call |
| 2 | ~800ms | `getSalesDashboardAction` (12+ sequential queries; 7-stage pipeline loop is 200-400ms by itself) |
| 3 | ~400ms | `force-dynamic` SSR + cookie/role fresh-DB check + Sidebar profile fetch |
| 4 | ~200-400ms | Auth + getCurrentUserAction round-trip |

**Top three fixes to claim ~2 seconds**:
1. Pipeline-counts → single `GROUP BY` RPC + `(account_manager_id, pipeline_stage)` index → **-300ms**.
2. Cron-precomputed daily briefings stored in `jarvis_briefings` table; dashboard reads, never calls Groq → **-1500ms cold, -400ms warm**.
3. Stream the dashboard via parallel `Promise.all` + suspense boundaries on revenue chart + top closers → perceived load drops to **<800ms**.

---

## 5. FUNCTIONAL / UX FINDINGS

### BUGs (broken functionality, 23)

```
[BUG] app/dashboard/PageClient.tsx:177-180 — KPI sparklines are HARDCODED arrays [3,4,4,6,5,7,8,7,9] etc.; not real trend data
[BUG] app/dashboard/PageClient.tsx:177 — "+X vs yesterday" calculated as 0.12 × today (fake)
[BUG] app/dashboard/PageClient.tsx:345 — "12 hours ago" hardcoded literal string
[BUG] app/dashboard/PageClient.tsx:209-210 — revBars fallback to hardcoded [42,12],[51,18]… when no real data
[BUG] app/dashboard/PageClient.tsx:298 — "Refresh" button does window.location.reload() — full page reload
[BUG] src/actions/intelligenceActions.ts:8-198 — 6 actions return raw arrays/objects (NOT { success, data, error } envelope); UI can't show error toasts
[BUG] src/actions/dashboardActions.ts:7 — getSalesDashboardAction has no try/catch and returns raw shape
[BUG] src/actions/intelligenceActions.ts:14,29,43,53 — silent return [] / null on RPC error; UI can't distinguish "no data" from "Postgres error"
[BUG] src/actions/scraperActions.ts:15 — throws bare Error('ADMIN_REQUIRED') instead of envelope
[BUG] src/actions/inviteActions.ts:37 — throws Error('Email failed') from inside server action
[BUG] src/actions/emailActions.ts:1172,1175,1325,1340,1354 — multiple raw throws in actions
[BUG] src/actions/contactDetailActions.ts:159 — mid-action throw mixes with envelope contract
[BUG] app/opportunities/PageClient.tsx:75 — copy says "drag cards between stages" but no DnD wired (FALSE ADVERTISING)
[BUG] app/campaigns/[id]/PageClient.tsx:158 — silently swallows failed launch/pause/resume; button just stops spinning
[BUG] app/components/InboxComponents.tsx:1191 — alert("Project created successfully!") blocks UI; only success feedback
[BUG] app/components/InboxComponents.tsx:807,1067 — window.confirm('Delete this email?') for destructive op with no undo path
[BUG] app/clients/PageClient.tsx:107,116 — bulk-quality flows use native confirm()/alert()
[BUG] app/accounts/PageClient.tsx — 14 native alert()/confirm() calls in admin-critical OAuth + bulk-health flow
[BUG] app/components/CSVImportModal.tsx:60-77 — handleImport has no try/catch; throws freeze step at 'importing'
[BUG] app/components/AddProjectModal.tsx:46-78 — handleSubmit no try/catch; modal stays open with stuck state
[BUG] app/components/AddLeadModal.tsx:34 — silent return on empty fields; no feedback
[BUG] src/actions/emailActions.ts:160 — TODO: Gmail per-account daily limit NOT enforced; can blow Gmail send caps
[BUG] components/projects/project-detail/ProjectDetailPanel.tsx:61-65 — debouncedUpdate has no rollback if onUpdate fails
```

### UX (19) — modals, bulk ops, missing flows

```
[UX] ComposeModal / AddProjectModal / AddLeadModal / CSVImportModal / DownloadExtensionModal / AccountSettingsModal / ProjectDetailPanel — no Escape, no focus trap, no body scroll lock
[UX] Only ManagePersonaModal follows the full a11y pattern; others 6 modals are below standard
[UX] app/clients/PageClient.tsx — no checkbox column, no select-all, no bulk delete/reassign/tag toolbar (Sales-Head ask, missing)
[UX] app/opportunities/PageClient.tsx — no bulk operations, no checkbox selection, no drag-to-reassign-stage despite copy advertising it
[UX] app/sent/PageClient.tsx — paginates but no checkbox/bulk-delete on sent items
[UX] app/clients/PageClient.tsx:148 — single "Filter" button has title="Filter" but NO onClick
[UX] app/clients/PageClient.tsx:144-146 — "board" view tab not implemented; clicking does nothing
[UX] app/components/InboxComponents.tsx:1212 — PaginationControls returns null when totalPages <= 1; user sees nothing on filter empty
[UX] app/components/InboxComponents.tsx:1214-1226 — page-number ellipsis logic doesn't handle currentPage > totalPages
[UX] app/sent/PageClient.tsx:205 — pagination range string off-by-N when data shrinks
[UX] app/jarvis/PageClient.tsx:64 — alert('Speech recognition not supported. Use Chrome.') — Firefox/Safari users get modal
[UX] app/dashboard/PageClient.tsx:94 — alert(res.error) for the most-visible AI feature on landing page
[UX] app/components/InlineReply.tsx:222,232 — Send Reply error path uses native alert()
[UX] app/components/Topbar.tsx:1 — entire component is a back-compat stub; real search lives in GlobalTopbar.tsx (dead code)
[UX] app/campaigns/PageClient.tsx:78,87 — single delete uses confirm()+alert(); no bulk archive
[UX] app/campaigns/new/PageClient.tsx:313 — Launch Campaign no debounce/disable; rapid clicks fire multiple launches
[UX] AddLeadModal & ManagePersonaModal disabled-on-submit; ComposeModal/AddProjectModal/CSVImportModal don't (double-submit risk)
[UX] LoadingStates.tsx PageLoader used on /clients, /opportunities, /campaigns, /sent, /my-projects — but NOT on /jarvis, /actions, /data-health, /finance, /intelligence, /analytics, /scraper (blank flash)
[UX] Dashboard "Refresh" button does window.location.reload() — kills client cache
```

### A11Y (7)

```
[A11Y] ComposeModal / Sidebar / clients filter button / JarvisVoiceOrb / InboxComponents / project cells / jarvis page — missing aria-current/aria-label/role attributes, screen reader gaps
```

### POLISH (13) — drift, dead code, formatting

```
[POLISH] Three different fmt(n) currency definitions across dashboard / clients / opportunities — same project_value renders differently per page
[POLISH] Three different date formatters across project_detail / opportunities / clients/[id] for same project_date
[POLISH] AnalyticsCharts.tsx (~50 hex), JarvisVoiceOrb (11), QuickActions (11), InboxComponents (8), ActionCard (4) — hardcoded hex despite CLAUDE.md note 14 purge
[POLISH] AddProjectModal.tsx:5 — DEFAULT_USER_ID hardcoded fallback (multi-tenant code smell)
[POLISH] app/invite/accept/page.tsx:8,9,28,29,51 — 5 console.log on auth path
[POLISH] app/jarvis/PageClient.tsx:133,141,155,159,172 — 5 [TTS] debug logs
[POLISH] app/api/jarvis/route.ts:155, agent/route.ts:13,15 — debug logs in prod
[POLISH] Orphan files (CONFIRMED zero imports): src/actions/automationActions.ts, relationshipActions.ts, src/services/pipelineLogic.ts, app/components/RevenueChart.tsx, RevenueBarChart.tsx, OnboardingWizard.tsx, JarvisDailyBriefing.tsx
[POLISH] src/actions/emailActions.ts attachAccountManagerNames() lift STILL TODO; sent/search/thread paths show "AM(System)"
[POLISH] CampaignTabs.tsx:159,161 — placeholder="email@example.com" leaks brand
[POLISH] src/services/gmailSenderService.ts:1, emailSyncLogic.ts:1 — stale TODO "Add 'server-only' after npm install"
[POLISH] CLAUDE.md notes 9 (lint broken) + buildCommand description (`|| true`) are stale
[POLISH] CLAUDE.md missing 6 routes: /brand-guides, /calendar, /delivered, /footage-library, /my-queue, /revisions and /api/auth/refresh-session
```

---

## 6. CLAUDE.md DRIFT INVENTORY

| Section | Status | Fix |
|---------|--------|-----|
| Tech Stack: ESLint "currently broken" | **STALE** — passes 0 warnings | Drop the warning line |
| Critical Files: `vercel.json` "buildCommand: `next build || true`" | **STALE** — actual: `next build --experimental-build-mode=compile` | Update note 9 in Non-Obvious Patterns |
| Routes: missing `/brand-guides`, `/calendar`, `/delivered`, `/footage-library`, `/my-queue`, `/revisions` | **STALE** | Add to File Structure → Pages |
| API Routes: missing `/api/auth/refresh-session` | **STALE** | Add to API Routes table |
| Orphan files list: all 7 verified zero imports | **CORRECT** | Either delete files or remove note |
| Models count "22" | **CORRECT** | — |
| Role enum: "Prisma enum has only ADMIN + SALES" — DB stores ACCOUNT_MANAGER + VIDEO_EDITOR as raw strings | **CORRECT** but not enforced — hardening item | Add ACCOUNT_MANAGER + VIDEO_EDITOR to enum + migrate |
| Note 8: `console.log` stripped in prod (keeps error/warn) | **CORRECT** but the auth path leaks 5+ console.log calls | These survive locally; clean up before global launch |

---

## 7. INNOVATION LIST (what's missing for $1M / global launch)

### Must-have before global launch
1. **Bulk operations** on /clients and /opportunities — select-all, bulk delete, bulk reassign owner, bulk tag (Sales Head's #1 ask).
2. **Pipeline drag-and-drop** on /opportunities — actually wire `@dnd-kit` (already a dependency!) to drag cards between stages, OR remove the misleading copy.
3. **2FA / TOTP** for admin accounts — IP whitelist alone is brittle. Use `speakeasy` or `otplib`.
4. **Rate limiting** on `/api/auth/login`, `/api/extension/*`, `/api/track/click` — Upstash Ratelimit (already have `@upstash/qstash`).
5. **Database row-level security (RLS)** — defense-in-depth backstop for the 12 RBAC misses above. The service-role key bypasses RLS today; switch SALES paths to scoped clients.
6. **Pre-computed daily briefings** — 6 AM PKT cron writes briefings to `jarvis_briefings` table; dashboard reads (no Groq on dashboard load).
7. **Audit log UI** — surface `OWNERSHIP_TRANSFER` and `AM_CREDIT_OVERRIDE` rows on `/clients/[id]` and `/team` so admins can review history without psql.
8. **Compliance flow**: privacy policy, terms, GDPR data-export, opt-out workflow on outbound emails (CAN-SPAM physical-address requirement).
9. **Modal a11y baseline** — focus trap, Esc, body lock, role=dialog. Use ManagePersonaModal as the template; refactor the other 6 modals to match.
10. **Replace native alert()/confirm() universally** with the existing `useUndoToast` system.

### Strategic / 6-month roadmap
- **Public client portal** — signed-URL routes for clients to review videos, pay invoices, leave revisions (currently no client-facing surface).
- **Slack/WhatsApp briefing push** — daily Jarvis briefing DM'd at 9 AM PKT.
- **Lead enrichment** — Clearbit/Apollo for missing fields after scraper.
- **Calendar integration** — Cal.com or Google Calendar for booking calls inline from a thread.
- **AI training admin UI** — surface `jarvis_lessons` / `jarvis_knowledge` for inline editing (today only via SQL).
- **Editor WIP timer** — auto time-track per project on `edit_projects`.
- **Mobile PWA** — install-to-home-screen with offline inbox cache.
- **Smart unsubscribe** — detect "remove me" / "stop emailing" in inbound replies and auto-unsubscribe.
- **Auto-pause unhealthy accounts** — extend `account_health` to gate sends below health_score threshold.

---

## 8. REMOVAL LIST (kill these)

```
DELETE  src/actions/automationActions.ts                  — zero imports
DELETE  src/actions/relationshipActions.ts                — zero imports
DELETE  src/services/pipelineLogic.ts                     — zero imports
DELETE  app/components/RevenueChart.tsx                   — zero imports
DELETE  app/components/RevenueBarChart.tsx                — zero imports
DELETE  app/components/OnboardingWizard.tsx               — zero imports
DELETE  app/components/JarvisDailyBriefing.tsx            — zero imports (dashboard calls action directly)
REPLACE app/components/Topbar.tsx                          — back-compat stub; real search in GlobalTopbar
REMOVE  HARDCODED dashboard sparkline arrays + fake "+12% vs yesterday" + "12 hours ago" + revBars fallback
REMOVE  DEFAULT_USER_ID constant in AddProjectModal.tsx:5
REMOVE  All 5 console.log on /invite/accept/page.tsx auth path
REMOVE  All [TTS] / [Jarvis] debug console.log in production paths
```

---

## 9. LAUNCH CHECKLIST (must-pass for $1M / global launch)

### P0 — Block launch
- [ ] All 12 CRITICAL security findings fixed + verified
- [ ] OIDC JWT verification on `/api/webhooks/gmail`
- [ ] AES-256-GCM session cookies (drop CBC)
- [ ] Hash invitation tokens before storing
- [ ] Login null-role default no longer 'ADMIN'
- [ ] `getClientsAction` SALES fallthrough patched
- [ ] Rate limit on `/api/auth/login` + extension routes
- [ ] Public extension binary download requires session
- [ ] `track/click` open-redirect domain allowlist
- [ ] IP whitelist replaced or supplemented with TOTP for admins
- [ ] Encryption keys validated for entropy at boot
- [ ] No `force-dynamic` at root layout
- [ ] PII / token-leak audit on all `console.error` and `console.warn` (those survive next.config strip)

### P1 — Required for credible launch
- [ ] Native `alert()` and `confirm()` replaced with toast pattern across Inbox/Clients/Accounts/Compose
- [ ] All modals: focus trap + Esc + body-lock (ManagePersonaModal as template)
- [ ] Bulk ops on /clients + /opportunities (select, delete, reassign, tag)
- [ ] Pipeline DnD wired on /opportunities (or copy removed)
- [ ] Pre-computed daily briefings via cron
- [ ] Pipeline-counts → single GROUP BY RPC
- [ ] `(contacts.account_manager_id, pipeline_stage)` index added
- [ ] `(projects.paid_status, project_date)` index added
- [ ] All 6 dashboard fake-data values replaced with real or removed
- [ ] CLAUDE.md drift corrected (4 stale items)
- [ ] Test runner added (vitest) + smoke tests on auth + RBAC

### P2 — Hardening
- [ ] DB row-level security policies for `contacts`, `projects`, `email_messages`
- [ ] Sentry / error reporting wired
- [ ] Production logs scrubbed of console.log on auth + jarvis paths
- [ ] `users` table SELECT scopes drop password + extension_api_key columns
- [ ] CSP header configured (currently missing)
- [ ] HSTS header on production
- [ ] Backup + restore drill performed
- [ ] Status page wired (e.g. statuspage.io / openstatus)

---

## 10. PHASE 1 CRITICAL-FIX PLAN

> Ordered for shortest distance from "broken" to "shippable." All Phase 1 items are surgical (no architectural rewrites). Estimated effort: **6-8 hours of careful work**.

| # | Fix | File(s) | Risk |
|---|-----|---------|------|
| 1 | `getClientsAction` SALES fallthrough | `src/actions/clientActions.ts` | Low — additive guard |
| 2 | Add `blockEditorAccess` + RBAC to: `ensureContactAction`, `createClientAction`, `checkDuplicateAction`, `searchContactsForComposeAction`, `generateAISummaryAction` | `src/actions/clientActions.ts`, `emailActions.ts`, `summaryActions.ts` | Low — additive |
| 3 | `markClientEmailsAsReadAction` add `ensureAuthenticated` | `src/actions/emailActions.ts:599` | Low |
| 4 | Login default role 'ADMIN' → reject null | `app/api/auth/login/route.ts:39-45` | Low — surgical |
| 5 | Switch session AES-CBC → AES-GCM (use existing `encrypt()` from `src/utils/encryption.ts`) | `src/lib/auth.ts` | **Medium** — invalidates all existing sessions; users must log in again |
| 6 | Remove dev-fallback secret; fail closed on missing `NEXTAUTH_SECRET` | `src/lib/auth.ts:7-18` | Low |
| 7 | Hash invitation tokens (SHA-256 at rest); compare hashed | `src/actions/inviteActions.ts:91-103, 128-150`, `app/invite/accept/page.tsx` | Low — needs migration of existing invites or expiry of pending |
| 8 | Verify Pub/Sub OIDC JWT in Gmail webhook | `app/api/webhooks/gmail/route.ts` | **Medium** — must validate with Google's JWKS; ship behind feature flag |
| 9 | Escape IP in 403 page (XSS) | `proxy.ts:91-98` | Low |
| 10 | Update `CLAUDE.md` drift (lint, vercel.json, 6 missing routes, build cmd) | `CLAUDE.md` | Low |
| 11 | Fix dashboard hardcoded fake data (sparklines, deltas, "12h ago") — either wire real or remove | `app/dashboard/PageClient.tsx` | Low — UX improvement |
| 12 | Pipeline-counts → one `GROUP BY` query | `src/actions/dashboardActions.ts:73-80` | Low — hot-path perf win |
| 13 | Add `@@index([pipelineStage])` + `@@index([accountManagerId, pipelineStage])` on contacts | `prisma/schema.prisma` + migration | Low — non-locking on Postgres if `CONCURRENTLY` |

Items 5, 7, 8 are the tricky ones — they invalidate sessions, require migration, or need OAuth/JWKS infrastructure. Everything else is a pure code edit.

---

_Generated by an agent-orchestrated audit on 2026-04-30. Ground-truth: tsc clean, lint 0 warnings, build 28s, 35 routes._
