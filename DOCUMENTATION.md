# Unibox - Complete Application Documentation

> **Multi-Account Email CRM for Video Production Teams**
>
> Version 1.0.0 | Last Updated: March 2026

---

## Table of Contents

1. [App Overview](#1-app-overview)
2. [Tech Stack & Languages](#2-tech-stack--languages)
3. [Frontend Documentation](#3-frontend-documentation)
4. [Backend Documentation](#4-backend-documentation)
5. [Database Documentation](#5-database-documentation)
6. [App Architecture & Structure](#6-app-architecture--structure)
7. [Features List](#7-features-list)
8. [Data Flow](#8-data-flow)
9. [Third-Party Integrations](#9-third-party-integrations)
10. [Setup & Installation](#10-setup--installation)

---

## 1. App Overview

### What Is Unibox?

Unibox is a **multi-account email CRM** purpose-built for video production companies. It provides a unified inbox that aggregates emails from multiple Gmail and IMAP accounts, organizes conversations through a sales pipeline, tracks email engagement with open/click analytics, and automates outreach through multi-step email campaigns.

### The Problem It Solves

Video production teams typically manage client relationships across multiple email accounts, spreadsheets, and disconnected tools. Key pain points include:

- **Scattered communication** -- Sales reps juggle 3-5 Gmail accounts and lose track of conversations
- **No pipeline visibility** -- Managers cannot see where leads stand without asking each rep
- **Manual follow-ups** -- Reps forget to follow up, and there is no automation for outreach sequences
- **Zero engagement data** -- Teams have no idea whether their emails are being opened or ignored
- **Disjointed project tracking** -- Once a deal closes, there is no link between the email thread and the project deliverables

### How Unibox Solves It

Unibox consolidates everything into a single platform:

| Problem | Unibox Solution |
|---------|----------------|
| Scattered inboxes | Unified inbox across all Gmail & IMAP accounts |
| No pipeline visibility | Automatic lead classification (Cold Lead, Lead, Offer Accepted, Closed) |
| Manual follow-ups | Automated multi-step email campaigns with scheduling |
| No engagement data | Real-time open tracking with WhatsApp-style delivery ticks |
| Disjointed project tracking | Projects linked directly to email threads and contacts |
| Team coordination | Role-based access, account assignments, and manager dashboards |

### Target Users

- **Video production agency owners** managing sales pipelines
- **Account managers** handling client relationships across multiple accounts
- **Sales representatives** doing cold outreach and follow-ups

---

## 2. Tech Stack & Languages

### Core Technologies

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Language** | TypeScript | 5.9 | Primary language (frontend + backend) |
| **Framework** | Next.js | 16.1 | Full-stack React framework with App Router |
| **Runtime** | Node.js | 20+ | Server-side JavaScript runtime |
| **UI Library** | React | 19.2 | Component-based UI library |
| **Bundler** | Turbopack | Built-in | Next.js development bundler |
| **Database** | PostgreSQL | 15+ | Relational database (via Supabase) |
| **ORM** | Prisma | 6.19 | Type-safe database access layer |
| **BaaS** | Supabase | 2.97 | Database hosting, real-time subscriptions, auth infrastructure |

### Frontend Dependencies

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` | Core UI rendering |
| `lucide-react` | Icon library (200+ icons used across the app) |
| `recharts` | Data visualization (bar charts, line charts, pie charts) |
| `dompurify` | HTML sanitization to prevent XSS in email rendering |

### Backend Dependencies

| Package | Purpose |
|---------|---------|
| `googleapis` | Gmail API client (send, sync, watch, labels) |
| `nodemailer` | SMTP email sending for manual accounts |
| `imapflow` | IMAP email syncing for non-Gmail providers |
| `mailparser` | MIME email parsing and body extraction |
| `uuid` | UUID generation for tracking IDs and primary keys |
| `server-only` | Enforces server-side-only imports |

### Development Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | TypeScript compiler |
| `prisma` | Database schema management and migration CLI |
| `eslint` + `eslint-config-next` | Code linting with Next.js rules |
| `dotenv` | Environment variable loading |
| `pg` | PostgreSQL driver for direct migrations |
| `ts-node` | TypeScript script execution |

### Styling

| Technology | Usage |
|-----------|-------|
| **Tailwind CSS** | Utility-first CSS framework |
| **CSS Variables** | Design tokens for colors, spacing, typography, shadows |
| **CSS-in-JS** | Component-scoped styles via `<style jsx>` |
| **Inline Styles** | Dynamic styling (theme colors, responsive grids) |

No external UI component libraries (shadcn, Radix, Material-UI) are used. All components are custom-built with a Gmail-inspired design language.

---

## 3. Frontend Documentation

### 3.1 Page Structure

The application uses the Next.js App Router. Every page requires authentication except `/login` and `/invite/accept`.

| Route | Page | Description |
|-------|------|-------------|
| `/` | Inbox | Main email inbox with pipeline stage tabs (Cold, Lead, Offer Accepted, Closed, Not Interested, Spam) |
| `/login` | Login | Google OAuth sign-in page (public) |
| `/accounts` | Accounts | Gmail account management, connection, and sync controls |
| `/clients` | Clients | Client/lead database with list, grid, and board views |
| `/projects` | Projects | Project management with financial tracking and review status |
| `/campaigns` | Campaigns | Email campaign list with creation, launch, pause, and archive actions |
| `/campaigns/new` | New Campaign | Multi-step campaign builder |
| `/campaigns/[id]` | Campaign Detail | Campaign performance metrics, step management, and settings |
| `/templates` | Templates | Email template CRUD with categories and preview |
| `/analytics` | Analytics | KPI dashboard with charts, manager leaderboard, and engagement trends |
| `/sent` | Sent Mail | Sent email view with open tracking indicators |
| `/team` | Team | Team member and invitation management (admin/account manager only) |
| `/settings` | Settings | User preferences (polling, focus sync, notifications) |
| `/invite/accept` | Accept Invite | Invitation acceptance flow (public) |

Every main page has a corresponding `loading.tsx` file providing skeleton screens for instant perceived loading.

### 3.2 Layout Architecture

```
RootLayout (app/layout.tsx)
  |
  +-- FilterProvider (account selection, date range - persisted to localStorage)
       |
       +-- UIProvider (compose modal state)
            |
            +-- ClientLayout (app/components/ClientLayout.tsx)
                 |
                 +-- Sidebar (left navigation)
                 |
                 +-- Topbar (search bar with live dropdown)
                 |
                 +-- Page Content (children)
                 |
                 +-- ComposeModal (conditional, triggered from any page)
```

### 3.3 Core Components

#### Layout Components

| Component | File | Description |
|-----------|------|-------------|
| **ClientLayout** | `app/components/ClientLayout.tsx` | Main layout wrapper rendering sidebar + content + compose modal. Hides sidebar on `/login` and `/invite` routes. |
| **Sidebar** | `app/components/Sidebar.tsx` | Left navigation with links to all pages. Shows "Team" link only for ADMIN/ACCOUNT_MANAGER roles. Contains the Compose button. |
| **Topbar** | `app/components/Topbar.tsx` | Top search bar with live search dropdown, advanced search toggle, and search chips (`has:attachment`, `newer_than:7d`). Supports customizable left/right content slots. |

#### Email Components

| Component | File | Description |
|-----------|------|-------------|
| **EmailRow** | `app/components/InboxComponents.tsx` | Memoized email row with sender, subject, preview, stage badge, tracking ticks (WhatsApp-style), account label, manager name, and date. |
| **EmailDetail** | `app/components/InboxComponents.tsx` | Right-side panel showing the full email thread with reply/forward actions, stage dropdown, "Not Interested" button, and inline reply slot. |
| **ComposeModal** | `app/components/ComposeModal.tsx` | Full email compose dialog with rich text editor, formatting toolbar (bold, italic, underline, alignment, lists, quotes, highlight, strikethrough), font family/size picker, emoji picker with search and categories, CC/BCC fields, account selector, and template insertion. Supports `Cmd+Enter` to send. |
| **InlineReply** | `app/components/InlineReply.tsx` | Compact inline reply editor within the email detail view with formatting toolbar, account selector, and signature insertion. |
| **PaginationControls** | `app/components/InboxComponents.tsx` | Page navigation at the bottom of email lists. |
| **ToastStack** | `app/components/InboxComponents.tsx` | Toast notification system for success/error feedback. |

#### Modal Components

| Component | File | Description |
|-----------|------|-------------|
| **AddLeadModal** | `app/components/AddLeadModal.tsx` | New client/lead creation form with name, email, company, phone, priority, estimated value, expected close date, pipeline stage, and account manager fields. |
| **AddProjectModal** | `app/components/AddProjectModal.tsx` | New project creation form with 15+ fields: client selector, project name, dates, manager, priority, paid status, final review, quote, project value, link, brief, reference, and deduction. |
| **TemplatePickerModal** | `app/components/TemplatePickerModal.tsx` | Template selection modal with category filter tabs, search by name/subject, and template preview pane. |

#### Data Visualization Components

| Component | File | Description |
|-----------|------|-------------|
| **AnalyticsCharts** | `app/components/AnalyticsCharts.tsx` | Lazy-loaded analytics dashboard with KPI cards, reply rate and response time trends, sentiment analysis, email breakdown, manager leaderboard, top subject lines, and device/browser breakdown. |
| **CampaignTabs** | `app/components/CampaignTabs.tsx` | Campaign detail tabs (Steps, Performance, Settings) with step list, performance metrics, and campaign settings form. |
| **ABTestingAnalytics** | `app/components/ABTestingAnalytics.tsx` | A/B testing analytics visualization. |
| **ABTestingChart** | `app/components/ABTestingChart.tsx` | A/B test comparison chart. |

#### UI Primitives

| Component | File | Description |
|-----------|------|-------------|
| **Button** | `app/components/ui/Button.tsx` | Reusable button with variants (primary, secondary, danger, ghost), sizes (sm, md, lg), loading state, and icon support. |
| **FormField** | `app/components/ui/FormField.tsx` | Form field wrapper, input, select, and textarea components with consistent styling. |
| **Badge** | `app/components/ui/Badge.tsx` | Colored badge component for stage labels. |
| **ErrorAlert** | `app/components/ui/ErrorAlert.tsx` | Error message display component. |
| **LoadingStates** | `app/components/LoadingStates.tsx` | Skeleton shimmer components: `Skeleton`, `SkeletonEmailRow`, `SkeletonCard`, `PageLoader`. |
| **DateRangePicker** | `app/components/DateRangePicker.tsx` | Date range filter with presets (Today, Yesterday, Last 7/30 Days, This Year) and custom date inputs. |

### 3.4 State Management

Unibox uses a lightweight state management approach with no external state libraries (no Redux, Zustand, or MobX).

#### Context Providers

| Context | File | State | Purpose |
|---------|------|-------|---------|
| **FilterContext** | `app/context/FilterContext.tsx` | `selectedAccountId`, `startDate`, `endDate`, `accounts`, `isLoadingAccounts` | Global account selection and date range filtering. Persisted to localStorage for instant restore. |
| **UIContext** | `app/context/UIContext.tsx` | `isComposeOpen`, `composeDefaultTo` | Controls compose modal visibility and pre-filled recipient. |

#### Custom Hooks

| Hook | File | Purpose |
|------|------|---------|
| **useMailbox** | `app/hooks/useMailbox.ts` | Universal hook for all email list views (inbox, sent, client, search). Manages emails, pagination, tab counts, thread loading, multi-select, sync, and caching. |
| **usePrefetch** | `app/hooks/usePrefetch.ts` | Background prefetch of clients, managers, and projects data 2 seconds after app load. Saves to localStorage for instant navigation. |
| **useRealtimeInbox** | `src/hooks/useRealtimeInbox.ts` | Real-time email updates via Supabase real-time subscriptions. |
| **useHydration** | `app/utils/useHydration.ts` | SSR hydration check returning a boolean when client-side rendering is ready. |

#### Caching Strategy

The `useMailbox` hook implements a multi-layer cache:

| Layer | Storage | TTL | Purpose |
|-------|---------|-----|---------|
| Memory cache | Global variables | Session lifetime | Instant re-renders on tab switches |
| localStorage | Browser storage | Persistent | Instant page loads on return visits |
| Thread cache | Global variable | 5 minutes | Avoid re-fetching thread messages |
| Tab counts cache | Global variable | 30 seconds | Reduce count query frequency |

All caches are flushed when the user switches the selected Gmail account.

#### localStorage Keys

| Key | Purpose |
|-----|---------|
| `unibox_user_role` | Cached user role |
| `unibox_selected_account_id` | Selected Gmail account |
| `settings_polling_enabled` | Background polling toggle |
| `settings_polling_interval` | Polling interval (5-300 seconds) |
| `settings_focus_sync_enabled` | Refresh on window focus |
| `settings_notifications_enabled` | Desktop notifications |
| `unibox_cache_mailbox_*` | Cached email lists |
| `unibox_cache_inbox_tabs_*` | Cached tab counts |
| `unibox_cache_accounts_data` | Cached accounts |
| `unibox_cache_clients_*` | Cached clients |

### 3.5 Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open compose | `C` |
| Send email | `Cmd+Enter` or `Ctrl+Enter` |
| Close detail / clear selection | `Escape` |
| Select all emails | `Ctrl+A` |
| Save inline edit | `Enter` or `Tab` |
| Cancel inline edit | `Escape` |

### 3.6 Design System

Unibox uses a Gmail-inspired design language with custom CSS variables:

```
Colors:    --bg-base, --bg-surface, --text-primary, --accent (#1a73e8), --success, --warning, --danger
Spacing:   --space-sm, --space-md, --space-lg, --space-xl, --space-2xl
Borders:   --radius-sm, --radius-md, --radius-lg, --radius-full
Typography: --text-xs, --text-sm, --text-base, --text-lg, --text-xl
Shadows:   --shadow-sm, --shadow-md
```

Key UI classes follow a BEM-like naming convention: `.gmail-email-row`, `.modal-overlay`, `.tabs-bar`, `.sidebar`, `.topbar`, `.content-split`.

### 3.7 Performance Optimizations

| Optimization | Implementation |
|-------------|----------------|
| Component memoization | `EmailRow` uses `React.memo` with custom comparator |
| Lazy loading | `AnalyticsCharts` loaded via `dynamic()` to defer the heavy Recharts bundle |
| Multi-layer caching | Memory + localStorage for instant navigation |
| Background prefetch | `usePrefetch` loads clients/projects/managers 2 seconds after initial page load |
| Skeleton loading | Skeleton screens shown during data fetch to eliminate blank screen flash |
| Search debouncing | Live search debounced at 300ms |
| Configurable polling | User-adjustable polling interval (5-300 seconds) |

---

## 4. Backend Documentation

### 4.1 API Routes

All API routes are located in `app/api/` and use the Next.js Route Handler pattern.

#### Authentication Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/auth/crm/google` | Initiates CRM Google OAuth flow. Generates CSRF state with `crm_` prefix, encodes optional `invite_token` in state, sets `crm_oauth_state` cookie (httpOnly, 10-min expiry), and redirects to Google consent screen. |
| GET | `/api/auth/crm/google/callback` | Handles CRM OAuth callback. Validates CSRF state, exchanges code for user info, creates or links user (with invite token handling), auto-creates first user as ADMIN, creates encrypted session, and redirects to home. |
| GET | `/api/auth/google/callback` | Handles Gmail account connection OAuth callback. Validates CSRF state, exchanges code for tokens, stores encrypted refresh token, triggers initial email sync, and redirects to accounts page. |

#### Email Sync Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/sync` | Triggers email sync for a specific Gmail account. Validates account ownership, determines sync type (MANUAL via IMAP, OAUTH with history via incremental sync, OAUTH without history via full sync), and checks if Gmail watch needs renewal. |
| POST | `/api/webhooks/gmail` | Receives Google Cloud Pub/Sub push notifications. Verifies Google OIDC token, decodes base64 message, extracts email address and history ID, and inserts into `webhook_events` table for deferred processing. Always returns 200 to prevent Pub/Sub retries. |

#### Email Tracking Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/track` | Open tracking via 1x1 pixel. Validates 32-char hex tracking ID, filters out email provider pre-fetches (ignores opens within 2 minutes of delivery), atomically updates `opened_at`, and returns a 1x1 PNG with cache-busting headers. |
| GET | `/api/unsubscribe` | Unsubscribe handler. Decodes email from base64url token, inserts into `unsubscribes` table (upsert), updates `campaign_contacts` status if campaign ID provided, and returns a styled HTML confirmation page. |

#### Campaign Processing Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/campaigns/process` | Three-phase campaign processor (called by Vercel Cron every 15 minutes). **Phase 1:** Enqueues campaign sends with staggered timing. **Phase 2:** Processes send queue (max 30 per account per cycle). **Phase 3:** Processes subsequence triggers (opens without replies). Requires `CRON_SECRET` bearer token. |

#### Cron Job Routes

| Method | Route | Schedule | Purpose |
|--------|-------|----------|---------|
| GET | `/api/cron/process-webhooks` | Every 2 minutes | Processes queued webhook events with exponential backoff (30s, 2min, 10min, 30min, 2hr). Marks events as DEAD_LETTER after 5 failed attempts. |
| GET | `/api/cron/renew-gmail-watches` | Every 6 days at 3 AM | Renews Gmail Pub/Sub watches before their 7-day expiry. Targets accounts with expiry < 36 hours or status in [EXPIRED, INACTIVE, ERROR]. |
| GET | `/api/cron/cleanup-tracking` | Daily | Truncates email bodies older than 60 days, deletes activity logs older than 90 days, and resets `sent_count_today` on all accounts. |

#### Utility Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/ping` | Health check endpoint (Edge runtime). Returns `{ ok: true, ts: Date.now() }`. |
| POST | `/api/backfill-email-types` | Backfills `email_type` classification on all emails and `first_reply_received` on threads. |
| POST | `/api/migrate` | Admin-only data migration endpoint. |

### 4.2 Server Actions

Server Actions are server-side functions callable directly from React components via the `'use server'` directive. All actions require authentication unless noted.

#### Authentication Actions (`src/actions/authActions.ts`)

| Action | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getCurrentUserAction` | -- | `{ userId, email, name, role }` or `null` | Fetches current user session with fresh role from database. |
| `logoutAction` | -- | Redirect to `/login` | Clears session cookie, revalidates cache. |

#### Account Actions (`src/actions/accountActions.ts`)

| Action | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getGoogleAuthUrlAction` | -- | Google OAuth URL | Generates OAuth URL with CSRF state. Requires ADMIN or ACCOUNT_MANAGER. |
| `connectManualAccountAction` | `email`, `appPassword`, `config?` | `{ success, account }` | Connects a manual IMAP/SMTP account. Tests connection before saving. Encrypts password with AES-256-GCM. |
| `getAccountsAction` | -- | `{ success, accounts }` | Fetches all accessible accounts with thread counts and manager names. Auto-fixes stuck syncs (>15 min). RBAC-filtered. |
| `reSyncAccountAction` | `accountId`, `connectionMethod` | `{ success }` | Triggers background sync. |
| `syncAllUserAccountsAction` | -- | `{ success, accountsSynced }` | Syncs all accessible accounts in background. |
| `toggleSyncStatusAction` | `accountId`, `currentStatus` | `{ success, status }` | Toggles between ACTIVE and PAUSED. |
| `stopSyncingAction` | `accountId` | `{ success }` | Force-stops a stuck sync. |
| `removeAccountAction` | `accountId` | `{ success }` | Revokes OAuth token, protects linked CRM data, cascade deletes general sync emails. |
| `renewAllWatchesAction` | -- | `{ success, renewed, failed }` | Force-renews all Gmail Pub/Sub watches. Admin only. |

#### Email Actions (`src/actions/emailActions.ts`)

| Action | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `sendEmailAction` | `{ accountId, to, cc?, bcc?, subject, body, threadId?, isTracked? }` | `{ success, messageId, threadId, trackingId }` | Sends email via Gmail API or SMTP. Injects tracking pixel if tracked. Increments daily send counter. |
| `getInboxEmailsAction` | `page, pageSize, stage, gmailAccountId?` | `{ emails, totalCount, totalPages }` | Paginated inbox using Supabase RPC. Filters by pipeline stage. RBAC-filtered. |
| `getInboxWithCountsAction` | `page, pageSize, stage, gmailAccountId?` | `{ emails, counts }` | Parallel query for inbox + tab counts in a single network round trip. |
| `getSentEmailsAction` | `page, pageSize, gmailAccountId?` | `{ emails, totalCount, totalPages }` | Paginated sent emails sorted by date. |
| `searchEmailsAction` | `query, limit, gmailAccountId?` | `[emails]` | Full-text search with operators: `from:`, `to:`, `subject:`, `has:attachment`, `newer_than:7d`. |
| `getThreadMessagesAction` | `threadId` | `[messages]` | All messages in a thread sorted by date with `has_reply` flag. |
| `markEmailAsReadAction` | `messageId` | `{ success }` | Marks single email as read. |
| `bulkMarkAsReadAction` | `messageIds[]` | `{ success }` | Batch marks emails as read. |
| `updateEmailStageAction` | `messageId, stage` | `{ success }` | Updates pipeline stage. Auto-creates contact if needed. Propagates stage to all emails from same contact. |
| `deleteEmailAction` | `messageId` | `{ success }` | Deletes email. Protects linked project references. |
| `bulkDeleteEmailsAction` | `messageIds[]` | `{ success }` | Batch delete with project link protection. |
| `markAsNotInterestedAction` | `email` | `{ success }` | Adds to `ignored_senders`, updates all related emails and contact to NOT_INTERESTED. |
| `markAsNotSpamAction` | `messageId` | `{ success }` | Moves email back to inbox via Gmail API or IMAP. Sets `is_spam = false`. |
| `getEmailTrackingAction` | `messageId` | `{ tracking_id, is_tracked, delivered_at, opened_at }` | Returns tracking status for a message. |
| `getClientEmailsAction` | `clientEmail` | `[emails]` | Fetches all emails from/to a specific contact, grouped by thread. |
| `getTabCountsAction` | `gmailAccountId?` | `{ COLD_LEAD: n, LEAD: n, ... }` | Returns per-stage email counts via Supabase RPC. |

#### Client Actions (`src/actions/clientActions.ts`)

| Action | Description |
|--------|-------------|
| `ensureContactAction` | Creates contact if not exists, returns `{ id, name, email }`. |
| `createClientAction` | Creates a new client/lead with full CRM fields. |
| Additional CRUD operations for contacts. |

#### Project Actions (`src/actions/projectActions.ts`)

| Action | Description |
|--------|-------------|
| `getAllProjectsAction` | Fetches all projects with client and manager details. Filterable by account. |
| Additional CRUD operations for projects. |

#### Campaign Actions (`src/actions/campaignActions.ts`)

| Action | Description |
|--------|-------------|
| `createCampaignAction` | Creates campaign with steps, variants, and scheduling. |
| `updateCampaignAction` | Updates campaign settings. |
| `deleteCampaignAction` | Deletes campaign and all associated data. |
| `getCampaignsAction` | Lists all campaigns accessible to the user. |
| `addContactsToCampaignAction` | Bulk-adds contacts to a campaign. |

#### Template Actions (`src/actions/templateActions.ts`)

| Action | Description |
|--------|-------------|
| Template CRUD operations with category filtering and usage tracking. |

#### Invitation Actions (`src/actions/inviteActions.ts`)

| Action | Parameters | Description |
|--------|-----------|-------------|
| `sendInviteAction` | `{ email, name, role, assignedGmailAccountIds }` | Generates 64-char hex invite token with 72-hour expiry. Sends invite email via first available OAuth account. |
| `listInvitesAction` | -- | Lists all invitations with status and inviter name. |
| `revokeInviteAction` | `inviteId` | Sets invitation status to EXPIRED. |
| `resendInviteAction` | `inviteId` | Generates new token and resends. |
| `validateInviteTokenAction` | `token` | Public endpoint. Validates token exists, not expired, status is PENDING. |

#### User Management Actions (`src/actions/userManagementActions.ts`)

| Action | Description |
|--------|-------------|
| `listUsersAction` | Lists all users with assigned Gmail accounts. |
| `assignGmailToUserAction` | Assigns a Gmail account to a user. |
| `removeGmailFromUserAction` | Removes account assignment. |
| `updateUserRoleAction` | Changes user role. Prevents self-role-change. |
| `deactivateUserAction` | Sets user status to REVOKED. |
| `reactivateUserAction` | Sets user status to ACTIVE. |

### 4.3 Services Layer

Services contain the core business logic and external integrations.

#### Gmail Sync Service (`src/services/gmailSyncService.ts`)

The heart of the email sync system. Provides three sync strategies:

| Function | Strategy | Description |
|----------|----------|-------------|
| `syncGmailEmails(accountId)` | Full sync | Fetches all message IDs via paginated Gmail API calls, then fetches full message payloads. Used for initial account setup. |
| `syncAccountHistory(accountId, historyId?)` | Incremental | Uses Gmail History API to fetch only changed messages since last `historyId`. Efficient for real-time updates. |
| `startGmailWatch(accountId)` | Push setup | Registers a Gmail Pub/Sub watch (7-day expiry) to receive real-time push notifications on account changes. |

Additional functions:
- `getOAuthClient(account)` -- Creates OAuth2 client with auto-token-refresh on 401
- `getMessageBody(payload)` -- Extracts text/html body from Gmail MIME payload (caps at 100KB)
- `fetchAllMessageIds(gmail, labelIds, query?, maxMessages?)` -- Paginated message list retrieval
- `unspamGmailMessage(account, messageId)` -- Moves message back to Inbox via Gmail API

#### Email Sync Logic (`src/services/emailSyncLogic.ts`)

Core business logic for processing synced emails:

| Function | Description |
|----------|-------------|
| `handleEmailReceived(data)` | Processes incoming email: creates contact if sender not exists, marks as CLIENT if applicable, classifies email type (INITIAL, REPLY, FORWARD, AUTO_REPLY), extracts phone from body if missing, updates thread's `first_reply_received`, triggers auto-reply detection. |
| `handleEmailSent(data)` | Processes outgoing email: inserts message record, links to contact if exists. |
| `classifyEmailInThread(message, priorMessages)` | Determines email type: OUTREACH_FIRST, FOLLOW_UP, CONVERSATIONAL, FIRST_REPLY, CONTINUED_REPLY. |
| `isAutoReply(subject, body)` | Pattern matching for auto-reply detection (out-of-office, vacation, etc.). |
| `extractEmail(raw)` | Parses RFC 2822 `"Name <email@domain>"` format. |
| `markAsClient(contactId, emailDate, gmailAccountId, emailBody?)` | Updates contact to CLIENT status. |

#### Gmail Sender Service (`src/services/gmailSenderService.ts`)

| Function | Description |
|----------|-------------|
| `sendGmailEmail(params)` | Constructs MIME message manually, encodes in base64url for Gmail API, handles UTF-8 subject encoding, auto-refreshes token on AUTH error, calls `handleEmailSent()` to persist to DB. |

#### Manual Email Service (`src/services/manualEmailService.ts`)

| Function | Description |
|----------|-------------|
| `testManualConnection(email, appPassword, config?)` | Tests both IMAP and SMTP connections before saving. Defaults to Gmail servers. |
| `sendManualEmail(params)` | Sends via nodemailer/SMTP with encrypted app password. |
| `syncManualEmails(accountId)` | Fetches emails via ImapFlow, parses with mailparser, syncs to database. |
| `unspamManualMessage(account, messageId)` | Moves message via IMAP. |

#### Campaign Processor Service (`src/services/campaignProcessorService.ts`)

| Function | Description |
|----------|-------------|
| `enqueueCampaignSends()` | Phase 1: Finds RUNNING campaigns, identifies contacts due for next step, creates `campaign_send_queue` entries with staggered delays, checks schedule window (timezone-aware), checks daily send limits, skips if company domain has opt-outs, handles "new leads" throttling. |
| `isWithinSchedule(campaign)` | Timezone-aware check if current time is within the campaign's sending window. |

#### Send Queue Processor Service (`src/services/sendQueueProcessorService.ts`)

| Function | Description |
|----------|-------------|
| `processSendQueue()` | Phase 2: Processes QUEUED items where `scheduled_for <= now`, groups by account (max 30/account/cycle for Gmail rate limit safety), replaces placeholders (`{{first_name}}`, `{{company}}`, etc.), resolves spintax (`{option1|option2}`), injects unsubscribe link, injects tracking pixel, sends email, updates tracking on message. |

#### Webhook Processor Service (`src/services/webhookProcessorService.ts`)

| Function | Description |
|----------|-------------|
| `processWebhookEvents()` | Processes PENDING webhook events with exponential backoff retry. Fetches up to 20 events per cycle. Retry delays: 30s, 2min, 10min, 30min, 2hr. After 5 attempts: marks as DEAD_LETTER. |

#### Watch Renewal Service (`src/services/watchRenewalService.ts`)

| Function | Description |
|----------|-------------|
| `renewExpiringWatches()` | Finds ACTIVE OAUTH accounts with watch expiring within 36 hours or in ERROR/INACTIVE/EXPIRED status. Refreshes access tokens and re-registers Pub/Sub watches. Triggers non-blocking catch-up sync. |

#### Tracking Service (`src/services/trackingService.ts`)

| Function | Description |
|----------|-------------|
| `generateTrackingId()` | Generates UUIDv4 (32 hex characters). |
| `prepareTrackedEmail(body, isTrackingEnabled)` | Injects a 1x1 PNG tracking pixel image tag before `</body>` or `</html>`. URL format: `/api/track?t={trackingId}`. Returns `{ body, trackingId }`. |

#### Google Auth Service (`src/services/googleAuthService.ts`)

| Function | Description |
|----------|-------------|
| `generateOAuthState()` | 32 bytes random, 64 hex chars for CSRF protection. |
| `validateOAuthState(returned, expected)` | Timing-safe string comparison. |
| `getGoogleAuthUrl(state?)` | Returns OAuth URL with Gmail scopes. |
| `handleAuthCallback(code, userId)` | Exchanges code for tokens, gets user info, stores encrypted refresh token. |
| `refreshAccessToken(accountId)` | Refreshes expired access token, updates DB. |

**OAuth Scopes:**
- `gmail.readonly`, `gmail.modify`, `gmail.send`, `gmail.labels`
- `userinfo.email`, `userinfo.profile`
- `mail.google.com`

#### CRM Auth Service (`src/services/crmAuthService.ts`)

Lightweight auth for CRM login (no refresh token needed):
- `getCrmAuthUrl(state)` -- Minimal scopes (userinfo only)
- `verifyCrmAuth(code)` -- Returns user info (email, name, avatar)
- `getWhitelistedUser(email)` -- Checks if user exists in system

#### Pipeline Logic (`src/services/pipelineLogic.ts`)

Sales pipeline stage definitions and transition rules.

### 4.4 Authentication & Security

#### Session Management (`src/lib/auth.ts`)

| Property | Value |
|----------|-------|
| Format | `{iv}:{encrypted_payload}` (AES-256-CBC) |
| Cookie | `unibox_session` (httpOnly, secure, sameSite: lax) |
| Expiry | 7 days |
| Payload | `{ userId, email, name, role, exp }` |

Functions: `createSession(user)`, `getSession()`, `clearSession()`

#### Role-Based Access Control (`src/utils/accessControl.ts`)

| Role | Access Level |
|------|-------------|
| **ADMIN** | Full access to all accounts, team management, settings |
| **ACCOUNT_MANAGER** | Same as ADMIN (legacy) |
| **SALES** | Limited to assigned Gmail accounts only |

The `getAccessibleGmailAccountIds(userId, role)` function returns `'ALL'` for admin roles or an array of specific account IDs for SALES users via the `user_gmail_assignments` table.

#### Middleware (`middleware.ts`)

Two-layer protection:
1. **IP Whitelist** -- Hardcoded allowed IPs (public, IPv6, LAN, localhost). Returns 403 if not whitelisted.
2. **Session Validation** -- Checks for valid `unibox_session` cookie. Redirects to `/login` if missing.

Public paths excluded: `/login`, `/invite`

#### Encryption (`src/utils/encryption.ts`)

| Algorithm | Key Length | Output Format |
|-----------|-----------|---------------|
| AES-256-GCM | 256 bits (64-char hex `ENCRYPTION_KEY`) | `{iv}:{authTag}:{ciphertext}` |

Used for: OAuth refresh tokens, IMAP app passwords, session payloads.

#### Security Headers (via `next.config.js`)

| Header | Value |
|--------|-------|
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Cache-Control (static) | public, max-age=31536000, immutable |

### 4.5 Utility Functions

| File | Functions | Description |
|------|-----------|-------------|
| `src/utils/encryption.ts` | `encrypt(text)`, `decrypt(data)` | AES-256-GCM encryption/decryption |
| `src/utils/emailNormalizer.ts` | `normalizeEmail(raw)` | Extracts and lowercases email from RFC 2822 format |
| `src/utils/accessControl.ts` | `getAccessibleGmailAccountIds()`, `requireAdmin()` | RBAC utilities |
| `src/utils/placeholders.ts` | `replacePlaceholders(text, contact, vars?)` | Replaces `{{first_name}}`, `{{company}}`, etc. with defaults |
| `src/utils/spintax.ts` | `resolveSpintax(text)` | Resolves `{option1|option2}` syntax with nesting support |
| `src/utils/unsubscribe.ts` | `generateUnsubscribeLink()`, `injectUnsubscribeLink()` | Generates and injects unsubscribe links |
| `src/utils/csvParser.ts` | `parseLeadsCSV(csvText)` | Parses CSV into typed `ParsedLead` objects with custom column support |
| `src/utils/phoneExtractor.ts` | -- | Extracts phone numbers from email body text |
| `src/utils/accountHelpers.ts` | `buildAccountMap(accountIds)` | Maps account ID to `{ email, manager_name }` |
| `src/utils/emailTransformers.ts` | -- | Transform email rows for API response |
| `src/utils/threadHelpers.ts` | -- | Thread-related helper functions |
| `src/utils/pagination.ts` | -- | Pagination limit helpers |

---

## 5. Database Documentation

### 5.1 Overview

| Property | Value |
|----------|-------|
| **Database** | PostgreSQL 15+ |
| **Hosting** | Supabase |
| **ORM** | Prisma 6.19 |
| **Connection (runtime)** | Pooled via PgBouncer (`DATABASE_URL`) |
| **Connection (migrations)** | Direct (`DIRECT_URL`) |
| **Naming Convention** | All models use `@@map()` for snake_case table/column names |
| **Total Models** | 20 |
| **Total Enums** | 21 |

### 5.2 Entity-Relationship Diagram (Textual)

```
                                    +-------------------+
                                    |      users        |
                                    +-------------------+
                                    | id (PK, UUID)     |
                                    | name              |
                                    | email (UNIQUE)    |
                                    | role (ENUM)       |
                                    | status (ENUM)     |
                                    | avatar_url        |
                                    | invited_by        |
                                    +-------------------+
                                         |  |  |  |
             +---------------------------+  |  |  +---------------------------+
             |                              |  |                              |
             v                              |  v                              v
    +--------------------+                  |  +--------------------+  +---------------+
    |  gmail_accounts    |                  |  |   invitations      |  |  campaigns    |
    +--------------------+                  |  +--------------------+  +---------------+
    | id (PK, UUID)      |                  |  | id (PK, UUID)      |  | id (PK)       |
    | email (UNIQUE)     |                  |  | email (UNIQUE)     |  | name          |
    | connection_method  |                  |  | token (UNIQUE)     |  | status        |
    | access_token       |                  |  | role               |  | goal          |
    | refresh_token      |<--+              |  | status             |  | schedule_*    |
    | app_password       |   |              |  | expires_at         |  | rate_limits   |
    | status             |   |              |  +--------------------+  +---------------+
    | history_id         |   |              |                              |
    | watch_expiry       |   |              v                              |
    | sent_count_today   |   |     +--------------------+                  |
    +--------------------+   |     |     contacts        |                  |
             |               |     +--------------------+                  |
             |               |     | id (PK, UUID)      |                  |
             v               |     | email (UNIQUE)     |                  |
    +------------------------+     | pipeline_stage     |                  |
    | user_gmail_assignments |     | contact_type       |                  |
    +------------------------+     | company, phone     |                  |
    | user_id (FK)           |     | priority           |                  |
    | gmail_account_id (FK)  |     | estimated_value    |                  |
    +------------------------+     | account_manager_id |                  |
                                   +--------------------+                  |
                                        |           |                      |
                    +-------------------+           |                      |
                    |                               |                      |
                    v                               v                      v
           +------------------+            +---------------+     +------------------+
           |  email_threads   |            |   projects    |     | campaign_steps   |
           +------------------+            +---------------+     +------------------+
           | id (PK)          |            | id (PK, UUID) |     | id (PK)          |
           | subject          |            | project_name  |     | step_number      |
           | first_reply_rcvd |            | paid_status   |     | delay_days       |
           +------------------+            | priority      |     | subject, body    |
                    |                      | project_value |     | is_subsequence   |
                    v                      +---------------+     +------------------+
           +------------------+                    |                      |
           | email_messages   |                    v                      v
           +------------------+            +---------------+     +------------------+
           | id (PK)          |            | activity_logs |     | campaign_variants|
           | thread_id (FK)   |            +---------------+     +------------------+
           | gmail_account_id |            | action        |     | variant_label    |
           | contact_id (FK)  |            | performed_by  |     | subject, body    |
           | from/to_email    |            | note          |     | weight           |
           | subject, body    |            +---------------+     +------------------+
           | direction (ENUM) |
           | email_type (ENUM)|          +---------------------+
           | pipeline_stage   |          | campaign_contacts   |
           | is_tracked       |          +---------------------+
           | tracking_id      |          | campaign_id (FK)    |
           | opened_at        |          | contact_id (FK)     |
           +------------------+          | status (ENUM)       |
                    |                    | current_step_number |
                    v                    | custom_variables    |
           +------------------+          +---------------------+
           | campaign_emails  |
           +------------------+          +---------------------+
           | campaign_id      |          | campaign_send_queue |
           | step_id          |          +---------------------+
           | contact_id       |          | status (ENUM)       |
           | variant_label    |          | scheduled_for       |
           +------------------+          | attempts            |
                                         +---------------------+

           +------------------+          +---------------------+
           | webhook_events   |          | email_templates     |
           +------------------+          +---------------------+
           | source           |          | name, subject, body |
           | payload (JSON)   |          | category (ENUM)     |
           | status (ENUM)    |          | is_shared           |
           | attempts         |          | usage_count         |
           +------------------+          +---------------------+

           +------------------+          +---------------------+
           | ignored_senders  |          | unsubscribes        |
           +------------------+          +---------------------+
           | email (PK)       |          | email (UNIQUE)      |
           +------------------+          +---------------------+
```

### 5.3 Models in Detail

#### Users (`users`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Primary key |
| `name` | String | Required | Display name |
| `email` | String | Unique | Login email |
| `role` | Enum (Role) | Default: ADMIN | ADMIN or SALES |
| `invited_by` | String? | Optional | ID of inviting user |
| `status` | Enum (UserStatus) | Default: ACTIVE | ACTIVE or REVOKED |
| `avatar_url` | String? | Optional | Google profile picture URL |
| `created_at` | DateTime | Default: now() | Account creation timestamp |

**Relations:** Has many GmailAccounts, Contacts (as manager), Projects, Invitations, UserGmailAssignments, Campaigns, EmailTemplates.

---

#### Contacts (`contacts`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Primary key |
| `name` | String? | Optional | Contact name |
| `email` | String | Unique | Contact email |
| `source` | String? | Optional | Data source (manual, import, auto) |
| `notes` | String? | Optional | Free-text notes |
| `is_lead` | Boolean | Default: false | Is this a lead? |
| `pipeline_stage` | Enum? | Optional | COLD_LEAD, LEAD, OFFER_ACCEPTED, CLOSED, NOT_INTERESTED |
| `is_client` | Boolean | Default: false | Has this contact become a client? |
| `contact_type` | Enum | Default: LEAD | LEAD or CLIENT |
| `became_client_at` | DateTime? | Optional | When contact converted to client |
| `company` | String? | Optional | Company name |
| `phone` | String? | Optional | Phone number |
| `priority` | Enum? | Optional | LOW, MEDIUM, HIGH, URGENT |
| `estimated_value` | Float? | Optional | Deal value |
| `expected_close_date` | DateTime? | Optional | Expected close date |
| `last_email_at` | DateTime? | Optional | Last email timestamp |
| `last_gmail_account_id` | UUID? | FK (SetNull) | Last Gmail account used |
| `account_manager_id` | UUID? | FK (SetNull) | Assigned account manager |
| `created_at` | DateTime | Default: now() | Creation timestamp |
| `updated_at` | DateTime | Auto-updated | Last update timestamp |

**Indexes:** `account_manager_id`, `is_lead`, `is_client`, `last_email_at`

---

#### Gmail Accounts (`gmail_accounts`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Primary key |
| `user_id` | UUID | FK (Cascade) | Creator user |
| `email` | String | Unique | Gmail address |
| `connection_method` | Enum | Default: OAUTH | OAUTH or MANUAL |
| `access_token` | String? | Optional | OAuth access token |
| `refresh_token` | Text? | Optional | Encrypted OAuth refresh token |
| `app_password` | Text? | Optional | Encrypted IMAP app password |
| `smtp_host` | String? | Optional | Custom SMTP server |
| `smtp_port` | Int? | Optional | Custom SMTP port |
| `smtp_encryption` | String? | Default: STARTTLS | TLS type |
| `imap_host` | String? | Optional | Custom IMAP server |
| `imap_port` | Int? | Optional | Custom IMAP port |
| `status` | Enum | Default: ACTIVE | ACTIVE, ERROR, DISCONNECTED, SYNCING, PAUSED |
| `last_synced_at` | DateTime? | Optional | Last successful sync |
| `history_id` | String? | Optional | Gmail history pointer for incremental sync |
| `sync_progress` | Int | Default: 0 | Sync percentage (0-100) |
| `sent_count_today` | Int | Default: 0 | Daily send counter (reset by cron) |
| `watch_expiry` | DateTime? | Optional | Pub/Sub watch expiration |
| `watch_status` | Enum | Default: INACTIVE | ACTIVE, INACTIVE, EXPIRED, ERROR |

**Index:** `user_id`

---

#### Email Threads (`email_threads`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | String | PK | Gmail thread ID |
| `subject` | String? | Optional | Thread subject |
| `first_reply_received` | Boolean | Default: false | Whether client has replied |
| `created_at` | DateTime | Default: now() | Creation timestamp |

---

#### Email Messages (`email_messages`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | String | PK | Gmail message ID |
| `gmail_account_id` | UUID? | FK (Cascade) | Source account (nullable on account deletion) |
| `thread_id` | String | FK (Cascade) | Parent thread |
| `contact_id` | UUID? | FK (SetNull) | Linked contact |
| `from_email` | String | Required | Sender email |
| `to_email` | String | Required | Recipient email |
| `subject` | Text | Required | Email subject |
| `body` | Text | Required | Full message body |
| `snippet` | Text? | Optional | Preview text |
| `direction` | Enum | Required | SENT or RECEIVED |
| `email_type` | Enum? | Optional | OUTREACH_FIRST, FOLLOW_UP, CONVERSATIONAL, FIRST_REPLY, CONTINUED_REPLY |
| `is_unread` | Boolean | Default: true | Read status |
| `sent_at` | DateTime | Required | Send/receive timestamp |
| `pipeline_stage` | Enum? | Optional | Inferred pipeline stage |
| `is_spam` | Boolean | Default: false | Spam flag |
| `is_tracked` | Boolean | Default: false | Open tracking enabled |
| `tracking_id` | String? | Optional | 32-char hex tracking ID |
| `delivered_at` | DateTime? | Optional | Server delivery confirmation |
| `opened_at` | DateTime? | Optional | First open timestamp (via pixel) |

**Indexes (11 total -- optimized for inbox queries):**
- `(gmail_account_id, direction, sent_at DESC)` -- Primary inbox query
- `(gmail_account_id, is_spam, sent_at DESC)` -- Spam filtering
- `(gmail_account_id, is_spam, pipeline_stage, sent_at DESC)` -- Stage-filtered inbox
- `thread_id` -- Thread lookup
- `contact_id`, `is_unread`, `pipeline_stage`, `from_email`, `to_email`, `sent_at`, `is_spam`, `tracking_id`

---

#### Projects (`projects`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Primary key |
| `client_id` | UUID | FK (Restrict) | Linked contact |
| `project_name` | String | Required | Project name |
| `project_date` | DateTime | Required | Start date |
| `due_date` | DateTime | Required | Due date |
| `account_manager_id` | UUID | FK (Restrict) | Assigned manager |
| `paid_status` | Enum | Default: UNPAID | UNPAID, PARTIALLY_PAID, PAID |
| `quote` | Float? | Optional | Quoted amount |
| `project_value` | Float? | Optional | Actual value |
| `project_link` | Text? | Optional | External link |
| `brief` | Text? | Optional | Project brief |
| `reference` | Text? | Optional | Reference materials |
| `deduction_on_delay` | Float? | Optional | Penalty for lateness |
| `final_review` | Enum | Default: PENDING | PENDING, APPROVED, REVISIONS_NEEDED |
| `priority` | Enum | Default: MEDIUM | LOW, MEDIUM, HIGH, URGENT |
| `source_email_id` | String? | FK (SetNull) | Originating email |

**Indexes:** `client_id`, `account_manager_id`, `created_at`

---

#### Additional Models

| Model | Table | Purpose |
|-------|-------|---------|
| **Invitation** | `invitations` | Team invitations with token, role, assigned accounts, expiry |
| **UserGmailAssignment** | `user_gmail_assignments` | Maps SALES users to accessible Gmail accounts |
| **IgnoredSender** | `ignored_senders` | Email addresses marked as "Not Interested" |
| **ActivityLog** | `activity_logs` | Audit trail for contact and project actions |
| **Campaign** | `campaigns` | Email campaign with scheduling, rate limits, A/B testing config |
| **CampaignStep** | `campaign_steps` | Individual steps in a campaign sequence with delay and subsequence support |
| **CampaignVariant** | `campaign_variants` | A/B test variants per step with weight-based distribution |
| **CampaignContact** | `campaign_contacts` | Per-contact campaign enrollment with progression state |
| **CampaignEmail** | `campaign_emails` | Audit trail linking every sent campaign email to step, contact, and variant |
| **CampaignSendQueue** | `campaign_send_queue` | Rate-limited sending queue with retry logic |
| **CampaignAnalytics** | `campaign_analytics` | Daily aggregated campaign metrics (sent, opened, clicked, replied, bounced) |
| **Unsubscribe** | `unsubscribes` | Global unsubscribe list for compliance |
| **WebhookEvent** | `webhook_events` | Reliable webhook event processing with exponential backoff |
| **EmailTemplate** | `email_templates` | Reusable email templates with categories and usage tracking |

### 5.4 Enums

| Enum | Values |
|------|--------|
| **Role** | `ADMIN`, `SALES` |
| **UserStatus** | `ACTIVE`, `REVOKED` |
| **InvitationStatus** | `PENDING`, `ACCEPTED`, `EXPIRED` |
| **GmailAccountStatus** | `ACTIVE`, `ERROR`, `DISCONNECTED`, `SYNCING`, `PAUSED` |
| **ConnectionMethod** | `OAUTH`, `MANUAL` |
| **WatchStatus** | `ACTIVE`, `INACTIVE`, `EXPIRED`, `ERROR` |
| **PipelineStage** | `LEAD`, `COLD_LEAD`, `OFFER_ACCEPTED`, `CLOSED`, `NOT_INTERESTED` |
| **EmailDirection** | `SENT`, `RECEIVED` |
| **EmailType** | `OUTREACH_FIRST`, `FOLLOW_UP`, `CONVERSATIONAL`, `FIRST_REPLY`, `CONTINUED_REPLY` |
| **ContactType** | `LEAD`, `CLIENT` |
| **Priority** | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| **PaidStatus** | `UNPAID`, `PARTIALLY_PAID`, `PAID` |
| **FinalReviewStatus** | `PENDING`, `APPROVED`, `REVISIONS_NEEDED` |
| **CampaignGoal** | `COLD_OUTREACH`, `FOLLOW_UP`, `RETARGETING` |
| **CampaignStatus** | `DRAFT`, `SCHEDULED`, `RUNNING`, `PAUSED`, `COMPLETED`, `ARCHIVED` |
| **CampaignContactStatus** | `PENDING`, `IN_PROGRESS`, `COMPLETED`, `STOPPED`, `BOUNCED`, `UNSUBSCRIBED` |
| **CampaignStoppedReason** | `REPLIED`, `MANUAL`, `UNSUBSCRIBED` |
| **SubsequenceTrigger** | `OPENED_NO_REPLY` |
| **WebhookEventStatus** | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `DEAD_LETTER` |
| **SendQueueStatus** | `QUEUED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED` |
| **TemplateCategory** | `GENERAL`, `COLD_OUTREACH`, `FOLLOW_UP`, `RETARGETING`, `PROJECT_UPDATE` |

---

## 6. App Architecture & Structure

### 6.1 High-Level Architecture

```
+-----------------------------------------------------+
|                     CLIENT (Browser)                 |
|                                                      |
|   Next.js App Router (React 19)                      |
|   +-----------------------------------------------+  |
|   | Pages (app/**/page.tsx)                        |  |
|   | Components (app/components/*)                  |  |
|   | Context (FilterContext, UIContext)              |  |
|   | Hooks (useMailbox, usePrefetch)                 |  |
|   | localStorage cache layer                       |  |
|   +-----------------------------------------------+  |
+-----------------------------------------------------+
          |                          |
          | Server Actions           | API Routes
          | (direct RPC)             | (REST/Webhooks)
          v                          v
+-----------------------------------------------------+
|                     SERVER (Node.js)                 |
|                                                      |
|   Server Actions Layer (src/actions/*)               |
|   +-----------------------------------------------+  |
|   | Auth, Email, Client, Project, Campaign,        |  |
|   | Template, Invite, User Management Actions      |  |
|   +-----------------------------------------------+  |
|                       |                               |
|   Services Layer (src/services/*)                    |
|   +-----------------------------------------------+  |
|   | Gmail Sync, Email Sync Logic, Gmail Sender,    |  |
|   | Manual Email, Campaign Processor, Send Queue,  |  |
|   | Webhook Processor, Watch Renewal, Tracking,    |  |
|   | Google Auth, CRM Auth, Pipeline Logic          |  |
|   +-----------------------------------------------+  |
|                       |                               |
|   Utilities Layer (src/utils/*)                      |
|   +-----------------------------------------------+  |
|   | Encryption, Access Control, Email Normalizer,  |  |
|   | Placeholders, Spintax, CSV Parser, etc.        |  |
|   +-----------------------------------------------+  |
+-----------------------------------------------------+
          |                          |
          v                          v
+---------------------+  +-----------------------+
|   Supabase          |  |   Google Cloud        |
|   (PostgreSQL)      |  |                       |
|   - Pooled (runtime)|  | - Gmail API           |
|   - Direct (migrate)|  | - OAuth 2.0           |
|   - Realtime WS     |  | - Pub/Sub (webhooks)  |
+---------------------+  +-----------------------+
```

### 6.2 Complete Folder Structure

```
unibox/
|
+-- app/                                # Next.js App Router
|   +-- layout.tsx                      # Root layout (providers wrapping)
|   +-- page.tsx                        # Main inbox page
|   +-- loading.tsx                     # Global loading fallback
|   +-- globals.css                     # Global styles, CSS variables, skeleton animations
|   +-- icon.svg                        # Favicon
|   |
|   +-- login/page.tsx                  # Google OAuth login page
|   +-- invite/accept/page.tsx          # Invitation acceptance flow
|   |
|   +-- accounts/                       # Gmail account management
|   |   +-- page.tsx                    # Account list, connect, sync controls
|   |   +-- loading.tsx                 # Skeleton loading state
|   |
|   +-- analytics/                      # Analytics dashboard
|   |   +-- page.tsx                    # KPIs, charts, manager leaderboard
|   |   +-- loading.tsx
|   |
|   +-- campaigns/                      # Campaign management
|   |   +-- page.tsx                    # Campaign list
|   |   +-- loading.tsx
|   |   +-- new/page.tsx               # Multi-step campaign builder
|   |   +-- [id]/                      # Dynamic campaign detail
|   |       +-- page.tsx               # Campaign performance & settings
|   |       +-- CampaignCharts.tsx     # Campaign-specific charts
|   |
|   +-- clients/                        # Client/lead management
|   |   +-- page.tsx                    # List/grid/board views
|   |   +-- loading.tsx
|   |
|   +-- projects/                       # Project management
|   |   +-- page.tsx                    # Project list with financial tracking
|   |   +-- loading.tsx
|   |
|   +-- sent/page.tsx                   # Sent email view
|   +-- settings/                       # User preferences
|   |   +-- page.tsx
|   |   +-- loading.tsx
|   |
|   +-- team/                           # Team management (admin only)
|   |   +-- page.tsx                    # Members + invitations
|   |   +-- loading.tsx
|   |
|   +-- templates/                      # Email templates
|   |   +-- page.tsx                    # Template CRUD
|   |   +-- loading.tsx
|   |
|   +-- components/                     # Shared React components
|   |   +-- ClientLayout.tsx            # Main layout wrapper
|   |   +-- Sidebar.tsx                 # Left navigation sidebar
|   |   +-- Topbar.tsx                  # Top search bar
|   |   +-- InboxComponents.tsx         # EmailRow, EmailDetail, Pagination, ToastStack
|   |   +-- ComposeModal.tsx            # Email compose dialog
|   |   +-- InlineReply.tsx             # Inline reply editor
|   |   +-- AddProjectModal.tsx         # New project form
|   |   +-- AddLeadModal.tsx            # New client form
|   |   +-- TemplatePickerModal.tsx     # Template selection modal
|   |   +-- LoadingStates.tsx           # Skeleton components
|   |   +-- DateRangePicker.tsx         # Date range filter
|   |   +-- AnalyticsCharts.tsx         # Analytics visualizations (lazy-loaded)
|   |   +-- CampaignTabs.tsx            # Campaign detail tabs
|   |   +-- ABTestingAnalytics.tsx      # A/B test analytics
|   |   +-- ABTestingChart.tsx          # A/B test chart
|   |   +-- ui/                         # UI primitives
|   |       +-- Button.tsx
|   |       +-- FormField.tsx
|   |       +-- Badge.tsx
|   |       +-- ErrorAlert.tsx
|   |
|   +-- context/                        # React context providers
|   |   +-- FilterContext.tsx           # Account & date range state
|   |   +-- UIContext.tsx               # Compose modal state
|   |
|   +-- hooks/                          # Frontend hooks
|   |   +-- useMailbox.ts              # Universal email list hook
|   |   +-- usePrefetch.ts            # Background data prefetch
|   |
|   +-- utils/                          # Frontend utilities
|   |   +-- helpers.ts                 # Date formatting, colors, initials
|   |   +-- localCache.ts             # localStorage wrapper
|   |   +-- useHydration.ts           # SSR hydration check
|   |
|   +-- constants/                      # Frontend constants
|   |   +-- stages.ts                  # Pipeline stage colors, labels, options
|   |   +-- config.ts                  # App configuration
|   |   +-- emojis.ts                  # Emoji picker categories
|   |
|   +-- api/                            # API route handlers
|       +-- auth/
|       |   +-- google/callback/route.ts       # Gmail OAuth callback
|       |   +-- crm/google/route.ts            # CRM OAuth initiation
|       |   +-- crm/google/callback/route.ts   # CRM OAuth callback
|       |
|       +-- sync/route.ts                      # Email sync trigger
|       +-- webhooks/gmail/route.ts            # Gmail Pub/Sub webhook
|       +-- track/route.ts                     # Open tracking pixel
|       +-- unsubscribe/route.ts               # Unsubscribe handler
|       |
|       +-- campaigns/process/route.ts         # Campaign cron processor
|       |
|       +-- cron/
|       |   +-- process-webhooks/route.ts      # Webhook event processor
|       |   +-- renew-gmail-watches/route.ts   # Watch renewal
|       |   +-- cleanup-tracking/route.ts      # Data cleanup
|       |
|       +-- backfill-email-types/route.ts      # Email classification backfill
|       +-- migrate/route.ts                   # Data migration
|       +-- ping/route.ts                      # Health check (Edge)
|
+-- src/                                # Business logic layer
|   +-- actions/                        # Server Actions
|   |   +-- authActions.ts             # Login, logout, session
|   |   +-- accountActions.ts          # Gmail account CRUD & sync
|   |   +-- emailActions.ts           # Email CRUD, send, search, tracking
|   |   +-- clientActions.ts          # Contact/client management
|   |   +-- projectActions.ts         # Project CRUD
|   |   +-- campaignActions.ts        # Campaign CRUD
|   |   +-- templateActions.ts        # Template CRUD
|   |   +-- inviteActions.ts          # Team invitations
|   |   +-- userManagementActions.ts  # User role & account management
|   |   +-- analyticsActions.ts       # Analytics data retrieval
|   |
|   +-- services/                       # External service integrations
|   |   +-- gmailSyncService.ts        # Gmail API sync (full, incremental, push)
|   |   +-- emailSyncLogic.ts         # Email processing & classification
|   |   +-- gmailSenderService.ts     # Gmail API sending
|   |   +-- manualEmailService.ts     # IMAP/SMTP operations
|   |   +-- campaignProcessorService.ts # Campaign execution engine
|   |   +-- sendQueueProcessorService.ts # Rate-limited send queue
|   |   +-- webhookProcessorService.ts # Webhook event processing
|   |   +-- watchRenewalService.ts    # Gmail watch lifecycle
|   |   +-- trackingService.ts        # Email open tracking pixel
|   |   +-- googleAuthService.ts      # Google OAuth management
|   |   +-- crmAuthService.ts         # CRM authentication
|   |   +-- emailClassificationService.ts # Email type classifier
|   |   +-- pipelineLogic.ts          # Pipeline stage definitions
|   |
|   +-- utils/                          # Utility functions
|   |   +-- encryption.ts             # AES-256-GCM encrypt/decrypt
|   |   +-- accessControl.ts          # RBAC utilities
|   |   +-- emailNormalizer.ts        # Email address parsing
|   |   +-- placeholders.ts           # Template variable replacement
|   |   +-- spintax.ts                # Spintax resolver ({A|B} syntax)
|   |   +-- unsubscribe.ts            # Unsubscribe link generation
|   |   +-- csvParser.ts              # CSV import parser
|   |   +-- phoneExtractor.ts         # Phone number extraction
|   |   +-- accountHelpers.ts         # Account utility functions
|   |   +-- emailTransformers.ts      # Email data transformers
|   |   +-- threadHelpers.ts          # Thread helpers
|   |   +-- pagination.ts             # Pagination limits
|   |   +-- migrationHelpers.ts       # Data migration utilities
|   |
|   +-- lib/                            # Core libraries
|   |   +-- auth.ts                    # Session create/get/clear
|   |   +-- config.ts                  # Environment config resolution
|   |   +-- safe-action.ts            # Authenticated action wrapper
|   |   +-- supabase.ts               # Supabase server client (service role)
|   |   +-- supabase-client.ts        # Supabase browser client (anon key)
|   |
|   +-- hooks/
|   |   +-- useRealtimeInbox.ts        # Supabase real-time subscriptions
|   |
|   +-- constants/
|   |   +-- limits.ts                  # Rate limits, pagination, sync limits
|   |
|   +-- scripts/
|       +-- backfillClients.ts         # Data backfill script
|
+-- prisma/
|   +-- schema.prisma                   # Complete database schema (20 models, 21 enums)
|   +-- manual_migration.sql            # Manual SQL for edge cases
|
+-- public/
|   +-- images/                         # Static image assets
|
+-- middleware.ts                        # IP whitelist + auth middleware
+-- next.config.js                      # Next.js configuration
+-- tsconfig.json                       # TypeScript configuration
+-- package.json                        # Dependencies & scripts
+-- .eslintrc.json                      # ESLint configuration
+-- .env.example                        # Environment variables template
+-- CLAUDE.md                           # AI assistant instructions
```

---

## 7. Features List

### 7.1 Unified Inbox

- **Multi-account aggregation** -- View emails from all connected Gmail and IMAP accounts in a single inbox
- **Pipeline-based tabs** -- Emails organized by sales stage: Cold Lead, Lead, Offer Accepted, Closed, Not Interested, Spam
- **Tab counts** -- Real-time count badges on each tab showing email volume per stage
- **Email threading** -- Full conversation view with all messages in a thread
- **Read/unread management** -- Mark individual or bulk emails as read/unread
- **Multi-select operations** -- Checkbox-based selection for bulk delete, bulk mark as read
- **Stage management** -- Change an email's pipeline stage via dropdown; propagates to contact and all related emails
- **Not Interested / Not Spam** -- One-click actions to classify senders
- **Search with operators** -- Full-text search with advanced operators: `from:`, `to:`, `subject:`, `has:attachment`, `newer_than:7d`
- **WhatsApp-style delivery ticks** -- Single grey tick (sent), double grey ticks (delivered), double blue ticks (opened)

### 7.2 Email Composition

- **Rich text editor** -- ContentEditable-based editor with formatting toolbar: bold, italic, underline, strikethrough, text alignment, ordered/unordered lists, blockquotes, highlight
- **Font customization** -- Font family and font size picker
- **Emoji picker** -- Searchable emoji picker with categories
- **CC/BCC fields** -- Toggleable CC and BCC recipient fields
- **Account selector** -- Choose which Gmail account to send from
- **Template insertion** -- Insert pre-built email templates with one click
- **Reply and forward** -- Inline reply within email detail, or forward to new recipients
- **Signature insertion** -- Insert saved email signature
- **Keyboard shortcut** -- `C` to compose, `Cmd+Enter` to send
- **Open tracking** -- Automatic 1x1 tracking pixel injection for sent emails

### 7.3 Email Tracking & Analytics

- **Open tracking** -- Invisible 1x1 pixel detects when recipients open emails
- **Pre-fetch filtering** -- Ignores email provider proxy pre-fetches (Gmail, Outlook, Yahoo) within 2 minutes of delivery to prevent false positives
- **Delivery confirmation** -- Tracks when email was successfully delivered
- **Owner session detection** -- `OwnerSessionTracker` component filters out self-opens
- **Analytics dashboard** -- Comprehensive metrics:
  - Total emails sent/received
  - Reply rate trends over time
  - Average response time
  - Revenue tracking
  - Sentiment analysis (pie chart)
  - Manager leaderboard
  - Top performing subject lines
  - Device and browser breakdown
- **Date range filtering** -- Presets (Today, Last 7/30 Days, This Year) and custom ranges
- **Filter by manager and account** -- Drill down analytics by team member or Gmail account

### 7.4 Contact & Client Management

- **Three view modes** -- List view (table), Grid view (cards), Board view (Kanban by stage)
- **Inline editing** -- Click-to-edit cells for manager, estimated value, and expected close date
- **Add lead modal** -- Create new leads with name, email, company, phone, priority, estimated value, expected close date, pipeline stage, and account manager
- **Auto-contact creation** -- Contacts are automatically created when emails are synced
- **Client conversion tracking** -- Tracks when a lead becomes a client (`became_client_at`)
- **Email history per client** -- View all email threads with a specific contact
- **Pipeline stage management** -- Drag or dropdown to change contact's pipeline stage
- **Bulk removal** -- Select and remove multiple contacts

### 7.5 Project Management

- **Project creation** -- Link projects to contacts with 15+ fields: name, dates, manager, priority, paid status, quote, project value, link, brief, reference, deduction on delay, final review
- **Financial tracking** -- Paid status (Unpaid, Partially Paid, Paid), quote amounts, project values, deduction penalties
- **Review workflow** -- Final review status: Pending, Approved, Revisions Needed
- **Priority levels** -- Low, Medium, High, Urgent
- **Source email linking** -- Projects linked to the originating email thread
- **Deep linking** -- Direct URL to specific projects via query parameters
- **Activity logging** -- Audit trail of all actions on projects

### 7.6 Email Campaigns

- **Multi-step sequences** -- Create campaigns with multiple email steps, each with configurable delay
- **A/B testing** -- Each step can have Variant A and Variant B with weight-based distribution
- **Spintax support** -- Dynamic content variation with `{option1|option2}` syntax
- **Template placeholders** -- Dynamic variables: `{{first_name}}`, `{{last_name}}`, `{{company}}`, `{{email}}`, `{{phone}}` with default fallbacks (`{{var|default}}`)
- **Campaign lifecycle** -- DRAFT, SCHEDULED, RUNNING, PAUSED, COMPLETED, ARCHIVED
- **Scheduling** -- Timezone-aware send windows with day-of-week and time range restrictions
- **Rate limiting** -- Daily send limits, per-account caps (max 30/cycle), email gap timing with random jitter
- **Auto-stop on reply** -- Automatically stops the sequence when a contact replies
- **Auto-reply detection** -- Detects out-of-office and auto-reply messages
- **Company-wide opt-out** -- Stop sending to an entire company domain if one contact opts out
- **Subsequence triggers** -- Conditional follow-ups triggered by opens without replies
- **CSV import** -- Import contact lists from CSV files
- **Unsubscribe compliance** -- Auto-injected unsubscribe links with confirmation page
- **Campaign analytics** -- Daily aggregated metrics: sent, opened, clicked, replied, bounced, unsubscribed
- **Performance charts** -- Visual campaign performance over time

### 7.7 Email Templates

- **Template CRUD** -- Create, read, update, delete email templates
- **Categories** -- General, Cold Outreach, Follow-Up, Retargeting, Project Update
- **Template sharing** -- Mark templates as shared for team-wide access
- **Usage tracking** -- Track how many times each template has been used
- **Template picker** -- Modal with category filter, search, and preview pane
- **Rich text body** -- Templates support full HTML formatting

### 7.8 Multi-Account Email Management

- **OAuth connection** -- Connect Gmail accounts via Google OAuth 2.0 with full API access
- **Manual connection** -- Connect non-Gmail accounts via IMAP/SMTP with app passwords
- **Custom server config** -- Support for custom IMAP/SMTP hosts and ports
- **Three sync strategies:**
  - **Push (real-time):** Google Pub/Sub webhooks for instant new email notifications
  - **Incremental:** Gmail History API for efficient delta sync
  - **Full sync:** Complete message reconciliation for initial setup
- **Sync controls** -- Pause, resume, re-sync, stop stuck syncs
- **Connection testing** -- IMAP/SMTP connection test before saving manual accounts
- **Account removal** -- Safe removal with CRM data protection (nullifies FK, doesn't delete contacts/projects)

### 7.9 Team Management

- **Team invitations** -- Email-based invitations with 72-hour expiry and magic link tokens
- **Role-based access:**
  - **ADMIN** -- Full access to all accounts, settings, team management
  - **SALES** -- Access limited to assigned Gmail accounts
- **Account assignment** -- Assign specific Gmail accounts to SALES users
- **Member management** -- View members, change roles, deactivate/reactivate users
- **Invitation management** -- List, resend, revoke pending invitations

### 7.10 Real-Time Sync & Notifications

- **Gmail Pub/Sub webhooks** -- Real-time push notifications via Google Cloud Pub/Sub
- **Configurable polling** -- Background polling with adjustable interval (5-300 seconds)
- **Focus sync** -- Auto-refresh inbox when browser window regains focus
- **Desktop notifications** -- Browser notification support
- **Webhook reliability** -- Deferred processing with exponential backoff retry (30s to 2hr)
- **Dead letter queue** -- Events failing after 5 attempts are marked for manual inspection

### 7.11 Settings & Configuration

- **Polling settings** -- Enable/disable background polling and set interval
- **Focus sync** -- Toggle auto-refresh on window focus
- **Desktop notifications** -- Toggle browser notifications
- **App version info** -- Display framework and version information

---

## 8. Data Flow

### 8.1 Email Receiving Flow (Push)

```
1. New email arrives in Gmail
         |
2. Google Pub/Sub sends notification
         |
         v
3. POST /api/webhooks/gmail
   - Verify Google OIDC token
   - Decode base64 payload
   - Extract emailAddress + historyId
   - Insert into webhook_events (PENDING)
   - Return 200 immediately
         |
4. Cron: GET /api/cron/process-webhooks (every 2 min)
   - Fetch PENDING events where next_retry_at <= now
   - For each event:
         |
         v
5. gmailSyncService.syncAccountHistory(accountId, historyId)
   - Call Gmail History API with stored historyId
   - Get changed message IDs
   - Fetch full message payloads
   - For each message:
         |
         v
6. emailSyncLogic.handleEmailReceived(data)
   - Create/update contact
   - Classify email type (INITIAL, REPLY, FORWARD, AUTO_REPLY)
   - Extract phone from body if missing
   - Update thread's first_reply_received
   - Persist to email_messages table
         |
         v
7. Client polling detects new emails
   - useMailbox hook fetches inbox via getInboxEmailsAction
   - New emails appear in UI
```

### 8.2 Email Sending Flow

```
1. User composes email in ComposeModal
   - Selects account, enters recipients, writes body
   - Clicks Send (or Cmd+Enter)
         |
         v
2. sendEmailAction(params) [Server Action]
   - Validate authenticated user
         |
         v
3. trackingService.prepareTrackedEmail(body, isTracked)
   - Generate 32-char tracking ID
   - Inject 1x1 pixel: <img src="/api/track?t={id}">
   - Return { body, trackingId }
         |
         v
4. Send via appropriate method:
   +-- OAUTH: gmailSenderService.sendGmailEmail(params)
   |   - Construct MIME message
   |   - Encode base64url
   |   - Call Gmail API users.messages.send
   |
   +-- MANUAL: manualEmailService.sendManualEmail(params)
       - Decrypt app password
       - Send via nodemailer/SMTP
         |
         v
5. emailSyncLogic.handleEmailSent(data)
   - Insert email_messages record
   - Link to contact if exists
   - Set delivered_at timestamp
         |
         v
6. Increment sent_count_today atomically
         |
         v
7. Return { success, messageId, threadId, trackingId }
         |
         v
8. UI updates: toast notification, email list refresh
```

### 8.3 Email Open Tracking Flow

```
1. Recipient opens email in their email client
         |
2. Email client fetches tracking pixel
         |
         v
3. GET /api/track?t={trackingId}
   - Validate trackingId (32-char hex)
   - Query email_messages by tracking_id
   - Check: delivered_at < now - 2 minutes?
     +-- NO: Likely provider pre-fetch, ignore
     +-- YES: Legitimate open
         |
         v
4. UPDATE email_messages SET opened_at = now()
   (atomic, first open wins)
         |
         v
5. Return 1x1 PNG pixel with no-cache headers
         |
         v
6. Client polling detects opened_at change
   - EmailRow shows blue double-ticks
```

### 8.4 Campaign Execution Flow

```
1. Admin creates campaign (DRAFT)
   - Define steps with delays
   - Add A/B variants
   - Configure schedule & rate limits
   - Add contacts
   - Launch campaign (status -> RUNNING)
         |
         v
2. Cron: GET /api/campaigns/process (every 15 min)
         |
   +-- Phase 1: enqueueCampaignSends()
   |   - Find RUNNING campaigns
   |   - Find contacts where:
   |     - status = PENDING or IN_PROGRESS
   |     - next_send_at <= now (or delay elapsed)
   |     - Not unsubscribed, not bounced
   |   - Check isWithinSchedule(campaign) [timezone]
   |   - Check dailySendLimit not exceeded
   |   - Create campaign_send_queue entries
   |   - Stagger: email_gap_minutes + random jitter
   |
   +-- Phase 2: processSendQueue()
   |   - Fetch QUEUED items where scheduled_for <= now
   |   - Group by account (max 30/account/cycle)
   |   - For each item:
   |     - Replace placeholders: {{first_name}}, etc.
   |     - Resolve spintax: {option1|option2}
   |     - Inject unsubscribe link
   |     - Inject tracking pixel
   |     - Send email (Gmail API or SMTP)
   |     - Insert campaign_emails audit record
   |     - Mark queue item as SENT
   |     - Advance contact to next step
   |
   +-- Phase 3: processSubsequenceTriggers()
       - Find contacts who OPENED but didn't REPLY
       - Within delay threshold for subsequence trigger
       - Advance to conditional follow-up step
```

### 8.5 Authentication Flow

```
A. New User (via Invitation):
   1. Admin sends invite -> token email
   2. User clicks link -> /invite/accept?token=...
   3. Page validates token (validateInviteTokenAction)
   4. User clicks "Sign in with Google"
   5. Redirect to /api/auth/crm/google?invite_token=...
   6. State encoded: crm_{csrf}.invite.{token}
   7. Google OAuth consent screen
   8. Callback: /api/auth/crm/google/callback
   9. Validate CSRF, exchange code for user info
   10. Create user, assign Gmail accounts from invitation
   11. Mark invitation as ACCEPTED
   12. Create session (encrypted cookie, 7-day expiry)
   13. Redirect to /

B. Returning User:
   1. User visits /login
   2. Click "Sign in with Google"
   3. Redirect to /api/auth/crm/google
   4. Google OAuth -> callback
   5. Look up user by email
   6. Auto-accept any pending invitations
   7. Create session, redirect to /

C. Adding Gmail Account (existing user):
   1. User clicks "Connect Gmail" on /accounts
   2. getGoogleAuthUrlAction() -> Google OAuth URL
   3. Google consent (requesting Gmail scopes)
   4. Callback: /api/auth/google/callback
   5. Exchange code for tokens
   6. Store encrypted refresh token
   7. Trigger initial full sync
   8. Redirect to /accounts
```

### 8.6 Page Load Data Flow

```
1. Browser navigates to /
         |
2. RootLayout renders
   - FilterProvider initializes
     - Checks localStorage for saved account ID
     - Fetches accounts from server (getAccountsAction)
   - UIProvider initializes
   - ClientLayout renders Sidebar + content
         |
3. Inbox page.tsx renders
   - useMailbox('inbox') hook activates
         |
4. useMailbox cache check:
   a. Check global memory cache -> instant if hit
   b. Check localStorage cache -> instant if hit
   c. Fetch from server (getInboxWithCountsAction)
         |
5. Server Action executes:
   - getSession() -> validate auth
   - getAccessibleGmailAccountIds() -> RBAC
   - Supabase RPC: get_inbox_emails -> PostgreSQL
   - Return paginated emails + tab counts
         |
6. UI renders email list
   - usePrefetch loads clients/projects in background (2s delay)
   - Polling starts (if enabled) for periodic refresh
```

---

## 9. Third-Party Integrations

### 9.1 Google APIs

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Gmail API** | Email sync (read), send, label management, history API for incremental sync | OAuth 2.0 with refresh tokens. Scopes: `gmail.readonly`, `gmail.modify`, `gmail.send`, `gmail.labels` |
| **Google OAuth 2.0** | User authentication (CRM login) and Gmail account connection | Client ID + Client Secret via Google Cloud Console |
| **Google Cloud Pub/Sub** | Real-time push notifications for Gmail account changes | Topic: `projects/{GCP_PROJECT}/topics/unibox-topic`. Watch registered per Gmail account with 7-day expiry. |
| **Google People/UserInfo API** | Fetch user profile (name, email, avatar) during OAuth | Scopes: `userinfo.email`, `userinfo.profile` |

### 9.2 Supabase

| Feature | Purpose |
|---------|---------|
| **PostgreSQL Database** | Primary data store for all application data |
| **Connection Pooling** | PgBouncer-based pooled connections for runtime queries (`DATABASE_URL`) |
| **Direct Connection** | Non-pooled connection for Prisma migrations (`DIRECT_URL`) |
| **Real-Time Subscriptions** | WebSocket-based real-time updates for inbox (via `useRealtimeInbox` hook) |
| **RPC Functions** | Server-side PostgreSQL functions: `get_inbox_emails`, `get_tab_counts`, `get_account_thread_counts` |
| **Service Role Key** | Server-side admin access bypassing Row Level Security |
| **Anon Key** | Client-side read access with Row Level Security |

### 9.3 Vercel

| Feature | Purpose |
|---------|---------|
| **Hosting** | Production deployment platform |
| **Edge Functions** | Health check endpoint (`/api/ping`) runs on edge |
| **Cron Jobs** | Scheduled triggers for webhook processing, campaign execution, watch renewal, data cleanup |
| **Environment Variables** | Secure secret management |

### 9.4 Email Protocols

| Protocol | Library | Purpose |
|----------|---------|---------|
| **IMAP** | `imapflow` | Sync emails from non-Gmail providers |
| **SMTP** | `nodemailer` | Send emails from manual (non-OAuth) accounts |
| **MIME** | `mailparser` | Parse email headers, body, and attachments |

### 9.5 Cron Schedule Summary

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| Every 2 minutes | `/api/cron/process-webhooks` | Process Gmail webhook events with retry |
| Every 15 minutes | `/api/campaigns/process` | Enqueue + send campaign emails + subsequence triggers |
| Every 6 days at 3 AM | `/api/cron/renew-gmail-watches` | Renew expiring Gmail Pub/Sub watches |
| Daily | `/api/cron/cleanup-tracking` | Truncate old email bodies, delete old logs, reset daily counters |

---

## 10. Setup & Installation

### 10.1 Prerequisites

- **Node.js** 20.x or later
- **npm** 10.x or later
- **Git** for version control
- **Supabase** account (free tier works for development)
- **Google Cloud** project with Gmail API enabled
- **Google Cloud Pub/Sub** topic created (for real-time sync)

### 10.2 Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd unibox

# Install dependencies
npm install
# This also runs `prisma generate` via the postinstall script
```

### 10.3 Environment Configuration

Copy the example environment file and fill in all values:

```bash
cp .env.example .env
```

Required environment variables:

```env
# ===========================
# DATABASE (Supabase PostgreSQL)
# ===========================
DATABASE_URL="postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# ===========================
# SUPABASE
# ===========================
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# ===========================
# ENCRYPTION
# ===========================
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY="<64-character-hex-string>"

# ===========================
# GOOGLE OAUTH
# ===========================
GOOGLE_CLIENT_ID="<ID>.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="<SECRET>"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"

# ===========================
# GOOGLE PUB/SUB (for real-time email sync)
# ===========================
GOOGLE_PUBSUB_TOPIC="projects/<GCP_PROJECT_ID>/topics/unibox-topic"

# ===========================
# AUTHENTICATION
# ===========================
NEXTAUTH_SECRET="<strong-random-string>"
NEXTAUTH_URL="http://localhost:3000"

# ===========================
# APPLICATION
# ===========================
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# ===========================
# CRON SECURITY
# ===========================
CRON_SECRET="<random-string>"

# ===========================
# DEFAULT USER (for initial setup)
# ===========================
DEFAULT_USER_ID="<user-uuid>"
NEXT_PUBLIC_DEFAULT_USER_ID="<user-uuid>"
```

### 10.4 Database Setup

```bash
# Push the schema to your Supabase database
npx prisma db push

# Or create a migration (for production)
npx prisma migrate dev --name init

# Regenerate Prisma client (if needed)
npx prisma generate
```

### 10.5 Google Cloud Setup

1. **Create a Google Cloud project** at https://console.cloud.google.com
2. **Enable the Gmail API** in the API Library
3. **Create OAuth 2.0 credentials:**
   - Application type: Web application
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/google/callback` (development)
     - `https://your-domain.vercel.app/api/auth/google/callback` (production)
4. **Create a Pub/Sub topic:**
   - Topic name: `unibox-topic` (or your choice)
   - Grant `gmail-api-push@system.gserviceaccount.com` the Publisher role on the topic
5. **Configure OAuth consent screen:**
   - Add scopes: Gmail (readonly, modify, send, labels), UserInfo (email, profile)

### 10.6 Run the Development Server

```bash
npm run dev
```

The app will start at **http://localhost:3000** with Turbopack for fast hot-module replacement.

### 10.7 Important: Middleware IP Whitelist

The middleware enforces an IP whitelist. For local development, `127.0.0.1` and `::1` are already included. If accessing from other IPs, update the `ALLOWED_IPS` array in `middleware.ts`.

### 10.8 First-Time Usage

1. Navigate to `http://localhost:3000`
2. You will be redirected to `/login`
3. Click **"Sign in with Google"** -- the first user is automatically created as ADMIN
4. Go to `/accounts` and click **"Connect Gmail Account"** to link your first Gmail account
5. The initial email sync will begin automatically
6. Your unified inbox is now ready

### 10.9 Production Deployment (Vercel)

```bash
# Build for production
npm run build

# Start production server
npm run start
```

For Vercel deployment:
1. Connect your Git repository to Vercel
2. Set all environment variables in the Vercel dashboard
3. Configure cron jobs in `vercel.json`:
   ```json
   {
     "crons": [
       { "path": "/api/cron/process-webhooks", "schedule": "*/2 * * * *" },
       { "path": "/api/campaigns/process", "schedule": "*/15 * * * *" },
       { "path": "/api/cron/renew-gmail-watches", "schedule": "0 3 */6 * *" },
       { "path": "/api/cron/cleanup-tracking", "schedule": "0 4 * * *" }
     ]
   }
   ```
4. Update `GOOGLE_REDIRECT_URI` and `NEXT_PUBLIC_APP_URL` to your production domain
5. Update the IP whitelist in `middleware.ts` for production

### 10.10 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx prisma generate` | Regenerate Prisma client |
| `npx prisma migrate dev --name <name>` | Create and apply a database migration |
| `npx prisma db push` | Push schema changes without migration (dev only) |
| `npx prisma studio` | Open Prisma Studio (visual database browser) |

---

## Appendix: Constants & Configuration Reference

### Pipeline Stages

| Stage | Label | Badge Color | Description |
|-------|-------|-------------|-------------|
| `COLD_LEAD` | Cold | Blue | New/unqualified contacts |
| `LEAD` | Lead | Yellow | Qualified leads in conversation |
| `OFFER_ACCEPTED` | Offer Accepted | Green | Deal terms agreed |
| `CLOSED` | Closed | Purple | Deal completed |
| `NOT_INTERESTED` | Not Interested | Red | Declined or unresponsive |

### System Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| Default page size | 50 | Emails per page |
| Max page size | 100 | Maximum emails per request |
| Search max results | 50 | Maximum search results |
| Max messages per sync | 100,000 | Hard cap per account |
| Campaign send per cycle | 30 per account | Gmail rate limit safety |
| Tracking rate limit | 20 per minute | Pixel request throttling |
| Open dedup window | 1 hour | Ignore duplicate opens |
| Owner session window | 24 hours | Self-open detection |
| Webhook retry delays | 30s, 2min, 10min, 30min, 2hr | Exponential backoff |
| Max webhook attempts | 5 | Before dead letter |
| Email body retention | 60 days | Truncated after (bodies only) |
| Activity log retention | 90 days | Deleted after |
| Invitation expiry | 72 hours | Magic link validity |
| Session expiry | 7 days | Login session duration |
| Watch expiry | 7 days | Gmail Pub/Sub watch duration |
| Watch renewal threshold | 36 hours | Renew when < 36hr remaining |

---

> **Unibox** -- Built with Next.js 16, React 19, Prisma, Supabase, and Google APIs.
>
> Designed for video production teams who need a unified, intelligent email CRM.
