# UNIBOX — Project Memory

Unibox is a **multi-account email CRM** built for video production companies. It manages Gmail and manual IMAP/SMTP accounts, syncs emails in real-time, tracks leads through a sales pipeline, runs automated email campaigns with A/B testing, and provides open/click analytics.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.1.6 |
| Language | TypeScript (strict mode) | 5.9.3 |
| UI Library | React | 19.2.4 |
| Database | PostgreSQL via Supabase | — |
| ORM | Prisma | 6.19.2 |
| Hosting | Vercel (IAD1 region) | — |
| Styling | Vanilla CSS (`app/globals.css`, ~58KB) | — |
| Icons | Lucide React | 0.575.0 |
| Charts | Recharts | 3.8.0 |
| Drag & Drop | @dnd-kit/core + sortable | 6.3.1 / 10.0.0 |
| Email (Gmail) | googleapis (Gmail API + OAuth2) | 171.4.0 |
| Email (IMAP) | imapflow | 1.2.10 |
| Email (SMTP) | nodemailer | 8.0.1 |
| Email (Transactional) | Resend (invitations only) | 6.10.0 |
| Task Queue | Upstash QStash | 2.10.1 |
| Auth Encryption | AES-256-CBC (custom, `src/lib/auth.ts`) | — |
| Token Encryption | AES-256-GCM (`src/utils/encryption.ts`) | — |
| Password Hashing | bcryptjs (12 rounds) | 3.0.3 |
| CSV Parsing | PapaParse | 5.5.3 |
| Email Parsing | mailparser | 3.9.3 |
| HTML Sanitization | DOMPurify | 3.3.3 |
| ZIP Archives | archiver | 7.0.1 |
| Virtual Scrolling | @tanstack/react-virtual (installed, not yet used) | 3.13.23 |
| File Upload | react-dropzone | 15.0.0 |
| Date Utilities | date-fns | 4.1.0 |
| Linting | ESLint + eslint-config-next | 9.27.0 |
| Formatting | Prettier | 3.8.1 |

**No Tailwind CSS** — all styling is vanilla CSS in `app/globals.css`.

---

## Commands

```bash
npm run dev              # Start dev server (Next.js 16 + Turbopack)
npm run build            # Production build
npm run start            # Start production server
npm run lint             # ESLint via next lint
npm run format           # Prettier format all files
npm run format:check     # Check formatting without writing
npx prisma generate      # Regenerate Prisma client (also runs on postinstall)
npx prisma migrate dev --name <name>  # Create and apply a migration
npx prisma db push       # Push schema changes without migration (dev only)
npx tsc --noEmit         # Type-check without emitting (RUN BEFORE EVERY COMMIT)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        VERCEL (IAD1)                        │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  App Router   │   │  API Routes  │   │  Cron Routes   │  │
│  │  (pages)      │   │  /api/*      │   │  /api/cron/*   │  │
│  │  Client-side  │   │  Server-side │   │  QStash/Vercel │  │
│  └──────┬───────┘   └──────┬───────┘   └───────┬────────┘  │
│         │                  │                    │           │
│  ┌──────▼──────────────────▼────────────────────▼────────┐  │
│  │              Server Actions (src/actions/)             │  │
│  │         All DB mutations go through here               │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────▼───────────────────────────────┐  │
│  │              Services (src/services/)                  │  │
│  │    Gmail sync, sending, campaigns, tracking, auth     │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────▼───────────────────────────────┐  │
│  │           Supabase Client (src/lib/)                   │  │
│  │    supabase.ts (server/service-role)                   │  │
│  │    supabase-client.ts (browser/anon-key)               │  │
│  └──────────────────────┬───────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │   Supabase PostgreSQL  │
              │   (PgBouncer pooling)  │
              └───────────────────────┘
```

### Key Layers

