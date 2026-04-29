---

## Claude Code — Read This Every Session

You are the sole developer on this project. Never ask the user where to push, deploy, or which service to use. All URLs are defined here. Whenever the user says "live karo", "deploy karo", "push karo", or "update karo" — follow the deploy steps below without asking any questions.

### Deploy Steps (run in this exact order):

1. `npx tsc --noEmit` → fix any TypeScript errors first
2. `npm run lint` → fix any lint errors (currently broken under Next.js 16 — see Roadmap)
3. `npm run build` → fix any build errors
4. `git add .`
5. `git commit -m "describe what changed"`
6. `git push origin main`
7. Vercel auto-deploys automatically
8. Tell user: "Live ho gaya → https://txb-unibox.vercel.app"

### Live Service URLs:

- GitHub: https://github.com/designbyhasnain/unibox
- Vercel Live: https://txb-unibox.vercel.app
- Vercel Dashboard: https://vercel.com/designsbyhasnain-6046s-projects/unibox
- Vercel Env Vars: https://vercel.com/designsbyhasnain-6046s-projects/unibox/settings/environment-variables
- Supabase URL: https://uksnpmelsxryycnsokxc.supabase.co
- Supabase Dashboard: https://supabase.com/dashboard/project/uksnpmelsxryycnsokxc
- Resend: https://resend.com/overview
- Upstash QStash: https://console.upstash.com/qstash

---

## Self-Updating Rule (MANDATORY)

**This file is the Ultimate Source of Truth. Keep it current.**

Every time I (Claude) do any of the following, I MUST update the relevant section of this file in the same commit:

| Trigger | Section to update |
|---------|-------------------|
| Add a new page under `app/` | **File Structure → Pages** |
| Add a new API route | **File Structure → API Routes** |
| Add a new server action file | **File Structure → Server Actions** |
| Add a new service file | **File Structure → Services** |
| Add/rename/remove a Prisma model or enum | **Database → Models / Enums** |
| Add a new cron job or QStash schedule | **Background Jobs** |
| Add a new npm dependency or bump major version | **Tech Stack** |
| Add a new role or change RBAC rules | **RBAC & Roles** |
| Add a new AI model / external service (Groq, ElevenLabs, etc.) | **External Integrations** |
| Change `proxy.ts`, `auth.ts`, `roleGate.ts`, or `accessControl.ts` | **Auth & Security** |
| Change sidebar navigation groups | **Core Modules → Sidebar Groups** |
| Move/rename a critical file | **Critical Files (Do Not Break)** |
| Discover a surprising pattern or hidden feature | **Non-Obvious Patterns** |

**If I discover that this file is out of date during a task, I fix it before continuing — not after.**

When I update this file, I also update the "Last audited" date at the bottom.

---

# UNIBOX (TXB-UNIBOX) — Master Memory File

> **Ultimate Source of Truth.** Rewritten from scratch on 2026-04-20 via full ground-up codebase audit.
> Covers every route, component, service, DB model, role, cron, and integration currently in the app.

Unibox is a **high-performance, AI-driven, multi-account email CRM + outreach platform** built for Wedits (a wedding-video editing agency based in Pakistan). It unifies 77+ Gmail and manual IMAP/SMTP accounts into a single inbox, tracks leads through a visual sales pipeline, runs automated cold-outreach campaigns with A/B testing, and layers an AI assistant ("**Jarvis**") that speaks, drafts replies, plans campaigns, and briefs the team every morning.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | **Next.js 16** (App Router, Turbopack by default) | 16.1.1 |
| Language | TypeScript (strict mode) | 5.9.3 |
| UI Library | React | 19.2.4 |
| Database | PostgreSQL via Supabase (shared DB, local = prod) | — |
| ORM | Prisma | 6.19.2 |
| Hosting | Vercel (IAD1 region) | — |
| Styling | **Vanilla CSS only** (`app/globals.css`, ~58 KB) — no Tailwind | — |
| Icons | lucide-react + inline 15×15 SVGs in Sidebar | 0.575.0 |
| Charts | Recharts | 3.8.0 |
| Drag & Drop | @dnd-kit/core + sortable | 6.3.1 / 10.0.0 |
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
| Session Encryption | AES-256-CBC (custom, `src/lib/auth.ts`) | — |
| OAuth Token Encryption | AES-256-GCM (`src/utils/encryption.ts`) | — |
| Password Hashing | bcryptjs (12 rounds) | 3.0.3 |
| Linting | ESLint + eslint-config-next (**currently broken on Next 16**) | 9.27.0 |
| Formatting | Prettier | 3.8.1 |

---

## Commands

```bash
npm run dev              # Next.js dev server (Turbopack)
npm run build            # Production build
npm run start            # Start built app
npm run lint             # next lint — BROKEN on Next 16, needs migration
npm run format           # Prettier write
npm run format:check     # Prettier check
npx tsc --noEmit         # Type-check (RUN BEFORE EVERY COMMIT)
npx prisma generate      # Regenerate Prisma client (also runs on postinstall)
npx prisma migrate dev --name <name>  # Create + apply migration
npx prisma db push       # Push schema without migration (dev only)
```

---

## Core Modules (as of April 2026)

### 1. AI Engine — Jarvis
The marquee feature. A multi-surface AI executive layer built on **Groq** (Llama 3.3 70B + 3.1 8B) with **ElevenLabs** TTS.

| Surface | File | What it does |
|---------|------|--------------|
| **Dashboard Daily Briefing** | `app/components/JarvisDailyBriefing.tsx` → `src/services/dailyBriefingService.ts` | Role-aware 3-4 bullet summary of the last 24h. Three separate code paths (ADMIN, SALES, VIDEO_EDITOR). Regenerate + 5 snapshot stats. |
| **Voice Orb** | `app/components/JarvisVoiceOrb.tsx` | Floating orb with 4 phases (idle/listening/thinking/speaking). Browser SpeechRecognition → `/api/jarvis` → ElevenLabs TTS (voice: Sarah). |
| **In-thread Reply Suggestions** | `app/components/JarvisSuggestionBox.tsx` → `src/actions/jarvisActions.ts#suggestReplyAction` → `src/services/replySuggestionService.ts` | Drafts a reply in thread based on conversation history + contact profile. |
| **Jarvis Page (Chat)** | `app/jarvis/page.tsx` | Full-page chat interface. Tool-calling (18 tools in `JARVIS_TOOLS`). |
| **Jarvis Agent (Autonomous)** | `app/api/jarvis/agent/route.ts` → `src/services/jarvisAgentService.ts` | Goal-driven autonomous agent: plans → executes → evaluates → reports. Max 10 steps per plan. |
| **TTS** | `app/api/jarvis/tts/route.ts` | ElevenLabs `eleven_multilingual_v2`. Falls back to browser TTS if `ELEVENLABS_API_KEY` missing. |
| **Feedback Loop** | `jarvisActions.ts#logJarvisFeedbackAction` → `jarvis_feedback` table | Logs when agent sends a different reply than Jarvis suggested, with similarity score. |
| **Knowledge Base** | `jarvis_knowledge` table + `scripts/mine-jarvis-knowledge.ts` | Q&A mined from historical emails. Admin verifies/corrects via `verifyKnowledgeAction`. |

Jarvis tools (in `src/services/jarvisService.ts`, exposed to the LLM):
`search_contacts`, `get_contact_detail`, `get_pipeline_stats`, `get_revenue_analytics`, `get_region_breakdown`, `get_top_clients`, `get_unpaid_clients`, `get_contacts_by_stage`, `get_contacts_by_region`, `get_am_performance`, `get_email_accounts`, `draft_email`, `create_campaign`, `launch_campaign`, `get_campaign_stats`, `get_financial_health`, `get_resource_utilization`, `get_morning_briefing`, `assess_project_decision`.

### 2. CRM & Sales Pipeline
Visual pipeline with 7 stages. Auto-transitions on email events.

