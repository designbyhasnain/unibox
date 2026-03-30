# Unibox — Complete System Documentation

## 1. Overview & Purpose

Unibox is a unified email inbox and lightweight CRM built for outreach-driven teams. It aggregates email accounts (Gmail via OAuth and generic IMAP/SMTP via app passwords) into a single interface, automatically categorizes contacts through a sales pipeline, tracks email opens and clicks, and provides project management tied to email conversations.

**Core capabilities:**

- Multi-account email aggregation (Gmail OAuth + manual IMAP/SMTP)
- Automatic pipeline stage classification (Cold Lead → Lead → Offer Accepted → Closed)
- Email open/click tracking with pixel and link-wrapping
- Per-contact project management with due dates, quotes, and paid status
- Analytics dashboard with conversion funnels, sentiment analysis, and engagement metrics
- Real-time inbox updates via Supabase Realtime + polling fallback

**Target users:** Account managers and sales teams running email-based outreach campaigns.

---

## 2. Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Framework | Next.js (App Router) | Server actions, API routes, client components |
| Language | TypeScript | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Database | Supabase (PostgreSQL) | Pooled + direct connections, Realtime subscriptions |
| ORM | Prisma | 7 tracked models + untracked tables via raw SQL |
| Email (OAuth) | Google APIs (`googleapis`) | Gmail API for read/send/sync |
| Email (Manual) | `nodemailer` / `imapflow` / `mailparser` | SMTP send, IMAP sync |
| Encryption | Node.js `crypto` | AES-256-GCM |
| Charts | Recharts | Analytics visualizations |
| Animation | Framer Motion | Analytics transitions |
| Realtime | Supabase Realtime | WebSocket subscriptions on `email_messages` |
| Deployment | Vercel | Region `iad1`, function timeouts configured per route |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js App Router                       │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Pages   │  │Components│  │  Hooks   │  │FilterContext  │  │
│  │(Client)  │──│(Memoized)│──│useMailbox │──│(localStorage) │  │
│  └────┬─────┘  └──────────┘  │useRealtime│  └───────────────┘  │
│       │                      └─────┬─────┘                      │
│       ▼                            ▼                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Server Actions (src/actions/)               │   │
│  │  emailActions · accountActions · clientActions           │   │
│  │  projectActions · analyticsActions                       │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                     │
│  ┌────────────────────────▼────────────────────────────────┐   │
│  │              Services Layer (src/services/)              │   │
│  │  gmailSyncService · gmailSenderService                  │   │
│  │  manualEmailService · googleAuthService                 │   │
│  │  emailSyncLogic · pipelineLogic · trackingService       │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                     │
│  ┌────────────────────────▼────────────────────────────────┐   │
│  │                    API Routes                            │   │
│  │  /api/auth/google/callback  /api/sync                   │   │
│  │  /api/track (pixel+click)   /api/webhooks/gmail         │   │
│  │  /api/track/session                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Supabase (PostgreSQL)  │
                    │   Prisma ORM + Raw SQL   │
                    │   RPC Functions           │
                    │   Realtime (WebSocket)    │
                    └─────────────────────────┘
```

**Key architectural decisions:**
- All pages are client components; data fetching goes through server actions
- Three-tier caching: memory (`globalMailboxCache`) → localStorage → server
- Gmail sync uses Google Pub/Sub push notifications with history-based incremental sync, falling back to full sync on 404
- Manual accounts use IMAP polling
- Email tracking is fire-and-forget (pixel and click endpoints always return immediately)

---

## 4. Frontend Architecture

### 4.1 Pages & Routing

| Route | File | Description |
|-------|------|-------------|
| `/` | `app/page.tsx` | Inbox — pipeline stage tabs, search, bulk actions |
| `/sent` | `app/sent/page.tsx` | Sent mail — no stage tabs, shows "To:" |
| `/clients` | `app/clients/page.tsx` | Contacts grouped by email with project tabs |
| `/projects` | `app/projects/page.tsx` | Project management with client/manager/status filters |
| `/accounts` | `app/accounts/page.tsx` | Account management (OAuth + Manual) |
| `/settings` | `app/settings/page.tsx` | Polling, focus sync, notification settings |
| `/analytics` | `app/analytics/page.tsx` | KPIs, funnels, sentiment, leaderboard, engagement |

**Layout hierarchy:**

```
html > body > FilterProvider > OwnerSessionTracker
  └── .layout-container
        ├── Sidebar
        └── .main-area
              ├── Topbar
              ├── .tabs-bar
              └── .content-split
                    ├── .list-panel
                    └── .detail-panel
