# Unibox CRM — Complete Application Documentation

> **Version:** 1.0.0
> **Generated:** March 20, 2026
> **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 · PostgreSQL (Supabase) · Google APIs

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [Authentication & Security](#5-authentication--security)
6. [Pages & UI](#6-pages--ui)
7. [Components](#7-components)
8. [Server Actions](#8-server-actions)
9. [Services (Business Logic)](#9-services-business-logic)
10. [API Routes](#10-api-routes)
11. [Email Sync System](#11-email-sync-system)
12. [Email Classification System](#12-email-classification-system)
13. [Email Tracking](#13-email-tracking)
14. [Analytics Engine](#14-analytics-engine)
15. [Pipeline & Lead Management](#15-pipeline--lead-management)
16. [Client-Side State Management](#16-client-side-state-management)
17. [Utilities](#17-utilities)
18. [Configuration & Environment](#18-configuration--environment)
19. [Deployment](#19-deployment)

---

## 1. Overview

Unibox is a **multi-account email CRM** built for video production businesses. It connects to Gmail (OAuth) and IMAP/SMTP (manual) accounts, syncs all emails, classifies them into 5 types for accurate analytics, tracks email opens via pixel injection, manages a sales pipeline for leads/prospects, and provides a comprehensive analytics dashboard with 20+ metrics.

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **Multi-Account Email** | Connect multiple Gmail and IMAP/SMTP accounts |
| **Email Sync** | Real-time (webhook), incremental (history-based), and full sync modes |
| **Email Classification** | 5-type system: Outreach, Follow-up, Conversational, First Reply, Continued Reply |
| **Email Tracking** | 1x1 pixel injection for open rate tracking |
| **Sales Pipeline** | Lead stages: Cold Lead → Lead → Offer Accepted → Closed / Not Interested |
| **Analytics Dashboard** | 20+ metrics with charts, heatmaps, leaderboards, and funnel analysis |
| **Project Management** | Track video projects with payment status, deadlines, and review workflow |
| **Client Management** | Contact database with email history, project links, and pipeline tracking |

---

## 2. Tech Stack & Dependencies

### Core Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.x | App Router, Server Actions, API routes |
| React | 19.x | UI rendering |
| TypeScript | 5.9.x | Type safety |
| Prisma | 6.19.x | ORM & database migrations |

### Database & Auth
| Technology | Purpose |
|------------|---------|
| PostgreSQL (Supabase) | Primary database with PgBouncer pooling |
| Supabase JS Client | Server (service role) + Browser (anon key) |
| Google OAuth 2.0 | Gmail account linking + CRM login |
| AES-256-GCM | Token & password encryption at rest |

### Email Integration
| Package | Purpose |
|---------|---------|
| `googleapis` | Gmail API (read, send, sync, labels) |
| `imapflow` | IMAP client for manual accounts |
| `nodemailer` | SMTP sending for manual accounts |
| `mailparser` | Email parsing (MIME, headers, body) |

### Frontend
| Package | Purpose |
|---------|---------|
| `recharts` | Charts & data visualizations |
| `lucide-react` | Icon library |
| `dompurify` | HTML sanitization for email bodies |

### NPM Scripts
```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
# postinstall automatically runs: prisma generate
```

---

## 3. Project Structure

```
unibox-main/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout (FilterProvider → UIProvider → ClientLayout)
│   ├── page.tsx                      # Inbox page (main email view)
│   ├── globals.css                   # CSS variables, Gmail color palette, animations
│   ├── accounts/page.tsx             # Email accounts management
│   ├── analytics/page.tsx            # Analytics dashboard
│   ├── clients/page.tsx              # Client/prospect management
│   ├── projects/page.tsx             # Project tracking
│   ├── sent/page.tsx                 # Sent emails archive
│   ├── settings/page.tsx             # App settings
│   ├── login/page.tsx                # Google OAuth login
│   ├── api/
│   │   ├── auth/
│   │   │   ├── google/callback/      # Gmail account OAuth callback
│   │   │   └── crm/google/           # CRM login OAuth (initiate + callback)
│   │   ├── sync/                     # Manual email sync trigger
│   │   ├── track/                    # Email open tracking pixel
│   │   ├── webhooks/gmail/           # Google Pub/Sub webhook
│   │   ├── cron/cleanup-tracking/    # Daily maintenance cron
│   │   └── backfill-email-types/     # Email classification backfill
│   ├── components/
│   │   ├── ClientLayout.tsx          # Sidebar + content wrapper
│   │   ├── Sidebar.tsx               # Navigation menu
│   │   ├── Topbar.tsx                # Search bar with live results
│   │   ├── InboxComponents.tsx       # EmailRow, EmailDetail, Pagination, Toasts
│   │   ├── ComposeModal.tsx          # Full email composer
│   │   ├── InlineReply.tsx           # Quick reply in thread view
│   │   ├── AddLeadModal.tsx          # New lead creation form
│   │   ├── AddProjectModal.tsx       # New project creation form
│   │   ├── AnalyticsCharts.tsx       # Recharts visualizations
│   │   ├── DateRangePicker.tsx       # Date range selector with presets
│   │   ├── LoadingStates.tsx         # Skeleton loaders
│   │   └── ui/                       # Reusable UI primitives
│   │       ├── Button.tsx
│   │       ├── Badge.tsx
│   │       ├── ErrorAlert.tsx
│   │       └── FormField.tsx
│   ├── context/
│   │   ├── FilterContext.tsx         # Global account + date filters
│   │   └── UIContext.tsx             # Compose modal state
│   ├── hooks/
│   │   └── useMailbox.ts             # Email list state management
│   └── constants/
│       ├── config.ts                 # DEFAULT_USER_ID
│       ├── stages.ts                 # Pipeline stage definitions & colors
│       └── emojis.ts                 # Emoji picker data
│
├── src/
│   ├── actions/                      # Server Actions
│   │   ├── accountActions.ts         # Account CRUD, OAuth, sync
│   │   ├── analyticsActions.ts       # Analytics aggregation (23+ data series)
│   │   ├── authActions.ts            # Login, logout, session
│   │   ├── clientActions.ts          # Contact/lead CRUD
│   │   ├── emailActions.ts           # Email list, send, search, bulk ops
│   │   └── projectActions.ts         # Project CRUD
│   ├── services/                     # Business Logic
│   │   ├── gmailSyncService.ts       # Gmail API sync (OAuth, history-based, full)
│   │   ├── gmailSenderService.ts     # Gmail API sending
│   │   ├── manualEmailService.ts     # IMAP/SMTP handling
│   │   ├── emailSyncLogic.ts         # Email database persistence
│   │   ├── emailClassificationService.ts  # 5-type email classification
│   │   ├── trackingService.ts        # Tracking pixel injection
│   │   ├── googleAuthService.ts      # OAuth state & token handling
│   │   ├── crmAuthService.ts         # CRM user authentication
│   │   └── pipelineLogic.ts          # Lead stage transitions
│   ├── lib/
│   │   ├── supabase.ts               # Server Supabase client (service role)
│   │   ├── supabase-client.ts        # Browser Supabase client (anon)
│   │   ├── auth.ts                   # Session creation, validation, clearing
│   │   ├── config.ts                 # Configuration helpers
│   │   └── safe-action.ts            # Auth wrapper for server actions
│   ├── utils/
│   │   ├── encryption.ts             # AES-256-GCM encrypt/decrypt
│   │   ├── emailNormalizer.ts        # Email format normalization
│   │   ├── emailTransformers.ts      # Email DTO transformations
│   │   ├── threadHelpers.ts          # Thread-level helpers
│   │   ├── accountHelpers.ts         # Account map builder
│   │   └── pagination.ts             # Page size clamping
│   ├── hooks/
│   │   └── useRealtimeInbox.ts       # Supabase real-time subscriptions
│   └── constants/
│       └── limits.ts                 # Rate limits, pagination, sync limits
│
├── prisma/
│   └── schema.prisma                 # Database schema (all models)
├── middleware.ts                      # Route protection
├── next.config.js                     # Next.js config (security headers, externals)
├── package.json                       # Dependencies & scripts
├── tsconfig.json                      # TypeScript config (strict mode)
└── .env.example                       # Environment variable template
```

---

## 4. Database Schema

### Enums

| Enum | Values | Mapped To |
|------|--------|-----------|
| **Role** | `ACCOUNT_MANAGER`, `VIDEO_EDITOR`, `CLIENT` | `user_role` |
| **UserStatus** | `ACTIVE`, `REVOKED` | `user_status_crm` |
| **GmailAccountStatus** | `ACTIVE`, `ERROR`, `DISCONNECTED`, `SYNCING`, `PAUSED` | `gmail_account_status` |
| **ConnectionMethod** | `OAUTH`, `MANUAL` | `connection_method` |
| **PipelineStage** | `LEAD`, `COLD_LEAD`, `OFFER_ACCEPTED`, `CLOSED`, `NOT_INTERESTED` | `pipeline_stage` |
| **EmailDirection** | `SENT`, `RECEIVED` | `email_direction` |
| **EmailType** | `OUTREACH_FIRST`, `FOLLOW_UP`, `CONVERSATIONAL`, `FIRST_REPLY`, `CONTINUED_REPLY` | `email_type` |
| **PaidStatus** | `UNPAID`, `PARTIALLY_PAID`, `PAID` | `paid_status` |
| **FinalReviewStatus** | `PENDING`, `APPROVED`, `REVISIONS_NEEDED` | `final_review_status` |
| **Priority** | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | `priority_level` |

### Models

#### User → `users`
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | |
| `name` | String | |
| `email` | String | **Unique** |
| `role` | Role | Default: `ACCOUNT_MANAGER` |
| `invitedBy` | String? | |
| `status` | UserStatus | Default: `ACTIVE` |
| `avatarUrl` | String? | |
| `createdAt` | DateTime | |
| **Relations** | `gmailAccounts[]`, `handledContacts[]`, `projects[]` | |

#### Contact → `contacts`
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | |
| `name` | String? | |
| `email` | String | **Unique** |
| `source` | String? | |
| `notes` | String? | |
| `isLead` | Boolean | Default: `false` |
| `pipelineStage` | PipelineStage? | |
| `isClient` | Boolean | Default: `false` |
| `accountManagerId` | String? (FK → User) | onDelete: SetNull |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | Auto-updated |
| **Relations** | `emails[]`, `projects[]`, `activityLogs[]` | |
| **Indexes** | `accountManagerId`, `isLead`, `isClient` | |

#### GmailAccount → `gmail_accounts`
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | |
| `userId` | String (FK → User) | onDelete: Cascade |
| `email` | String | **Unique** |
| `connectionMethod` | ConnectionMethod | Default: `OAUTH` |
| `accessToken` | String? | OAuth access token |
| `refreshToken` | String? | **Encrypted** (AES-256-GCM) |
| `appPassword` | String? | **Encrypted** (manual accounts) |
| `smtpHost` | String? | Manual SMTP config |
| `smtpPort` | Int? | Manual SMTP config |
| `imapHost` | String? | Manual IMAP config |
| `imapPort` | Int? | Manual IMAP config |
| `status` | GmailAccountStatus | Default: `ACTIVE` |
| `lastSyncedAt` | DateTime? | |
| `historyId` | String? | Gmail history ID for incremental sync |
| `syncProgress` | Int | Default: `0` (0-100%) |
| `sentCountToday` | Int | Default: `0` (reset daily via cron) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | Auto-updated |
| **Relations** | `emails[]` | |
| **Indexes** | `userId` | |

#### EmailThread → `email_threads`
| Field | Type | Notes |
|-------|------|-------|
| `id` | String (PK) | Gmail thread ID |
| `subject` | String? | |
| `firstReplyReceived` | Boolean | Default: `false` — set when first inbound reply arrives |
| `createdAt` | DateTime | |
| **Relations** | `messages[]` | |

#### EmailMessage → `email_messages`
| Field | Type | Notes |
|-------|------|-------|
| `id` | String (PK) | Gmail message ID |
| `gmailAccountId` | String? (FK → GmailAccount) | Nullable (preserved after account removal) |
| `threadId` | String (FK → EmailThread) | onDelete: Cascade |
| `contactId` | String? (FK → Contact) | onDelete: SetNull |
| `fromEmail` | String | |
| `toEmail` | String | |
| `subject` | String | TEXT |
| `body` | String | TEXT |
| `snippet` | String? | TEXT |
| `direction` | EmailDirection | SENT or RECEIVED |
| `emailType` | EmailType? | Classification (5 types) |
| `isUnread` | Boolean | Default: `true` |
| `sentAt` | DateTime | |
| `pipelineStage` | PipelineStage? | |
| `isSpam` | Boolean | Default: `false` |
| `isTracked` | Boolean | Default: `false` |
| `trackingId` | String? | 32-char hex UUID |
| `deliveredAt` | DateTime? | Delivery confirmation |
| `openedAt` | DateTime? | First open timestamp |
| **Relations** | `linkedProjects[]` | |
| **Indexes** | `(gmailAccountId, direction, sentAt DESC)`, `(gmailAccountId, isSpam, sentAt DESC)`, `(gmailAccountId, isSpam, pipelineStage, sentAt DESC)`, `threadId`, `contactId`, `isUnread`, `pipelineStage`, `fromEmail`, `toEmail`, `sentAt`, `isSpam`, `trackingId` | |

#### Project → `projects`
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | |
| `clientId` | String (FK → Contact) | onDelete: Restrict |
| `projectName` | String | |
| `projectDate` | DateTime | |
| `dueDate` | DateTime | |
| `accountManagerId` | String (FK → User) | onDelete: Restrict |
| `paidStatus` | PaidStatus | Default: `UNPAID` |
| `quote` | Float? | |
| `projectValue` | Float? | |
| `projectLink` | String? | TEXT |
| `brief` | String? | TEXT |
| `reference` | String? | TEXT |
| `deductionOnDelay` | Float? | |
| `finalReview` | FinalReviewStatus | Default: `PENDING` |
| `priority` | Priority | Default: `MEDIUM` |
| `sourceEmailId` | String? (FK → EmailMessage) | onDelete: SetNull |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | Auto-updated |
| **Relations** | `activityLogs[]` | |
| **Indexes** | `clientId`, `accountManagerId`, `createdAt` | |

#### ActivityLog → `activity_logs`
| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | |
| `action` | String | |
| `performedBy` | String? | |
| `note` | String? | TEXT |
| `contactId` | String? (FK → Contact) | onDelete: SetNull |
| `projectId` | String? (FK → Project) | onDelete: SetNull |
| `createdAt` | DateTime | |
| **Indexes** | `createdAt`, `contactId`, `projectId` | |

#### IgnoredSender → `ignored_senders`
| Field | Type | Notes |
|-------|------|-------|
| `email` | String (PK) | Blacklisted sender — skipped during sync |
| `createdAt` | DateTime | |

### Entity Relationship Diagram

```
User (Account Manager)
├── GmailAccount* ──── EmailMessage* ──── EmailThread
│                                    └─── Contact
│                                          ├── Project*
│                                          └── ActivityLog*
└── Project* (as manager)

Contact
├── isLead → pipeline_stage: COLD_LEAD → LEAD → OFFER_ACCEPTED → CLOSED
├── emails* ← EmailMessage (via contact_id)
└── projects* ← Project (via client_id)
```

---

## 5. Authentication & Security

### Session Management

1. **Login Flow:**
   - User clicks "Login with Google" → redirected to Google OAuth
   - Google callback → verify email against `users` table (whitelist)
   - If whitelisted → create encrypted session cookie (AES-256-CBC, 7-day expiry)
   - Cookie name: `unibox_session`, format: `userId:encryptedToken`

2. **Route Protection** (`middleware.ts`):
   - All routes require valid session cookie except public paths
   - **Public paths:** `/login`, `/api/auth/*`, `/api/track`, `/api/webhooks`, `/api/cron`, `/_next`, `/favicon.ico`
   - Invalid/missing session → redirect to `/login?callbackUrl=...`

3. **Server Action Protection** (`safe-action.ts`):
   - `ensureAuthenticated()` wraps all server actions
   - Returns `DEFAULT_USER_ID` for shared dashboard mode
   - Redirects to `/login` if no valid session

### Encryption

| What | Algorithm | Key |
|------|-----------|-----|
| OAuth refresh tokens | AES-256-GCM | `ENCRYPTION_KEY` (64-char hex) |
| IMAP app passwords | AES-256-GCM | `ENCRYPTION_KEY` (64-char hex) |
| Session cookies | AES-256-CBC | `NEXTAUTH_SECRET` |
| OAuth state (CSRF) | 32-byte random token | Stored in httpOnly cookie (10-min TTL) |

### Security Headers (all routes)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

---

## 6. Pages & UI

### 6.1 Inbox (`/` — `app/page.tsx`)
- **Purpose:** Core email inbox with pipeline stage tab filtering
- **Features:**
  - Tab filters: All, Cold Lead, Lead, Offer Accepted, Closed, Not Interested, Spam
  - Email list with sender avatar, subject, preview, stage badge, timestamp
  - Click email → expand thread view with full conversation
  - Live search with debouncing
  - Pagination (50 emails per page)
  - Bulk select, mark as read/unread, delete, stage change
  - Inline reply within thread view

### 6.2 Sent Emails (`/sent` — `app/sent/page.tsx`)
- **Purpose:** Archive of all sent emails
- **Features:**
  - Same layout as inbox but for outbound emails
  - Thread view, reply, delete, pagination
  - Tracking status indicators (delivered, opened)

### 6.3 Accounts (`/accounts` — `app/accounts/page.tsx`)
- **Purpose:** Connect and manage email accounts
- **Features:**
  - List all connected accounts with status (Active, Error, Syncing, Paused)
  - Add Gmail account (OAuth) or Manual account (IMAP/SMTP)
  - Sync progress bar for each account
  - Re-sync, pause/resume, remove account
  - Email count and last sync timestamp per account
  - 5-minute cache with localStorage

### 6.4 Analytics (`/analytics` — `app/analytics/page.tsx`)
- **Purpose:** Comprehensive email and business analytics dashboard
- **Features:**
  - Date range picker with presets (Today, Last 7/30 Days, This Year)
  - Manager filter for team-based views
  - 20+ metrics and charts (see [Analytics Engine](#14-analytics-engine))
  - Lazy-loaded Recharts components
  - 5-minute data cache

### 6.5 Clients (`/clients` — `app/clients/page.tsx`)
- **Purpose:** Contact and prospect management
- **Features:**
  - Client list with email stats (total, unread), pipeline stage, project count
  - Click client → view email conversation history
  - Add new lead/prospect modal
  - Edit contact details, pipeline stage, manager assignment
  - 5-minute cache (100 max entries)

### 6.6 Projects (`/projects` — `app/projects/page.tsx`)
- **Purpose:** Video production project tracking
- **Features:**
  - Project list with client, dates, payment status, priority, review status
  - Edit project details inline
  - Add new project modal
  - Filter by account/manager
  - Due date and timeline tracking

### 6.7 Settings (`/settings` — `app/settings/page.tsx`)
- **Purpose:** App configuration
- **Features:**
  - Polling toggle (enable/disable, interval)
  - Focus sync toggle
  - Notifications toggle
  - All settings persisted to localStorage

### 6.8 Login (`/login` — `app/login/page.tsx`)
- **Purpose:** Authentication entry point
- **Features:**
  - Google OAuth login button
  - Error display (unauthorized, failed auth)
  - Invite-only system (whitelist validation)
  - Full-screen layout (no sidebar)

---

## 7. Components

### Layout Components

| Component | File | Purpose |
|-----------|------|---------|
| `ClientLayout` | `app/components/ClientLayout.tsx` | Sidebar + content + ComposeModal wrapper. Hides sidebar on login page |
| `Sidebar` | `app/components/Sidebar.tsx` | Navigation: Inbox, Clients, Projects, Analytics, Settings. Logout button |
| `Topbar` | `app/components/Topbar.tsx` | Search bar with live dropdown results, advanced search, focus/blur states |

### Email Components

| Component | File | Purpose |
|-----------|------|---------|
| `EmailRow` | `app/components/InboxComponents.tsx` | Individual email row: avatar, sender, subject, preview, stage badge, checkbox |
| `EmailDetail` | `app/components/InboxComponents.tsx` | Full email view with thread messages, reply options, tracking indicators |
| `PaginationControls` | `app/components/InboxComponents.tsx` | Page navigation (prev/next, page numbers) |
| `ToastStack` | `app/components/InboxComponents.tsx` | Notification toasts for user actions |
| `ComposeModal` | `app/components/ComposeModal.tsx` | Full email composer: rich text, CC/BCC, attachments, emoji picker, tracking toggle, minimize/maximize |
| `InlineReply` | `app/components/InlineReply.tsx` | Quick reply inside thread view: minimal toolbar, account select, emoji |

### Modal Components

| Component | File | Purpose |
|-----------|------|---------|
| `AddLeadModal` | `app/components/AddLeadModal.tsx` | New lead form: name, email, source dropdown, notes |
| `AddProjectModal` | `app/components/AddProjectModal.tsx` | New project form: client, dates, priority, payment, quote, links, brief |

### Data Visualization

| Component | File | Purpose |
|-----------|------|---------|
| `AnalyticsCharts` | `app/components/AnalyticsCharts.tsx` | Recharts-based: bar, area, pie charts, breakdown lists, empty states |

### Utility Components

| Component | File | Purpose |
|-----------|------|---------|
| `DateRangePicker` | `app/components/DateRangePicker.tsx` | Date range with presets (Today, Yesterday, Last 7/30 Days, This Year) |
| `LoadingStates` | `app/components/LoadingStates.tsx` | Skeleton loaders: `Skeleton`, `SkeletonEmailRow`, `SkeletonCard` |

### UI Primitives (`app/components/ui/`)

| Component | Variants |
|-----------|----------|
| `Button` | primary, secondary, danger, ghost + sizes + loading state + icons |
| `Badge` | primary, success, warning, danger, neutral + sizes |
| `ErrorAlert` | Error message with dismiss button |
| `FormField` | Label wrapper + FormInput, FormSelect, FormTextarea |

---

## 8. Server Actions

### Account Actions (`src/actions/accountActions.ts`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getGoogleAuthUrlAction()` | — | `string` (URL) | Generate Google OAuth URL with CSRF state |
| `connectManualAccountAction()` | `email, appPassword, config?` | `{success, error?, account?}` | Connect IMAP/SMTP account (tests credentials first, encrypts password) |
| `getAccountsAction()` | — | `{success, accounts[]}` | List all accounts with thread counts, auto-fix stuck syncs |
| `reSyncAccountAction()` | `accountId, connectionMethod` | `{success, error?}` | Trigger background re-sync |
| `syncAllUserAccountsAction()` | — | `{success, accountsSynced}` | Sync all user accounts |
| `toggleSyncStatusAction()` | `accountId, currentStatus` | `{success, error?, status?}` | Toggle ACTIVE ↔ PAUSED |
| `stopSyncingAction()` | `accountId` | `{success, error?}` | Force-stop sync (set progress to 100) |
| `removeAccountAction()` | `accountId` | `{success, error?}` | Remove account (revokes OAuth, preserves CRM data) |

### Email Actions (`src/actions/emailActions.ts`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `sendEmailAction()` | `accountId, to, cc?, bcc?, subject, body, threadId?, isTracked?` | `{success, messageId?, threadId?, trackingId?}` | Send email (injects tracking pixel, increments daily count) |
| `getInboxEmailsAction()` | `page?, pageSize?, stage?, gmailAccountId?` | `PaginatedEmailResult` | Paginated inbox with stage filter (uses RPC) |
| `getSentEmailsAction()` | `page?, pageSize?, gmailAccountId?` | `PaginatedEmailResult` | Paginated sent emails |
| `getClientEmailsAction()` | `paramsOrEmail, email?, accountId?` | `emails[]` or `PaginatedResult` | Emails for a specific contact |
| `getThreadMessagesAction()` | `threadId` | `messages[]` | Full thread conversation |
| `searchEmailsAction()` | `query, limit?, gmailAccountId?` | `emails[]` | Search with operators: `from:`, `to:`, `subject:`, `has:attachment`, `newer_than:` |
| `markEmailAsReadAction()` | `messageId` | `{success}` | Mark single email as read |
| `markEmailAsUnreadAction()` | `messageId` | `{success}` | Mark single email as unread |
| `bulkMarkAsReadAction()` | `messageIds[]` | `{success}` | Bulk mark as read |
| `bulkMarkAsUnreadAction()` | `messageIds[]` | `{success}` | Bulk mark as unread |
| `updateEmailStageAction()` | `messageId, stage` | `{success}` | Update pipeline stage (creates contact if needed) |
| `deleteEmailAction()` | `messageId` | `{success, error?}` | Delete email (protects linked projects) |
| `bulkDeleteEmailsAction()` | `messageIds[]` | `{success, error?}` | Bulk delete with project protection |
| `markAsNotInterestedAction()` | `email` | `{success}` | Blacklist sender + update all their messages |
| `markAsNotSpamAction()` | `messageId` | `{success, error?}` | Un-spam via Gmail API + update DB |
| `getTabCountsAction()` | `gmailAccountId?` | `Record<string, number>` | Email count per pipeline stage |
| `getEmailTrackingAction()` | `messageId` | `{tracking_id, is_tracked, delivered_at, opened_at}` | Tracking metadata |
| `markClientEmailsAsReadAction()` | `clientEmail` | `{success}` | Mark all emails from/to client as read |

### Analytics Actions (`src/actions/analyticsActions.ts`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getAnalyticsDataAction()` | `{startDate, endDate, managerId, accountId}` | Full analytics payload (see [Analytics Engine](#14-analytics-engine)) | All metrics, charts, leaderboards |

### Auth Actions (`src/actions/authActions.ts`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getCurrentUserAction()` | — | `UserSession \| null` | Current user from session cookie |
| `logoutAction()` | — | `void` | Clear session, redirect to `/login` |

### Client Actions (`src/actions/clientActions.ts`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `ensureContactAction()` | `email, name?` | Contact object | Find or create contact |
| `getClientsAction()` | `gmailAccountId?` | `contacts[]` | All contacts with project count, email stats, stage |
| `getContactAction()` | `contactId` | `{id, name, email}` | Single contact details |
| `getClientProjectsAction()` | `contactId` | `projects[]` | Projects for a contact |
| `updateClientAction()` | `clientId, updates` | `{success, error?, client?}` | Update contact fields (whitelist-protected) |

### Project Actions (`src/actions/projectActions.ts`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getAllProjectsAction()` | `gmailAccountId?` | `projects[]` | All projects with joins (client, manager, source email) |
| `getManagersAction()` | — | `{id, name}[]` | All account managers |
| `updateProjectAction()` | `projectId, payload` | `{success, error?, project?}` | Update project (validates numeric fields ≥ 0) |
| `createProjectFromEmailAction()` | `{clientId, projectName, sourceEmailId, accountManagerId?}` | `{success, error?, project?}` | Quick project from email (due = today + 7 days) |
| `createProjectAction()` | Full payload | `{success, error?, project?}` | Create project with all fields |

---

## 9. Services (Business Logic)

### Gmail Sync Service (`src/services/gmailSyncService.ts`)

| Function | Description |
|----------|-------------|
| `getOAuthClient(account)` | Create OAuth2 client, auto-refresh tokens, decrypt refresh token |
| `getMessageBody(payload)` | Recursively extract text/html from Gmail message, extract attachments, strip HTML bloat |
| `syncGmailEmails(accountId)` | Full sync: fetch all messages, classify, persist to DB |
| `syncAccountHistory(accountId)` | Incremental sync using Gmail `historyId` (delta changes only) |
| `unspamGmailMessage(account, messageId)` | Move message from Spam to Inbox via Gmail API |

### Gmail Sender Service (`src/services/gmailSenderService.ts`)

| Function | Description |
|----------|-------------|
| `sendGmailEmail({accountId, to, cc?, bcc?, subject, body, threadId?})` | Build RFC 2822 MIME message, send via Gmail API, auto-refresh token, sync to DB |

### Manual Email Service (`src/services/manualEmailService.ts`)

| Function | Description |
|----------|-------------|
| `testManualConnection(email, appPassword, config?)` | Test both IMAP and SMTP connections |
| `sendManualEmail({accountId, to, cc?, bcc?, subject, body, threadId?})` | Send via Nodemailer SMTP, decrypt app password, sync to DB |
| `syncManualEmails(accountId)` | Sync via IMAP (ImapFlow) |

### Email Sync Logic (`src/services/emailSyncLogic.ts`)

| Function | Description |
|----------|-------------|
| `handleEmailSent(data)` | Persist sent email: find/create contact, classify type, upsert thread + message |
| `handleEmailReceived(data)` | Persist received email: classify type, detect acceptance keywords, auto-advance pipeline |

### Email Classification Service (`src/services/emailClassificationService.ts`)

| Function | Description |
|----------|-------------|
| `classifySentEmail(threadMessages)` | → `OUTREACH_FIRST`, `FOLLOW_UP`, or `CONVERSATIONAL` |
| `classifyReceivedEmail(threadMessages, firstReplyReceived)` | → `FIRST_REPLY` or `CONTINUED_REPLY` |
| `classifyEmailInThread(email, priorMessages, firstReplyAlreadySet)` | Unified classifier for backfilling |

### Tracking Service (`src/services/trackingService.ts`)

| Function | Description |
|----------|-------------|
| `generateTrackingId()` | UUID v4 without dashes (32-char hex) |
| `prepareTrackedEmail(body, isTrackingEnabled?)` | Inject 1x1 tracking pixel before `</body>` or `</html>` |

### Google Auth Service (`src/services/googleAuthService.ts`)

| Function | Description |
|----------|-------------|
| `generateOAuthState()` | 32-byte random CSRF token |
| `validateOAuthState(returned, expected)` | Timing-safe comparison |
| `getGoogleAuthUrl(state?)` | OAuth URL with Gmail scopes |
| `handleAuthCallback(code, userId)` | Exchange code → encrypt + upsert tokens |
| `refreshAccessToken(accountId)` | Refresh expired token, save to DB |

### CRM Auth Service (`src/services/crmAuthService.ts`)

| Function | Description |
|----------|-------------|
| `getCrmAuthUrl(state)` | OAuth URL for CRM login (userinfo scopes only) |
| `verifyCrmAuth(code)` | Verify OAuth code, fetch user info from Google |
| `getWhitelistedUser(email)` | Check if user exists in whitelist |

### Pipeline Logic (`src/services/pipelineLogic.ts`)

| Function | Description |
|----------|-------------|
| `createManualLead({name, email, source?, notes?, accountManagerId})` | Find/create contact, promote to lead (COLD_LEAD), log activity |
| `updateLeadStage({contactId, accountManagerId, newStage})` | Update pipeline stage, log old→new transition |

---

## 10. API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/google/callback` | GET | None | Gmail account OAuth callback: validate state, exchange code, trigger sync |
| `/api/auth/crm/google` | GET | None | CRM login: generate state cookie, redirect to Google |
| `/api/auth/crm/google/callback` | GET | None | CRM login callback: verify, whitelist check, create session |
| `/api/sync` | POST | Session | Manual sync trigger: `{accountId}` body, uses history-based or full sync |
| `/api/track` | GET | Public | Tracking pixel: `?t={trackingId}` (32-char hex), returns 1x1 PNG, sets `opened_at` |
| `/api/webhooks/gmail` | POST | Verify token | Google Pub/Sub: receive push notification, trigger incremental sync |
| `/api/cron/cleanup-tracking` | GET | CRON_SECRET | Daily cleanup: truncate old bodies, delete old logs, reset sent counters |
| `/api/backfill-email-types` | POST | Session | Batch classify existing emails (50 per batch, paginated) |

---

## 11. Email Sync System

### Three Sync Modes

```
┌─────────────────────────────────────────────────────────┐
│                    EMAIL SYNC MODES                      │
├──────────────┬──────────────────┬────────────────────────┤
│ Push         │ History-based    │ Full Sync              │
│ (Real-time)  │ (Incremental)    │ (Background)           │
├──────────────┼──────────────────┼────────────────────────┤
│ Google       │ Uses historyId   │ Fetches ALL messages   │
│ Pub/Sub →    │ for delta only   │ from beginning         │
│ Webhook →    │                  │                        │
│ sync latest  │ Fast (seconds)   │ Used for first-time    │
│              │                  │ setup or reconciliation │
├──────────────┼──────────────────┼────────────────────────┤
│ Trigger:     │ Trigger:         │ Trigger:               │
│ Google push  │ Manual sync      │ Account connect or     │
│ notification │ (if historyId    │ manual sync (if no     │
│              │  exists)         │  historyId)            │
└──────────────┴──────────────────┴────────────────────────┘
```

### Sync Flow (per email)

```
Gmail/IMAP → Parse Message → Normalize Email → Find/Create Contact
  → Classify Email Type → Upsert Thread → Upsert Message
  → If received: Check acceptance keywords → Auto-advance pipeline
  → If first reply: Set thread.firstReplyReceived = true
```

### Manual Account Sync

- IMAP polling via `imapflow` for non-Gmail accounts
- Maintains connection state
- Fetches new/unseen messages
- Automatic retry on connection failure

---

## 12. Email Classification System

### The 5 Email Types

```
OUTGOING (direction = SENT):
┌──────────────────┬───────────────────────────────────────────────┐
│ OUTREACH_FIRST   │ First email sent in thread (cold outreach)    │
│ FOLLOW_UP        │ Sent again before they replied                │
│ CONVERSATIONAL   │ Sent after they already replied (dialogue)    │
└──────────────────┴───────────────────────────────────────────────┘

INCOMING (direction = RECEIVED):
┌──────────────────┬───────────────────────────────────────────────┐
│ FIRST_REPLY      │ First inbound reply from contact in thread    │
│ CONTINUED_REPLY  │ Subsequent inbound replies                    │
└──────────────────┴───────────────────────────────────────────────┘
```

### Classification Logic

```
For SENT emails:
  if no prior SENT in thread       → OUTREACH_FIRST
  if prior RECEIVED exists         → CONVERSATIONAL
  else (sent before, no reply yet) → FOLLOW_UP

For RECEIVED emails:
  if thread.firstReplyReceived = false AND no prior RECEIVED → FIRST_REPLY
  else → CONTINUED_REPLY
```

### Why This Matters

**Correct Reply Rate Formula:**
```
Reply Rate = FIRST_REPLY count / OUTREACH_FIRST count × 100%
```

Most tools incorrectly compute: `ALL replies ÷ ALL emails sent` → inflated number.

The correct formula uses:
- **Numerator:** Only first-time inbound replies (not continued conversation)
- **Denominator:** Only unique prospects outreached (Email #1, not follow-ups)

### Per-Thread Tracking

Each `EmailThread` has `firstReplyReceived: boolean`:
- Starts as `false`
- Set to `true` when the first `RECEIVED` email arrives in that thread
- Once set, all subsequent received emails are classified as `CONTINUED_REPLY`

---

## 13. Email Tracking

### How It Works

```
Send Email → Inject 1x1 pixel → Recipient opens email → Pixel loads
  → GET /api/track?t={trackingId} → Set opened_at (first open only)
  → Return transparent 1x1 PNG
```

### Tracking Pixel Injection

```html
<!-- Injected before </body> or </html> -->
<img src="https://your-domain.vercel.app/api/track?t=abc123..."
     width="1" height="1" style="display:none" />
```

### Tracking ID Format
- UUID v4 with dashes removed → 32-character lowercase hex
- Validated with regex: `/^[a-f0-9]{32}$/i`

### Tracking States

| State | Field | Meaning |
|-------|-------|---------|
| Sent | `is_tracked = true` | Email has tracking pixel |
| Delivered | `delivered_at` | Timestamp when send was confirmed |
| Opened | `opened_at` | First open timestamp (subsequent opens ignored) |

### Rate Limits & Constants

```
TRACKING.RATE_LIMIT_PER_MINUTE = 20
TRACKING.DEDUP_WINDOW_HOURS = 1
TRACKING.OWNER_SESSION_WINDOW_HOURS = 24
```

---

## 14. Analytics Engine

### Entry Point

`getAnalyticsDataAction({startDate, endDate, managerId, accountId})`

### Metrics Returned

#### Core Stats
| Metric | Formula |
|--------|---------|
| Total Outreach | COUNT(direction=SENT) |
| Total Received | COUNT(direction=RECEIVED) |
| Leads Generated | COUNT(is_lead=true) in date range |
| Reply Rate | (FIRST_REPLY / OUTREACH_FIRST) × 100% |
| Open Rate | (opened_at IS NOT NULL / totalOutreach) × 100% |
| Spam Rate | (isSpam=true / totalOutreach) × 100% |
| Inbox Rate | ((totalOutreach - spamCount) / totalOutreach) × 100% |
| Total Revenue | SUM(project_value) WHERE paid_status=PAID |
| Closed Deals | COUNT(projects WHERE paid_status=PAID) |
| Avg Deal Size | totalRevenue / totalProjects |
| Avg Response Time | Mean hours between first sent & first reply in thread |

#### Email Type Breakdown
| Metric | Description |
|--------|-------------|
| outreachFirst | Count of OUTREACH_FIRST emails |
| followUps | Count of FOLLOW_UP emails |
| conversational | Count of CONVERSATIONAL emails |
| firstReplies | Count of FIRST_REPLY emails |
| continuedReplies | Count of CONTINUED_REPLY emails |
| uniqueProspectsOutreached | = outreachFirst count |

### Chart Data Series (23+)

| Data Series | Chart Type | Description |
|-------------|------------|-------------|
| `funnelData` | Funnel | Outreach → Opened → Replied → Leads |
| `dailyData` | Area/Line | Daily sent vs received trend |
| `hourlyEngagement` | Bar | Replies by hour of day (24 bars) |
| `volumeByDay` | Bar | Sent/received by day of week |
| `heatmapData` | Heatmap | 7×24 grid of email volume |
| `topSubjects` | Bar | Top 10 subject lines by reply count |
| `bestSubjects` | Bar | Top subjects by open rate |
| `topClients` | Table | Top 10 contacts by email volume |
| `leaderboard` | Table | Per-manager: leads, revenue, deals, sent, received |
| `accountPerformance` | Table | Per-account: sent, received, reply rate, status |
| `deliverability` | Gauge | Inbox rate, spam rate, health status |
| `sentimentData` | Pie | Positive/Neutral/Negative distribution |
| `threadDepthData` | Pie | Single/Short/Long thread distribution |
| `unreadData` | Pie | Read vs Unread ratio |
| `pipelineFunnel` | Funnel | Lead stage distribution |
| `paidBreakdown` | Pie | Paid/Partially Paid/Unpaid |
| `revenueTrend` | Line | Monthly revenue trend |
| `priorityDist` | Pie | Project priority distribution |
| `reviewStats` | Pie | Approved/Pending/Revisions |
| `timelinessData` | Pie | On-time vs Delayed projects |
| `responseTimeBuckets` | Bar | <1h, 1-6h, 6-24h, 1-3d, 3d+ |
| `outreachBreakdown` | Pie | 5 email types breakdown |

---

## 15. Pipeline & Lead Management

### Pipeline Stages

```
COLD_LEAD → LEAD → OFFER_ACCEPTED → CLOSED
                                   ↘ NOT_INTERESTED
```

| Stage | Color | Description |
|-------|-------|-------------|
| `COLD_LEAD` | Blue | Initial contact, no engagement yet |
| `LEAD` | Yellow | Engaged prospect |
| `OFFER_ACCEPTED` | Green | Deal agreed |
| `CLOSED` | Purple | Deal completed |
| `NOT_INTERESTED` | Red | Rejected/blacklisted |

### Auto-Stage Advancement

When an incoming email contains acceptance keywords (e.g., "yes", "deal", "approved"), the system automatically advances the contact's pipeline stage via `handleEmailReceived()`.

### Manual Stage Management

- `updateEmailStageAction(messageId, stage)` — Updates stage for all messages from that contact
- `updateLeadStage({contactId, accountManagerId, newStage})` — Direct stage update with activity logging
- `markAsNotInterestedAction(email)` — Blacklist sender, add to `ignored_senders`

---

## 16. Client-Side State Management

### FilterContext (`app/context/FilterContext.tsx`)

Global account and date range filter state:

```typescript
{
  selectedAccountId: 'ALL' | string,  // Persisted to localStorage
  startDate: string,                   // YYYY-MM-DD
  endDate: string,                     // YYYY-MM-DD
  accounts: Account[],                 // Connected accounts list
  isLoadingAccounts: boolean
}
```

Side effect: Switching account flushes all mailbox caches.

### UIContext (`app/context/UIContext.tsx`)

Compose modal state:

```typescript
{
  isComposeOpen: boolean,
  composeDefaultTo: string    // Pre-filled recipient
}
```

### useMailbox Hook (`app/hooks/useMailbox.ts`)

Comprehensive email list state management:

| Feature | Detail |
|---------|--------|
| **Types** | `inbox`, `sent`, `client`, `search` |
| **Caching** | Global memory cache + localStorage (5-min TTL, 100 max threads) |
| **State** | emails, totalCount, totalPages, currentPage, selectedEmail, threadMessages, selectedEmailIds |
| **Methods** | loadEmails, handleSync, setCurrentPage, setSelectedEmail, handleDelete, handleBulkDelete, handleToggleRead, prefetchThread |
| **Tab counts** | Cached with 30-second TTL |

### useRealtimeInbox Hook (`src/hooks/useRealtimeInbox.ts`)

Two-tier live updates:

1. **Supabase Realtime** (WebSocket) — instant `INSERT`/`UPDATE`/`DELETE` notifications
2. **Polling fallback** (15s default) — for environments without WebSocket
   - Priority 1: New received emails (newer than last seen)
   - Priority 2: Tracking updates on recently sent emails (last 12 hours)

### Hydration Safety (`app/utils/useHydration.ts`)

`useHydrated()` — returns `false` during SSR, `true` after hydration. Prevents localStorage access during server rendering.

---

## 17. Utilities

### Encryption (`src/utils/encryption.ts`)

```typescript
encrypt(text: string) → string    // AES-256-GCM → "iv:authTag:ciphertext" (hex)
decrypt(encrypted: string) → string  // Reverse
```

Requires `ENCRYPTION_KEY` environment variable (64-char hex = 32 bytes).

### Email Normalizer (`src/utils/emailNormalizer.ts`)

```typescript
normalizeEmail(raw: string) → string
// '"John" <JOHN@Example.COM>' → 'john@example.com'
// '  JOHN@Example.COM  ' → 'john@example.com'
```

### Email Transformers (`src/utils/emailTransformers.ts`)

```typescript
transformEmailRow(row, accountMap, threadRepliesMap?, overrides?) → enriched email object
transformJoinedEmailRow(row) → enriched email object (flattens Supabase joins)
```

### Account Helpers (`src/utils/accountHelpers.ts`)

```typescript
buildAccountMap(accountIds, supabase) → Map<string, {email, manager_name}>
```

### Thread Helpers (`src/utils/threadHelpers.ts`)

```typescript
buildThreadRepliesMap(threadIds, supabase) → Set<string>  // thread IDs with replies
```

### Pagination (`src/utils/pagination.ts`)

```typescript
clampPageSize(size, max?) → number  // Clamps to [1, MAX_PAGE_SIZE(100)]
```

### Client-Side Helpers (`app/utils/helpers.ts`)

| Function | Description |
|----------|-------------|
| `avatarColor(seed)` | Deterministic 7-color avatar from string hash |
| `initials(name)` | 1-2 character initials (handles HTML entities) |
| `formatDate(dateString)` | Relative format (today=time, older=Month Day) |
| `cleanBody(html)` | Strip HTML/scripts for safe preview |
| `cleanPreview(text)` | Truncate to 100 chars, clean whitespace |

### Local Cache (`app/utils/localCache.ts`)

```typescript
saveToLocalCache(key, data, ttlMs?)  // Default TTL: 30 minutes
getFromLocalCache(key)               // Returns null if expired
// Key format: unibox_cache_{key}
```

---

## 18. Configuration & Environment

### Required Environment Variables

```env
# ── Database (Supabase) ──────────────────────────────────
DATABASE_URL=                    # Pooled connection (PgBouncer) for runtime
DIRECT_URL=                      # Direct connection for Prisma migrations
NEXT_PUBLIC_SUPABASE_URL=        # Public Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Public anonymous key (safe for browser)
SUPABASE_SERVICE_ROLE_KEY=       # Server-only service role key

# ── Encryption ────────────────────────────────────────────
ENCRYPTION_KEY=                  # 64-char hex for AES-256-GCM
                                 # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ── Google OAuth ──────────────────────────────────────────
GOOGLE_CLIENT_ID=                # From Google Cloud Console
GOOGLE_CLIENT_SECRET=            # Sensitive
GOOGLE_REDIRECT_URI=             # http://localhost:3000/api/auth/google/callback (dev)
GOOGLE_PUBSUB_TOPIC=             # Optional: projects/<GCP_PROJECT_ID>/topics/<TOPIC>

# ── Auth & Session ────────────────────────────────────────
NEXTAUTH_SECRET=                 # 64-char hex for session encryption
NEXTAUTH_URL=                    # http://localhost:3000 (dev)

# ── Application ───────────────────────────────────────────
NEXT_PUBLIC_APP_URL=             # Base URL for tracking pixels
DEFAULT_USER_ID=                 # Fallback admin user UUID
NEXT_PUBLIC_DEFAULT_USER_ID=     # Public version of above

# ── Vercel Cron ───────────────────────────────────────────
CRON_SECRET=                     # Authenticates cron job requests
```

### Constants (`src/constants/limits.ts`)

```typescript
TRACKING = {
    RATE_LIMIT_PER_MINUTE: 20,
    DEDUP_WINDOW_HOURS: 1,
    OWNER_SESSION_WINDOW_HOURS: 24,
}

PAGINATION = {
    DEFAULT_PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 100,
    SEARCH_MAX: 50,
}

EMAIL_SYNC = {
    MAX_MESSAGES: 100000,
    PAGE_SIZE_LARGE: 5000,
    PAGE_SIZE_MEDIUM: 500,
}
```

### Pipeline Stage Config (`app/constants/stages.ts`)

```typescript
STAGE_COLORS = {
    COLD_LEAD: 'badge-blue',
    LEAD: 'badge-yellow',
    OFFER_ACCEPTED: 'badge-green',
    CLOSED: 'badge-purple',
    NOT_INTERESTED: 'badge-red',
}
```

---

## 19. Deployment

### Platform: Vercel

### Build Configuration

- **Turbopack** bundler for dev server
- **External packages** (not bundled): `@prisma/client`, `prisma`, `nodemailer`, `imapflow`, `mailparser`, `googleapis`
- **Production optimizations:** `console.log` removed (except `error` and `warn`)

### Security Headers (all routes)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

### Cron Jobs

| Job | Route | Schedule | Purpose |
|-----|-------|----------|---------|
| Cleanup Tracking | `/api/cron/cleanup-tracking` | Daily | Truncate old email bodies (>60 days), delete old logs, reset daily sent counters |

### TypeScript Configuration

- **Strict mode** enabled with `noUncheckedIndexedAccess`
- Target: `esnext`
- Module: `esnext` with `bundler` resolution
- Source maps and declaration maps enabled

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React 19)                       │
│                                                                 │
│  FilterContext ─── UIContext ─── useMailbox ─── useRealtimeInbox │
│       │                │             │               │          │
│  DateRange +      ComposeModal   Email List      WebSocket +    │
│  Account Filter                  + Caching       Polling        │
└────────────────────────┬────────────────────────────────────────┘
                         │ Server Actions
┌────────────────────────▼────────────────────────────────────────┐
│                     NEXT.JS SERVER                              │
│                                                                 │
│  accountActions ── emailActions ── analyticsActions              │
│  clientActions  ── projectActions ── authActions                 │
│       │                │                │                        │
│  ┌────▼────────────────▼────────────────▼───────────────┐       │
│  │              SERVICES LAYER                           │       │
│  │  gmailSyncService ── emailClassificationService       │       │
│  │  gmailSenderService ── manualEmailService             │       │
│  │  trackingService ── pipelineLogic                     │       │
│  │  googleAuthService ── crmAuthService                  │       │
│  │  emailSyncLogic                                       │       │
│  └──────────────────────┬────────────────────────────────┘       │
│                         │                                        │
│  ┌──────────────────────▼────────────────────────────────┐       │
│  │              UTILITIES                                 │       │
│  │  encryption ── emailNormalizer ── emailTransformers    │       │
│  │  accountHelpers ── threadHelpers ── pagination         │       │
│  └──────────────────────┬────────────────────────────────┘       │
└─────────────────────────┬────────────────────────────────────────┘
                          │ Prisma / Supabase Client
┌─────────────────────────▼────────────────────────────────────────┐
│                   POSTGRESQL (Supabase)                           │
│                                                                   │
│  users ── gmail_accounts ── email_threads ── email_messages       │
│  contacts ── projects ── activity_logs ── ignored_senders         │
└──────────────────────────────────────────────────────────────────┘
```

---

*This documentation reflects the current local state of the Unibox application.*