- **`app/`** — Next.js App Router. Pages (`page.tsx`), API routes (`app/api/`), components, hooks, context, constants.
- **`src/actions/`** — 19 server action files. ALL database mutations flow through here. Each uses `'use server'` and `ensureAuthenticated()`.
- **`src/services/`** — 18 service files. Business logic: Gmail sync, email sending, campaign processing, tracking, auth, health monitoring, AI summaries.
- **`src/lib/`** — Supabase clients, auth session management, config, safe-action helpers.
- **`src/utils/`** — 13 utility files: encryption, access control, CSV parsing, email normalization, spintax, placeholders, pagination.
- **`prisma/schema.prisma`** — 22 models, 13 enums. All models use `@@map()` for snake_case table/column names.

---

## Auth System

**WARNING: NEVER break the existing auth system. It is production-critical.**

### Session Management

- **Cookie:** `unibox_session` (httpOnly, secure, sameSite: lax, 7-day expiry)
- **Encryption:** AES-256-CBC with random IV, stored as `iv:ciphertext`
- **Payload:** `{ userId, email, name, role, exp }`
- **File:** `src/lib/auth.ts` — `createSession()`, `getSession()`, `clearSession()`

### Login Methods

1. **Google OAuth (Primary):** `/api/auth/crm/google` → Google consent → `/api/auth/crm/google/callback` → validates CSRF state (timing-safe) → checks user exists or has pending invitation → creates session
2. **Email + Password:** POST `/api/auth/login` → bcrypt password verification → session creation
3. **Invitation Acceptance:** `/invite/accept?token={token}` → validates 7-day token → creates user with invitation role → assigns Gmail accounts → session creation

### Middleware (`middleware.ts`)

Two-layer protection on every request:
1. **IP Whitelist** — hardcoded allowed IP ranges (see SEC-005 in Known Issues)
2. **Session Validation** — decrypts cookie, validates format and expiry
3. **Public paths** (no session required): `/login`, `/invite`, `/api/track`, `/api/webhooks`, `/api/unsubscribe`, `/api/ext`, `/api/ping`

### Security Features

- CSRF protection via OAuth state parameter (timing-safe comparison)
- bcryptjs (12 rounds) for password hashing
- crypto.randomBytes(32) for invitation tokens (64-char hex)
- Self-protection: users cannot change their own role or deactivate themselves
- Invitation expiry: 7 days (extendable on resend)

---

## RBAC Rules

### Roles

| Role | Access Level |
|------|-------------|
| **ADMIN** | Full access to everything |
| **ACCOUNT_MANAGER** | Same as ADMIN (legacy role, treated identically) |
| **SALES** | Limited to assigned Gmail accounts only |

### ADMIN / ACCOUNT_MANAGER Can:

- View/send emails from ALL Gmail accounts
- Create/edit campaigns using any account
- View ALL clients, leads, projects
- Access Team page (`/team`) — invite users, assign accounts, change roles, set passwords, deactivate users
- Access Intelligence page (`/intelligence`)
- Access Finance page (`/finance`)
- View full analytics dashboard
- Connect/disconnect Gmail accounts
- Manage account sync (pause/resume)

### SALES Users Can:

- View/send emails ONLY from assigned Gmail accounts (via `user_gmail_assignments` table)
- Create campaigns ONLY using assigned accounts
- View ONLY their own clients (where `account_manager_id = userId`)
- View their own projects and campaigns
- Access Dashboard page (`/dashboard`) — personal sales metrics
- View analytics (limited to their accounts)

### SALES Users CANNOT:

- Access `/team`, `/intelligence`, `/finance` pages
- See other users' campaigns, clients, or emails
- Manage Gmail accounts or sync settings
- Invite users or change roles

### Enforcement Points

1. **Middleware** — session + IP validation on every request
2. **`ensureAuthenticated()`** (`src/lib/safe-action.ts`) — called by every server action
3. **`requireAdmin()`** — throws error if not ADMIN/ACCOUNT_MANAGER
4. **`getAccessibleGmailAccountIds()`** (`src/utils/accessControl.ts`) — returns `'ALL'` for admins, specific IDs for SALES
5. **Frontend Sidebar** — hides admin-only navigation items for SALES users

