# UNIBOX — Project Overview

> **Single source of truth for UNIBOX.** Rewritten from scratch on **2026-04-21** after a ground-up codebase audit. Use this file when onboarding new engineers, handing off to a different AI assistant, or aligning on the current architecture.
>
> The companion file `CLAUDE.md` contains the same technical facts plus editing rules aimed at Claude. If they disagree, trust this file for the ground truth of the code and `CLAUDE.md` for the workflow conventions.

---

## 1. What UNIBOX Is

UNIBOX (repo: `txb-unibox`) is a **high-performance, AI-driven multi-account email CRM + outreach platform** built for **Wedits**, a wedding-video editing agency based in Pakistan.

It unifies **77+ Gmail and manual IMAP/SMTP accounts** into a single inbox, tracks leads through a 7-stage visual sales pipeline, runs automated cold-outreach campaigns with A/B testing, and layers an AI assistant — **Jarvis** — that speaks, drafts replies, plans campaigns, and briefs the team every morning.

**Live URL:** https://txb-unibox.vercel.app
**Repository:** https://github.com/designbyhasnain/unibox
**Region:** Vercel IAD1 (US East)
**Scale (April 2026):** ~12,913 contacts, 1,117 projects, 62 active Gmail accounts, capacity ~1,860 emails/day, $367K all-time revenue, 83% collection rate, 11 account managers.

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | **Next.js 16** (App Router, Turbopack by default) | 16.1.1 |
| Language | TypeScript (strict mode) | 5.9.3 |
| UI Library | React | 19.2.4 |
| Database | PostgreSQL via Supabase (shared DB — local = prod) | — |
| ORM | Prisma | 6.19.2 |
| Hosting | Vercel (IAD1 region) | — |
| Styling | **Vanilla CSS only** — `app/globals.css` (~58 KB, oklch tokens, dark mode) | — |
| Icons | lucide-react + inline 15×15 SVGs in Sidebar | 0.575.0 |
| Charts | Recharts | 3.8.0 |
| Drag & Drop | @dnd-kit/core / sortable / utilities | 6.3.1 / 10.0.0 / 3.2.2 |
| Virtualization | @tanstack/react-virtual | 3.13.23 |
| File Upload | react-dropzone | 15.0.0 |
| Email (Gmail) | googleapis (Gmail API + OAuth2 + Pub/Sub) | 171.4.0 |
| Email (IMAP) | imapflow | 1.2.10 |
| Email (SMTP) | nodemailer | 8.0.1 |
| Email (Transactional) | Resend (invitations only) | 6.10.0 |
| Task Queue | Upstash QStash | 2.10.1 |
| Web Scraping | cheerio | 1.2.0 |
| CSV Parsing | PapaParse | 5.5.3 |
| Email Parsing | mailparser | 3.9.3 |
| HTML Sanitization | DOMPurify | 3.3.3 |
| ZIP Archives | archiver | 7.0.1 |
| Date Utilities | date-fns | 4.1.0 |
| Realtime | @supabase/supabase-js | 2.97.0 |
| UUID | uuid | 13.0.0 |
| Session Encryption | AES-256-CBC (custom, `src/lib/auth.ts`) | — |
| OAuth Token Encryption | AES-256-GCM (`src/utils/encryption.ts`) | — |
| Password Hashing | bcryptjs (12 rounds) | 3.0.3 |
| Linting | ESLint + eslint-config-next (**broken on Next 16**) | 9.27.0 / 16.1.6 |
| Formatting | Prettier | 3.8.1 |
| Type-checking | `tsc --noEmit` (no dedicated test runner) | — |
| Browser Automation (dev) | Puppeteer | 24.40.0 |

**Commands:**
```bash
npm run dev              # Next.js dev server (Turbopack)
npm run build            # Production build
npm run start            # Start built app
npm run lint             # next lint — BROKEN on Next 16
npm run format           # Prettier write
npm run format:check     # Prettier check
npx tsc --noEmit         # Type-check (run before every commit)
npx prisma generate      # Regenerate Prisma client
npx prisma migrate dev   # Create + apply migration
```

---

## 3. Directory Map (High Level)

```
unibox/
├── app/                        # Next.js App Router
│   ├── api/                    # 32 API routes
│   ├── components/             # 30+ shared React components
│   ├── constants/              # config, stages, emojis
│   ├── context/                # FilterContext, UIContext, UndoToastContext
│   ├── hooks/                  # useMailbox, usePrefetch, useIdleDetection
│   ├── utils/                  # helpers, localCache, staleWhileRevalidate, useHydration
│   ├── <page-folder>/          # 25 page routes (see §5)
│   ├── globals.css             # ~58 KB vanilla CSS
│   ├── layout.tsx              # Root layout + providers
│   ├── PageClient.tsx          # Inbox client shell
│   ├── page.tsx                # Inbox root (/)
│   └── loading.tsx             # Shared loading skeleton
├── src/
│   ├── actions/                # 23 server-action files (see §6)
│   ├── constants/              # limits.ts
│   ├── hooks/                  # useRealtimeInbox.ts
│   ├── lib/                    # auth, supabase, config, roleGate, safe-action
│   ├── scripts/                # backfillClients.ts
│   ├── services/               # 24 business-logic services (see §7)
│   └── utils/                  # 15 helper modules
├── components/projects/        # Notion-style project table (25+ files — active)
├── lib/                        # qstash.ts + lib/projects/ helpers
├── prisma/                     # schema.prisma + SQL migration snapshots
├── scripts/                    # one-off maintenance scripts (.ts + .mjs)
├── chrome-extension/           # Prospector v2 (Antigravity) — self-contained
├── docs/                       # engineering & process docs (SOPs, QA notes)
├── public/                     # static assets
├── proxy.ts                    # Next.js 16 middleware replacement
├── next.config.js
├── vercel.json
├── package.json
├── CLAUDE.md                   # editing rules & patterns for Claude
├── PROJECT_OVERVIEW.md         # this file
├── CHANGES.md                  # Changelog + feature inventory
├── KNOWN_ISSUES.md             # open issues
└── README.md
```

---

## 4. Core Features

### 4.1 Unified Inbox
A single view across 77+ Gmail + IMAP accounts with per-account filtering, real-time updates, thread grouping, compose/reply, and open-tracking.
- **Main inbox page:** `app/page.tsx` + `app/PageClient.tsx` + `app/hooks/useMailbox.ts` (useReducer + 2-tier cache: memory + localStorage).
- **Realtime:** Supabase realtime subscription in `useMailbox.ts` and `src/hooks/useRealtimeInbox.ts`.
- **Thread UI:** `app/components/InboxComponents.tsx` (EmailRow, EmailDetail, PaginationControls, ToastStack).
- **Compose / Reply:** `app/components/ComposeModal.tsx`, `app/components/InlineReply.tsx`.
- **Sent view:** `app/sent/page.tsx`.
- **Sync modes:**
  - **Gmail push** — Pub/Sub → `/api/webhooks/gmail` → `webhook_events` → cron processor (every 2 min).
  - **Gmail history sync** — partial catch-up via `historyId` (`gmailSyncService.syncAccountHistory`).
  - **Gmail full / deep-gap-fill** — bootstrap + rate-limited backfill after recovery (`syncGmailEmails`, `deepGapFillSync`).
  - **IMAP** — every 15 min via QStash → `/api/cron/sync-imap` → `manualEmailService.ts` (max 5 accounts per run).