```

**Inbox page details:**
- 6 pipeline stage tabs with badge counts: COLD_LEAD, LEAD, OFFER_ACCEPTED, CLOSED, NOT_INTERESTED, SPAM
- PAGE_SIZE = 50
- Live search with 300ms debounce
- Keyboard shortcuts: `Escape` closes detail, `c` opens compose
- Actions: sync, mark read/unread, bulk delete, stage change, not interested, inline reply, forward

### 4.2 Components

| Component | Key Behavior |
|-----------|-------------|
| **Sidebar** | Navigation links + account filter dropdown. Fetches accounts on mount. |
| **Topbar** | Search bar with live dropdown results. Left/right content slots. |
| **EmailRow** | Memoized. Gmail-like row: checkbox, avatar, sender, subject+preview, stage badge, tracking ticks, date. |
| **EmailDetail** | Toolbar (back, delete, not spam, not interested, new project, stage selector). Thread view with collapsed read / expanded unread messages. |
| **InlineReply** | `contenteditable` rich text editor. Formatting toolbar, emoji picker, account selector. |
| **ComposeModal** | From/to/cc/bcc/subject fields. Rich editor. Tracking toggle (default on). Minimize/maximize. |
| **DateRangePicker** | Presets (today, 7d, 30d, year) + custom range. |
| **AddProjectModal / AddLeadModal** | Form modals for creating projects and leads. |
| **LoadingStates** | Skeleton components with shimmer animation. |
| **OwnerSessionTracker** | Invisible. POSTs to `/api/track/session` on load to register owner IP (for filtering out self-opens from tracking). |

**Tracking tick indicators on EmailRow:**
- 1 gray tick = sent
- 2 gray ticks = delivered
- 2 blue ticks = opened

### 4.3 State Management (Hooks, Context)

**`useMailbox`** — Universal mailbox state machine.
- Supports types: `inbox`, `sent`, `client`, `search`
- Three-layer cache: memory (`globalMailboxCache`) → localStorage → server action
- Cache key format: `${type}_${filter}_${accountId}`
- Flushes all caches on account change
- Returns: emails, pagination, loading state, sync methods

**`useRealtimeInbox`** — Live updates.
- Primary: Supabase Realtime subscription on `email_messages` table
- Fallback: polling every 15 seconds
- Also monitors SENT emails for tracking updates within a 12-hour window

**`useHydrated`** — SSR mismatch prevention. Returns `false` on server, `true` after mount.

**`FilterContext`** — Global filter state.
- Fields: `selectedAccountId` (`'ALL'` or specific ID), `startDate`, `endDate`
- Persisted to localStorage
- Flushes all mailbox caches on account change

### 4.4 Design System & CSS

All styles in `globals.css` (~4,794 lines). No CSS framework; hand-written utility and component classes.

**Design tokens:**

| Token | Value |
|-------|-------|
| `--bg-base` | `#f6f8fc` |
| `--accent` | `#1a73e8` (Gmail blue) |
| `--text-primary` | `#202124` |
| `--sidebar-width` | `256px` |
| `--topbar-height` | `64px` |

**Typography:** `'Google Sans'`, `'Roboto'`, system fallback. Root `15px`, body `14px`.

**Key CSS classes:** `.layout-container`, `.sidebar`, `.main-area`, `.content-split`, `.list-panel`, `.detail-panel`, `.gmail-email-row`, `.badge`

**Animations:** `fade-in`, `skeleton-shimmer`, `spin`

**Pipeline stage colors:**

| Stage | Color |
|-------|-------|
| COLD_LEAD | Blue |
| LEAD | Yellow |
| OFFER_ACCEPTED | Green |
| CLOSED | Purple |
| NOT_INTERESTED | Red |

Helpers from `stages.ts`: `shouldShowStageBadge()`, `doesEmailMatchTab()`

### 4.5 Data Flow Patterns