- **Pages:** `app/clients/page.tsx`, `app/clients/[id]/page.tsx`, `app/opportunities/page.tsx`, `app/dashboard/page.tsx`.
- **Stages:** `app/constants/stages.ts` — `COLD_LEAD → CONTACTED → WARM_LEAD → LEAD → OFFER_ACCEPTED → CLOSED` (+ `NOT_INTERESTED` terminal).
- **Auto-transitions:** `src/services/pipelineLogic.ts`, `src/services/emailSyncLogic.ts`.

### 3. Unified Inbox
77+ connected accounts in a single view.

- **Main inbox:** `app/page.tsx` + `app/hooks/useMailbox.ts` (useReducer, 2-tier cache memory + localStorage).
- **Real-time:** `app/hooks/useMailbox.ts` subscribes to Supabase changes.
- **Threaded UI:** `app/components/InboxComponents.tsx` (EmailRow, EmailDetail, PaginationControls, ToastStack).
- **Compose/Reply:** `app/components/ComposeModal.tsx`, `app/components/InlineReply.tsx`.
- **Sent view:** `app/sent/page.tsx`.
- **Gmail sync:** push (Pub/Sub) → `/api/webhooks/gmail` → `webhook_events` → 2-min cron processor. Also partial (historyId) and full sync modes in `src/services/gmailSyncService.ts`.
- **IMAP sync:** every 15 min via QStash → `/api/cron/sync-imap` → `src/services/manualEmailService.ts`. Max 5 accounts per run.

### 4. Marketing & Outreach
- **Campaigns:** `app/campaigns/page.tsx`, `app/campaigns/new/page.tsx`, `app/campaigns/[id]/page.tsx`. 3-phase processor (enqueue → send → subsequence). A/B variants. Account rotation with warmup mode. Placeholder + spintax support.
- **Lead Scraper (ADMIN only):** `app/scraper/page.tsx` → `src/actions/scraperActions.ts` → `src/services/leadScraperService.ts`. cheerio-based. Extracts name/email/phone/social, scores leads `Hot / Warm / Lukewarm / Cold` (0-100) via keyword matching.
- **Templates:** `app/templates/page.tsx`. Mined automatically every Monday 3 AM via `/api/mine-templates` (Groq Llama 3.3 70B).
- **Unsubscribe:** `/api/unsubscribe` → `unsubscribes` table.

### 5. Work / Productivity
- **Actions Queue:** `app/actions/page.tsx` → `src/actions/actionQueueActions.ts`. Prioritized action list across 5 types: `REPLY_NOW`, `FOLLOW_UP`, `WIN_BACK`, `NEW_LEAD`, `STALE`. Counts surfaced as sidebar badge on `/actions` (polls every 60 s).
- **Edit Projects (Notion-style):** `app/projects/page.tsx` → `projectActions.ts`. Full editorial tracking — progress, due dates, editors, AM review, comments.
- **My Projects:** `app/my-projects/page.tsx` — user-scoped project view.
- **Link Projects:** `app/link-projects/page.tsx` — link contacts to projects.

### 6. Administration
- **Team:** `app/team/page.tsx` → invite/revoke/assign/role-change/deactivate via `inviteActions.ts` + `userManagementActions.ts`.
- **Intelligence:** `app/intelligence/page.tsx` — Jarvis audit card UI (rewritten April 2026).
- **Finance:** `app/finance/page.tsx` → `financeActions.ts` + `revenueActions.ts`.
- **Data Health:** `app/data-health/page.tsx` → `dataHealthActions.ts`. Admin-only data integrity checks.
- **Accounts:** `app/accounts/page.tsx` — Gmail/IMAP account management.
- **Settings:** `app/settings/page.tsx`.
- **Analytics:** `app/analytics/page.tsx` — charts, campaign A/B, revenue trends.

### Sidebar Groups (`app/components/Sidebar.tsx`)

The sidebar is **role-aware** and splits navigation into logical groups. Badges come from live action-queue counts.

| Group | Items | Visible to |
|-------|-------|------------|
| **CRM** | Actions, Inbox, Dashboard, Clients (`/My Clients` for SALES), My Projects, Accounts (admin-only), Opportunities (`/My Pipeline` for SALES) | ADMIN + SALES |
| **Marketing** | Campaigns, Scraper (admin-only), Templates, Analytics | ADMIN + SALES |
| **Work** (ADMIN) / **Assistant** (SALES) | Edit Projects (admin-only), Link Projects (admin-only), Jarvis AI | ADMIN + SALES |
| **Admin** | Intelligence, Finance, Data Health, Team | ADMIN / ACCOUNT_MANAGER only |
| **My Work** | Dashboard, My Projects | VIDEO_EDITOR only |

---

## Auth & Security

### Session Management (`src/lib/auth.ts`)
- Cookie: `unibox_session` (httpOnly, secure, sameSite: lax, 7-day expiry).
- Encryption: AES-256-CBC with random 16-byte IV. Token format: `{ivHex}:{ciphertextHex}`.
- Payload: `{ userId, email, name, role, exp }`.
- API: `createSession()`, `getSession()`, `clearSession()`.

### `proxy.ts` (replaces `middleware.ts` — Next.js 16 convention)
Two-layer guard on every request:
1. **IP whitelist** — hardcoded (no env dependency). Includes exact IPs + broad prefixes for PK ISPs (PTCL `111.88.`, `182.189.`, Jazz 4G/5G `39.32.`–`39.61.`, Nayatel `175.107.`, Telenor `119.160.`, Zong `119.73.`) plus IPv6 ranges and `192.168.` LAN. Non-matching IPs get a styled 403 HTML page.
2. **Session check** — validates cookie format (IV = 32 hex, ciphertext ≥ 16 hex). Malformed → redirect to `/login?callbackUrl=…`.
3. **Public paths** (no session needed): `/login`, `/invite`. The `matcher` excludes `_next/*`, `favicon.ico`, `/api/*`, and static files — API routes protect themselves via `getSession()`.

### `src/lib/roleGate.ts` — fresh-DB role check
Used by server components (`page.tsx` wrappers) that need a non-stale role straight from the DB rather than the signed cookie.
- `getFreshSession()` — session + latest role from `users` table.
- `blockEditorAccess(redirectTo)` — throws VIDEO_EDITOR users back to `/dashboard`.
- `requireAdminAccess(redirectTo)` — gates ADMIN-only pages (Data Health, Scraper, etc.).

### `src/lib/safe-action.ts` — cookie-role gate for server actions
- `ensureAuthenticated()` — reads role from cookie (fast, no DB hit). Every server action calls this first.

### `src/utils/accessControl.ts` — identity-based data scoping
- `isAdmin(role)` — ADMIN or ACCOUNT_MANAGER.
- `isSales(role)`, `isEditor(role)`.
- `getAccessibleGmailAccountIds(userId, role)` — `'ALL'` for admins, `[]` for editors, assigned IDs for SALES. **Cached per request via React `cache()`**.
- `canAccessGmailAccount()`, `getOwnerFilter()`, `requireAdmin()`, `blockEditorAccess()`.

### Login Methods
1. **Google OAuth** — `/api/auth/crm/google` → Google consent → `/api/auth/crm/google/callback` → CSRF state check (timing-safe) → user must exist OR have a pending invitation → create session.
2. **Email + Password** — `POST /api/auth/login` → bcrypt verify → session.
3. **Invitation Acceptance** — `/invite/accept?token=…` → 7-day token → creates user with invited role → auto-assigns Gmail accounts.

### Token Encryption (`src/utils/encryption.ts`)
AES-256-GCM with `ENCRYPTION_KEY` (64-char hex) for Gmail OAuth tokens and IMAP app-passwords at rest.

---

## RBAC & Roles

### Roles (3 distinct + 1 legacy)