### 4.2 CRM & Sales Pipeline
Visual pipeline with 7 stages, auto-transitions on email events, lead scoring, and contact timelines.
- **Stages** (`app/constants/stages.ts`): `COLD_LEAD → CONTACTED → WARM_LEAD → LEAD → OFFER_ACCEPTED → CLOSED` (+ `NOT_INTERESTED` terminal).
- **Pages:** `app/clients/page.tsx`, `app/clients/[id]/page.tsx`, `app/opportunities/page.tsx`, `app/dashboard/page.tsx`.
- **Auto-transitions:** `src/services/emailSyncLogic.ts` (on send/receive).
- **Pipeline CRUD helpers:** `src/services/pipelineLogic.ts` (createManualLead, updateLeadStage). ⚠ Currently unreferenced outside documentation — candidate for removal or rewire.

### 4.3 Outreach Campaigns
3-phase sequential campaign processor with A/B variants, account rotation, warmup mode, spintax, and placeholders.
- **Pages:** `app/campaigns/page.tsx`, `app/campaigns/new/page.tsx`, `app/campaigns/[id]/page.tsx`.
- **Processor:** `src/services/campaignProcessorService.ts` (enqueue) → `src/services/sendQueueProcessorService.ts` (send + advance) → subsequence trigger.
- **A/B testing:** `prisma.CampaignVariant` + `app/components/ABTestingAnalytics.tsx`.
- **Analytics:** `app/analytics/page.tsx`, `src/actions/analyticsActions.ts`.

### 4.4 Jarvis (AI Layer)
A multi-surface AI executive built on **Groq** (Llama 3.3 70B + 3.1 8B) with **ElevenLabs** TTS (`voice: Sarah`).

| Surface | Entry Point | What It Does |
|---------|-------------|--------------|
| Full-page chat | `app/jarvis/page.tsx` → `/api/jarvis` → `src/services/jarvisService.ts` | Tool-calling chat (18 tools, 3 iterations max) |
| Autonomous agent | `/api/jarvis/agent` → `src/services/jarvisAgentService.ts` | Plan → execute → evaluate (max 10 steps) |
| Voice orb | `app/components/JarvisVoiceOrb.tsx` | Browser SpeechRecognition → `/api/jarvis` → ElevenLabs |
| Daily briefing | `app/dashboard/PageClient.tsx` → `src/actions/jarvisActions.ts#getDailyBriefingAction` → `src/services/dailyBriefingService.ts` | Role-aware 24h summary (ADMIN / SALES / VIDEO_EDITOR paths) |
| In-thread reply suggestion | `app/components/JarvisSuggestionBox.tsx` → `jarvisActions.ts#suggestReplyAction` → `replySuggestionService.ts` | AI-drafted reply above every thread |
| TTS | `/api/jarvis/tts` | ElevenLabs `eleven_multilingual_v2`; falls back to browser `SpeechSynthesis` |
| Feedback loop | `jarvisActions.ts#logJarvisFeedbackAction` → `jarvis_feedback` table | Logs suggested vs. actual reply with similarity |
| Knowledge base | `jarvis_knowledge` table + `scripts/mine-jarvis-knowledge.ts` + `jarvisActions.ts#verifyKnowledgeAction` | Q&A mined from historical emails |

**Jarvis tools** (18, defined in `jarvisService.ts → JARVIS_TOOLS`):
`search_contacts`, `get_contact_detail`, `get_pipeline_stats`, `get_revenue_analytics`, `get_region_breakdown`, `get_top_clients`, `get_unpaid_clients`, `get_contacts_by_stage`, `get_contacts_by_region`, `get_am_performance`, `get_email_accounts`, `draft_email`, `create_campaign`, `launch_campaign`, `get_campaign_stats`, `get_financial_health`, `get_resource_utilization`, `get_morning_briefing`, `assess_project_decision`.

> ⚠ `jarvisService.ts → JARVIS_SYSTEM_PROMPT` embeds live business data (revenue totals, top clients, team roster). Update the string when those numbers shift materially.

### 4.5 Lead Scraper (ADMIN only) + Campaign Enrollment
cheerio-based website scraper that extracts name/email/phone/social and scores leads `Hot / Warm / Lukewarm / Cold` (0–100) by keyword matching. **Scraped leads feed directly into outreach campaigns via a single server action** — no CSV export/re-import step.

- **Scraping:** `app/scraper/page.tsx` → `startScrapeJobAction(rawUrls)` → `src/services/leadScraperService.ts#scrapeUrl`. Max 50 URLs per job. Stores into `scrape_jobs` + `scrape_results` (raw Supabase tables — not Prisma-modelled).
- **Campaign dropdown source:** `listEnrollableCampaignsAction()` returns all admin-visible campaigns in `DRAFT | SCHEDULED | RUNNING | PAUSED`.
- **Enrollment:** `bulkEnrollScrapedLeadsAction(scrapeResultIds, campaignId)` — the **only** path from scraper to campaign:
  1. **Upsert Contact** by email — create new with `source='scraper'`, `pipeline_stage='COLD_LEAD'`, `account_manager_id=userId`, or link existing.
  2. **Insert `campaign_contacts`** row with `status='PENDING'`, `current_step_number=1`. Duplicates are detected via the `(campaign_id, contact_id)` unique constraint (error code `23505`) and silently skipped.
  3. **Mark `scrape_result.status='APPROVED'`** and backfill `contact_id` for traceability.
  4. **Revalidates** `/scraper` and `/campaigns/[id]`.
- **Handoff point:** the action deliberately does **not** write to `campaign_send_queue`. The campaign processor cron (every 15 min) picks up `PENDING` enrollments and handles scheduling, staggering, daily limits, and account rotation. That is the single source of truth for send timing.
- **Guards:** max 500 leads per enrollment call, admin-only, campaign must exist, scrape-results are scoped to the user's own jobs via `scrape_jobs!inner(user_id)` join.

### 4.6 Edit Projects (Notion-Style Tracker)
A full-featured Notion-style project table for video-editing work. Drag/drop, cells, board view, CSV import.
- **Pages:** `app/projects/page.tsx` (admin — all projects), `app/my-projects/page.tsx` (per-user).
- **Component tree:** `components/projects/` (root-level folder, **not** under `app/components/`):
  - `ProjectsClient.tsx`, `EditorDashboard.tsx`, `EditorWorkstation.tsx`
  - `table/` (ProjectTable, ProjectTableHeader, ProjectTableRow, TableFooter, TablePagination)
  - `cells/` (TextCell, NumberCell, DateCell, UrlCell, CheckboxCell, PriorityCell, TagsCell, PersonCell, ProgressCell, PaidCell, HardDriveCell, AMReviewCell)
  - `toolbar/` (TableToolbar, ViewSwitcher, CSVImportModal)
  - `views/` (BoardView)
  - `project-detail/` (ProjectDetailPanel)
- **Server actions / types:** `lib/projects/` — `actions.ts`, `types.ts`, `constants.ts`, `csv-parser.ts`, `editorStats.ts`.
- **Related pages:** `app/link-projects/page.tsx` (admin — link contacts to projects).

### 4.7 Team / Invitations / RBAC
- **Pages:** `app/team/page.tsx`.
- **Actions:** `src/actions/inviteActions.ts`, `src/actions/userManagementActions.ts`.
- **Invitation flow:** 7-day token → `/invite/accept` → creates user with invited role → auto-assigns Gmail accounts.
- **Transactional email:** Resend from `noreply@texasbrains.com`.

### 4.8 Actions Queue
Prioritized action list across five types: `REPLY_NOW`, `FOLLOW_UP`, `WIN_BACK`, `NEW_LEAD`, `STALE`. The sidebar badge on `/actions` polls every 60 s.
- `app/actions/page.tsx` → `src/actions/actionQueueActions.ts`.