```
Email loading:    Page → useMailbox → memory cache → localStorage → server action
Account switch:   setSelectedAccountId → flush all caches → reload
Search:           300ms debounce → searchEmailsAction → dropdown results
Sync trigger:     POST /api/sync per account → wait 1500ms → reload
Stage change:     updateEmailStageAction → reload list
Realtime update:  Supabase channel event → merge into cache → re-render
```

**Search operators:** `from:`, `to:`, `subject:`, `has:attachment`, `newer_than:Nd/w/m/y`

---

## 5. Backend Architecture

### 5.1 Server Actions

#### Email Actions (`src/actions/emailActions.ts`)

| Action | Purpose |
|--------|---------|
| `sendEmailAction` | Validates account, prepares tracking, routes to Gmail or Manual sender, upserts message, increments `sent_count_today` |
| `getInboxEmailsAction` | RPC `get_inbox_threads` → enrich with account/manager → backfill `has_reply` |
| `getSentEmailsAction` | RPC `get_sent_threads` |
| `getClientEmailsAction` | ILIKE search on from/to, group by thread |
| `markEmailAsReadAction` / `markEmailAsUnreadAction` | Toggle `is_unread` |
| `bulkMarkAsReadAction` / `bulkMarkAsUnreadAction` | Bulk toggle |
| `updateEmailStageAction` | Auto-create contact if needed, update stage on all messages from sender, remove from `ignored_senders` if leaving NOT_INTERESTED |
| `getThreadMessagesAction` | All messages in thread, chronological, computes `has_reply` |
| `deleteEmailAction` / `bulkDeleteEmailsAction` | Delete linked projects first, then messages |
| `markAsNotInterestedAction` | Add to `ignored_senders`, update messages + contact |
| `getTabCountsAction` | RPC `get_all_tab_counts` |
| `markAsNotSpamAction` | Route to Gmail/Manual unspam, set `is_spam=false` |
| `searchEmailsAction` | Full-text with operator parsing |
| `getEmailTrackingAction` | Fetch tracking_id, opens, clicks, events |

#### Account Actions (`src/actions/accountActions.ts`)

| Action | Purpose |
|--------|---------|
| `getGoogleAuthUrlAction` | Returns OAuth consent URL |
| `connectManualAccountAction` | Test IMAP+SMTP, encrypt password, upsert account |
| `getAccountsAction` | Fetch accounts with email counts (5s timeout per query), auto-fix stuck syncs (>15min) |
| `reSyncAccountAction` | Trigger background sync |
| `syncAllUserAccountsAction` | Sync every account for a user |
| `toggleSyncStatusAction` | PAUSED ↔ ACTIVE |
| `stopSyncingAction` | Force ACTIVE + progress=100 |
| `removeAccountAction` | Revoke token, nullify linked emails (preserves CRM data), delete account |

#### Other Actions

| File | Key Actions |
|------|-------------|
| `clientActions.ts` | `ensureContactAction` (get-or-create, default COLD_LEAD), `getClientsAction`, `getContactAction`, `getClientProjectsAction`, `updateClientAction` |
| `projectActions.ts` | `getAllProjectsAction`, `getManagersAction`, `updateProjectAction`, `createProjectFromEmailAction` (defaults: +7d due, UNPAID, MEDIUM), `createProjectAction` |
| `analyticsActions.ts` | `getAnalyticsDataAction` — returns stats, funnel, leaderboard, deliverability, sentiment, daily/hourly data, top subjects, account performance |

### 5.2 API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/google/callback` | GET | OAuth callback. Exchanges code, upserts account, triggers sync, redirects to `/accounts` |
| `/api/sync` | POST | Validates `accountId`. Routes to history sync (if `historyId` exists) or full sync |
| `/api/track?t=` | GET | Tracking pixel. Returns 1x1 transparent PNG. Records open event. Currently in DEBUG mode (all hits recorded, including owner) |
| `/api/track/click?t=&url=` | GET | Click tracking. Records click event, 302 redirects to target URL |
| `/api/track/session` | POST | Registers owner IP address for self-open filtering |
| `/api/webhooks/gmail` | POST | Google Pub/Sub push. Decodes base64 payload, triggers `syncAccountHistory` |

### 5.3 Services Layer

#### Gmail Sync (`gmailSyncService.ts`)