| Role | DB-level | Access |
|------|----------|--------|
| **ADMIN** | Prisma enum | Full access to everything |
| **ACCOUNT_MANAGER** | Legacy (stored as string, treated identically to ADMIN) | Full access |
| **SALES** | Prisma enum | Only assigned Gmail accounts + own contacts/projects/campaigns |
| **VIDEO_EDITOR** | Stored as string (not in Prisma enum yet) | Only their `edit_projects` rows. No Gmail, Contact, or Campaign access. |

> ⚠ The Prisma `Role` enum currently has only `ADMIN` and `SALES`. `ACCOUNT_MANAGER` and `VIDEO_EDITOR` are DB strings the app code recognizes but are not enforced at the schema level. If you add migrations, be careful not to break these legacy values.

### Enforcement Points
1. `proxy.ts` — IP + session cookie validation on every request.
2. `ensureAuthenticated()` — called by every server action.
3. `blockEditorAccess()` / `requireAdminAccess()` — server-component page gates.
4. `getAccessibleGmailAccountIds()` — RBAC-filtered data queries.
5. `Sidebar.tsx` — hides admin-only + editor-only items client-side.

### VIDEO_EDITOR Allowed Paths
`/dashboard`, `/projects` — everything else redirects back to `/dashboard` via `blockEditorAccess()`.

---

## Database

PostgreSQL via Supabase. Two connection strings:
- `DATABASE_URL` — pooled (PgBouncer) for runtime.
- `DIRECT_URL` — direct connection for Prisma migrations.

### Prisma Models (22)

| Model | Table | Purpose |
|-------|-------|---------|
| **User** | `users` | Auth + role + avatar |
| **Contact** | `contacts` | Lead/client with pipeline stage, lead score, follow-up state |
| **GmailAccount** | `gmail_accounts` | Gmail/IMAP account: OAuth tokens, sync state, health, warmup, daily limits, **persona (`display_name` + `profile_image`) shown in From header** |
| **Invitation** | `invitations` | Team invites (7-day token, assigned Gmail IDs) |
| **UserGmailAssignment** | `user_gmail_assignments` | SALES → GmailAccount pivot |
| **EmailThread** | `email_threads` | Gmail thread grouping |
| **EmailMessage** | `email_messages` | Individual messages (open/click tracking) |
| **Project** | `projects` | Sales projects — revenue, paid status |
| **ActivityLog** | `activity_logs` | Audit trail for contacts/projects |
| **IgnoredSender** | `ignored_senders` | Sync block-list |
| **Campaign** | `campaigns` | Outreach campaigns |
| **CampaignStep** | `campaign_steps` | Sequential steps with delay_days + subsequence triggers |
| **CampaignVariant** | `campaign_variants` | A/B testing (subject + body) |
| **CampaignContact** | `campaign_contacts` | Enrollment + status |
| **CampaignEmail** | `campaign_emails` | Individual sends within campaigns |
| **Unsubscribe** | `unsubscribes` | Unsubscribe tracking |
| **CampaignAnalytics** | `campaign_analytics` | Daily aggregates |
| **WebhookEvent** | `webhook_events` | Gmail Pub/Sub events with retry state |
| **CampaignSendQueue** | `campaign_send_queue` | Rate-limited send queue with stagger |
| **EmailTemplate** | `email_templates` | Mined + hand-written templates |
| **EditProject** | `edit_projects` | Notion-style video editing project tracker |
| **ProjectComment** | `project_comments` | Comments on edit projects |

### Enums
`Role`, `InvitationStatus`, `UserStatus`, `GmailAccountStatus`, `ConnectionMethod`, `WatchStatus`, `PipelineStage`, `EmailDirection`, `EmailType`, `PaidStatus`, `FinalReviewStatus`, `Priority`, `ContactType`, `CampaignGoal`, `CampaignStatus`, `CampaignContactStatus`, `CampaignStoppedReason`, `SubsequenceTrigger`, `WebhookEventStatus`, `SendQueueStatus`, `TemplateCategory`, `ProjectProgress`, `ProjectPriority`, `AMReview`.

### Non-Prisma (raw) Tables
These are queried directly via Supabase but not yet modeled in Prisma. **Setup SQL: `scripts/jarvis-tables.sql`** — paste into Supabase SQL editor (idempotent, safe to re-run).
- **`jarvis_knowledge`** — mined Q&A from historical emails. Cols: `id`, `category`, `client_question`, `our_reply`, `outcome`, `contact_region`, `service_type`, `price_mentioned`, `success_score` (0-1 float), `source_contact_id`, `source_thread_id`, `agent_verified`, `notes`, `created_at`, `updated_at`. Indexes: `(category, success_score DESC)`, `(agent_verified, success_score DESC)`, `(contact_region)`, `(source_contact_id)`.
- **`jarvis_feedback`** — logs Jarvis suggestion vs actual agent reply. Cols: `id`, `contact_id`, `thread_id`, `jarvis_suggestion`, `agent_reply`, `similarity_score`, `accepted`, `notes`, `created_at`.
- **`jarvis_lessons`** — anti-patterns from lost deals. Cols: `id`, `category`, `client_question`, `bad_reply`, `why_lost`, `lesson`, `contact_region`, `source_contact_id`, `created_at`. Used by `replySuggestionService.fetchRelevantLessons()` to inject "AVOID" examples into prompts.

> When adding fields to these tables, document them here and consider adding Prisma models to make the schema authoritative.

### Key Indexes
- `email_messages(gmail_account_id, direction, sent_at DESC)` — inbox queries.
- `email_messages(thread_id)` — thread lookups.
- `contacts(account_manager_id)`, `contacts(is_lead)`, `contacts(is_client)`, `contacts(last_email_at)`.
- `edit_projects(user_id)`, `edit_projects(progress)`, `edit_projects(created_at)`.

---

## File Structure

### Pages (`app/`) — 25 routes

```
app/
├── page.tsx                   # Inbox (main email interface)
├── layout.tsx                 # Root layout + FilterProvider + UIProvider + UndoToastProvider + ClientLayout
├── globals.css                # ~58 KB of vanilla CSS (oklch tokens, dark mode)
├── login/page.tsx             # Login (Google OAuth + email/password)
├── invite/accept/page.tsx     # Invitation acceptance
├── dashboard/page.tsx         # Role-aware dashboard (JarvisDailyBriefing + metrics)
├── actions/page.tsx           # Action queue (prioritized work list) — non-editor
├── clients/page.tsx
├── clients/[id]/page.tsx      # Individual contact detail
├── accounts/page.tsx          # Gmail/IMAP management (admin)
├── campaigns/page.tsx
├── campaigns/new/page.tsx
├── campaigns/[id]/page.tsx
├── projects/page.tsx          # Edit projects (admin)
├── my-projects/page.tsx       # User-scoped projects
├── link-projects/page.tsx     # Link contacts to projects (admin)
├── templates/page.tsx
├── analytics/page.tsx
├── sent/page.tsx
├── opportunities/page.tsx     # Pipeline view
├── intelligence/page.tsx      # Jarvis audit (admin)
├── finance/page.tsx           # Revenue + collections (admin)
├── data-health/page.tsx       # Data integrity checks (admin)
├── team/page.tsx              # Team management (admin)
├── scraper/page.tsx           # Lead scraper (admin)
├── jarvis/page.tsx            # Jarvis chat
└── settings/page.tsx
```

### Server Actions (`src/actions/`) — 23 files