### 4.9 Admin Surfaces
- **Intelligence:** `app/intelligence/page.tsx` — Jarvis audit card UI.
- **Finance:** `app/finance/page.tsx` — revenue + collections.
- **Data Health:** `app/data-health/page.tsx` — data-integrity checks (admin only).
- **Accounts (Unified):** `app/accounts/page.tsx` — single page that merges what used to be three: Gmail/IMAP connection management + DNS deliverability (SPF/DKIM/DMARC pills, BIMI explainer) + Persona / branding (display name, profile photo, signature push to Gmail Send-As). The standalone `/branding` and `/identity-factory` pages were folded in and deleted (commits `c04f05a`, `a740a28`).
- **Analytics:** `app/analytics/page.tsx` — campaign A/B + revenue charts.

> Theme is auto from `prefers-color-scheme` (no manual toggle). The old `/settings` route was deleted 2026-05-05; profile editing for every role now flows through the AccountSettingsModal opened from the sidebar profile pill (or the topbar avatar — see §10).

### 4.10 Chrome Extension — **Unibox Prospector v2 (Antigravity)**
Self-contained extension that ships under `chrome-extension/` and talks to `/api/ext/*` + `/api/extension/*`.

```
chrome-extension/
├── manifest.json (v3)
├── package.json
├── build.js
├── zip.js
├── background/background.js
├── content/
│   ├── content_script.js
│   ├── island.js              # Dynamic Island lead capture UI
│   ├── page_scraper.js
│   ├── location_extractor.js
│   └── prospect_scorer.js
├── popup/popup.html
├── utils/
│   ├── api.js
│   ├── platforms.js
│   └── scraper.js
├── fallbacks/
│   ├── facebook_scraper.js
│   └── instagram_scraper.js
└── dist/                      # compiled output
```

**Excludes by design:** Gmail, Google Docs/Drive, Facebook, Instagram, LinkedIn, YouTube, localhost.

### 4.11 Sender Identity & Deliverability
A multi-layer attempt to make outbound mail look like it comes from a real person — gateway recipients (Gmail, Yahoo, Apple Mail, Outlook) gate avatar / branding behind very different policies, so we cover them in parallel rather than picking one.

- **Persona (per-account)** — display name + photo per Gmail/IMAP account. Edited via the kebab menu on each card on `/accounts` (`ManagePersonaModal`). Persisted on `gmail_accounts.display_name` + `profile_image`.
- **Identity force-sync — `pushAllPersonasToGmailAction()`** in `accountActions.ts` → `src/services/gmailSendAsService.ts`. For every OAuth account, pushes the Persona's display name + signature into Gmail's `users.settings.sendAs` so Gmail itself reflects the latest identity. Surfaced in the `/accounts` secondary toolbar as **Push to Gmail**. Reconnect-needed accounts are reported in the toast (`/reconnect/i.test(error)` check) so the user knows which to re-OAuth.
- **Sync Google profiles** — `syncGoogleProfilesAction()` reverse-fills empty Personas with the Google account's photo + name (uses `oauth2.userinfo.get`). Toolbar action: **Sync profiles**.
- **CID inline avatar (SMTP path)** — for IMAP/SMTP sends, `manualEmailService.ts` injects the persona photo as a `cid:` attachment referenced by the inline HTML signature. Recipients on clients that don't pull external imagery (or that block 1×1 trackers) still see the photo because it's part of the MIME body. Speculative `X-*` headers attempted earlier were stripped (commit `a740a28`).
- **Inline HTML signature engine** — every send injects a Persona-driven HTML signature: 60 px circular photo + bold display name + role line. Built once per send in the same code path as the body wrap. This is the most reliable workaround to Gmail's avatar blocking (which requires a paid VMC certificate).
- **DNS deliverability** — `brandingActions.ts` runs SPF / DKIM / DMARC + Gravatar checks. Results cached client-side per domain on `/accounts`. The card surface shows **✓ Trusted / ✓ Provider-managed / ⚠ DNS issues / Checking…** as a single pill in the Technical Health summary; expand for per-record pills + a "Re-check" button. `scripts/dns-fixer-report.mjs` is a one-shot CLI that prints what's missing per domain.
- **MIME-proofing** — `scripts/mime-proof.mjs` dumps the actual outbound MIME for a sample send so the user can sanity-check headers, attachment IDs, and signature wrapping before bulk-pushing.
- **BIMI** — every send emits a `BIMI-Selector: v=BIMI1; s=default;` header. The TXT record at `default._bimi.<domain>` activates Yahoo / AOL avatar rendering as soon as DMARC enforcement is in place.
- **Per-account diagnostic** — `checkAccountBrandingAction(email)` (kebab → "Run diagnostic") returns a 4-axis report (DNS / Persona / Signature / Send-As) as a toast.

> Background on coverage (verified May 2026): Gmail avatar circle is hard-blocked without a paid VMC (~$1500/yr). Yahoo/AOL works free with self-asserted BIMI. Apple Mail iCloud works free via Apple Business Connect "Branded Mail" enrollment. Outlook doesn't render BIMI as of April 2026. Schema.org JSON-LD chips don't drive avatar — we send them anyway because the cost is zero.

### 4.12 Global Search (Topbar)
- **`app/components/GlobalTopbar.tsx`** — banner-role topbar mounted by `ClientLayout` for every authenticated route. Three slots: left (placeholder), centered search form, right (placeholder).
- **Centered search** — 3-column CSS grid on `.global-topbar` so the search form sits dead-center of the topbar regardless of viewport width.
- **Per-page registration** — pages call `useRegisterGlobalSearch(key, { placeholder, value, onChange, onClear, onSubmit })` from `app/context/GlobalSearchContext.tsx`. The context publishes via `useSyncExternalStore`; only the topbar subscribes, so pages don't re-render on every keystroke that doesn't belong to them. **When no page is registered, the search form is hidden entirely** (not just disabled) so non-list routes stay visually clean.
- **List-heavy routes that register search:** `/` (mail by sender/subject/body), `/sent`, `/clients` (server-side debounced 300ms across name/email/company/phone), `/projects` (server-side debounced 300ms across name/client_name/editor — see `lib/projects/actions.ts`), `/campaigns` (client-side by name/goal/createdBy), `/accounts` (client-side by email/status), `/scraper` (client-side filter on visible jobs/results table).
- **Routes that DO NOT register search** (search bar hidden): `/dashboard`, `/intelligence`, `/finance`, `/data-health`, `/team`, plus singletons like `/calendar`, `/jarvis`, `/analytics`.
- **Recent search history** — partitioned per page key in `localStorage` under `unibox_search_history:<key>` (e.g. `unibox_search_history:/clients`), max 8 entries each. Opens on focus when entries exist; clicking a row replays the query through the registered page's `onChange` + `onSubmit`. The legacy global key `unibox_search_history` is removed on first load. Cleared via the small "Clear" button in the dropdown header.
- **Keyboard shortcuts** (`ClientLayout`): `⌘K` / `⌃K` and bare `/` (when not already in a field) focus the search input on routes where it is mounted; `⌘J` / `⌃J` jumps to `/jarvis`.

---

## 5. Pages (24 routes)

