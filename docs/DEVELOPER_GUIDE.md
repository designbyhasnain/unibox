# UNIBOX — Complete Developer Documentation
## For New or Freelance Developers

---

## 1. PROJECT OVERVIEW

**Product:** Unibox — Premium CRM for Video Agencies
**Company:** Wedits (wedding video editing agency)
**Type:** Full-stack B2B SaaS web application
**Live URL:** https://txb-unibox.vercel.app
**GitHub:** Private repository

---

## 2. TECH STACK

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16 | React framework, App Router |
| React | 19 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.x | Utility CSS (minimal use) |
| Recharts | latest | Analytics charts |
| @tanstack/react-virtual | latest | Virtual scrolling (Projects table) |
| @dnd-kit/core | latest | Drag and drop (Board views) |
| papaparse | latest | CSV parsing |
| react-dropzone | latest | File upload |
| date-fns | latest | Date formatting |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Next.js API Routes | 16 | REST API endpoints |
| Next.js Server Actions | 16 | Form actions, mutations |
| Prisma ORM | 5.x | Database client + migrations |
| bcryptjs | latest | Password hashing |
| archiver | latest | ZIP file creation (extension download) |

### Database & Services
| Service | Purpose |
|---|---|
| Supabase | PostgreSQL database + Auth + Storage |
| Supabase Realtime | Live updates (not heavily used) |
| Google Gmail API | Email sync, send, OAuth |
| Google Pub/Sub | Gmail push notifications |
| QStash (Upstash) | Cron job scheduling (free tier) |
| Resend | Transactional emails (invites) |
| Groq / Gemini | AI features (relationship audit, intelligence) |

### Infrastructure
| Service | Purpose |
|---|---|
| Vercel | Hosting + auto-deploy from GitHub |
| GitHub | Version control |
| Cloudflare | DNS (not CDN) |

---

## 3. ARCHITECTURE OVERVIEW

```
Browser/Client
     |
Vercel Edge (middleware.ts - auth check)
     |
Next.js App Router (/app directory)
     |
Server Components (data fetching) + Client Components (interactivity)
     |
Server Actions (/src/actions/) + API Routes (/app/api/)
     |
Services (/src/services/) - Gmail, IMAP, Campaign processing
     |
Supabase PostgreSQL (primary DB) + Supabase JS Client
     |
External APIs: Gmail API, QStash, Resend, Groq, Gemini
```

### Key Architecture Decisions:
- **No separate backend** - everything is in one Next.js app
- **Two DB clients:** Prisma (migrations + type safety) + Supabase JS (runtime queries)
- **Server Actions** for mutations (not REST POST in most cases)
- **API Routes** for external webhooks, cron jobs, extension API
- **QStash** instead of Vercel cron (Hobby plan limitation - once/day max on Vercel crons)

---

## 4. FOLDER STRUCTURE