- **`getOAuthClient(account)`** — Creates OAuth2 client with auto-refresh token listener
- **`getMessageBody(payload)`** — Recursive MIME walk; priority: HTML → plain text → snippet
- **`fetchAllMessageIds(gmail, labelIds, query?, max?)`** — Paginated `messages.list`
- **`processSingleMessage(...)`** — Dedup check, fetch full message, extract fields, route to `handleEmailSent` or `handleEmailReceived`
- **`processBatch(...)`** — Parallel with `Promise.allSettled`, concurrency=20, progress updates with 100ms throttle
- **`startGmailWatch(accountId)`** — Register Pub/Sub for INBOX+SENT labels
- **`syncAccountHistory(accountId, newHistoryId?)`** — `history.list(messageAdded)`, batch process, update historyId. Falls back to full sync on 404
- **`syncGmailEmails(accountId)`** — Full sync: fetch all IDs → batch process → store historyId → start watch

#### Gmail Sender (`gmailSenderService.ts`)

- **`sendGmailEmail(...)`** — Build raw MIME, base64url encode, send via Gmail API, retry on 401 (token refresh)

#### Manual Email (`manualEmailService.ts`)

- **`testManualConnection(email, appPassword, config?)`** — Verify IMAP + SMTP connectivity
- **`sendManualEmail(...)`** — Send via nodemailer SMTP
- **`syncManualEmails(accountId)`** — IMAP sync: list mailboxes, fetch last 6 months, parse with mailparser
- **`unspamManualMessage(...)`** — IMAP move from Spam to INBOX

#### Auth (`googleAuthService.ts`)

- **`getGoogleAuthUrl()`** — Scopes: `gmail.readonly`, `gmail.modify`, `gmail.send`, `gmail.labels`, `userinfo.email`, `userinfo.profile`, `mail.google.com`
- **`handleAuthCallback(code, userId)`** — Exchange code, fetch user email, encrypt refresh token, upsert account
- **`refreshAccessToken(accountId)`** — Decrypt refresh token, refresh via Google, update access_token

#### Email Processing (`emailSyncLogic.ts`)

- **`handleEmailSent(data)`** — Find/create contact, inherit thread stage or default to COLD_LEAD, upsert thread + message
- **`handleEmailReceived(data, sentThreadIds?)`** — Find/create contact, detect conversation (reply to sent) → auto-promote to LEAD, keyword detection, upsert

#### Tracking (`trackingService.ts`)

- **`generateTrackingId()`** — UUID with dashes stripped
- **`getBaseUrl()`** — `NEXT_PUBLIC_APP_URL` || `VERCEL_URL` || `localhost`
- **`prepareTrackedEmail(body, isEnabled)`** — Wraps links with `/api/track/click?t=&url=` + appends 1x1 tracking pixel

---

## 6. Email System (End-to-End)

### 6.1 Gmail OAuth Flow

```
User clicks "Connect Gmail"
  → getGoogleAuthUrlAction() → redirect to Google consent
  → User grants access
  → Google redirects to /api/auth/google/callback
  → Exchange authorization code for tokens
  → Fetch user email from Google
  → Encrypt refresh token (AES-256-GCM)
  → Upsert GmailAccount (connectionMethod: OAUTH)
  → Trigger full sync (fire-and-forget)
  → Redirect to /accounts
```