| File | Purpose |
|------|---------|
| `emailActions.ts` | Send, fetch, search, read/unread, delete |
| `contactDetailActions.ts` | Contact CRUD, pipeline stage transitions |
| `campaignActions.ts` | Campaign CRUD, launch, stop, enrollment |
| `accountActions.ts` | Gmail/IMAP connect/disconnect, sync controls, **persona (upload image to Supabase `avatars` bucket, set display name, bulk apply)** |
| `authActions.ts` | Current user, logout |
| `userManagementActions.ts` | ADMIN: list users, roles, deactivate |
| `inviteActions.ts` | ADMIN: send/revoke/resend invites via Resend |
| `projectActions.ts` | Project CRUD, status |
| `templateActions.ts` | Email template CRUD |
| `analyticsActions.ts` | Dashboard analytics |
| `dashboardActions.ts` | Sales rep dashboard data |
| `financeActions.ts` | Revenue + payment tracking |
| `intelligenceActions.ts` | AI audit cards |
| `clientActions.ts` | Client queries |
| `importActions.ts` | CSV import |
| `automationActions.ts` | Automation settings |
| `relationshipActions.ts` | Contact relationship data |
| `revenueActions.ts` | Revenue calcs |
| `summaryActions.ts` | Overview/summary |
| `actionQueueActions.ts` | **NEW:** Prioritized action queue (REPLY_NOW / FOLLOW_UP / WIN_BACK / NEW_LEAD / STALE) |
| `dataHealthActions.ts` | **NEW:** Data integrity checks (admin) |
| `jarvisActions.ts` | **NEW:** Daily briefing, reply suggestions, feedback log, knowledge verification |
| `scraperActions.ts` | **NEW:** Scraper jobs + results CRUD |

### Services (`src/services/`) — 23 files

| File | Purpose |
|------|---------|
| `gmailSyncService.ts` | Full + history sync, watch registration |
| `emailSyncLogic.ts` | Classification, auto-contact creation, pipeline transitions |
| `gmailSenderService.ts` | MIME build, Gmail send, token refresh. **From header uses `formatFromHeader()` so `display_name` appears alongside the address when set.** |
| `manualEmailService.ts` | IMAP/SMTP for non-Gmail. **Passes `{ name, address }` to nodemailer when persona `display_name` is set.** |
| `trackingService.ts` | Open pixel + link rewriting |
| `emailClassificationService.ts` | Email type taxonomy |
| `campaignProcessorService.ts` | Phase 1: enqueue |
| `sendQueueProcessorService.ts` | Phase 2: send + advance |
| `salesAutomationService.ts` | Follow-ups, warm-lead detection, lead scoring |
| `accountHealthService.ts` | Bounce rate, health score, auto-pause |
| `accountRotationService.ts` | Round-robin, warmup mode |
| `googleAuthService.ts` | OAuth URL + callback + token storage |
| `crmAuthService.ts` | CRM OAuth flow |
| `tokenRefreshService.ts` | Token refresh, auto-recovery from ERROR |
| `watchRenewalService.ts` | Gmail Pub/Sub watch lifecycle (7-day TTL) |
| `webhookProcessorService.ts` | Retry webhook events with exponential backoff (max 5) |
| `aiSummaryService.ts` | Relationship audits (Groq + Gemini fallback) |
| `pipelineLogic.ts` | Stage transition rules |
| `jarvisService.ts` | **NEW:** Jarvis chat brain — 18 tools, system prompt with live business data |
| `jarvisAgentService.ts` | **NEW:** Autonomous goal-driven agent (plan/execute/evaluate) |
| `dailyBriefingService.ts` | **NEW:** Role-aware 24h briefing (ADMIN/SALES/VIDEO_EDITOR paths) via Groq llama-3.1-8b-instant |
| `replySuggestionService.ts` | **NEW:** In-thread reply draft generation |
| `leadScraperService.ts` | **NEW:** cheerio-based website scraper with lead scoring |
| `templateMiningService.ts` | **NEW:** Groq-based weekly template mining from sent emails |

### API Routes (`app/api/`) — 32 routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/ping` | GET | none | Health check |
| `/api/auth/login` | POST | none | Email + password login |
| `/api/auth/google/callback` | GET | session | Gmail account-connection OAuth callback (init is client-side — no separate `/api/auth/google` route) |
| `/api/auth/crm/google` | GET | none | CRM login OAuth init |
| `/api/auth/crm/google/callback` | GET | CSRF state | CRM login OAuth callback |
| `/api/auth/set-password` | POST | session | Set password for invited users |
| `/api/sync` | POST | session | Manual sync trigger |
| `/api/sync/health` | GET | session | Sync status |
| `/api/sync/poll` | GET | session | Webhook-polling fallback |
| `/api/webhooks/gmail` | POST | OIDC | Gmail Pub/Sub push |
| `/api/track` | GET | none | Open pixel |
| `/api/track/click` | GET | none | Click-through redirect |
| `/api/campaigns/process` | POST/GET | QStash/CRON_SECRET | Campaign processor (15 min) |
| `/api/cron/automations` | POST/GET | QStash/CRON_SECRET | Hourly automations |
| `/api/cron/process-webhooks` | POST/GET | QStash/CRON_SECRET | 2-min webhook retry |
| `/api/cron/renew-gmail-watches` | POST/GET | QStash/CRON_SECRET | Every 6 days |
| `/api/cron/cleanup-tracking` | POST/GET | QStash/CRON_SECRET | Weekly cleanup |
| `/api/cron/sync-imap` | POST/GET | QStash/CRON_SECRET | **NEW:** IMAP sync every 30 min (max 5 accounts/run) |
| `/api/unsubscribe` | GET | none | Campaign unsubscribe |
| `/api/jarvis` | POST | session | **NEW:** Jarvis chat (tool-calling, 3 iterations max) |
| `/api/jarvis/agent` | POST | session | **NEW:** Autonomous agent execution |
| `/api/jarvis/tts` | POST | session | **NEW:** ElevenLabs TTS (voice: Sarah) |
| `/api/mine-templates` | GET | CRON_SECRET | **NEW:** Weekly template mining (Mon 3 AM) |
| `/api/mine-templates-direct` | POST | session | **NEW:** Manual template mining trigger |
| `/api/ext/add-lead` | POST | API key | Chrome extension: add lead |
| `/api/ext/check-duplicate` | GET | API key | Extension: check email exists |
| `/api/ext/ping` | GET | none | Extension health |
| `/api/extension/generate-key` | POST | session | Generate extension API key |
| `/api/extension/me` | GET | API key | Current user for extension |
| `/api/extension/clients` | GET | API key | Client list for extension |
| `/api/extension/download` | GET | session | Extension binary download |
| `/api/backfill-email-types` | POST | session | One-time email type backfill |
| `/api/migrate` | POST | admin | DB migration endpoint |

### Components (`app/components/`)
Core: `ClientLayout`, `Sidebar`, `Topbar`, `ComposeModal`, `InlineReply`, `InboxComponents` (EmailRow + EmailDetail + PaginationControls + ToastStack), `LoadingStates`, `ErrorBoundary`, `Resizer`.

Feature: `AddProjectModal`, `AddLeadModal`, `TemplatePickerModal`, `CSVImportModal`, `DownloadExtensionModal`, `OnboardingWizard`, `QuickActions`, `ActionCard`, `AnalyticsCharts`, `CampaignTabs`, `ABTestingAnalytics`, `ABTestingChart`, `RevenueChart`, `RevenueBarChart`, `DateRangePicker`.

Jarvis: **`JarvisVoiceOrb`**, **`JarvisDailyBriefing`**, **`JarvisSuggestionBox`**.

UI primitives (`app/components/ui/`): `Badge`, `Button`, `ErrorAlert`, `FormField`.

### Hooks (`app/hooks/`)
`useMailbox.ts` (useReducer + 2-tier cache), `usePrefetch.ts`, `useIdleDetection.ts`.

### Context (`app/context/`)
`FilterContext` (selected account, date range), `UIContext` (compose open, etc.), `UndoToastContext`.

### Utils (`src/utils/`) — 16 files
`accessControl.ts`, `accountHelpers.ts`, `clientHabits.ts`, `csvParser.ts`, `emailNormalizer.ts`, `emailPreview.ts`, `emailTransformers.ts`, `encryption.ts`, `fromAddress.ts` (RFC 2047 From-header formatter used by Gmail sender), `migrationHelpers.ts`, `pagination.ts`, `phoneExtractor.ts`, `placeholders.ts`, `spintax.ts`, `threadHelpers.ts`, `unsubscribe.ts`.