```
unibox/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout with providers
│   ├── page.tsx                  # Home (redirects based on role)
│   ├── login/page.tsx            # Login page
│   ├── dashboard/page.tsx        # Sales dashboard (SALES role)
│   ├── inbox/page.tsx            # Email inbox
│   ├── clients/page.tsx          # Client/contact management
│   ├── accounts/page.tsx         # Gmail account management
│   ├── projects/page.tsx         # Production hub (Notion-style)
│   ├── campaigns/                # Campaign management
│   │   ├── page.tsx              # Campaign list
│   │   └── [id]/page.tsx         # Campaign detail
│   ├── analytics/page.tsx        # Analytics dashboard
│   ├── templates/page.tsx        # Email templates
│   ├── opportunities/page.tsx    # Opportunities (AI-powered)
│   ├── intelligence/page.tsx     # Intelligence features
│   ├── finance/page.tsx          # Finance/revenue tracking
│   ├── team/page.tsx             # Team management
│   ├── settings/page.tsx         # User settings
│   ├── invite/accept/page.tsx    # Invite acceptance
│   ├── reset-password/page.tsx   # Password reset
│   │
│   ├── api/                      # API Routes
│   │   ├── auth/                 # Auth endpoints
│   │   │   ├── crm/google/       # Google OAuth flow
│   │   │   ├── login/route.ts    # Email/password login
│   │   │   ├── logout/route.ts   # Logout
│   │   │   ├── forgot-password/  # Password reset flow
│   │   │   └── set-password/     # Set password
│   │   ├── campaigns/
│   │   │   └── process/route.ts  # Campaign processor (QStash)
│   │   ├── cron/                 # Cron job endpoints
│   │   │   ├── process-webhooks/ # Gmail webhook processor
│   │   │   ├── cleanup-tracking/ # Tracking cleanup
│   │   │   ├── renew-gmail-watches/ # Gmail watch renewal
│   │   │   ├── automations/      # Automation rules
│   │   │   └── sync-imap/        # IMAP auto-sync
│   │   ├── extension/            # Chrome extension API
│   │   │   ├── me/               # Verify API key
│   │   │   ├── clients/          # Create/check clients
│   │   │   ├── generate-key/     # Generate API key
│   │   │   └── download/         # Download extension zip
│   │   ├── sync/route.ts         # Manual Gmail sync
│   │   ├── track/[id]/route.ts   # Email open tracking pixel
│   │   ├── unsubscribe/route.ts  # Unsubscribe handler
│   │   └── webhooks/gmail/       # Gmail Pub/Sub webhooks
│   │
│   └── components/               # Shared UI components
│       ├── Sidebar.tsx           # Navigation sidebar
│       ├── ClientLayout.tsx      # Client-side layout wrapper
│       ├── LoadingStates.tsx     # Skeleton loaders
│       ├── ErrorBoundary.tsx     # Error boundaries
│       ├── production-hub/       # Projects page components
│       └── ui/
│           └── UndoToast.tsx     # Undo delete toast
│
├── src/
│   ├── actions/                  # Server Actions
│   │   ├── authActions.ts        # Auth: getCurrentUser, etc.
│   │   ├── clientActions.ts      # Client CRUD
│   │   ├── campaignActions.ts    # Campaign CRUD
│   │   ├── emailActions.ts       # Email fetch, send
│   │   ├── accountActions.ts     # Gmail account management
│   │   ├── analyticsActions.ts   # Analytics queries
│   │   ├── dashboardActions.ts   # Sales dashboard data
│   │   ├── inviteActions.ts      # Team invitations
│   │   ├── userManagementActions.ts # User management
│   │   └── projectEditActions.ts # Project CRUD
│   │
│   ├── services/                 # Business logic services
│   │   ├── gmailSyncService.ts   # Gmail sync logic
│   │   ├── imapSyncService.ts    # IMAP sync logic
│   │   ├── gmailSenderService.ts # Gmail email sending
│   │   ├── campaignProcessorService.ts # Campaign processing
│   │   ├── sendQueueProcessorService.ts # Send queue
│   │   ├── googleAuthService.ts  # OAuth token management
│   │   └── aiSummaryService.ts   # AI features
│   │
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client (service role)
│   │   ├── auth.ts               # Session management
│   │   ├── safe-action.ts        # ensureAuthenticated helper
│   │   └── qstash.ts             # QStash client
│   │
│   └── utils/
│       ├── accessControl.ts      # RBAC: getAccessibleGmailAccountIds()
│       └── encryption.ts         # AES-256-CBC session encryption
│
├── chrome-extension/             # Chrome Extension
│   ├── manifest.json
│   ├── popup/                    # Extension popup UI
│   ├── content/                  # Content script (scraper)
│   ├── background/               # Service worker
│   └── dist/                     # Built extension
│
├── prisma/
│   ├── schema.prisma             # Database schema (22 models)
│   └── migrations/               # Migration history
│
├── middleware.ts                 # Auth middleware (IP + session)
├── next.config.js                # Next.js config
├── CLAUDE.md                     # AI assistant memory
└── .env                          # Environment variables (never commit)
```

---

## 5. DATABASE SCHEMA (Core Models)

### Contact
```
id, name, email, phone, company, website, location
pipelineStage: COLD_LEAD | CONTACTED | WARM_LEAD | LEAD | OFFER_ACCEPTED | CLOSED | NOT_INTERESTED
priority, estimatedValue, accountManagerId
openCount, lastOpenedAt, nextFollowupAt
source, sourceUrl (Chrome extension tracking)
```

### EmailMessage
```
id, gmailMessageId (unique), threadId
from, to, subject, body (HTML), textBody
direction: SENT | RECEIVED
gmailAccountId, contactId
isRead, isTracked, isOpened, openedAt
```