---

## Database

PostgreSQL via Supabase with two connection strings:
- `DATABASE_URL` — Pooled (PgBouncer) for runtime queries
- `DIRECT_URL` — Direct connection for Prisma migrations

### All Prisma Models (22)

| Model | Purpose |
|-------|---------|
| **User** | Core user with role (ADMIN/SALES/ACCOUNT_MANAGER), status (ACTIVE/REVOKED), password hash, avatar |
| **Contact** | Lead/client with pipeline stage, lead score, follow-up tracking, contact type (LEAD/CLIENT) |
| **GmailAccount** | Gmail/IMAP account with OAuth tokens, sync state, health score, warmup tracking, daily limits |
| **Invitation** | Team invitations with 7-day expiry token, assigned Gmail account IDs |
| **UserGmailAssignment** | Links SALES users to specific Gmail accounts (RBAC pivot table) |
| **EmailThread** | Gmail thread grouping with metadata |
| **EmailMessage** | Full email messages with tracking (opened_at, clicked_at, delivered_at, tracking_id) |
| **Project** | Project management with client, status, revenue tracking, paid status |
| **ActivityLog** | Audit log for contacts and projects (stage changes, emails, notes) |
| **IgnoredSender** | Blocked email senders (filtered during sync) |
| **Campaign** | Email campaign with goals, scheduling, daily limits, account rotation |
| **CampaignStep** | Sequential steps in campaign with delay_days and subsequence triggers |
| **CampaignVariant** | A/B testing variants per step (subject + body) |
| **CampaignContact** | Enrollment of contacts in campaigns with status tracking |
| **CampaignEmail** | Individual emails sent in campaigns (links email_message to step/variant) |
| **Unsubscribe** | Unsubscribe tracking per email/campaign |
| **CampaignAnalytics** | Daily aggregated campaign metrics |
| **WebhookEvent** | Gmail Pub/Sub webhook events with retry tracking |
| **CampaignSendQueue** | Rate-limited sending queue with stagger delays and retry logic |
| **EmailTemplate** | Reusable email templates with categories |
| **EditProject** | Notion-style editorial project tracking (video/design editing) |
| **ProjectComment** | Comments on edit projects |

### Key Enums

- **Role:** ADMIN, SALES, ACCOUNT_MANAGER
- **PipelineStage:** COLD_LEAD, CONTACTED, WARM_LEAD, LEAD, OFFER_ACCEPTED, CLOSED, NOT_INTERESTED
- **EmailDirection:** SENT, RECEIVED
- **EmailType:** OUTREACH_FIRST, FOLLOW_UP, CONVERSATIONAL, FIRST_REPLY, CONTINUED_REPLY
- **ConnectionMethod:** OAUTH, MANUAL
- **GmailAccountStatus:** ACTIVE, ERROR, DISCONNECTED, SYNCING, PAUSED
- **ContactType:** LEAD, CLIENT
- **Priority:** LOW, MEDIUM, HIGH, URGENT

### Key Indexes

- `(gmailAccountId, direction, sentAt DESC)` — inbox queries
- `(threadId)` — thread lookups
- Missing: `(campaignId, status, nextSendAt)` on CampaignContact (see SCHEMA-003 in Known Issues)

---

## File Structure

### Pages (app/)

```
app/
├── page.tsx                    # Inbox (main email interface with stage tabs)
├── layout.tsx                  # Root layout with context providers
├── login/page.tsx              # Login page (Google OAuth + email/password)
├── invite/accept/page.tsx      # Invitation acceptance page
├── dashboard/page.tsx          # Sales rep dashboard (SALES role)
├── clients/page.tsx            # Client/lead management
├── clients/[id]/page.tsx       # Individual client detail
├── accounts/page.tsx           # Gmail account management
├── campaigns/page.tsx          # Campaign list
├── campaigns/new/page.tsx      # Create new campaign
├── campaigns/[id]/page.tsx     # Campaign detail + analytics
├── projects/page.tsx           # Project management
├── templates/page.tsx          # Email template management
├── analytics/page.tsx          # Analytics dashboard with charts
├── sent/page.tsx               # Sent emails view
├── opportunities/page.tsx      # Opportunities pipeline
├── intelligence/page.tsx       # AI intelligence (ADMIN only)
├── finance/page.tsx            # Finance tracking (ADMIN only)
├── team/page.tsx               # Team management (ADMIN only)
└── settings/page.tsx           # App settings
```