### Lib (`src/lib/`) — 6 files
`auth.ts` (session enc/dec), `supabase.ts` (service-role client, server), `supabase-client.ts` (anon, browser), `safe-action.ts` (cookie-role gate), **`roleGate.ts`** (fresh-DB role check for page wrappers), `config.ts`.

### Top-level `lib/`
- `lib/qstash.ts` — QStash receiver config + signing keys.
- `lib/projects/` — actions, types, constants, csv-parser, editorStats for the Edit Projects tracker (consumed by `app/projects/page.tsx` and `components/projects/*`).

### Top-level `components/`
Not under `app/` — the Notion-style Edit Projects UI lives here:
- `components/projects/ProjectsClient.tsx`, `EditorDashboard.tsx`, `EditorWorkstation.tsx`
- `components/projects/table/` (ProjectTable, ProjectTableHeader, ProjectTableRow, TableFooter, TablePagination)
- `components/projects/cells/` — 12 cell types (Text, Number, Date, Url, Checkbox, Priority, Tags, Person, Progress, Paid, HardDrive, AMReview)
- `components/projects/toolbar/` (TableToolbar, ViewSwitcher, CSVImportModal)
- `components/projects/views/BoardView.tsx`
- `components/projects/project-detail/ProjectDetailPanel.tsx`

### `app/utils/` (4 files — undocumented in earlier audit)
`helpers.ts`, `localCache.ts`, `staleWhileRevalidate.ts`, `useHydration.ts`.

### `src/constants/`
`limits.ts` — numeric limits (pagination, send caps).

### `src/hooks/`
`useRealtimeInbox.ts` — Supabase realtime subscription for inbox.

### `src/scripts/`
`backfillClients.ts` — one-off data backfill.

### Scripts (`scripts/`)
Code: `backfill-warmup-badges.mjs`, `db-maintenance.mjs`, `import-revenue.ts`, `mine-jarvis-knowledge.ts`, `setup-qstash-schedules.ts`, `warmup.mjs`, `warmup.ts`.
Data inputs: `Edit_revenue_for_web_app.csv`, `not-found-projects.csv`.

### `docs/`
`ACTION-PAGE-REDESIGN.md`, `ACTION-QUEUE-ARCHITECTURE.md`, `DEEP-DIVE.md`, `DESIGN-IMPLEMENTATION-PLAN.md`, `DEVELOPER_GUIDE.md`, `JARVIS-TRAINING-PLAN.md`, `SALES-AGENT-PLAYBOOK.md`, `UNIBOX-SOP.md`, plus `docs/qa/` (build-config-qa, database-qa, architecture-dry-qa) and `docs/superpowers/plans/`.

### Chrome Extension (`chrome-extension/`)
Self-contained extension with `background/`, `content/`, `popup/`, `fallbacks/`, `utils/`, `manifest.json` (v3), own `package.json`, `build.js`, `zip.js`, and `dist/`. Talks to `/api/ext/*` and `/api/extension/*`.

### Orphan files (verified 2026-04-21, candidates for removal)
- `src/actions/automationActions.ts`
- `src/actions/relationshipActions.ts`
- `src/services/pipelineLogic.ts`
- `app/components/RevenueChart.tsx`, `app/components/RevenueBarChart.tsx`
- `app/components/OnboardingWizard.tsx`
- `app/components/JarvisDailyBriefing.tsx` *(dashboard calls the action directly, not the component)*

---

## Background Jobs

| Schedule | Path | Purpose |
|----------|------|---------|
| Every 2 min | `/api/cron/process-webhooks` | Retry failed Gmail webhook events (max 5 retries, exponential backoff) |
| Every 15 min | `/api/campaigns/process` | Campaign processor (3 phases) |
| Every 15 min | `/api/cron/sync-imap` | IMAP/manual account sync (max 5 accounts/run) |
| Hourly | `/api/cron/automations` | Token refresh, lead scoring, warm-lead detection, health checks |
| Every 6 days | `/api/cron/renew-gmail-watches` | Renew Pub/Sub watches before 7-day expiry |
| Weekly (Mon 3 AM) | `/api/mine-templates` | Mine templates from historical sent emails (Groq Llama 3.3 70B) |
| Weekly | `/api/cron/cleanup-tracking` | Truncate old email bodies, delete old activity logs |

All cron routes accept both POST (QStash signed) and GET (Vercel Cron with `Bearer ${CRON_SECRET}`). Timings in `vercel.json` for function `maxDuration` (30-60 s).

---

## External Integrations

| Service | Purpose | Where |
|---------|---------|-------|
| **Supabase** | PostgreSQL, realtime, RPC functions | `src/lib/supabase*.ts`, hooks |
| **Google Gmail API + OAuth2 + Pub/Sub** | Sync, send, push notifications | `googleAuthService.ts`, `gmailSyncService.ts`, `gmailSenderService.ts`, webhooks |
| **Upstash QStash** | Cron + queue (signing-key verified) | `lib/qstash.ts`, all `/api/cron/*` |
| **Resend** | Transactional email (invitations only) from `noreply@texasbrains.com` | `inviteActions.ts` |
| **Anthropic Claude** (via Gloy proxy) | **Primary** for in-thread reply suggestions — `claude-sonnet-4.5` (note the dot, not a dash). Base URL `https://api.gloyai.fun`, Anthropic Messages API path `/v1/messages`. Auth via `x-api-key` header. Balance/key check: `GET /claude/key`. Falls back to Groq → Gemini. | `replySuggestionService.ts` |
| **Groq** | Primary LLM — `llama-3.3-70b-versatile` for Jarvis chat/agent/mining, `llama-3.1-8b-instant` for daily briefing | `jarvisService.ts`, `dailyBriefingService.ts`, `templateMiningService.ts`, `aiSummaryService.ts`, `replySuggestionService.ts` (fallback + coaching) |
| **Google Gemini** | LLM fallback when Groq fails | `aiSummaryService.ts`, `replySuggestionService.ts` |
| **ElevenLabs** | TTS (`eleven_multilingual_v2`, voice `Sarah` / `EXAVITQu4vr4xnSDxMaL`). Falls back to browser `SpeechSynthesis`. | `/api/jarvis/tts` |
| **Vercel** | Hosting (IAD1), serverless functions, Vercel Cron fallback | — |

---

## Current Production Status

- **Live URL:** https://txb-unibox.vercel.app
- **Region:** IAD1 (US East)
- **Environment parity:** Local dev is a perfect mirror of production — shared Supabase DB, same commit hash `038a3bb` (last deployed).
- **Data volume:** ~12,913 contacts, 1,117 projects, 62 active Gmail accounts, capacity ~1,860 emails/day, $367K all-time revenue, 83% collection rate.
- **Team:** 11 account managers.

---

## Critical Files (Do Not Break)

| File | Why |
|------|-----|
| `proxy.ts` | IP whitelist + session validation on every request |
| `src/lib/auth.ts` | Session encryption/decryption |
| `src/lib/roleGate.ts` | Fresh DB role check for page guards |
| `src/lib/safe-action.ts` | Cookie-role gate for all server actions |
| `src/utils/accessControl.ts` | Data scoping — breaking this leaks data across roles |
| `src/utils/encryption.ts` | OAuth/IMAP token encryption |
| `app/dashboard/PageClient.tsx` | Heart of the dashboard (Jarvis briefing + metrics) |
| `app/api/webhooks/gmail/route.ts` | Gmail push notifications |
| `app/api/auth/crm/google/callback/route.ts` | OAuth login callback |
| `src/services/jarvisService.ts` | Jarvis tool catalog + system prompt (contains live business data) |
| `prisma/schema.prisma` | Only ADD models/fields — never rename existing `@@map()` |
| `next.config.js` | Turbopack, server externals, security headers |
| `vercel.json` | Function timeouts, region, crons |