### Campaign
```
id, name, goal, status: DRAFT | RUNNING | PAUSED | COMPLETED | ARCHIVED
gmailAccountId, scheduleEnabled, scheduleDays, timezone
Steps[], Contacts[], SendQueue[]
```

### EditProject (Production Hub)
```
id, name, date, clientName, progress, editor, accountManager
totalProjectValue, paid, received1
```

---

## 6. AUTHENTICATION SYSTEM

1. User logs in via Google OAuth OR Email/Password
2. Server creates encrypted session using AES-256-CBC
3. Session stored in HTTP-only cookie: `session`
4. Middleware validates session on every request
5. `ensureAuthenticated()` used in all server actions

**CRITICAL: Never touch auth system without understanding it fully.**

---

## 7. RBAC (Role-Based Access Control)

### Roles:
- `ADMIN` - full access
- `ACCOUNT_MANAGER` - treated as admin for most things
- `SALES` - restricted to assigned Gmail accounts only

### The Central Gatekeeper:
```typescript
getAccessibleGmailAccountIds(userId, role)
// Returns: 'ALL' (admin) or string[] (assigned account IDs)
```

**NEVER add a new data-fetching action without calling this function for SALES users.**

---

## 8. SERVER ACTIONS PATTERN

```typescript
'use server';
import { ensureAuthenticated } from '../lib/safe-action';
import { supabase } from '../lib/supabase';

export async function doSomethingAction(param: string) {
  const { userId, role } = await ensureAuthenticated();
  const accessible = await getAccessibleGmailAccountIds(userId, role);
  // ... do work with RBAC filtering
}
```

---

## 9. CAMPAIGN SYSTEM

```
Phase 1: enqueueCampaignSends() - Find ready contacts, insert into send queue
Phase 2: processSendQueue() - Send emails via Gmail API with tracking
Phase 3: processSubsequenceTriggers() - Handle opened-but-no-reply flows
```

Triggered by QStash every 15 minutes.

---

## 10. EMAIL SYNC

- **Gmail (OAuth):** Push notifications via Pub/Sub + History API incremental sync
- **IMAP:** QStash cron every 15 min, 5 accounts per run, page-by-page processing

---

## 11. QSTASH CRON JOBS

| Schedule | Cron | Purpose |
|---|---|---|
| Campaign Processor | `*/15 * * * *` | Send campaign emails |
| Webhook Processor | `*/2 * * * *` | Process Gmail push notifications |
| IMAP Sync | `*/15 * * * *` | Sync domain email accounts |
| Automations | `0 * * * *` | Run automation rules |
| Cleanup | `0 3 * * *` | Clean old tracking data |
| Gmail Watch Renewal | `0 3 */3 * *` | Renew Gmail push subscriptions |

---

## 12. ENVIRONMENT VARIABLES

```env
DATABASE_URL, DIRECT_URL           # Supabase PostgreSQL
NEXT_PUBLIC_SUPABASE_URL           # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY          # Supabase admin key
SESSION_SECRET                     # AES-256 session encryption
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  # OAuth
QSTASH_TOKEN, QSTASH_*_SIGNING_KEY     # QStash auth
RESEND_API_KEY                     # Transactional emails
GROQ_API_KEY, GEMINI_API_KEY       # AI features
CRON_SECRET                        # Debug cron auth
```

---

## 13. CRITICAL RULES

1. **Never reset `lastHistoryId`** when reconnecting Gmail accounts
2. **Never call `ensureAuthenticated()` in invite/reset-password flows**
3. **Always use `getAccessibleGmailAccountIds()`** in new data-fetching actions
4. **Never store plaintext passwords** - always bcrypt 12 rounds
5. **Always run `npx tsc --noEmit`** before committing
6. **Never use `window.confirm()`** - use UndoToast
7. **`campaign_send_queue.id` must have `gen_random_uuid()` default**
8. **CORS on extension API routes** must allow `*`

---

## 14. DEVELOPMENT WORKFLOW

```bash
git clone <repo> && cd unibox
npm install
cp .env.example .env  # fill in values
npx prisma generate
npm run dev

# Before every commit:
npx tsc --noEmit && npm run build && npm run lint
git add . && git commit -m "type: description"
git push origin main  # auto-deploys to Vercel
```

---

*Documentation prepared for Unibox - April 2026*
*Stack: Next.js 16 + React 19 + Supabase + Prisma + Vercel + QStash + Resend*