### Server Actions (src/actions/) — 19 files

| File | Purpose |
|------|---------|
| `emailActions.ts` | Send, fetch, search, read/unread, delete emails |
| `contactDetailActions.ts` | Contact CRUD, pipeline stage transitions |
| `campaignActions.ts` | Campaign CRUD, launch, stop, enrollment |
| `accountActions.ts` | Gmail account connect/disconnect, sync controls |
| `authActions.ts` | Get current user, session management |
| `userManagementActions.ts` | ADMIN: list users, assign accounts, roles, deactivate |
| `inviteActions.ts` | ADMIN: send/revoke/resend invitations via Resend |
| `projectActions.ts` | Project CRUD, status updates |
| `templateActions.ts` | Email template CRUD |
| `analyticsActions.ts` | Dashboard analytics queries |
| `dashboardActions.ts` | Sales rep dashboard data |
| `financeActions.ts` | Revenue and payment tracking |
| `intelligenceActions.ts` | AI relationship summaries |
| `clientActions.ts` | Client-specific queries |
| `importActions.ts` | CSV import for contacts |
| `automationActions.ts` | Automation settings (follow-ups, lead scoring) |
| `relationshipActions.ts` | Contact relationship data |
| `revenueActions.ts` | Revenue calculations |
| `summaryActions.ts` | Summary/overview data |

### Services (src/services/) — 18 files

| File | Purpose |
|------|---------|
| `gmailSyncService.ts` | Full sync, partial sync (History API), watch registration |
| `emailSyncLogic.ts` | Email classification, contact auto-creation, pipeline transitions |
| `gmailSenderService.ts` | MIME message building, Gmail API send, token refresh |
| `manualEmailService.ts` | IMAP/SMTP for non-Gmail accounts |
| `trackingService.ts` | 1x1 pixel injection, link rewriting for click tracking |
| `emailClassificationService.ts` | Email type taxonomy (outreach, follow-up, reply) |
| `campaignProcessorService.ts` | Phase 1: enqueue sends (schedule, limits, spintax, placeholders) |
| `sendQueueProcessorService.ts` | Phase 2: process send queue (send, track, advance steps) |
| `salesAutomationService.ts` | Auto follow-ups, warm lead detection, lead scoring, re-engagement |
| `accountHealthService.ts` | Bounce rate calculation, health scoring, auto-pause |
| `accountRotationService.ts` | Multi-account round-robin, warmup mode, daily limits |
| `googleAuthService.ts` | OAuth URL generation, callback handling, token storage |
| `crmAuthService.ts` | CRM-specific OAuth flow |
| `tokenRefreshService.ts` | Token refresh for all accounts, auto-recovery from ERROR |
| `watchRenewalService.ts` | Gmail Pub/Sub watch lifecycle (renew every 7 days) |
| `webhookProcessorService.ts` | Process webhook_events with exponential backoff (max 5 retries) |
| `aiSummaryService.ts` | AI relationship audits via Groq (Llama 3.3 70B) with Gemini fallback |
| `pipelineLogic.ts` | Pipeline stage transition rules |