---

## Non-Obvious Patterns

1. **`middleware.ts` is now `proxy.ts`** — Next.js 16 convention (commit `038a3bb`). The file exports a `proxy()` function, not `middleware()`. Don't recreate `middleware.ts`.
2. **`server-only` import is required** on every file in `src/services/` to prevent accidental client-bundle leaks.
3. **Turbopack is the default** in Next.js 16 — `next.config.js` has an empty `turbopack: {}` block. Heavy packages (`@prisma/client`, `googleapis`, `nodemailer`, `imapflow`, `mailparser`) are in `serverExternalPackages` so they're not bundled.
4. **Two role-check layers, by design:**
   - `ensureAuthenticated()` in server actions uses the **cookie's role** (fast, no DB hit).
   - `roleGate.ts` in server-component page wrappers uses the **DB's current role** (safe against stale cookies after role change).
5. **`getAccessibleGmailAccountIds()` is memoized per-request** via React `cache()` — safe to call many times in one server action tree.
6. **`users_ *_role* enum` in DB differs from Prisma enum** — the Prisma schema only has `ADMIN` + `SALES`, but the DB also stores `ACCOUNT_MANAGER` and `VIDEO_EDITOR` as valid strings. All code paths must handle all 4.
7. **Jarvis system prompt embeds live business data** — revenue totals, top clients, team roster are hard-coded into `JARVIS_SYSTEM_PROMPT` in `jarvisService.ts`. When data shifts materially (new top clients, changed totals), update that string.
8. **`console.log` is stripped in production** (keeps only `error`/`warn`) — via `next.config.js` compiler.
9. **ESLint is broken on Next 16** — `eslint-config-next@16` needs a standalone ESLint config. Currently `npm run lint` exits with an error. Build still works because Vercel's `buildCommand` is `next build || true` — be careful: this masks real build failures too.
10. **Sidebar polls `actionQueueActions` every 60 s** for the badge count — an idle page still triggers this work.
11. **`jarvis_feedback` and `jarvis_knowledge` are raw Supabase tables**, not modeled in Prisma — queries use the Supabase client directly.
12. **Supabase Storage `avatars` bucket is created lazily** on first persona upload via `ensureAvatarsBucket()` in `accountActions.ts`. It is **public** so email clients can fetch `<img>` URLs we stuff into HTML bodies. Images live under `personas/{ts}-{rand}.{ext}`. The bucket is not tracked in Prisma.
13. **Gmail inbox avatars are a Gravatar thing, not ours.** Our `profile_image` column only drives in-app display (Accounts page, sender row) and optional inline signatures. Recipients (Gmail/Outlook) will only show a sender photo if the email owner has that same image on Gravatar. The Persona modal surfaces this as a copy-email hint.
14. **Theme toggle is `body[data-theme="light"]`, not `.dark` on html.** `:root` (html) holds the dark defaults; `[data-theme="light"]` only matches body, set by `themeScript` in `app/layout.tsx` from `localStorage.unibox_theme`. **Trap:** legacy alias tokens like `--bg-surface: var(--shell)` declared on `:root` get computed at html — where `[data-theme="light"]` doesn't match — so they freeze to the dark `--shell` value and inherit DARK to every descendant in light mode (silently breaking `.ep-page`, skeleton cards, search inputs). The fix lives in `globals.css` lines 219–278: every legacy alias that depends on a theme-swapping token must be **re-declared inside `[data-theme="light"]`** so it re-evaluates at body. When adding new aliases that wrap theme tokens, redeclare in both blocks.
15. **Editor pages (`.ed-today`, `.fl-page`, `.bg-page`) are theme-aware as of 2026-04-29.** Previously they hardcoded `#0F0F11/#1A1A1E/#2a2a30/#f3f4f6/#9ca3af` which made them stay dark even in light mode. They now use `var(--canvas)` (wrapper), `var(--surface)` (cards), `var(--hairline)` (borders), `var(--ink)` / `var(--ink-muted)` (text), `var(--accent)` (purple). Status pills use `color-mix(in oklab, var(--coach), transparent 88%)` style rather than hardcoded rgba.

---

## Coding Patterns

### Server Action Pattern
```typescript
// src/actions/exampleActions.ts
'use server';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, blockEditorAccess, requireAdmin } from '../utils/accessControl';
import { supabase } from '../lib/supabase';

export async function myAction() {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);          // throw on VIDEO_EDITOR
    // requireAdmin(role);             // uncomment for admin-only

    const accessible = await getAccessibleGmailAccountIds(userId, role);
    const accountIds = accessible === 'ALL' ? null : accessible;
    if (Array.isArray(accountIds) && accountIds.length === 0) {
        return { success: true, data: [] };
    }

    let q = supabase.from('email_messages').select('*');
    if (accountIds) q = q.in('gmail_account_id', accountIds);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data };
}
```

### Page Wrapper Pattern (server component)
```typescript
// app/feature/page.tsx
import { blockEditorAccess } from '../../src/lib/roleGate';
import FeatureClient from './PageClient';

export default async function Page() {
    await blockEditorAccess();        // or requireAdminAccess()
    return <FeatureClient />;
}
```

### Client Page Pattern
```typescript
// app/feature/PageClient.tsx
'use client';
import { useEffect, useState } from 'react';
import { useGlobalFilter } from '../context/FilterContext';
import { myAction } from '../../src/actions/exampleActions';

export default function FeatureClient() {
    const { selectedAccountId } = useGlobalFilter();
    const [data, setData] = useState([]);
    useEffect(() => { myAction().then(r => r.success && setData(r.data)); }, [selectedAccountId]);
    return <div>…</div>;
}
```

### Cron Route Pattern (dual QStash + Vercel Cron)
```typescript
// app/api/cron/your-job/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { qstashReceiver } from '../../../../lib/qstash';

async function run() { /* your logic */ }

export async function POST(req: NextRequest) {
    const body = await req.text();
    await qstashReceiver.verify({ signature: req.headers.get('upstash-signature')!, body });
    return NextResponse.json(await run());
}
export async function GET(req: NextRequest) {
    const auth = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (!auth || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(await run());
}
```