| Route | File | Auth Gate | Purpose |
|-------|------|-----------|---------|
| `/` | `app/page.tsx` + `PageClient.tsx` | Session | Unified inbox (main email interface) |
| `/login` | `app/login/page.tsx` | Public | Google OAuth + email/password |
| `/invite/accept` | `app/invite/accept/page.tsx` | Invite token | Invitation acceptance |
| `/dashboard` | `app/dashboard/page.tsx` | Session | Role-aware dashboard + Jarvis briefing |
| `/actions` | `app/actions/page.tsx` | Non-editor | Prioritized action queue |
| `/clients` | `app/clients/page.tsx` | Session | Client/contact list (role-scoped) |
| `/clients/[id]` | `app/clients/[id]/page.tsx` | Session | Contact detail + history |
| `/accounts` | `app/accounts/page.tsx` | Admin | Unified Gmail / IMAP management + DNS deliverability + Persona / branding (merged from former `/branding` + `/identity-factory`) |
| `/campaigns` | `app/campaigns/page.tsx` | Non-editor | Campaign list |
| `/campaigns/new` | `app/campaigns/new/page.tsx` | Non-editor | Create campaign wizard |
| `/campaigns/[id]` | `app/campaigns/[id]/page.tsx` | Non-editor | Campaign detail + analytics |
| `/projects` | `app/projects/page.tsx` | Admin | Edit Projects tracker (all) |
| `/my-projects` | `app/my-projects/page.tsx` | Session | User-scoped projects |
| `/link-projects` | `app/link-projects/page.tsx` | Admin | Link contacts to projects |
| `/templates` | `app/templates/page.tsx` | Non-editor | Email template library |
| `/analytics` | `app/analytics/page.tsx` | Non-editor | Campaign + revenue analytics |
| `/sent` | `app/sent/page.tsx` | Session | Sent email history |
| `/opportunities` | `app/opportunities/page.tsx` | Non-editor | Sales pipeline view |
| `/intelligence` | `app/intelligence/page.tsx` | Admin | Jarvis audit cards |
| `/finance` | `app/finance/page.tsx` | Admin | Revenue + collections |
| `/data-health` | `app/data-health/page.tsx` | Admin | Data integrity checks |
| `/team` | `app/team/page.tsx` | Admin | Team management + invites |
| `/scraper` | `app/scraper/page.tsx` | Admin | Lead scraper |
| `/jarvis` | `app/jarvis/page.tsx` | Session | Jarvis chat interface |

---

## 6. API Routes (32)

> All cron routes accept **both** POST (QStash signed) and GET (Vercel Cron with `Bearer ${CRON_SECRET}`). `proxy.ts` skips `/api/*` — every API route protects itself.

### Auth & Session
| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/auth/login` | POST | Public | Email + password login |
| `/api/auth/google/callback` | GET | OAuth state (CSRF) | Gmail account OAuth callback (connects accounts) |
| `/api/auth/crm/google` | GET | Public | CRM login OAuth init |
| `/api/auth/crm/google/callback` | GET | OAuth state + invite token | CRM login OAuth callback |
| `/api/auth/set-password` | POST | Invite token | Password setup for invited users |

> ⚠ Earlier docs listed `/api/auth/google` as a separate init route. It does **not** exist — Gmail OAuth is initiated client-side and lands directly on the callback. Docs corrected 2026-04-21.

### Sync
| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/sync` | POST | Session | Manual sync trigger (history or full) |
| `/api/sync/health` | GET | Public | Deep account-health check |
| `/api/sync/poll` | GET | Session | Polls active accounts (max 5/run) |

### Webhooks
| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/webhooks/gmail` | POST | None (Google OIDC) | Gmail Pub/Sub push ingest |

### Tracking
| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/track` | GET | Public | Email open pixel |
| `/api/track/click` | GET | Public | Click-through redirect |
| `/api/unsubscribe` | GET | Public | Campaign unsubscribe |

> Earlier docs referenced `/api/track/session` — that route does **not** exist. Docs corrected 2026-04-21.

### Jarvis
| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/jarvis` | POST | Session | Chat + tool-calling |
| `/api/jarvis/agent` | POST | Session | Autonomous plan/execute/evaluate |
| `/api/jarvis/tts` | POST | Session | ElevenLabs TTS |

### Campaigns / Cron / Automation
| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/campaigns/process` | GET/POST | CRON_SECRET / QStash | Campaign 3-phase processor (every 15 min) |
| `/api/cron/automations` | GET/POST | CRON_SECRET / QStash | Token refresh + automations (hourly) |
| `/api/cron/process-webhooks` | GET/POST | CRON_SECRET / QStash | Retry failed Gmail webhook events (every 2 min) |
| `/api/cron/renew-gmail-watches` | GET/POST | CRON_SECRET / QStash | Renew Pub/Sub watches (every 3 days) |
| `/api/cron/cleanup-tracking` | GET/POST | CRON_SECRET / QStash | Truncate old bodies + activity logs (daily 3 AM UTC) |
| `/api/cron/sync-imap` | GET/POST | CRON_SECRET / QStash | IMAP poll (every 15 min, max 5 accounts/run) |

### Templates
| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/mine-templates` | GET | CRON_SECRET | Weekly AI template mining (Mondays 3 AM UTC) |
| `/api/mine-templates-direct` | GET | Session (admin) or CRON_SECRET | Direct mining without clustering |

### Chrome Extension
| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/ext/add-lead` | POST, OPTIONS | Extension API key | Create contact from scraping |
| `/api/ext/check-duplicate` | POST, OPTIONS | Extension API key | Check contact exists + return intelligence |
| `/api/ext/ping` | GET, OPTIONS | Extension API key | Health check |
| `/api/extension/generate-key` | POST | Session | Generate extension API key |
| `/api/extension/me` | GET | API key | Current user profile |
| `/api/extension/clients` | GET/POST | API key | Get or create contacts |
| `/api/extension/download` | GET | Public | Download zipped extension |