### API Routes (app/api/)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | Email + password login |
| `/api/auth/google` | GET | Gmail OAuth initiation (account connection) |
| `/api/auth/google/callback` | GET | Gmail OAuth callback |
| `/api/auth/crm/google` | GET | CRM login OAuth initiation |
| `/api/auth/crm/google/callback` | GET | CRM login OAuth callback |
| `/api/auth/set-password` | POST | Set password for invited users |
| `/api/sync` | POST | Manual/on-demand email sync |
| `/api/sync/health` | GET | Sync status check |
| `/api/sync/poll` | GET | Webhook polling fallback |
| `/api/webhooks/gmail` | POST | Google Pub/Sub push notifications |
| `/api/track` | GET | Open tracking pixel (1x1 PNG) |
| `/api/track/click` | GET | Click tracking redirect |
| `/api/track/session` | — | Owner session detection |
| `/api/campaigns/process` | POST/GET | Campaign processor (QStash + Vercel Cron) |
| `/api/cron/automations` | POST/GET | Hourly: token refresh, automations, health |
| `/api/cron/process-webhooks` | POST/GET | Every 2 min: webhook retry processor |
| `/api/cron/renew-gmail-watches` | POST/GET | Every 6 days: renew Gmail watches |
| `/api/cron/cleanup-tracking` | POST/GET | Weekly: database maintenance |
| `/api/unsubscribe` | GET | Campaign unsubscribe handler |
| `/api/ext/add-lead` | POST | Chrome extension: add lead |
| `/api/ext/check-duplicate` | GET | Chrome extension: check email exists |
| `/api/ext/ping` | GET | Health check |
| `/api/extension/generate-key` | POST | Generate extension API key |
| `/api/extension/me` | GET | Current user for extension |
| `/api/extension/clients` | GET | Client list for extension |
| `/api/extension/download` | GET | Extension binary download |
| `/api/migrate` | — | Database migration endpoint |
| `/api/ping` | GET | App health check |
| `/api/backfill-email-types` | — | One-time email type backfill |

---

## Services Connected

### Supabase (Database + Auth)
- **PostgreSQL** with PgBouncer connection pooling
- **Real-time subscriptions** via `useRealtimeInbox` hook
- **Service role key** for server-side operations (never expose to client)
- **Anon key** for client-side operations (public, safe to expose)
- **RPC functions** for complex queries (inbox with counts, lead scoring, etc.)

### Google APIs (Gmail + OAuth)
- **Gmail API:** Message sync (full + history-based), send, labels, watch
- **OAuth2:** Account authentication, token refresh, consent flow
- **Pub/Sub:** Push notifications for real-time email sync (webhook → `/api/webhooks/gmail`)
- **Scopes:** gmail.readonly, gmail.modify, gmail.send, gmail.labels, userinfo.email, userinfo.profile

### Upstash QStash (Task Queue)
- **Campaign processor:** Every 15 minutes (3-phase: enqueue → send → subsequence triggers)
- **Automations:** Every hour (token refresh, lead scoring, warm lead detection, health checks)
- **Webhook processor:** Every 2 minutes (retry failed Gmail webhooks with exponential backoff)
- **Watch renewal:** Every 6 days (renew Gmail Pub/Sub watches before 7-day expiry)
- **Cleanup:** Weekly (truncate old email bodies, delete old activity logs)
- **Auth:** QSTASH_TOKEN + signing key verification on all POST endpoints
- **Fallback:** All cron routes also accept GET with Bearer CRON_SECRET for Vercel Cron

### Resend (Transactional Email)
- **Purpose:** Team invitation emails only
- **From:** noreply@texasbrains.com
- **Triggered by:** `sendInviteAction()` in `src/actions/inviteActions.ts`

### Vercel (Hosting + Deployment)
- **Region:** IAD1 (US East)
- **Serverless functions:** 30-60 second timeouts for sync/campaign routes
- **Security headers:** X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy
- **Static assets:** 1-year cache with immutable flag
- **API routes:** no-store cache headers
- **Console stripping:** Production builds remove console.log (keep error/warn)

### Groq + Google Gemini (AI)
- **Purpose:** AI relationship summaries and next-email suggestions
- **Primary:** Groq (Llama 3.3 70B, free tier)
- **Fallback:** Google Gemini
- **Used in:** `/intelligence` page, `aiSummaryService.ts`