**Note:** The OAuth callback currently uses a hardcoded `userId` — see [Security Issues](#94-known-security-issues).

### 6.2 Email Sync Pipeline

**Three sync strategies:**

1. **Push (Pub/Sub):** Google sends notification to `/api/webhooks/gmail` → decode base64 → `syncAccountHistory(accountId, newHistoryId)`
2. **History sync:** `history.list(startHistoryId)` → filter `messagesAdded` → `processBatch` → update `historyId`. Falls back to full sync on 404 (history expired).
3. **Full sync:** `fetchAllMessageIds` (paginated) → `processBatch` (concurrency=20, `Promise.allSettled`) → store `historyId` → `startGmailWatch`

**Message processing pipeline:**

```
Raw Gmail message
  → Dedup check (skip if message ID exists)
  → Fetch full message via Gmail API
  → getMessageBody() (recursive MIME walk)
  → Determine direction (SENT vs RECEIVED)
  → Route to handler:
      SENT  → handleEmailSent()  → find/create contact, inherit stage, upsert
      RECV  → handleEmailReceived() → find/create contact, auto-promote if reply, upsert
  → Progress update (100ms throttle)
```

**Batch processing:** Concurrency of 20 parallel message fetches. Uses `Promise.allSettled` so individual failures don't abort the batch.

### 6.3 Manual IMAP/SMTP

- **Connection:** `connectManualAccountAction` tests both IMAP and SMTP, encrypts app password, stores IMAP/SMTP host/port config
- **Sync:** `syncManualEmails` lists all mailboxes, fetches messages from the last 6 months, parses with `mailparser`
- **Send:** `sendManualEmail` uses nodemailer with SMTP transport

### 6.4 Email Sending Flow

```
ComposeModal → sendEmailAction(accountId, to, subject, body, threadId?, isTracked?)
  → Validate account exists
  → If tracked: prepareTrackedEmail(body)
      → wrapLinksForTracking(body, trackingId) — regex replace hrefs
      → Append 1x1 tracking pixel <img>
  → Route by connectionMethod:
      OAUTH  → sendGmailEmail() — raw MIME, base64url, Gmail API (retry on 401)
      MANUAL → sendManualEmail() — nodemailer SMTP
  → Upsert EmailMessage (direction: SENT)
  → Increment sent_count_today on account
```

### 6.5 Email Tracking System

**Tracking pixel (opens):**
```
GET /api/track?t={trackingId}
  → Record event in email_tracking_events (type: 'open', IP, user-agent)
  → RPC increment_email_opens(trackingId)
  → Return 1x1 transparent PNG
```

**Link click tracking:**
```
GET /api/track/click?t={trackingId}&url={encodedUrl}
  → Record event in email_tracking_events (type: 'click', IP, user-agent, link_url)
  → RPC increment_email_clicks(trackingId)
  → 302 redirect to original URL
```

**Owner filtering:** `OwnerSessionTracker` registers the user's IP via `POST /api/track/session`. Currently in DEBUG mode — all hits are recorded regardless of IP.

**Frontend polling:** `useRealtimeInbox` checks SENT emails within a 12-hour window for tracking count updates.

---

## 7. Database

### 7.1 Schema & Models

**7 Prisma-tracked models:**

| Model | Table | Primary Key | Notable Fields |
|-------|-------|-------------|----------------|
| User | `users` | UUID | email (unique), role (default ACCOUNT_MANAGER), status (default ACTIVE) |
| Contact | `contacts` | UUID | email (unique), isLead, pipelineStage, isClient, accountManagerId (FK) |
| GmailAccount | `gmail_accounts` | UUID | email (unique), connectionMethod (OAUTH/MANUAL), refreshToken (Text, encrypted), appPassword (Text, encrypted), status, historyId |
| EmailThread | `email_threads` | String (Gmail thread ID) | subject |
| EmailMessage | `email_messages` | String (Gmail msg ID) | gmailAccountId, threadId, contactId, from, to, subject, body (Text), snippet (Text), direction, isUnread, sentAt, pipelineStage, isSpam |
| Project | `projects` | UUID | clientId, projectName, dueDate, accountManagerId, paidStatus, quote, projectValue, priority, sourceEmailId, finalReview |
| ActivityLog | `activity_logs` | UUID | action, performedBy, note, contactId, projectId |

### 7.2 Relationships & Cascades

```
User ──1:N──> GmailAccount      (CASCADE delete)
User ──1:N──> Contact            (via accountManagerId)
User ──1:N──> Project            (RESTRICT delete — can't delete user with projects)

Contact ──1:N──> EmailMessage    (SET NULL on delete)
Contact ──1:N──> Project         (RESTRICT delete — can't delete contact with projects)
Contact ──1:N──> ActivityLog     (SET NULL on delete)

GmailAccount ──1:N──> EmailMessage  (nullify gmail_account_id to preserve CRM data before account deletion)

EmailThread ──1:N──> EmailMessage   (CASCADE delete)

Project ──N:1──> EmailMessage       (sourceEmailId, SET NULL)
Project ──1:N──> ActivityLog        (SET NULL on delete)
```

**Account removal strategy:** When removing a GmailAccount, emails linked to contacts have their `gmail_account_id` nullified (preserving CRM relationships) before the account is deleted.

### 7.3 Key Indexes

| Table | Index Columns |
|-------|--------------|
| `gmail_accounts` | `userId` |
| `contacts` | `accountManagerId`, `isLead`, `isClient` |
| `email_messages` | `(gmailAccountId, direction, sentAt DESC)`, `threadId`, `contactId`, `isUnread`, `pipelineStage` |

### 7.4 RPC Functions

| Function | Parameters | Purpose |
|----------|-----------|---------|
| `get_inbox_threads` | `p_account_ids`, `p_pipeline_stage`, `p_page`, `p_page_size`, `p_is_spam` | Paginated inbox threads with latest message per thread |
| `get_sent_threads` | `p_account_ids`, `p_page`, `p_page_size` | Paginated sent threads |
| `get_all_tab_counts` | `p_account_ids` | Badge counts for all pipeline stage tabs |
| `increment_email_opens` | `p_tracking_id` | Atomically increment opens_count |
| `increment_email_clicks` | `p_tracking_id` | Atomically increment clicks_count |

### 7.5 Untracked Tables (not in Prisma)

These tables exist in Supabase but are accessed only via raw SQL or RPC:

| Table / Column | Purpose |
|---------------|---------|
| `ignored_senders` | `email` field. Stores senders marked as NOT_INTERESTED. |
| `email_tracking_events` | `tracking_id`, `event_type`, `ip_address`, `user_agent`, `link_url`, `created_at` |
| `gmail_accounts.sent_count_today` | Daily send counter |
| `gmail_accounts.sync_progress` | 0–100 sync progress indicator |
| `gmail_accounts.avatar_url` | Google profile avatar |
| `email_messages.is_tracked` | Whether tracking was enabled for this email |
| `email_messages.tracking_id` | UUID linking to tracking events |
| `email_messages.opens_count` | Denormalized open count |
| `email_messages.clicks_count` | Denormalized click count |
| `email_messages.last_opened_at` | Timestamp of last open |
| `users.avatar_url` | User avatar |

---

## 8. Pipeline & CRM Logic

### 8.1 Pipeline Stages

```
COLD_LEAD ──(reply detected)──> LEAD ──(manual)──> OFFER_ACCEPTED ──(manual)──> CLOSED
     │                            │                       │                        │
     └──────────────────────────────────────(manual)───────────────────────────────┘
                                          ↓
                                   NOT_INTERESTED
```

| Stage | Meaning | Trigger |
|-------|---------|---------|
| COLD_LEAD | Initial outreach sent, no reply | Default on first sent email |
| LEAD | Prospect has replied | Auto-detected when a received email is in a thread that contains sent emails |
| OFFER_ACCEPTED | Deal in progress | Manual stage change |
| CLOSED | Deal completed | Manual stage change |
| NOT_INTERESTED | Opted out / unresponsive | Manual action via `markAsNotInterestedAction` |
| SPAM | Spam | Marked as spam |

### 8.2 Auto-Promotion Logic

Located in `emailSyncLogic.ts → handleEmailReceived()`:

1. On receiving an email, check if the thread contains any SENT messages (`sentThreadIds` set)
2. If yes → this is a conversation → auto-promote contact to LEAD (if currently COLD_LEAD)
3. Keyword detection is also applied (details in sync logic)
4. Contact record is auto-created via `ensureContactAction` if it doesn't exist (defaults to COLD_LEAD)

**Stage change side effects (`updateEmailStageAction`):**
- Auto-creates contact if one doesn't exist for the sender
- Updates stage on **all** messages from the same sender (not just the selected one)
- If leaving NOT_INTERESTED, removes the sender from `ignored_senders`

### 8.3 Activity Logging

The `ActivityLog` model records CRM events:
- Lead creation (`createManualLead`)
- Stage changes (`updateLeadStage`)
- Linked to `contactId` and/or `projectId` (both SET NULL on entity deletion)
- `performedBy` tracks the acting user
- Free-text `note` field for context

---

## 9. Security

### 9.1 Encryption (AES-256-GCM)

- **Algorithm:** AES-256-GCM
- **Key:** 64-character hex string (32 bytes) from `ENCRYPTION_KEY` environment variable
- **IV:** Random 12-byte IV generated per encryption operation
- **Storage format:** `iv:authTag:ciphertext` (all hex-encoded, colon-separated)
- **Used for:** Gmail refresh tokens, manual account app passwords

### 9.2 Auth & Token Management

- Google OAuth2 with automatic token refresh (listener on OAuth client)
- `refreshAccessToken(accountId)` decrypts stored refresh token, requests new access token from Google, updates in DB
- `sendGmailEmail` retries once on 401 (triggers token refresh)
- Account statuses: ACTIVE, ERROR, DISCONNECTED, SYNCING, PAUSED
- Stuck sync detection: accounts syncing for >15 minutes are auto-fixed by `getAccountsAction`

### 9.3 Security Headers

Configured in `next.config`:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

### 9.4 Known Security Issues

| Severity | Issue |
|----------|-------|
| **CRITICAL** | Hardcoded `userId` (`1ca1464d-1009-426e-96d5-8c5e8c84faac`) in OAuth callback — all accounts are linked to one user |
| **HIGH** | No signature verification on `/api/webhooks/gmail` — anyone can trigger syncs |
| **HIGH** | `/api/sync` lacks authentication — unauthenticated users can trigger syncs for any account ID |
| **MEDIUM** | No rate limiting on any endpoint |
| **MEDIUM** | No CSRF protection |

---

## 10. Configuration & Deployment

### 10.1 Environment Variables

**Supabase:**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Pooled connection string (for queries) |
| `DIRECT_URL` | Direct connection string (for migrations) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client-side) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |

**Google:**

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `GOOGLE_PUBSUB_TOPIC` | Pub/Sub topic for Gmail push notifications |

**Security:**

| Variable | Purpose |
|----------|---------|
| `ENCRYPTION_KEY` | 64-character hex string for AES-256-GCM |
| `NEXTAUTH_SECRET` | NextAuth.js secret |
| `NEXTAUTH_URL` | NextAuth.js base URL |

**App:**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | Public app URL (used for tracking pixel/link base URL) |

### 10.2 Next.js Config

- Security headers applied to all routes
- API routes configured with `Cache-Control: no-store`

### 10.3 TypeScript Config

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true
}
```

### 10.4 Vercel Deployment

| Setting | Value |
|---------|-------|
| Region | `iad1` (US East) |
| Build command | `prisma generate && next build` |
| `/api/sync` timeout | 60 seconds |
| `/api/webhooks/*` timeout | 30 seconds |
| `/api/auth/*` timeout | 30 seconds |
| All API routes | `Cache-Control: no-store` |

---

## 11. Key Patterns & Conventions

**Fire-and-forget syncs:** Sync operations are triggered and not awaited. The OAuth callback triggers a full sync, then immediately redirects. The inbox page triggers sync, waits a fixed 1500ms, then reloads (not waiting for completion).

**Concurrency guards:** Batch message processing uses `Promise.allSettled` with concurrency=20 so individual message failures don't abort the sync. Stuck syncs (>15min) are auto-recovered.

**Three-layer caching:** Memory (`globalMailboxCache`) → localStorage → server action. Cache keys incorporate type, filter, and account ID. Full flush on account switch.

**Pre-fetch optimization:** `getAccountsAction` runs email count queries per account with 5-second timeouts to prevent one slow account from blocking the UI.

**Progress tracking:** `sync_progress` (0–100) is updated during batch processing with 100ms throttle to avoid database write storms.

**Error handling philosophy:** 233 try-catch blocks across 32 files. Auth-related errors set account status to ERROR. Transient failures keep status ACTIVE. Webhook endpoints always return 200 (to prevent Google from retrying and creating duplicate work). Per-query 5-second timeouts on count operations.

**Realtime with fallback:** Primary channel is Supabase Realtime WebSocket on `email_messages`. Falls back to 15-second polling if the WebSocket connection fails.

**Settings persistence:** All user settings (polling, notifications, focus sync) are stored in localStorage — no server-side user preferences.

**Account status state machine:**

```
ACTIVE ←→ PAUSED      (manual toggle)
ACTIVE  → SYNCING     (sync started)
SYNCING → ACTIVE      (sync completed or force-stopped)
ACTIVE  → ERROR       (auth failure)
ACTIVE  → DISCONNECTED (manual removal)
```