### Admin / Misc
| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/ping` | GET | Public | Health check (returns IP + headers) |
| `/api/backfill-email-types` | POST | Admin | One-time email-type backfill |
| `/api/migrate` | POST | Admin | DB migration helper |

---

## 7. Background Jobs

QStash schedules (from `scripts/setup-qstash-schedules.ts`):

| Cadence | Path | Purpose |
|---------|------|---------|
| Every 2 min | `/api/cron/process-webhooks` | Retry Gmail webhook events (max 5 retries, exponential backoff) |
| Every 15 min | `/api/campaigns/process` | Campaign processor |
| Every 15 min | `/api/cron/sync-imap` | IMAP/manual sync |
| Hourly | `/api/cron/automations` | Token refresh, lead scoring, warm-lead detection, health checks |
| Every 3 days | `/api/cron/renew-gmail-watches` | Renew Pub/Sub watches before 7-day expiry |
| Daily (3 AM UTC) | `/api/cron/cleanup-tracking` | Body truncation, old-log cleanup |

Vercel Cron (from `vercel.json`):

| Cadence | Path | Purpose |
|---------|------|---------|
| Weekly (Mon 3 AM UTC) | `/api/mine-templates` | Template mining via Groq Llama 3.3 70B |

---

## 8. Server Actions (`src/actions/`, 23 files)

| File | Key Exports / Purpose |
|------|-----------------------|
| `emailActions.ts` | `sendEmailAction`, `getInboxEmailsAction`, `getSentEmailsAction`, `getClientEmailsAction`, `markClientEmailsAsReadAction` |
| `accountActions.ts` | Gmail/IMAP connect, sync controls, watch renew, health checks |
| `campaignActions.ts` | Campaign CRUD, launch/pause/resume, enrollment, A/B, CSV import, diagnose |
| `clientActions.ts` | Contact CRUD, stage counts, duplicate check, removal |
| `contactDetailActions.ts` | Detail fetch + update |
| `actionQueueActions.ts` | Action queue + snooze/done + AI recommendations |
| `analyticsActions.ts` | Analytics data |
| `authActions.ts` | Current user + logout |
| `dashboardActions.ts` | Sales/admin dashboard data |
| `dataHealthActions.ts` | Gmail sync + data health (admin) |
| `financeActions.ts` | Finance (revenue, collections) |
| `importActions.ts` | CSV import |
| `intelligenceActions.ts` | Intelligence cards |
| `inviteActions.ts` | Send / revoke / resend invites |
| `jarvisActions.ts` | Daily briefing, reply suggestions, feedback log, knowledge verification |
| `projectActions.ts` | Project CRUD + status |
| `revenueActions.ts` | Revenue calcs |
| `scraperActions.ts` | Scraper jobs + results |
| `summaryActions.ts` | Relationship summaries (used on `/clients/[id]`) |
| `templateActions.ts` | Email templates |
| `userManagementActions.ts` | Admin: list / role / deactivate |
| `automationActions.ts` | **⚠ Currently unreferenced** — candidate for removal (`salesAutomationService` runs instead) |
| `relationshipActions.ts` | **⚠ Currently unreferenced** — candidate for removal |

---

## 9. Services (`src/services/`, 24 files)

| File | Purpose |
|------|---------|
| `gmailSyncService.ts` | Full + history sync, watch registration, deep-gap-fill, unspam |
| `emailSyncLogic.ts` | Classification, auto-contact creation, pipeline transitions |
| `gmailSenderService.ts` | MIME build, Gmail send, token refresh |
| `manualEmailService.ts` | IMAP/SMTP for non-Gmail |
| `trackingService.ts` | Open pixel + link rewriting |
| `emailClassificationService.ts` | Email type taxonomy |
| `campaignProcessorService.ts` | Campaign Phase 1 (enqueue) |
| `sendQueueProcessorService.ts` | Campaign Phase 2 (send + advance) |
| `salesAutomationService.ts` | Follow-ups, warm-lead detection, lead scoring (`runAllAutomations`) |
| `accountHealthService.ts` | Bounce rate, health score, auto-pause |
| `accountRotationService.ts` | Round-robin + warmup mode |
| `googleAuthService.ts` | OAuth URL / callback / token storage |
| `crmAuthService.ts` | CRM OAuth flow |
| `tokenRefreshService.ts` | Token refresh, auto-recovery from ERROR |
| `watchRenewalService.ts` | Gmail Pub/Sub watch lifecycle (7-day TTL) |
| `webhookProcessorService.ts` | Retry webhook events (max 5, exponential backoff) |
| `aiSummaryService.ts` | Relationship audits (Groq + Gemini fallback) |
| `pipelineLogic.ts` | Stage transition rules. **⚠ Currently only exports used in docs — verify before removing.** |
| `jarvisService.ts` | Chat brain — 18 tools + system prompt with live business data |
| `jarvisAgentService.ts` | Goal-driven agent (plan / execute / evaluate) |
| `dailyBriefingService.ts` | Role-aware 24h briefing via Groq llama-3.1-8b-instant |
| `replySuggestionService.ts` | In-thread reply drafting |
| `leadScraperService.ts` | cheerio-based website scraper with scoring |
| `templateMiningService.ts` | Groq-based template mining from sent emails |

---

## 10. Components (`app/components/`)

### Core Layout
`ClientLayout`, `Sidebar`, `Topbar` (back-compat shell — search now lives in `GlobalTopbar`), `GlobalTopbar`, `TopbarUserBadge` (real-photo / initials disc, dispatches `unibox:open-account-settings`), `Resizer`, `ErrorBoundary`, `LoadingStates`.

### Inbox / Email
`InboxComponents.tsx` (EmailRow + EmailDetail + PaginationControls + ToastStack), `ComposeModal`, `InlineReply`.

### Feature Components
`AddLeadModal`, `AddProjectModal`, `CSVImportModal`, `TemplatePickerModal`, `OnboardingWizard`* , `QuickActions`, `ActionCard`, `CampaignTabs`, `DateRangePicker`.

### Analytics / Charts
`AnalyticsCharts`, `ABTestingChart`, `ABTestingAnalytics`, `RevenueChart`* , `RevenueBarChart`* .

### Jarvis
`JarvisVoiceOrb`, `JarvisSuggestionBox`, `JarvisDailyBriefing`* .

### UI Primitives (`app/components/ui/`)
`Button`, `Badge`, `FormField`, `ErrorAlert`.

> `*` = currently has **zero imports** outside docs. Flagged for cleanup — see §14.

---

## 11. Sidebar Groups (role-aware — `app/components/Sidebar.tsx`)

| Group | Items | Visible to |
|-------|-------|------------|
| **CRM** | Actions, Inbox, Dashboard, Clients (→ `/My Clients` for SALES), My Projects, Accounts (admin), Opportunities (→ `/My Pipeline` for SALES) | ADMIN + SALES |
| **Marketing** | Campaigns, Scraper (admin), Templates, Analytics | ADMIN + SALES |
| **Work** (admin) / **Assistant** (sales) | Edit Projects (admin), Link Projects (admin), Jarvis AI | ADMIN + SALES |
| **Admin** | Intelligence, Finance, Data Health, Team | ADMIN / ACCOUNT_MANAGER |
| **My Work** | Dashboard, My Projects | VIDEO_EDITOR only |

Badge counts come from live `actionQueueActions` polls every 60 s.

---

## 12. Auth & Security

### Session Cookie
- Name: `unibox_session` — httpOnly, secure, sameSite `lax`, 7-day expiry.
- Encryption: **AES-256-GCM** (authenticated — confidentiality + integrity). Random 12-byte IV, 16-byte auth tag. Format: `{ivHex}:{authTagHex}:{ciphertextHex}` (all lowercase hex). The legacy 2-part CBC format is rejected outright at decrypt so tampered cookies are forced through `/login`.
- Payload: `{ userId, email, name, role, exp }`.
- API: `createSession()`, `getSession()`, `clearSession()` in `src/lib/auth.ts`. `clearSession()` is also the entire body of `logoutAction()` — no `revalidatePath`, no server-side redirect; the client navigates via `window.location.replace('/login')` for sub-second logout.

### `proxy.ts` (Next.js 16 middleware replacement — commit `038a3bb`)
Two-layer guard on every request:
1. **IP whitelist** (hardcoded — exact IPs + prefixes for PTCL, Jazz, Nayatel, Telenor, Zong + IPv6 + `192.168.`). Non-matching IPs see a styled 403 HTML page. The reflected IP value is HTML-escaped before insertion (defense against `X-Forwarded-For` reflected XSS — the 403 page took attacker-controlled values otherwise).
2. **Session validation** — cookie format check matches the GCM layout: 3 hex parts, IV = 24 chars, auth tag = 32 chars, ciphertext ≥ 16. Stale CBC-shaped cookies fail this check and are deleted on the redirect to `/login`.
3. Public paths: `/login`, `/invite`. API routes protect themselves via `getSession()`.
4. Matcher excludes `_next/*`, `favicon.ico`, `/api/*`, static files.

> Hardening pass (May 2026, audit `c04f05a` neighbourhood) also covers: login null-role returns 403 instead of defaulting to ADMIN; invitation tokens are stored as SHA-256 hashes (legacy plaintext fallback through 2026-06-01); Gmail webhook verifies the OIDC JWT via `OAuth2Client.verifyIdToken` before processing (skip only with `GMAIL_WEBHOOK_VERIFY=false` in local dev); contact ownership transfers go through a single chokepoint (`transferContactAction`) that writes the `OWNERSHIP_TRANSFER` audit row; `projects.account_manager_id` writes after `paid_status='PAID'` require `{ adminOverride: true, reason: '... ≥10 chars' }` AND ADMIN role.

### Role Gates
- **`src/lib/safe-action.ts` → `ensureAuthenticated()`** — cookie-role gate. Fast (no DB hit). Called by every server action.
- **`src/lib/roleGate.ts` → `getFreshSession`, `blockEditorAccess`, `requireAdminAccess`** — fresh DB role check for server-component page wrappers (safe against stale cookies).
- **`src/utils/accessControl.ts`** — identity-based data scoping. `getAccessibleGmailAccountIds(userId, role)` returns `'ALL'` for admins, `[]` for editors, assigned IDs for SALES. Memoized per request via React `cache()`.

### Token Encryption
`src/utils/encryption.ts` — **AES-256-GCM** with `ENCRYPTION_KEY` (64-char hex). Used for Gmail OAuth tokens and IMAP app-passwords at rest.

### Identity Scoping (RBAC data layer — `src/utils/accessControl.ts`)

Every data query filters rows by the caller's identity. There is no application-level multi-tenancy — identity scoping **is** the security boundary after the session check.

**Role test helpers:**
- `isAdmin(role)` → `true` for `ADMIN` or `ACCOUNT_MANAGER` (legacy value treated as admin).
- `isSales(role)` → `true` only for `SALES`.
- `isEditor(role)` → `true` only for `VIDEO_EDITOR`.

**Gmail scope — `getAccessibleGmailAccountIds(userId, role)`:**
- `ADMIN` / `ACCOUNT_MANAGER` → returns the literal string `'ALL'`. Callers interpret this as "no `IN` filter needed."
- `VIDEO_EDITOR` → returns `[]`. Callers short-circuit to an empty result immediately.
- `SALES` → queries `user_gmail_assignments` pivot and returns the assigned `gmail_account_id` array (may be empty → caller returns empty result).
- Any unknown role → treated as SALES (no implicit admin escalation).
- **Wrapped in React `cache()`** — memoized per-request so a single server-action tree doesn't re-hit the DB.

**Canonical usage pattern:**
```typescript
const accessible = await getAccessibleGmailAccountIds(userId, role);
if (Array.isArray(accessible) && accessible.length === 0) {
    return { success: true, data: [] };   // editor / unassigned sales
}
let q = supabase.from('email_messages').select('*');
if (accessible !== 'ALL') q = q.in('gmail_account_id', accessible);
```

**Contact / Project scope — `getOwnerFilter(userId, role)`:**
- Admin → `null` (no filter).
- Non-admin → returns the user's own `userId`, forcing `WHERE account_manager_id = userId`.
- For editors this almost never matches (they have no contacts), which acts as a hard fallback to empty results even if a caller forgets `blockEditorAccess()`.

**Per-account guard — `canAccessGmailAccount(userId, role, accountId)`** — convenience check before send/sync/modify operations.

**Hard gates (throw on violation):**
- `requireAdmin(role)` → throws `'ADMIN_REQUIRED'`.
- `blockEditorAccess(role)` → throws `'EDITOR_FORBIDDEN'`. Use to guard every sales/CRM surface.

**Why it's layered, not bolted on:**
1. `proxy.ts` validates IP + session cookie before any handler runs.
2. `ensureAuthenticated()` (in `src/lib/safe-action.ts`) reads the role from the cookie at the top of every server action.
3. `blockEditorAccess` / `requireAdmin` throw if the role is wrong.
4. `getAccessibleGmailAccountIds` + `getOwnerFilter` constrain the SQL.

Breaking step 4 leaks data across users; breaking step 1 or 2 leaks to unauthenticated visitors. All four layers must stay intact.

### Login Methods
1. **Google OAuth** (`/api/auth/crm/google` → callback) — CSRF state (timing-safe) → user must exist OR have a pending invitation.
2. **Email + Password** (`POST /api/auth/login`) — bcrypt verify → session.
3. **Invitation** (`/invite/accept?token=…`) — 7-day token → creates user with invited role → auto-assigns Gmail accounts.

---

## 13. RBAC & Roles

### Roles (3 active + 1 legacy)

| Role | DB Status | Access |
|------|-----------|--------|
| **ADMIN** | Prisma enum | Full access |
| **ACCOUNT_MANAGER** | Legacy string (not in Prisma enum) | Treated as ADMIN |
| **SALES** | Prisma enum | Only assigned Gmail accounts + own contacts/projects/campaigns |
| **VIDEO_EDITOR** | Legacy string (not in Prisma enum) | Only `edit_projects` rows. No Gmail / Contact / Campaign access |

> ⚠ The Prisma `Role` enum only has `ADMIN` and `SALES`. `ACCOUNT_MANAGER` and `VIDEO_EDITOR` are DB strings the code recognizes but the schema does not enforce. Migrations must not break these values.

### VIDEO_EDITOR allowed paths
`/dashboard`, `/projects` — everything else redirects to `/dashboard` via `blockEditorAccess()`. Profile editing flows through the AccountSettingsModal opened by the sidebar profile pill, same as every other role.

---

## 13a. Design System & Interaction Model

> **CSS lives in one file: `app/globals.css` (~9 400 lines, oklch tokens, `[data-theme='light']` overrides).** No Tailwind, no CSS-in-JS for product surfaces (the few `style jsx` blocks are legacy and being phased out).

### Auto theme (no toggle)
- Inline `<head>` script in `app/layout.tsx` reads `window.matchMedia('(prefers-color-scheme: dark)')`, sets `data-theme="light"` on `<html>` + `<body>` when the OS prefers light, and listens to `matchMedia('change')` so flipping Windows / macOS dark mode flips the app live without a refresh.
- The legacy `unibox_theme` localStorage key is removed on boot.
- The Sidebar Theme toggle button was removed (commit `ab6c1d1`).

### Glassmorphism cards (`/accounts`)
- Card class: `.acct-glass-card` (account cards). Translucent surface (`color-mix(in oklab, var(--shell) 70%, transparent)` so a backdrop blur has something to peek through).
- **Backdrop blur is applied via the inline `style` prop** on the card element — `backdropFilter: 'blur(18px) saturate(160%)'` plus `WebkitBackdropFilter`. This is a deliberate workaround: Turbopack's CSS pipeline strips the `backdrop-filter` declaration from `globals.css` entirely (verified via `getComputedStyle` returning `none` even with the rule present). Inline-style bypasses the bundler.
- **Hairline edge** = `1px @ 6 % alpha border` + a `0 0 0 0.5px` subpixel `box-shadow` ring. True 0.5 px borders collapse on standard displays; the layered ring + low-alpha border reads as a hairline on retina without disappearing on 1× screens.
- **Hover = "Lift & Glow"** — `transform: translateY(-4px)` + a layered purple ambient shadow (`rgba(107, 92, 246, 0.10)` at the spreads `0 20px 25px -5px` and `0 8px 10px -6px`) plus a complementary purple-tinted border. Smooth `0.3s ease` transition. `prefers-reduced-motion: reduce` kills the transform.
- **Grid** = `repeat(auto-fill, minmax(320px, 1fr))` with 28 px gap and 28 px outer padding so the lift never crashes into a neighbour.

### Kebab menu (portaled)
- Per-card ⋮ menus are rendered via `createPortal()` to `<body>` with `position: fixed` and `z-index: 1000`. Coords come from `getBoundingClientRect()` on the trigger button (refs in a `Map<string, HTMLButtonElement>`). Menu auto-closes on outside `mousedown`, Escape, document scroll (capture phase), and window resize.
- Pre-portal, the menu was clipped by sibling cards' stacking contexts (commit `9e1520f` fix).

### Topbar avatar
- `app/components/TopbarUserBadge.tsx` — 32 px circle in the right slot of `GlobalTopbar`. Renders the user's profile photo (`unibox_user_avatar` in localStorage) or a clean Inter initials disc fallback. Hydrates from the same localStorage keys the Sidebar profile pill populates so there's no extra DB roundtrip on mount.
- Click dispatches `unibox:open-account-settings`; the Sidebar listens and opens its `AccountSettingsModal` so the modal stays a single source of truth.

### Account hero (stat pills + secondary toolbar)
- `.acct-stat-pills` — pill row above the grid: Total / Live / (Syncing) / (Paused) / Issues. The Syncing + Paused pills auto-render only when count > 0 so a healthy fleet stays uncluttered. Tabular-nums numerics, uppercase 10.5 px labels.
- `.acct-secondary-toolbar` — bordered pill-rail grouping bulk maintenance actions (Sync all · Renew watches · Sync profiles · Push to Gmail · | · Check health) with a vertical divider before the diagnostic action so admins read it as "operate vs. inspect". The single primary `+ Add Account` lives in the topbar above.

### Trust pill (Technical Health)
- `.acct-tech-trust` — single pill in the collapsed `<details>` summary of every card. Computed from `dnsMap`: `✓ Trusted` / `✓ Provider-managed` / `Checking…` / `⚠ DNS issues`. No click required to read the verdict; click expands to the per-record SPF / DKIM / DMARC pills + push-watch row + Re-check button.

### Login form
- Theme-aware via design tokens (`var(--ink)` text, `var(--surface)` bg, `var(--border-color)` border).
- Lucide-react `Eye` / `EyeOff` toggle on the password field.
- `:-webkit-autofill` override sets `-webkit-text-fill-color: var(--ink)` and a `1000px` inset bg matching `var(--surface)` — kills the white-on-white autofill flash that was the actual root cause of the "invisible text in dark mode" report.

---

## 14. Database Schema

PostgreSQL via Supabase. Two connection strings: `DATABASE_URL` (pooled/PgBouncer — runtime) and `DIRECT_URL` (direct — migrations).

### Prisma Models (22)

| Model | Table | Purpose |
|-------|-------|---------|
| `User` | `users` | Auth + role + avatar |
| `Contact` | `contacts` | Lead/client with pipeline stage, lead score, follow-up state |
| `GmailAccount` | `gmail_accounts` | OAuth tokens, sync state, health, warmup, daily limits |
| `Invitation` | `invitations` | Team invites (7-day token, assigned Gmail IDs) |
| `UserGmailAssignment` | `user_gmail_assignments` | SALES → GmailAccount pivot |
| `EmailThread` | `email_threads` | Gmail thread grouping |
| `EmailMessage` | `email_messages` | Individual messages (open/click tracking) |
| `Project` | `projects` | Sales projects — revenue, paid status |
| `ActivityLog` | `activity_logs` | Audit trail for contacts/projects |
| `IgnoredSender` | `ignored_senders` | Sync block-list |
| `Campaign` | `campaigns` | Outreach campaigns |
| `CampaignStep` | `campaign_steps` | Sequential steps + subsequence triggers |
| `CampaignVariant` | `campaign_variants` | A/B testing (subject + body) |
| `CampaignContact` | `campaign_contacts` | Enrollment + status |
| `CampaignEmail` | `campaign_emails` | Individual sends within campaigns |
| `Unsubscribe` | `unsubscribes` | Unsubscribe tracking |
| `CampaignAnalytics` | `campaign_analytics` | Daily aggregates |
| `WebhookEvent` | `webhook_events` | Gmail Pub/Sub events with retry state |
| `CampaignSendQueue` | `campaign_send_queue` | Rate-limited send queue with stagger |
| `EmailTemplate` | `email_templates` | Mined + hand-written templates |
| `EditProject` | `edit_projects` | Notion-style video editing tracker |
| `ProjectComment` | `project_comments` | Comments on edit projects |

### Prisma Enums (24)
`Role`, `InvitationStatus`, `UserStatus`, `GmailAccountStatus`, `ConnectionMethod`, `WatchStatus`, `PipelineStage`, `EmailDirection`, `EmailType`, `PaidStatus`, `FinalReviewStatus`, `Priority`, `ContactType`, `CampaignGoal`, `CampaignStatus`, `CampaignContactStatus`, `CampaignStoppedReason`, `SubsequenceTrigger`, `WebhookEventStatus`, `SendQueueStatus`, `TemplateCategory`, `ProjectProgress`, `ProjectPriority`, `AMReview`.

### Raw Tables (not modeled in Prisma)
Queried directly via Supabase client:
- **`jarvis_feedback`** — Jarvis suggestion vs actual reply + similarity score.
- **`jarvis_knowledge`** — Q&A mined from historical emails (agent_verified, success_score, price_mentioned).
- **`scrape_jobs`** — one row per scrape run (user_id, status `RUNNING|COMPLETED|FAILED`, total_urls, processed_urls, error_count, created_at, completed_at).
- **`scrape_results`** — per-URL result (job_id, url, domain, name, email, phone, location, pricing, social, score, score_label, status `PENDING|APPROVED|REJECTED`, contact_id, error_msg).

### Relationships (simplified)

```
User ─┬─→ GmailAccount (1:N, createdBy)
      ├─→ Contact (1:N, accountManager)
      ├─→ Project (1:N, accountManager)
      ├─→ EditProject (1:N, user)
      ├─→ UserGmailAssignment (1:N)
      ├─→ Campaign (1:N, createdBy)
      └─→ EmailTemplate (1:N, createdBy)

Contact ─┬─→ EmailMessage (1:N)
         ├─→ Project (1:N, client)
         ├─→ CampaignContact (1:N)
         ├─→ CampaignEmail (1:N)
         └─→ ActivityLog (1:N)

GmailAccount ─┬─→ EmailMessage (1:N)
              ├─→ UserGmailAssignment (1:N)
              ├─→ Campaign (1:N, sendingAccount)
              └─→ Contact (1:N, lastGmailAccount)

EmailThread ─→ EmailMessage (1:N)

EmailMessage ─┬─→ Project (1:N, sourceEmail)
              └─→ CampaignEmail (1:N)

Campaign ─┬─→ CampaignStep (1:N) ─┬─→ CampaignVariant (1:N)
          │                        ├─→ CampaignEmail (1:N)
          │                        └─→ CampaignStep (self-ref, subsequence)
          ├─→ CampaignContact (1:N)
          ├─→ CampaignEmail (1:N)
          ├─→ CampaignSendQueue (1:N)
          └─→ CampaignAnalytics (1:N)

EditProject ─→ ProjectComment (1:N)
```

### Key Indexes
- `email_messages(gmail_account_id, direction, sent_at DESC)` — inbox queries.
- `email_messages(thread_id)` — thread lookups.
- `contacts(account_manager_id)`, `contacts(is_lead)`, `contacts(is_client)`, `contacts(last_email_at)`.
- `edit_projects(user_id)`, `edit_projects(progress)`, `edit_projects(created_at)`.

---

## 15. External Integrations

| Service | Purpose | Touchpoint |
|---------|---------|------------|
| **Supabase** | PostgreSQL + realtime + RPC | `src/lib/supabase*.ts` |
| **Gmail API + OAuth2 + Pub/Sub** | Sync, send, push notifications | `googleAuthService`, `gmailSyncService`, `gmailSenderService`, `/api/webhooks/gmail` |
| **Upstash QStash** | Cron + queue (signature-verified) | `lib/qstash.ts` + all `/api/cron/*` |
| **Resend** | Transactional email (invitations) from `noreply@texasbrains.com` | `inviteActions.ts` |
| **Groq** | Primary LLM — `llama-3.3-70b-versatile` (chat/agent/mining) + `llama-3.1-8b-instant` (briefing) | `jarvisService`, `dailyBriefingService`, `templateMiningService`, `aiSummaryService` |
| **Google Gemini** | LLM fallback when Groq fails | `aiSummaryService.ts` |
| **ElevenLabs** | TTS (`eleven_multilingual_v2`, voice `Sarah`/`EXAVITQu4vr4xnSDxMaL`) — falls back to browser `SpeechSynthesis` | `/api/jarvis/tts` |
| **Vercel** | Hosting (IAD1) + serverless + Vercel Cron fallback | Platform |

---

## 16. Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Supabase pooled connection |
| `DIRECT_URL` | Supabase direct (migrations) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (never expose) |
| `ENCRYPTION_KEY` | 64-char hex — OAuth/IMAP token encryption |
| `NEXTAUTH_SECRET` | Session cookie encryption |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google OAuth |
| `GOOGLE_PUBSUB_TOPIC` | Gmail push notifications topic |
| `NEXT_PUBLIC_APP_URL` | Base URL for tracking pixels/links |
| `CRON_SECRET` | Vercel Cron bearer token |
| `RESEND_API_KEY` | Resend (invites) |
| `QSTASH_TOKEN` / `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | QStash |
| `GROQ_API_KEY` | Jarvis / briefing / template mining |
| `GEMINI_API_KEY` | AI fallback |
| `ELEVENLABS_API_KEY` | Jarvis TTS (optional — browser TTS fallback) |

> ⚠ `.env.example` is **incomplete** — it does not include `GROQ_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, or the `QSTASH_*` keys. Production deployments read them directly from Vercel env.

---

## 17. Non-Obvious Patterns (read before editing)

1. **`middleware.ts` is now `proxy.ts`** (commit `038a3bb`, April 2026) — Next.js 16 convention. The file exports `proxy()` not `middleware()`. Don't recreate `middleware.ts`.
2. **`server-only` import is required** on every file in `src/services/` to prevent accidental client-bundle leaks.
3. **Turbopack is default** in Next 16 — `next.config.js` has an empty `turbopack: {}`. Heavy packages (`@prisma/client`, `googleapis`, `nodemailer`, `imapflow`, `mailparser`) are in `serverExternalPackages`.
4. **Two role-check layers by design:**
   - `ensureAuthenticated()` in server actions → cookie role (fast).
   - `roleGate.ts` in server-component pages → fresh DB role (safe after role change).
5. **`getAccessibleGmailAccountIds()` is request-memoized** via React `cache()`.
6. **`users` table role column carries four values** but the Prisma enum only holds two — code paths must handle all four.
7. **Jarvis system prompt embeds live business data** — update `JARVIS_SYSTEM_PROMPT` in `jarvisService.ts` when totals shift.
8. **`console.log` is stripped in production** (keeps `error`/`warn`) via `next.config.js` compiler.
9. **ESLint is broken on Next 16** — `npm run lint` exits with an error. Vercel's `buildCommand` is `next build || true`, which masks failures.
10. **Sidebar polls every 60 s** for action-queue badge counts — even idle pages trigger this.
11. **`jarvis_feedback` and `jarvis_knowledge` are raw Supabase tables** — not modeled in Prisma.
12. **Edit Projects components live at repo root** (`components/projects/`) not `app/components/` — consuming page is `app/projects/page.tsx`. Same for helpers in `lib/projects/`.
13. **A second cron layer exists** — `vercel.json` cron + `scripts/setup-qstash-schedules.ts` are both live. The QStash script deletes and recreates schedules on each run.

---

## 18. Known Dead / Stale Files (as of 2026-04-21 audit)

Candidates for removal (verified with repo-wide grep — zero imports outside this doc and `CLAUDE.md`):

**Orphan action files** (no external imports):
- `src/actions/automationActions.ts`
- `src/actions/relationshipActions.ts`

**Orphan service** (no external imports):
- `src/services/pipelineLogic.ts`

**Orphan components** (no external imports):
- `app/components/RevenueChart.tsx`
- `app/components/RevenueBarChart.tsx`
- `app/components/OnboardingWizard.tsx`
- `app/components/JarvisDailyBriefing.tsx` *(listed as active in CLAUDE.md — actually unused)*

**Root-level detritus:**
- `build.log`, `sync_debug.log`, `prisma.config.ts.bak`

**Stale markdown** (drafts + one-off reports from Mar/Apr 2026):
- `analytics_design_doc.md`, `analytics_detailed_plan.md`, `analytics_final_plan.md`, `analytics_native_plan.md`, `premium_analytics_final_plan.md`, `ultimate_analytics_roadmap.md`, `unibox_comprehensive_doc.md`
- `ANALYTICS_AUDIT_REPORT.md`, `BUG_AUDIT_REPORT.md`, `CLIENT_EMAIL_BATCH1_REVIEW.md`, `DOMAIN_ACCOUNTS_REPORT.md`, `EMAIL_SYNC_FIX_REPORT.md`, `GMAIL_HEALTH_REPORT.md`, `MOBILE_RESPONSIVE_REPORT.md`, `UNIBOX_AUDIT_REPORT.md`, `UNIBOX_BRIEF.md`
- Older full-doc duplicates (keep only if still referenced): `DOCUMENTATION.md` (89 KB), `UNIBOX_DOCUMENTATION.md` (55 KB)

---

## 19. Immediate Roadmap

1. **Fix lint** — migrate to a standalone ESLint config compatible with Next.js 16.
2. **Performance** — cut initial hydration + Jarvis briefing latency (~5 s). Profile `app/dashboard/PageClient.tsx` + `jarvisActions#getDailyBriefingAction`.
3. **Scraper scalability** — move `leadScraperService.ts` to a worker/queue.
4. **Schema hardening** — migrate `ACCOUNT_MANAGER` + `VIDEO_EDITOR` into the Prisma `Role` enum. Model `jarvis_feedback` + `jarvis_knowledge` in Prisma.
5. **Remove `buildCommand: next build || true`** once lint + build are green.
6. **Delete orphan files** (see §18).
7. **Rewire `JarvisDailyBriefing` into dashboard** or delete it — right now `dashboard/PageClient.tsx` calls `getDailyBriefingAction` but does not import the component.

---

_Last audited: **2026-05-05** — Luxury UI overhaul pass. Added §4.11 Sender Identity & Deliverability (CID inline avatar, identity force-sync, BIMI, MIME-proofing), §4.12 Global Search (centered topbar + recent search history), §13a Design System & Interaction Model (auto theme, glassmorphism cards, lift-and-glow hover, portaled kebab, topbar user badge, account hero, trust pill), updated /accounts to the unified DNS + Persona surface, removed the deleted /settings route, refreshed §12 cookie crypto to AES-256-GCM + hardening notes (XFF reflected-XSS escape, hashed invite tokens, OIDC JWT verification on Gmail webhook, contact ownership chokepoint, paid-project AM lock). Previous: 2026-04-21 — full ground-up rewrite (commit `038a3bb`). Identity scoping + Scraper→Campaign enrollment flow + raw `scrape_jobs` / `scrape_results` tables._