### Chrome Extension
- **API endpoints:** `/api/ext/*` and `/api/extension/*`
- **Features:** Add leads, check duplicates, view clients
- **Auth:** API key-based authentication

---

## Coding Patterns

### Server Actions Pattern
```typescript
// src/actions/exampleActions.ts
'use server';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds } from '../utils/accessControl';
import { supabase } from '../lib/supabase';

export async function myAction(param: string) {
    const { userId, role } = await ensureAuthenticated();
    // For admin-only actions:
    // requireAdmin(role);
    
    // For RBAC-filtered queries:
    const accountAccess = await getAccessibleGmailAccountIds(userId, role);
    
    const { data, error } = await supabase
        .from('my_table')
        .select('*')
        .in('gmail_account_id', accountAccess === 'ALL' ? [] : accountAccess);
    
    if (error) return { success: false, error: error.message };
    return { success: true, data };
}
```

### API Route Pattern
```typescript
// app/api/example/route.ts
import { getSession } from '../../../src/lib/auth';

export async function GET(request: Request) {
    const session = await getSession();
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // ... handle request
    return Response.json({ data });
}

// For cron routes (dual QStash + Vercel Cron support):
export async function POST(request: Request) {
    // QStash signature verification
    const receiver = new Receiver({ ... });
    await receiver.verify({ ... });
    // ... process
}
export async function GET(request: Request) {
    // Vercel Cron with Bearer token
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });
    // ... same process
}
```

### Component Pattern
```typescript
// app/myfeature/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useGlobalFilter } from '../context/FilterContext';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { myAction } from '../../src/actions/myActions';

export default function MyFeaturePage() {
    const { selectedAccountId } = useGlobalFilter();
    const isHydrated = useHydrated();
    const [data, setData] = useState([]);

    useEffect(() => {
        myAction(selectedAccountId).then(res => {
            if (res.success) setData(res.data);
        });
    }, [selectedAccountId]);

    if (!isHydrated) return <PageLoader isLoading type="list" />;
    return <div>...</div>;
}
```

### State Management
- **Global state:** 3 context providers in `app/context/` (Filter, UI, UndoToast)
- **Email state:** `useMailbox` hook with useReducer + 2-tier caching (memory + localStorage)
- **Real-time:** `useRealtimeInbox` hook for Supabase WebSocket subscriptions
- **Hydration:** `useHydrated()` hook to prevent SSR/client mismatch
- **Role caching:** localStorage `unibox_user_role` for instant sidebar rendering

### Response Pattern
All server actions return: `{ success: boolean, data?: T, error?: string }`
Paginated actions return: `{ emails, totalCount, page, pageSize, totalPages }`

---

## Email Sync Strategy

Three sync modes in `gmailSyncService.ts`:

1. **Push (webhook):** Google Pub/Sub → `/api/webhooks/gmail` → insert into `webhook_events` → processed by cron every 2 min
2. **History-based (partial):** Uses Gmail `historyId` for efficient incremental sync. Triggered by webhooks or manual sync.
3. **Full sync:** Background reconciliation of all messages. Used on first connect or manual trigger.

### Sync Processing (`emailSyncLogic.ts`)
- **Sent email:** Auto-creates contact as CLIENT, transitions COLD_LEAD → CONTACTED
- **Received email:** Creates contact ONLY if replying to our outreach, promotes COLD_LEAD → LEAD
- **Filters out:** Promotional, social, automated, noreply, blocked domains (Facebook, LinkedIn, etc.)
- **Deduplication:** Skips already-synced messages by message ID

### Manual Accounts
- IMAP via `imapflow` for receiving (last 6 months on first sync)
- SMTP via `nodemailer` for sending
- Supports INBOX, Sent, Spam, Trash, Drafts folders

---

## Pipeline

Leads flow through stages with automatic and manual transitions:

```
COLD_LEAD → CONTACTED → WARM_LEAD → LEAD → OFFER_ACCEPTED → CLOSED
                                                              ↓
                                                        NOT_INTERESTED
```

### Automatic Transitions
| Trigger | Transition |
|---------|-----------|
| First email sent | COLD_LEAD → CONTACTED |
| 2+ opens, no reply (hourly detection) | → WARM_LEAD |
| Reply received to outreach | CONTACTED/COLD_LEAD → LEAD |
| Acceptance keywords in reply | Activity log "Possible Acceptance?" |

Stage definitions and colors: `app/constants/stages.ts`

---

## Campaign System

### 3-Phase Processor (every 15 minutes)

1. **Phase 1 — Enqueue** (`campaignProcessorService.ts`): Find ready contacts, check schedule/timezone/limits, build content (placeholders + spintax), inject unsubscribe link, calculate stagger delays, insert into send queue
2. **Phase 2 — Send** (`sendQueueProcessorService.ts`): Process QUEUED items (max 30/account/cycle), inject tracking, send via Gmail/SMTP, advance to next step or mark COMPLETED, retry up to 3x
3. **Phase 3 — Subsequences**: Check if contacts opened email N days ago with no reply, trigger subsequence steps

### Features
- A/B testing variants per step
- Spintax support: `{hello|hi|hey}`
- Placeholder replacement: `{{first_name}}`, `{{company}}`, etc.
- Account rotation with warmup mode (starts at 20/day, +1.43/day up to 500)
- Auto-stop on reply
- Unsubscribe tracking
- Daily send limits per account

---

## Critical Rules (NEVER break these)

1. **NEVER touch the existing auth system** without full understanding of session encryption, middleware, and RBAC flows
2. **ALWAYS run `npx tsc --noEmit`** before committing — TypeScript strict mode must pass
3. **NEVER hardcode secrets** — all sensitive values go in `.env` (see `.env.example` for docs)
4. **ALWAYS test after building** — run `npm run build` to catch SSR/client mismatches
5. **ALWAYS `git push` after finishing** — don't leave work only committed locally
6. **NEVER expose `SUPABASE_SERVICE_ROLE_KEY`** or `ENCRYPTION_KEY` to the client
7. **NEVER bypass RBAC** — always use `ensureAuthenticated()` + `getAccessibleGmailAccountIds()` for data access
8. **NEVER remove `'use server'`** from action files or `import 'server-only'` from service files
9. **NEVER modify Prisma `@@map()` decorators** — they map to existing Supabase table/column names
10. **ALWAYS use snake_case** for database column names in Prisma schema (with `@map()`)
11. **NEVER delete webhook_events** without processing — use dead-letter pattern instead
12. **NEVER skip IP whitelist or session checks** in middleware

---

## Files NOT to Touch (Without Good Reason)

| File | Why |
|------|-----|
| `middleware.ts` | Auth + IP whitelist — breaks all routes if modified incorrectly |
| `src/lib/auth.ts` | Session encryption/decryption — breaks all logins |
| `src/utils/encryption.ts` | OAuth token encryption — breaks all Gmail accounts |
| `src/lib/safe-action.ts` | Auth enforcement for all server actions |
| `src/utils/accessControl.ts` | RBAC enforcement — breaks data isolation |
| `prisma/schema.prisma` | Only modify to ADD models/fields, never rename existing `@@map()` |
| `app/api/webhooks/gmail/route.ts` | Gmail push notifications — breaks real-time sync |
| `app/api/auth/crm/google/callback/route.ts` | OAuth callback — breaks login |
| `next.config.js` | Server external packages, security headers, compiler settings |
| `vercel.json` | Function timeouts, region config — breaks deployment |

---

## Environment