### Response Envelope
All server actions return `{ success: boolean; data?: T; error?: string }`. Paginated: `{ emails, totalCount, page, pageSize, totalPages }`.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Supabase pooled connection |
| `DIRECT_URL` | Supabase direct (migrations only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (NEVER expose) |
| `ENCRYPTION_KEY` | 64-char hex for OAuth/IMAP token encryption |
| `NEXTAUTH_SECRET` | Session cookie encryption |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google OAuth |
| `GOOGLE_PUBSUB_TOPIC` | Gmail push notifications topic |
| `NEXT_PUBLIC_APP_URL` | Base URL for tracking pixels/links |
| `CRON_SECRET` | Vercel Cron bearer token |
| `RESEND_API_KEY` | Resend (invites) |
| `QSTASH_TOKEN` / `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | Upstash QStash |
| `GROQ_API_KEY` | Jarvis + briefings + template mining + reply-suggestion fallback |
| `GEMINI_API_KEY` | AI summary fallback |
| `ELEVENLABS_API_KEY` | Jarvis TTS (optional — falls back to browser TTS) |
| `ANTHROPIC_API_KEY` | Claude (via Gloy proxy) — primary for in-thread reply suggestions. Format: `sk-funpay-...` (proxy key, not real Anthropic key) |
| `ANTHROPIC_BASE_URL` | Gloy proxy URL — defaults to `https://api.gloyai.fun` if unset |

---

## Immediate Roadmap

1. **Fix lint** — migrate to standalone ESLint config compatible with Next.js 16 (currently `npm run lint` is broken).
2. **Performance** — cut initial hydration and Jarvis data-fetch latency (~5 s today). Profile `app/dashboard/PageClient.tsx` and `jarvisActions.ts#getDailyBriefingAction`.
3. **Scraper scalability** — move `leadScraperService.ts` to a worker/queue so batches don't block the main thread.
4. **Schema hardening** — migrate `ACCOUNT_MANAGER` and `VIDEO_EDITOR` into the Prisma `Role` enum; add Prisma models for `jarvis_feedback` and `jarvis_knowledge`.
5. **Vercel `buildCommand` masks failures** — `next build || true` makes broken builds ship silently. Remove the `|| true` once lint + build are green.

---

## Critical Rules

1. **Never touch auth** (`proxy.ts`, `src/lib/auth.ts`, `roleGate.ts`, `safe-action.ts`, `accessControl.ts`) without understanding the whole chain.
2. **Always `npx tsc --noEmit`** before committing — strict mode must pass.
3. **Never hardcode secrets** — all in `.env`. See `.env.example`.
4. **Always `npm run build`** before push — SSR/client mismatches only surface there.
5. **Always `git push` after committing** — don't leave work only local.
6. **Never expose `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`** to the client.
7. **Never bypass RBAC** — use `ensureAuthenticated()` + `getAccessibleGmailAccountIds()` for every data query.
8. **Never remove `'use server'`** from action files or `import 'server-only'` from service files.
9. **Never rename existing Prisma `@@map()` decorators** — they map to live Supabase tables/columns.
10. **Always use snake_case** column names in Prisma (with `@map()`).
11. **Never delete `webhook_events`** without processing — use dead-letter pattern.
12. **Never skip IP whitelist or session checks** in `proxy.ts`.
13. **Keep THIS file in sync** — see the Self-Updating Rule at the top.
14. **Never write `contacts.account_manager_id` directly.** All transfers MUST flow through [`transferContactAction`](src/actions/contactDetailActions.ts) (single chokepoint that writes the `OWNERSHIP_TRANSFER` audit row). Inserts on creation can stay direct for now but should call `recordOwnershipChange({ from: null, to: <userId>, source: 'import'|'campaign'|'scraper'|... })` after the insert. See [`docs/AM-CREDIT-AND-OWNERSHIP-SCOPE.md`](docs/AM-CREDIT-AND-OWNERSHIP-SCOPE.md).
15. **Never write `projects.account_manager_id` after `paid_status='PAID'`** without `{ adminOverride: true, reason: '... ≥10 chars' }` and ADMIN role. The guard lives in [`updateProjectAction`](src/actions/projectActions.ts) and writes an `AM_CREDIT_OVERRIDE` audit row. **Historical credit is immutable; current ownership is mutable** — these are two separate fields and must never be conflated.
16. **Always aggregate revenue through `projects.account_manager_id`, never `contacts.account_manager_id`.** Lifetime achieved revenue, commissions, leaderboards — all join through the project's closer. Aggregating through the contact's *current* AM double-counts revenue when a client moves between reps.

---

_Last audited: 2026-04-29 (theme integrity overhaul — legacy alias re-declaration in light theme + editor pages migrated to tokens). Previous audit: 2026-04-26 (AM credit & ownership separation — schema lock + transfer chokepoint + dual-ownership UI)._

**Build 2026-04-26 — AM Credit & Ownership separation. Full design in [`docs/AM-CREDIT-AND-OWNERSHIP-SCOPE.md`](docs/AM-CREDIT-AND-OWNERSHIP-SCOPE.md).**
- **Principle**: Historical credit (`projects.account_manager_id`) is immutable once `paid_status='PAID'`. Current ownership (`contacts.account_manager_id`) is mutable and moves with reassignments. Two facts, two fields, never conflated.
- **Schema lock**: [`updateProjectAction`](src/actions/projectActions.ts) now refuses to mutate `account_manager_id` on a PAID project unless the caller passes `{ adminOverride: true, reason: '...' (≥10 chars) }` AND has ADMIN role. Successful overrides write an `AM_CREDIT_OVERRIDE` row to `activity_logs` with `note = JSON.stringify({ from_user_id, to_user_id, reason, source: 'admin_override' })`. Refunds (`PAID → PENDING`) implicitly release the lock.
- **Transfer chokepoint**: New [`transferContactAction(contactId, newAmId, opts?)`](src/actions/contactDetailActions.ts) is the **only** path that writes `contacts.account_manager_id` (verified — see Critical Rule #14). Migrated [`updateClientAction`](src/actions/clientActions.ts) to defer the AM field to it. Each call writes an `OWNERSHIP_TRANSFER` audit row (`note = JSON.stringify({ from_user_id, to_user_id, source, reason })`). `OwnershipTransferSource` enum: `'manual' | 'bulk' | 'admin_override' | 'import' | 'campaign' | 'scraper' | 'invite' | 'system'`. Companion `recordOwnershipChange()` is exported for creation paths (CSV import, campaign enrollment, scraper) to log without doing the update — they already insert the contact directly.
- **History action**: New `getOwnershipTransferHistoryAction(contactId)` returns parsed history with resolved actor + from + to user names, batched in one `users` query.
- **Activity log payload shape**: The `activity_logs` table has columns `action, performed_by, note, contact_id, project_id, created_at` — note that `note` is a TEXT column, NOT a JSON column. We store `JSON.stringify(payload)` in `note` and parse on read. Earlier docs/scope assumed a `payload` JSONB column; reconciled. Any code that reads `activity_logs` should handle both `note` (current) and `details` (legacy if present).
- **UI surfaces** ([`app/clients/[id]/PageClient.tsx`](app/clients/[id]/PageClient.tsx)):
  - Profile header shows `Owner: <FirstName>` (or italic *Unassigned*) + collapsible "Transfer history ▾" panel that lazy-loads `getOwnershipTransferHistoryAction`.
  - Projects tab AM column: when `project.account_manager_id ≠ contact.account_manager_id` AND both exist, renders `Closed by <Closer> · Now: <Owner>`. Otherwise single name (with legacy `account_manager` string fallback).
  - Activity tab now reads `note` (and falls back to legacy `details`), parses JSON for `OWNERSHIP_TRANSFER` and `AM_CREDIT_OVERRIDE` actions, and shows human-readable summaries.
- **Out of scope (v1.5+)**: Project-list views at `/projects` and `/my-projects` still show single AM (the closer) — adding dual-ownership there requires server joins to `contacts`. Inbox row tooltip enrichment ("was Abdur until 2026-04-25") deferred. Multi-rep commission splits explicitly out (would need `project_commissions` table).

**Build 2026-04-25 (latest) — Inbox row "AM" label now shows the contact's account manager (with a smart fallback to the Gmail-account assignment), not the Gmail-account creator. Full design in [`docs/INBOX-ACCOUNT-MANAGER-DISPLAY.md`](docs/INBOX-ACCOUNT-MANAGER-DISPLAY.md).**
- **Root cause**: The inbox row was rendering `email.gmail_accounts.user.name` — i.e. the user who *connected the Gmail account* (`gmail_accounts.user_id`, Prisma `createdById`). For Wedits, that's the team admin who onboarded all 62 inboxes, so every row showed the same name. The actual relationship owner is on `contacts.account_manager_id` (override) with `user_gmail_assignments` as the per-inbox default.
- **Three distinct ownership pointers in the schema** (do not conflate):
  1. **Gmail-account creator** — `gmail_accounts.user_id` → who connected the OAuth. Audit/refresh only. **Never use for display.**
  2. **Gmail-account assignment** — `user_gmail_assignments` (M:N pivot) → which user(s) own this inbox. Drives RBAC via `getAccessibleGmailAccountIds()` AND is the **default AM** for any contact on that inbox.
  3. **Account manager for the contact** — `contacts.account_manager_id` → the explicit per-contact override. **Wins over the default when set.**
- **Resolution chain (matches user's stated rule):** *"the email account filmsbyrafay assigned to rameez so all the clients on that email is rameez clients if client database is not saying otherwise"* →
  1. `contacts.account_manager_id` (explicit override) →
  2. `user_gmail_assignments` for the row's `gmail_account_id` (default; multi-user → prefer SALES role over ADMIN, tie-break by oldest `assigned_at`) →
  3. `Unassigned` (italic dim).
- **Fix — server** ([`src/actions/emailActions.ts:194` — `getInboxEmailsAction`](src/actions/emailActions.ts#L194)): SELECT now includes `contact_id`. Three batched lookups (`contacts.in(uniqueContactIds)`, `user_gmail_assignments.in(uniqueAccountIds)`, deduped `users.in(allAmIds)`). Each row gets `account_manager_name`, `account_manager_email`, and `account_manager_source: 'contact' | 'gmail_account' | null`. AM `users.name` empty falls back to local-part of email.
- **Fix — UI** ([`app/components/InboxComponents.tsx:54-61, 141-149` — `EmailRow`](app/components/InboxComponents.tsx#L54)): renders `<gmail-account-email> · AM(<name>)`. When neither contact nor account assignment resolves, shows `Unassigned` in italic dim text. Tooltip on the AM label exposes the AM's email.
- **Follow-up TODO**: lift the AM-attach logic into `attachAccountManagerNames(rows)` and reuse on the sent / search / thread-side-panel paths flagged in the doc (lines 387, 487, 840, 908, 1117 of `emailActions.ts`).

**Build 2026-04-25 (later) — Fixed Jarvis Reply/Coach mode detection + long-thread bug. Full design in [`docs/JARVIS-MODE-DETECTION-FIX.md`](docs/JARVIS-MODE-DETECTION-FIX.md).**
- **Root cause #1**: `Reply` / `Coach` toggle in [`app/PageClient.tsx:671-672`](app/PageClient.tsx#L671-L672) was decorative — `jarvisMode` state never reached `<JarvisSuggestionBox>`. The component decided mode purely from server response.
- **Root cause #2**: `suggestReplyAction` used `.order('sent_at', { ascending: true }).limit(20)`, which returned the OLDEST 20 messages. Long threads (>20 msgs) had wrong mode + wrong prompt context. Now `ascending: false` + `limit(30)` + `.reverse()` for chronological context.
- **Root cause #3**: Sync race — Gmail webhook → `email_messages` insert isn't transactional with the inbox UI's live thread display. New inbound visible in inbox list but not yet in DB → mode auto-detects to coach on previous SENT.
- **Fix — server contract** ([`src/actions/jarvisActions.ts`](src/actions/jarvisActions.ts), [`src/services/replySuggestionService.ts`](src/services/replySuggestionService.ts)): `suggestReplyAction(threadId, opts?: { forceMode?: 'reply' | 'coach' })`. Returns `{ ..., mode, modeSource: 'forced' | 'auto', staleData: boolean }`. Staleness check compares `email_threads.last_message_at` vs newest fetched `email_messages.sent_at` (with 10s grace).
- **Fix — coaching prompt**: Adapts when there's no SENT message to coach (e.g. user forces coach on an inbound-only thread).
- **Fix — UI** ([`app/components/JarvisSuggestionBox.tsx`](app/components/JarvisSuggestionBox.tsx), [`app/PageClient.tsx`](app/PageClient.tsx)): `JarvisSuggestionBox` accepts `forceMode?: 'reply' | 'coach' | null`, refetches on prop change, renders `· auto` badge when mode is auto-detected and `· sync catching up` warn badge when DB is behind. PageClient `jarvisMode` state extended to `'auto' | 'reply' | 'coach'` (default `'auto'`), three tabs.

**Build 2026-04-25 — Switched Claude reply suggestion proxy from gngn.my → Gloy:**
- Swapped `ANTHROPIC_BASE_URL` default `https://api.gngn.my` → `https://api.gloyai.fun` and `CLAUDE_MODEL` `claude-sonnet-4-6` → `claude-sonnet-4.5` (Gloy uses dot-versioning; verified end-to-end via `/v1/messages` smoke test).
- Auth header still `x-api-key` (Gloy accepts both `Authorization: Bearer` and `x-api-key`); kept `anthropic-version: 2023-06-01` (Gloy ignores it harmlessly).
- Key prefix changed from `sk_live_*` (gngn.my) → `sk-funpay-*` (Gloy). Validate with `GET https://api.gloyai.fun/claude/key`.
- Patched `scripts/mine-jarvis-knowledge.ts` to coerce object-typed `price_mentioned` (Llama sometimes returns a price-list object) → smallest numeric, non-finite → null. Prevents Postgres numeric insert errors.

**Build 2026-04-24 — Claude reply suggestion + RAG infrastructure:**
- Added Anthropic Claude (via gngn.my proxy, model `claude-sonnet-4-6`) as primary LLM for in-thread reply suggestions; Groq + Gemini remain as fallback chain.
- New env vars: `ANTHROPIC_API_KEY` (proxy `sk_live_*` format), `ANTHROPIC_BASE_URL` (defaults to `https://api.gngn.my`).
- New table: `jarvis_lessons` (anti-patterns from lost deals — Q&A + `why_lost` + `lesson` columns). Used by `replySuggestionService.fetchRelevantLessons()`.
- Confirmed: `jarvis_knowledge` and `jarvis_feedback` tables previously documented but DID NOT EXIST in DB. Setup SQL added at `scripts/jarvis-tables.sql` — paste into Supabase SQL editor (idempotent).
- Upgraded `replySuggestionService.ts`:
  - V2 system prompt with explicit Empathy Opener + Closing Playbook + Pricing Table (~3KB, prompt-cached).
  - New `fetchTopExamples()` with 3-tier fallback: verified+region+score → verified+score → recent. Returns top-5 (was top-3).
  - New `fetchRelevantLessons()` injects 1 anti-pattern per category (lost-deal lesson) when applicable.
  - New `formatInboxSignalsBlock()` injects auto-detected signals (payment / deadline / files / frustration / silence) into the user prompt via `extractInboxSignals` from `clientIntelligenceService`.
  - Coaching mode (when last message was SENT) still uses Groq, unchanged.
- Updated `scripts/mine-jarvis-knowledge.ts`: added `--limit=N` flag for first-run trial (was hard-wired to all 200+ contacts).
- New helper `scripts/create-jarvis-tables.mjs` (pg-direct DDL — currently blocked by stale .env DB password; user runs SQL manually in Supabase dashboard for now).
- New playbook doc: `docs/CLAUDE-REPLY-SUGGESTION-PLAYBOOK.md` — full speed × accuracy implementation plan (7 phases).

**Deep System Discovery 2026-04-21 — drift corrections applied:**
- Removed non-existent routes `/api/auth/google` and `/api/track/session` from API table (verified in code).
- Fixed IMAP cron cadence 30 min → 15 min (matches `scripts/setup-qstash-schedules.ts`).
- Documented undocumented directories: `components/projects/` (25-file Notion-style tracker at repo root, not `app/components/`), `lib/projects/` (actions/types/constants/csv-parser/editorStats), `app/utils/` (helpers, localCache, staleWhileRevalidate, useHydration), `src/constants/limits.ts`, `src/hooks/useRealtimeInbox.ts`, `src/scripts/backfillClients.ts`, `docs/` (SOPs + QA + training plans).
- Flagged orphan files (zero imports outside docs): `src/actions/automationActions.ts`, `src/actions/relationshipActions.ts`, `src/services/pipelineLogic.ts`, `app/components/RevenueChart.tsx`, `app/components/RevenueBarChart.tsx`, `app/components/OnboardingWizard.tsx`, `app/components/JarvisDailyBriefing.tsx` (this one is ⚠ documented as active but has zero imports — dashboard calls `getDailyBriefingAction` directly without the component).
- Added Scripts CSVs note: `scripts/Edit_revenue_for_web_app.csv`, `scripts/not-found-projects.csv` are data inputs for `import-revenue.ts` / `db-maintenance.mjs`.