Copy `.env.example` to `.env`. Critical variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Supabase PostgreSQL (pooled via PgBouncer) |
| `DIRECT_URL` | Supabase PostgreSQL (direct, for migrations only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anonymous key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role (NEVER expose) |
| `ENCRYPTION_KEY` | 64-char hex for OAuth token encryption |
| `NEXTAUTH_SECRET` | Session encryption key |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `GOOGLE_PUBSUB_TOPIC` | GCP Pub/Sub topic for Gmail push |
| `NEXT_PUBLIC_APP_URL` | Base URL for tracking pixels/links |
| `CRON_SECRET` | Vercel Cron bearer token |
| `RESEND_API_KEY` | Resend (invitation emails only) |
| `QSTASH_TOKEN` | Upstash QStash auth |
| `QSTASH_CURRENT_SIGNING_KEY` | QStash webhook verification |
| `QSTASH_NEXT_SIGNING_KEY` | QStash key rotation |

---

## Known Issues / Tech Debt

See `KNOWN_ISSUES.md` for the full audit. Key items:

### Critical
- **SEC-005:** Hardcoded IP whitelist in middleware (should be env vars)
- **SEC-006:** CRON_SECRET optional in automations endpoint (no default-deny)

### High Priority
- **PERF-001/002:** N+1 queries in campaign processing and email sync
- **SEC-007:** Race condition on invitation acceptance (not atomic)
- **SEC-008:** Sync endpoint doesn't verify account access via RBAC
- **PERF-003:** Missing transactions in send queue (email sent but not recorded on failure)
- **SEC-010:** Missing `server-only` imports on some service files
- **BUG-001:** Null decrypt crash on manual accounts without refresh_token

### Medium
- **TYPE-001:** Widespread `any` types (lost TypeScript safety)
- **TYPE-002:** Unsafe `as unknown as` type casting on API responses
- **UX-003:** Hardcoded widths breaking mobile layout
- **PERF-006:** Unbounded thread cache in useMailbox (memory leak)

---

## How to Add New Features

### Adding a New Page

1. Create `app/myfeature/page.tsx` (use `'use client'` directive)
2. Create `app/myfeature/loading.tsx` for loading state
3. Add navigation entry in `app/components/Sidebar.tsx`:
   - `NAV_SHARED` for all roles, or `NAV_ADMIN_ONLY` for admin-only pages
4. If the page needs data, create server actions in `src/actions/myFeatureActions.ts`
5. Follow the component pattern: `useHydrated()` → `useGlobalFilter()` → `useEffect` to load data → render

### Adding a New Server Action

1. Create or edit file in `src/actions/` with `'use server'` at top
2. Always call `ensureAuthenticated()` first
3. Use `requireAdmin(role)` for admin-only actions
4. Use `getAccessibleGmailAccountIds()` for RBAC-filtered data
5. Return `{ success: boolean, data?: T, error?: string }`

### Adding a New API Route

1. Create `app/api/myroute/route.ts`
2. Export named functions: `GET`, `POST`, `PUT`, `DELETE`
3. Validate session with `getSession()` or use QStash receiver for cron routes
4. For cron routes: support both POST (QStash) and GET (Vercel Cron with Bearer token)
5. Add function timeout in `vercel.json` if needed (default 10s, max 60s)

### Adding a New Prisma Model

1. Add model to `prisma/schema.prisma` with `@@map('snake_case_table_name')`
2. Use `@map('snake_case')` for all column names
3. Run `npx prisma migrate dev --name add-my-model`
4. Run `npx prisma generate` to update client
5. Create corresponding server actions in `src/actions/`

### Adding a New Service

1. Create file in `src/services/`
2. Add `import 'server-only';` as first import
3. Keep business logic here, database calls in actions
4. If it needs scheduling, add a cron route in `app/api/cron/` with QStash + Vercel Cron dual support

### Pre-Commit Checklist

1. `npx tsc --noEmit` — type-check passes
2. `npm run lint` — no lint errors
3. `npm run build` — production build succeeds
4. Test the feature manually in dev server
5. Check RBAC: does it work correctly for both ADMIN and SALES roles?
6. Check that no secrets are hardcoded
7. Commit and push
