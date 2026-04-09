# UNIBOX - Project Overview

**Multi-Account Email CRM for Video Production Companies**

Unibox manages Gmail and manual IMAP/SMTP accounts, syncs emails in real-time, tracks leads through a sales pipeline, runs automated email campaigns with A/B testing, and provides open/click analytics. It includes an AI sales assistant (JARVIS), an action queue for sales reps, and a full team management system with role-based access control.

**Live URL:** https://txb-unibox.vercel.app
**Repository:** https://github.com/designbyhasnain/unibox

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.1.1 |
| Language | TypeScript (strict mode) | 5.9.3 |
| UI Library | React | 19.2.4 |
| Database | PostgreSQL via Supabase | -- |
| ORM | Prisma | 6.19.3 |
| Hosting | Vercel (IAD1 region) | -- |
| Styling | Vanilla CSS (`app/globals.css`) | -- |
| Icons | Lucide React | 0.575.0 |
| Charts | Recharts | 3.8.0 |
| Drag & Drop | @dnd-kit/core + sortable + utilities | 6.3.1 / 10.0.0 / 3.2.2 |
| Email (Gmail) | googleapis (Gmail API + OAuth2) | 171.4.0 |
| Email (IMAP) | imapflow | 1.2.10 |
| Email (SMTP) | nodemailer | 8.0.1 |
| Email (Transactional) | Resend (invitations only) | 6.10.0 |
| Task Queue | Upstash QStash | 2.10.1 |
| AI (Primary) | Groq (Llama 3.3 70B) | -- |
| AI (Fallback) | Google Gemini (2.0 Flash) | -- |
| Auth Encryption | AES-256-CBC (custom, `src/lib/auth.ts`) | -- |
| Token Encryption | AES-256-GCM (`src/utils/encryption.ts`) | -- |
| Password Hashing | bcryptjs (12 rounds) | 3.0.3 |
| CSV Parsing | PapaParse | 5.5.3 |
| Email Parsing | mailparser | 3.9.3 |
| HTML Sanitization | DOMPurify | 3.3.3 |
| ZIP Archives | archiver | 7.0.1 |
| Virtual Scrolling | @tanstack/react-virtual (installed, not yet used) | 3.13.23 |
| File Upload | react-dropzone | 15.0.0 |
| Date Utilities | date-fns | 4.1.0 |
| Browser Automation | Puppeteer (devDependency) | 24.40.0 |
| Realtime | @supabase/supabase-js | 2.97.0 |
| UUID | uuid | 13.0.0 |

---

## All Pages & Routes (22 pages)

### Application Pages

| Route | File | Description | Role |
|-------|------|-------------|------|
| `/` | `app/page.tsx` | **Inbox** -- Main email interface with pipeline stage tabs (Cold, Leads, Offer Accepted, Closed, Not Interested, Spam), email list, email detail panel with thread view, inline reply, bulk actions, debounced search, keyboard shortcuts, pagination (50/page) | All |
| `/login` | `app/login/page.tsx` | **Login** -- Google OAuth + email/password authentication with error handling for unauthorized, auth_failed, no_invite scenarios | Public |
| `/invite/accept` | `app/invite/accept/page.tsx` | **Invitation** -- Server component that validates 64-char token, checks invitation status/expiry, renders AcceptInviteClient for password setup or Google OAuth | Public |
| `/dashboard` | `app/dashboard/page.tsx` | **Sales Dashboard** -- KPI cards, revenue chart (dynamic import RevenueBarChart), pipeline stage breakdown, payment status badges, onboarding wizard for new users | SALES |
| `/clients` | `app/clients/page.tsx` | **CRM Contacts** -- Client/lead table with stage filter tabs, inline email threading, CSV import, Chrome extension download, AI relationship summaries, add lead/project modals, undo toast | All (RBAC filtered) |
| `/clients/[id]` | `app/clients/[id]/page.tsx` | **Contact Detail** -- Contact profile with editable fields, KPI cards, tabbed content (Emails/Projects/Activity), expandable email threads, AI relationship audit via Groq | All |
| `/accounts` | `app/accounts/page.tsx` | **Gmail Accounts** -- Connect OAuth/manual IMAP accounts, sync progress bars, health scores, pause/resume, remove, renew watches. Admin-only actions gated by role check | All (admin actions gated) |
| `/campaigns` | `app/campaigns/page.tsx` | **Campaign List** -- All campaigns with status filter tabs (All/Draft/Running/Paused/Completed), campaign cards with stats, launch/pause/resume/archive with undo toast | All (RBAC filtered) |
| `/campaigns/new` | `app/campaigns/new/page.tsx` | **New Campaign** -- Multi-step wizard with campaign name/goal/account, email sequence builder, A/B variants, subsequence triggers, spintax/placeholder support, template picker, contact enrollment | All |
| `/campaigns/[id]` | `app/campaigns/[id]/page.tsx` | **Campaign Detail** -- Performance analytics (lazy-loaded Recharts), enrolled contacts management, A/B testing results, campaign options/schedule tabs, diagnosis tool | All |
| `/projects` | `app/projects/page.tsx` | **Projects** -- Server wrapper rendering ProjectsClient component for project CRUD, status updates, revenue tracking | All |
| `/my-projects` | `app/my-projects/page.tsx` | **My Projects** -- Sortable project table with search, status/payment filters, expandable row details, CSV export, pagination | All |
| `/templates` | `app/templates/page.tsx` | **Email Templates** -- Template grid with category filter tabs (General, Cold Outreach, Follow Up, Retargeting, Project Update), search, create/edit modal, shared toggle | All |
| `/analytics` | `app/analytics/page.tsx` | **Analytics Dashboard** -- Dynamic import for AnalyticsCharts (no SSR), date range picker, manager/account filters, KPI cards, 5-minute cache with stale indicator, ErrorBoundary | All |
| `/sent` | `app/sent/page.tsx` | **Sent Emails** -- Sent mail viewer using useMailbox hook with type:'sent', email detail with thread view, inline reply, sync button, pagination | All |
| `/opportunities` | `app/opportunities/page.tsx` | **Revenue Opportunities** -- Three-tab layout (Reply ASAP/Win Back/Follow Up) with urgency badges, estimated revenue, AI relationship audit panel | All |
| `/jarvis` | `app/jarvis/page.tsx` | **JARVIS AI** -- AI Sales Director with Chat mode (Q&A) and Agent mode (autonomous execution), suggested questions, message history, tool usage badges, dark theme | All |
| `/actions` | `app/actions/page.tsx` | **Action Queue** -- Prioritized task list (Reply Now/New Leads/Follow Up/Win Back), urgency badges with pulse animation, quick email with template picker, snooze/done actions | All |
| `/intelligence` | `app/intelligence/page.tsx` | **Intelligence** -- Revenue forecast, escalation alerts, churn risks, competitor mentions, pricing analytics (KPIs, monthly trends, price brackets, AM performance) | ADMIN only |
| `/finance` | `app/finance/page.tsx` | **Finance** -- KPI cards, revenue by month chart, payment status pie chart, revenue by agent table, outstanding payments with aging | ADMIN only |
| `/team` | `app/team/page.tsx` | **Team Management** -- Team Members/Invitations tabs, role management, password set/reset, Gmail account assignments, invite/resend/revoke, activate/deactivate. Explicit redirect for non-admins | ADMIN only |
| `/settings` | `app/settings/page.tsx` | **Settings** -- Toggles for Background Polling, Focus Sync, Desktop Notifications; polling interval slider; app info section. Settings stored in localStorage | All |

### Loading States

Every page that needs data has a `loading.tsx` file with skeleton UI:
- `app/loading.tsx`, `app/accounts/loading.tsx`, `app/analytics/loading.tsx`, `app/campaigns/loading.tsx`, `app/clients/loading.tsx`, `app/projects/loading.tsx`, `app/settings/loading.tsx`, `app/team/loading.tsx`, `app/templates/loading.tsx`

---

## All Features

### 1. Email Management (Inbox)
- Multi-account inbox with unified view
- Pipeline stage tabs (Cold Lead, Contacted, Warm Lead, Lead, Offer Accepted, Closed, Not Interested, Spam)
- Email detail panel with full thread view
- Bulk actions (mark read/unread, delete, change stage)
- Inline reply with rich text editor (bold, italic, alignment, lists), emoji picker, template picker
- Real-time updates via Supabase WebSocket subscriptions + 30-second polling fallback
- Open/click tracking (1x1 pixel + link rewriting with 2-minute proxy filter)
- Spam filtering and sender blocking (ignored_senders)
- Debounced live search with advanced operators (from:, to:, subject:, newer_than:, has:attachment)
- Keyboard shortcuts (Escape to close, C to compose)

### 2. JARVIS AI Assistant
- Chat interface powered by Groq (Llama 3.3 70B)
- 15+ CRM tools: searchContacts, getContactDetail, getPipelineStats, getRevenueAnalytics, getRegionBreakdown, getTopClients, getUnpaidClients, getContactsByStage, getContactsByRegion, getAMPerformance, getEmailAccounts, draftPersonalizedEmail, createCampaignFromAgent, launchCampaignFromAgent, getCampaignStats
- Agent Mode: autonomous multi-step goal execution with plan creation and step-by-step execution (up to 5 tool-calling iterations per step)
- Conversation history and suggested prompts for quick queries
- System prompt as AI Sales Director persona

### 3. Action Queue
- Prioritized sales task system
- Urgency levels: REPLY_NOW (critical), NEW_LEAD (high), FOLLOW_UP (medium), WIN_BACK (medium)
- Quick-email with template picker and snooze actions per item
- Filters by urgency category with count badges
- Pulse animation on urgent count badge

### 4. Campaign System
- Multi-step email sequences with delay days between steps
- A/B testing variants per step with weight-based splitting
- Spintax support: `{hello|hi|hey}` (nested supported)
- Placeholder replacement: `{{first_name}}`, `{{company}}`, etc. with default values and custom variables
- 3-phase processor (every 15 min): Enqueue > Send > Subsequence triggers
- Account rotation with warmup mode (starts at 20/day, +1.43/day up to 500)
- Auto-stop on reply, auto-reply detection, stop-for-company logic
- Unsubscribe tracking with base64url-encoded links
- Daily send limits per account (max 30 per account per cycle)
- Campaign analytics with daily aggregation
- Campaign diagnosis tool (checks status, account, contacts, steps, limits, schedule, replies, unsubs)
- Test email and preview with real lead data

### 5. Sales Dashboard
- KPI cards with pipeline stage breakdown and color-coded counts
- Revenue bar chart (Recharts) with paid vs pending split
- Payment status badges (Paid/Unpaid/Partial)
- Onboarding wizard for first-time sales agents (5 steps: Welcome > Connect Gmail > Install Extension > Set API Key > Done)
- Relative date/time formatting

### 6. Analytics Dashboard
- KPI hero section (Total Emails, Reply Rate, Avg Response, Revenue)
- Dynamic chart import with SSR disabled (AnalyticsCharts)
- Pipeline conversion funnel and stage breakdown
- Email activity charts, daily trends, hourly engagement
- Top subjects and account performance
- Manager leaderboard
- Date range filtering with presets and account/manager filters
- 5-minute cache with stale-while-revalidate pattern

### 7. Client Management
- Client/lead table with pipeline stage filter tabs
- Multi-level caching (module-level + localStorage)
- Inline email threading and AI relationship summaries
- CSV import with drag-and-drop, column mapping, and duplicate detection
- Lead scoring algorithm and relationship insights
- Chrome extension integration for adding leads
- Undo toast for deletions with 5-second delay

### 8. My Projects
- Sortable project table with columns (name, status, revenue, payment, date)
- Status and payment filters with search
- Expandable rows showing brief, raw data URL, due date, AM, priority, quote
- CSV export and pagination

### 9. Team Management (ADMIN)
- Invite users via email (Resend from noreply@texasbrains.com)
- Assign Gmail accounts to SALES users
- Role management (ADMIN, SALES)
- Password setting and reset (bcrypt 12 rounds, min 8 chars)
- Activate/deactivate users with self-protection
- 7-day invitation tokens with resend/revoke
- Explicit redirect to `/` for non-admin users

### 10. Email Sync
- **Push**: Google Pub/Sub webhooks > immediate syncAccountHistory
- **History-based**: Gmail History API for incremental sync (triggered by webhooks or manual sync)
- **Full sync**: Paginated message fetch with parallel batch processing (concurrency 20), progress tracking
- **IMAP polling**: Every 15 minutes for manual accounts (up to 5 per run, last 6 months on first sync)
- Auto-creates contacts from sent/received emails
- Pipeline stage auto-transitions (COLD_LEAD > CONTACTED on first send, > LEAD on reply)
- Filters out promotional, social, automated, noreply, blocked domains
- Deduplication by message ID
- Concurrency guards and stale-state recovery (resets stuck SYNCING accounts after 5 min)

### 11. Sales Automation
- Auto follow-ups for stale contacts
- Warm lead detection (2+ opens, no reply)
- Lead scoring algorithm via Supabase RPC
- Re-engagement detection (90+ days stale)
- Send-time optimization via historical data
- Account health monitoring with auto-pause at 5% bounce rate
- Daily send count reset and warmup day increment around midnight UTC

### 12. Chrome Extension
- Add leads from any webpage with enrichment data (location, social, pricing)
- Rich duplicate check with CRM intelligence (email history, projects, revenue, tier)
- View client info and health check
- API key authentication (`unibox_ext_` + 64 hex chars)
- Downloadable ZIP from app (custom ZIP implementation, no archiver)

### 13. Intelligence Dashboard (ADMIN)
- Revenue forecast with 30-day projection
- Pipeline value breakdown by stage with conversion rates
- Monthly revenue bar chart
- Escalation alerts (stuck in Contacted, leads going cold)
- Churn risk detection (response time slowdown)
- Competitor mention tracking in emails
- Pricing analytics (overall KPIs, monthly trends, price brackets, top clients, AM performance)

### 14. Finance Dashboard (ADMIN)
- KPI cards (Total Revenue, Paid, Outstanding, Avg Deal Size, Collection Rate, Total Projects)
- Revenue by month bar chart and payment status pie chart
- Revenue by agent table
- Outstanding payments with aging (current/8-30d/30d+)
- Date range filtering

---

## All API Endpoints (30 routes)

### Authentication

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/auth/login` | Public | Email/password login via bcrypt verification |
| POST | `/api/auth/set-password` | Token validation | Set password for invited users, creates/updates user |
| GET | `/api/auth/google/callback` | Session + CSRF | Gmail OAuth callback for account connection (not login) |
| GET | `/api/auth/crm/google` | Public | CRM login OAuth initiation with CSRF state |
| GET | `/api/auth/crm/google/callback` | CSRF cookie | CRM login callback, handles invitation acceptance, creates session |

### Email Tracking

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/track` | Public | Open tracking pixel (1x1 PNG), 2-minute proxy filter |
| GET | `/api/track/click` | Public | Click tracking with 302 redirect to original URL |

### Sync

| Method | Route | Auth | Purpose | Timeout |
|--------|-------|------|---------|---------|
| POST | `/api/sync` | Session + RBAC | Trigger Gmail/IMAP sync for a specific account | 60s |
| GET | `/api/sync/health` | Public | Deep health check, validates all accounts with Google | 60s |
| GET | `/api/sync/poll` | Public | Aggressive polling fallback, syncs all active accounts | 30s |

### Webhooks

| Method | Route | Auth | Purpose | Timeout |
|--------|-------|------|---------|---------|
| POST | `/api/webhooks/gmail` | Public (Pub/Sub trust) | Google Pub/Sub push notifications for real-time sync | 30s |

### JARVIS AI

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/jarvis` | Session | Chat with JARVIS (Groq LLM + CRM tools, up to 5 iterations) |
| POST | `/api/jarvis/agent` | Session | Autonomous agent mode (goal decomposition + execution) |

### Campaigns & Cron

| Method | Route | Auth | Purpose | Timeout |
|--------|-------|------|---------|---------|
| POST/GET | `/api/campaigns/process` | QStash / Bearer | 3-phase campaign processor (enqueue > send > subsequence) | 60s |
| POST/GET | `/api/cron/automations` | QStash / Bearer | Hourly: token refresh, automations, health, daily resets | -- |
| POST/GET | `/api/cron/process-webhooks` | QStash / Bearer | Every 2 min: webhook retry with exponential backoff | 30s |
| POST/GET | `/api/cron/renew-gmail-watches` | QStash / Bearer | Every 6 days: renew Gmail Pub/Sub watches | 60s |
| POST/GET | `/api/cron/cleanup-tracking` | QStash / Bearer | Weekly: truncate old bodies (60d), delete old logs (90d) | -- |
| POST/GET | `/api/cron/sync-imap` | QStash / Bearer | Every 15 min: IMAP account polling (up to 5 per run) | 60s |

### Chrome Extension (Legacy `/api/ext/`)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET/OPTIONS | `/api/ext/ping` | Extension API key | Extension health check (CORS) |
| POST/OPTIONS | `/api/ext/add-lead` | Extension API key | Add lead with enrichment data (CORS) |
| POST/OPTIONS | `/api/ext/check-duplicate` | Extension API key | Rich duplicate check with CRM intelligence (CORS) |

### Chrome Extension (New `/api/extension/`)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/extension/generate-key` | Session | Generate extension API key (`unibox_ext_` + 64 hex) |
| GET | `/api/extension/me` | Extension API key | Current user info for extension |
| GET/POST | `/api/extension/clients` | Extension API key | Search/create clients from extension |
| GET | `/api/extension/download` | Public | Download extension source as ZIP |

### Misc

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/ping` | Public | Liveness check (Edge runtime, shows client IP) |
| GET | `/api/unsubscribe` | Public | Campaign unsubscribe with HTML confirmation page |
| POST | `/api/migrate` | Session + Admin | One-time RBAC data migration |
| POST | `/api/backfill-email-types` | Session + Admin | One-time email type classification backfill |

---

## Database Schema

### Models (22)

| Model | Table | Purpose |
|-------|-------|---------|
| User | `users` | Team members with role (ADMIN/SALES), status (ACTIVE/REVOKED), password hash, avatar |
| Contact | `contacts` | Leads/clients with pipeline stage, lead score, follow-up tracking, contact type (LEAD/CLIENT) |
| GmailAccount | `gmail_accounts` | Gmail/IMAP accounts with OAuth tokens, sync state, health score, warmup tracking, daily limits |
| Invitation | `invitations` | Team invitations with 7-day expiry token, assigned Gmail account IDs |
| UserGmailAssignment | `user_gmail_assignments` | RBAC pivot: links SALES users to specific Gmail accounts |
| EmailThread | `email_threads` | Gmail thread grouping with first_reply_received flag |
| EmailMessage | `email_messages` | Full emails with tracking (opened_at, delivered_at, tracking_id), direction, type, stage |
| Project | `projects` | Projects with client, status, revenue, paid status, final review |
| ActivityLog | `activity_logs` | Audit log for contacts and projects (stage changes, emails, notes) |
| IgnoredSender | `ignored_senders` | Blocked senders filtered during sync |
| Campaign | `campaigns` | Email campaigns with goals, scheduling, daily limits, rotation, A/B config |
| CampaignStep | `campaign_steps` | Sequential steps with delay_days, subsequence triggers, parent-child relations |
| CampaignVariant | `campaign_variants` | A/B testing variants per step (subject + body + weight) |
| CampaignContact | `campaign_contacts` | Contact enrollment with status tracking, variant assignment, custom variables |
| CampaignEmail | `campaign_emails` | Individual sent campaign emails linking message to step/variant |
| Unsubscribe | `unsubscribes` | Unsubscribe tracking per email/campaign |
| CampaignAnalytics | `campaign_analytics` | Daily aggregated campaign metrics (sent, opened, clicked, replied, bounced) |
| WebhookEvent | `webhook_events` | Gmail Pub/Sub events with retry tracking and dead-letter pattern |
| CampaignSendQueue | `campaign_send_queue` | Rate-limited sending queue with stagger delays and retry logic |
| EmailTemplate | `email_templates` | Reusable email templates with categories and usage counts |
| EditProject | `edit_projects` | Notion-style editorial project tracking (video/design editing) |
| ProjectComment | `project_comments` | Comments on edit projects |

### Enums (18)

| Enum | Values |
|------|--------|
| Role | ADMIN, SALES |
| InvitationStatus | PENDING, ACCEPTED, EXPIRED |
| UserStatus | ACTIVE, REVOKED |
| GmailAccountStatus | ACTIVE, ERROR, DISCONNECTED, SYNCING, PAUSED |
| ConnectionMethod | OAUTH, MANUAL |
| WatchStatus | ACTIVE, INACTIVE, EXPIRED, ERROR |
| PipelineStage | COLD_LEAD, CONTACTED, WARM_LEAD, LEAD, OFFER_ACCEPTED, CLOSED, NOT_INTERESTED |
| EmailDirection | SENT, RECEIVED |
| EmailType | OUTREACH_FIRST, FOLLOW_UP, CONVERSATIONAL, FIRST_REPLY, CONTINUED_REPLY |
| PaidStatus | UNPAID, PARTIALLY_PAID, PAID |
| FinalReviewStatus | PENDING, APPROVED, REVISIONS_NEEDED |
| Priority | LOW, MEDIUM, HIGH, URGENT |
| ContactType | LEAD, CLIENT |
| CampaignGoal | COLD_OUTREACH, FOLLOW_UP, RETARGETING |
| CampaignStatus | DRAFT, SCHEDULED, RUNNING, PAUSED, COMPLETED, ARCHIVED |
| CampaignContactStatus | PENDING, IN_PROGRESS, COMPLETED, STOPPED, BOUNCED, UNSUBSCRIBED |
| CampaignStoppedReason | REPLIED, MANUAL, UNSUBSCRIBED |
| SubsequenceTrigger | OPENED_NO_REPLY |

---

## Server Actions (20 files, 95 functions)

| File | Key Functions |
|------|---------------|
| `emailActions.ts` | sendEmailAction, getInboxEmailsAction, getInboxWithCountsAction, getSentEmailsAction, searchEmailsAction, markEmailAsReadAction, bulkDeleteEmailsAction, getThreadMessagesAction, updateEmailStageAction, markAsNotSpamAction, getTabCountsAction |
| `contactDetailActions.ts` | getContactDetailAction, updateContactAction |
| `campaignActions.ts` | createCampaignAction, getCampaignsAction, getCampaignDetailAction, launchCampaignAction, pauseCampaignAction, resumeCampaignAction, enrollContactsAction, getCampaignAnalyticsAction, getVariantAnalyticsAction, diagnoseCampaignAction, updateCampaignOptionsAction, importLeadsFromCSVAction, sendTestEmailAction, previewWithLeadAction |
| `accountActions.ts` | getGoogleAuthUrlAction, connectManualAccountAction, getAccountsAction, reSyncAccountAction, syncAllUserAccountsAction, toggleSyncStatusAction, removeAccountAction, renewAllWatchesAction |
| `authActions.ts` | getCurrentUserAction, logoutAction |
| `userManagementActions.ts` | listUsersAction, assignGmailToUserAction, removeGmailFromUserAction, updateUserRoleAction, deactivateUserAction, reactivateUserAction, setUserPasswordAction |
| `inviteActions.ts` | sendInviteAction, listInvitesAction, revokeInviteAction, resendInviteAction, validateInviteTokenAction |
| `projectActions.ts` | getAllProjectsAction, getManagersAction, createProjectAction, createProjectFromEmailAction, updateProjectAction |
| `templateActions.ts` | getTemplatesAction, createTemplateAction, updateTemplateAction, deleteTemplateAction, incrementTemplateUsageAction |
| `analyticsActions.ts` | getAnalyticsDataAction |
| `dashboardActions.ts` | getSalesDashboardAction |
| `financeActions.ts` | getFinanceOverviewAction |
| `intelligenceActions.ts` | getIntelligenceDashboardAction, getChurnRisksAction, getCompetitorMentionsAction, getRevenueForecastAction, getEscalationAlertsAction, getPricingAnalyticsAction |
| `clientActions.ts` | getClientsAction, getStageCounts, createClientAction, checkDuplicateAction, ensureContactAction, getContactAction, getClientProjectsAction, removeClientsAction, updateClientAction |
| `importActions.ts` | previewCSVImportAction, importCSVAction |
| `automationActions.ts` | getAutomationDashboardAction, recalculateScoresAction, runAutomationsAction, getFollowUpCandidatesAction, getBestSendTimesAction |
| `relationshipActions.ts` | getRelationshipInsightAction, getCriticalRelationshipsAction, getLostEngagementAction, runRelationshipAnalysisAction |
| `revenueActions.ts` | getWaitingForReplyAction, getWinBackCandidatesAction, getStaleFollowUpsAction, getRevenueOpportunitiesAction |
| `summaryActions.ts` | generateContactSummaryAction, generateAISummaryAction |
| `actionQueueActions.ts` | getActionQueueAction, snoozeActionAction, markActionDoneAction |

---

## Services (20 files)

| File | Purpose | External APIs |
|------|---------|---------------|
| `gmailSyncService.ts` | Full and incremental Gmail sync via History API, Pub/Sub watch setup, parallel batch processing (concurrency 20) | Gmail API, Google Pub/Sub |
| `emailSyncLogic.ts` | Email classification, contact auto-creation, pipeline transitions, acceptance keyword detection, campaign auto-stop on reply | Supabase |
| `gmailSenderService.ts` | MIME message building with UTF-8 base64url, Gmail API send, token refresh with retry | Gmail API, OAuth2 |
| `manualEmailService.ts` | IMAP sync across all folders (last 6 months), SMTP send, connection testing, unspam | IMAP/SMTP servers |
| `trackingService.ts` | UUID tracking ID generation, 1x1 pixel injection, link rewriting (skips mailto/unsubscribe/anchor) | -- |
| `emailClassificationService.ts` | 5-type email taxonomy (OUTREACH_FIRST, FOLLOW_UP, CONVERSATIONAL, FIRST_REPLY, CONTINUED_REPLY) | -- |
| `campaignProcessorService.ts` | Phase 1: find ready campaigns, check timezone-aware schedule, apply limits, resolve placeholders/spintax, inject unsubscribe, batch-insert to send queue | Supabase |
| `sendQueueProcessorService.ts` | Phase 2: process QUEUED items (max 30/account/cycle), send via Gmail/SMTP, inject tracking, advance steps, retry up to max_attempts | Gmail API, SMTP |
| `salesAutomationService.ts` | 5 automations: follow-ups, warm lead detection, re-engagement, send-time optimization, lead scoring | Supabase RPCs |
| `accountHealthService.ts` | Bounce rate/open rate calculation, health scoring (0-100), auto-pause at 5% bounce rate | Supabase |
| `accountRotationService.ts` | Multi-account round-robin, same-account follow-ups, warmup mode (20 to 500/day), daily count resets | Supabase |
| `googleAuthService.ts` | OAuth state generation/validation (timing-safe), full callback flow, token storage with AES-256-GCM encryption, refresh | Google OAuth2 |
| `crmAuthService.ts` | CRM-specific OAuth for login (limited scopes: userinfo only), user verification | Google OAuth2 |
| `tokenRefreshService.ts` | Proactive token refresh for ALL accounts (including ERROR), auto-recovery, watch renewal, stuck counter reset | Google OAuth2, Gmail API |
| `watchRenewalService.ts` | Renew Gmail Pub/Sub watches expiring within 48 hours, catch-up sync after renewal | Gmail API, Pub/Sub |
| `webhookProcessorService.ts` | Process webhook_events with exponential backoff (30s to 2hr, max 5 retries), dead-letter pattern | Supabase |
| `aiSummaryService.ts` | AI relationship audits with Alex Hormozi/Gary Vee/Jeremy Miner persona, scorecard, suggested next email | Groq (Llama 3.3 70B), Google Gemini (2.0 Flash) |
| `pipelineLogic.ts` | Manual lead creation with deduplication, pipeline stage transitions with activity logging | Supabase |
| `jarvisService.ts` | JARVIS CRM tools (15+), system prompt, tool execution engine, data access layer for AI | Supabase |
| `jarvisAgentService.ts` | Autonomous agent: goal decomposition, step-by-step plan creation, iterative tool execution (up to 5 per step) | Groq (Llama 3.3 70B) |

---

## Key Components (26 files)

| Component | Purpose |
|-----------|---------|
| `ClientLayout.tsx` | Root client-side shell: Sidebar + ComposeModal + ErrorBoundary; bypasses chrome for /login and /invite |
| `Sidebar.tsx` | Navigation with role-based items (NAV_SHARED vs NAV_ADMIN_ONLY), account selector, compose button, action queue badge, logout |
| `Topbar.tsx` | Search bar with debounced live search, results popup, search chips (has:attachment, from:me), advanced tips |
| `ComposeModal.tsx` | Minimizable/maximizable compose window with rich text (bold, italic, alignment, lists), emoji picker, CC/BCC, account selector, template picker |
| `InlineReply.tsx` | Inline reply editor in thread view with formatting toolbar, emoji picker, account switcher, DOMPurify |
| `InboxComponents.tsx` | EmailRow for inbox/sent lists, thread detail view, stage badges, sender parsing, prefetch-on-hover |
| `OnboardingWizard.tsx` | 5-step wizard for new sales agents (Welcome > Connect Gmail > Install Extension > Set API Key > Done) |
| `ActionCard.tsx` | Action queue card with urgency styling (critical/high/medium/low), quick email, snooze, done buttons |
| `QuickActions.tsx` | Template picker mapping action types to template categories for fast responses |
| `RevenueChart.tsx` | Monthly revenue trend AreaChart with gradient fill (Recharts) |
| `RevenueBarChart.tsx` | Monthly revenue stacked bar chart: paid vs pending (Recharts) |
| `AnalyticsCharts.tsx` | Chart suite: BarChart, AreaChart, PieChart with breakdown bar lists and empty states |
| `ABTestingAnalytics.tsx` | Per-step A/B variant comparison cards (sent/open rate/reply rate), winner badge, lazy-loaded chart |
| `ABTestingChart.tsx` | Horizontal bar chart comparing variants (Recharts) |
| `CampaignTabs.tsx` | Campaign options UI with Section/Toggle/NumberInput helpers for scheduling and automation |
| `CSVImportModal.tsx` | CSV import with file upload, drag-and-drop, column mapping preview, bulk contact import |
| `AddLeadModal.tsx` | Manual lead creation form (name, email, company, phone, stage, priority, value, manager) |
| `AddProjectModal.tsx` | Project creation form (client, name, dates, manager, priority, financials, brief) |
| `TemplatePickerModal.tsx` | Browse/select templates with category tabs, search, hover preview pane, usage count |
| `DateRangePicker.tsx` | Dropdown date range with presets (Today, Last 7 Days, etc.) and custom inputs |
| `LoadingStates.tsx` | Skeleton components (Skeleton, SkeletonEmailRow, SkeletonCard, PageLoader) with shimmer |
| `ErrorBoundary.tsx` | React error boundary with retry button and section-specific messaging |
| `clients/DownloadExtensionModal.tsx` | Modal for generating extension API key and downloading extension ZIP |

### UI Primitives (`components/ui/`)

| Component | Purpose |
|-----------|---------|
| `Badge.tsx` | Styled badge with variant (primary/success/warning/danger/neutral) and size (sm/md) |
| `Button.tsx` | Button with variant (primary/secondary/danger/ghost), size, loading spinner, icon slot |
| `ErrorAlert.tsx` | Dismissible inline error alert banner |
| `FormField.tsx` | Form primitives: FormField, FormInput, FormSelect, FormTextarea with consistent styling |

---

## State Management

| System | Purpose | Location |
|--------|---------|----------|
| FilterContext | Global account filter + date range + accounts list, localStorage persistence | `app/context/FilterContext.tsx` |
| UIContext | Compose modal visibility + prefill data (to/subject/body) | `app/context/UIContext.tsx` |
| UndoToastContext | Undo-delete queue with 5-second delay, animated progress bar | `app/context/UndoToastContext.tsx` |
| useMailbox | Email list state via useReducer + 2-tier cache (memory + localStorage), pagination, tabs, search | `app/hooks/useMailbox.ts` |
| useRealtimeInbox | Dual-mode: Supabase Realtime WebSocket + 30-second polling fallback with tab-focus refresh | `src/hooks/useRealtimeInbox.ts` |
| usePrefetch | Background prefetch of clients/managers/projects 2 seconds after page load | `app/hooks/usePrefetch.ts` |
| useHydrated | SSR/client hydration guard using global flag | `app/utils/useHydration.ts` |
| useSWRData | Stale-while-revalidate cache hook (returns cached data instantly, refreshes in background) | `app/utils/staleWhileRevalidate.ts` |
| localCache | localStorage cache with 30-minute TTL, 30-second freshness window | `app/utils/localCache.ts` |

---

## Authentication Flow

### Session Management
- **Cookie:** `unibox_session` (httpOnly, secure, sameSite: lax, 7-day expiry)
- **Encryption:** AES-256-CBC with random IV, stored as `iv:ciphertext`
- **Payload:** `{ userId, email, name, role, exp }`
- **File:** `src/lib/auth.ts` -- `createSession()`, `getSession()`, `clearSession()`

### Login Methods
1. **Google OAuth**: `/api/auth/crm/google` > Google consent > `/api/auth/crm/google/callback` > CSRF validation (timing-safe) > session creation
2. **Email + Password**: POST `/api/auth/login` > bcrypt verify > session creation
3. **Invitation**: `/invite/accept?token={token}` > validate 7-day token > create user > assign Gmail accounts > session

### Middleware (`middleware.ts`)

Two-layer protection on page navigations only (API routes excluded from matcher):

1. **IP Whitelist** -- hardcoded allowed IPs and prefix-based ranges:
   - Exact IPs: `5.31.225.102`, `111.88.9.3`, `111.88.8.27`, `182.189.96.103`, `202.47.33.132`, LAN IPs, localhost
   - Prefix ranges: Pakistan ISPs (`111.88.`, `182.189.`, `202.47.`, `59.103.`, `119.73.`, `119.160.`, `175.107.`), Jazz 4G/5G (`39.32.`-`39.61.`), current ISP (`5.31.`), all LAN (`192.168.`), Google IPv6 (`2001:4860:`)
   - IP detection: `x-forwarded-for` (first IP) > `x-real-ip` > `0.0.0.0`
   - Blocked: returns styled HTML 403 page showing blocked IP

2. **Session Validation** -- decrypts cookie, validates IV (32 hex chars), validates ciphertext (16+ hex chars)
   - Failed: redirects to `/login?callbackUrl=<pathname>` and deletes cookie

3. **Public paths** (no session): `/login`, `/invite` (prefix match via startsWith)

**Matcher:** Excludes Next.js static assets, images, data, favicon, all API routes (`/api/*`), and file extensions.

### RBAC Roles

| Role | Access |
|------|--------|
| ADMIN | Full access to everything |
| ACCOUNT_MANAGER | Same as ADMIN (legacy role, treated identically in code) |
| SALES | Limited to assigned Gmail accounts, own clients (where account_manager_id = userId), own campaigns |

### Enforcement Points
1. **Middleware** -- IP + session validation on page navigations
2. **`ensureAuthenticated()`** -- called by server actions (78 of 95 functions)
3. **`requireAdmin()`** -- throws error if not ADMIN/ACCOUNT_MANAGER (used by 2 functions)
4. **`getAccessibleGmailAccountIds()`** -- returns `'ALL'` for admins, specific IDs for SALES (used by ~10 functions)
5. **Frontend Sidebar** -- hides admin-only navigation for SALES users
6. **Manual role checks** -- `role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER'` in userManagement, invite, account actions

---

## Third-Party Services

### Supabase (Database)
- PostgreSQL with PgBouncer connection pooling (port 6543)
- Direct connection for Prisma migrations (port 5432)
- Real-time WebSocket subscriptions for inbox updates
- Service role key for server-side (full DB access, never exposed)
- Anon key for client-side (browser-safe)
- RPC functions for complex queries (inbox with counts, lead scoring, finance summaries, relationship analysis, etc.)

### Google APIs (Gmail + OAuth)
- Gmail API: messages.list, messages.get, history.list, users.watch, users.getProfile, users.messages.send, users.messages.modify
- OAuth2: authentication, token refresh, consent flow
- Pub/Sub: push notifications for real-time sync (topic configured via env)
- Scopes: gmail.readonly, gmail.modify, gmail.send, gmail.labels, userinfo.email, userinfo.profile

### Groq (AI)
- Powers JARVIS chat, agent mode, and AI relationship summaries
- Model: Llama 3.3 70B Versatile
- Temperature: 0.3, tool calling enabled
- Up to 5 tool-calling iterations per chat message

### Google Gemini (AI Fallback)
- Model: Gemini 2.0 Flash
- Fallback when Groq is unavailable
- Used in `aiSummaryService.ts`

### Upstash QStash (Task Queue)
- Campaign processor: every 15 minutes (3-phase)
- Automations: every hour (token refresh, lead scoring, health checks, daily resets)
- Webhook processor: every 2 minutes (exponential backoff retry)
- Watch renewal: every 6 days
- IMAP polling: every 15 minutes
- Cleanup: weekly (truncate old bodies 60d, delete old logs 90d)
- All cron routes support dual auth: QStash signature (POST) + Bearer CRON_SECRET (GET)

### Resend (Transactional Email)
- Team invitation emails only
- From: noreply@texasbrains.com
- Triggered by: `sendInviteAction()` in `src/actions/inviteActions.ts`

### Vercel (Hosting)
- Region: IAD1 (US East)
- Serverless functions: 30-60 second timeouts
- Build command: `next build || true` (deploy succeeds even with build errors)
- Security headers: X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin
- Static assets: 1-year cache with immutable flag
- API routes: no-store cache headers
- Console stripping: production builds remove console.log (keep error/warn)

---

## Environment Variables

### Required

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Supabase PostgreSQL (pooled via PgBouncer, port 6543) |
| `DIRECT_URL` | Supabase PostgreSQL (direct, for migrations, port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anonymous key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key (NEVER expose) |
| `ENCRYPTION_KEY` | 64-char hex for OAuth token encryption (AES-256-GCM) |
| `NEXTAUTH_SECRET` | Session encryption key (AES-256-CBC) |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `GOOGLE_PUBSUB_TOPIC` | GCP Pub/Sub topic for Gmail push |
| `NEXT_PUBLIC_APP_URL` | Base URL for tracking pixels/links |
| `GROQ_API_KEY` | Groq API key (JARVIS + AI summaries) |
| `QSTASH_TOKEN` | Upstash QStash authentication |
| `QSTASH_CURRENT_SIGNING_KEY` | QStash webhook verification |
| `QSTASH_NEXT_SIGNING_KEY` | QStash key rotation |
| `CRON_SECRET` | Vercel Cron bearer token + debug key |
| `RESEND_API_KEY` | Resend API key (invitations only) |

### Optional

| Variable | Purpose |
|----------|---------|
| `GOOGLE_GEMINI_API_KEY` | Gemini fallback for AI summaries |
| `DEFAULT_USER_ID` | Fallback user UUID (legacy/temporary) |
| `NEXT_PUBLIC_DEFAULT_USER_ID` | Client-side fallback user (legacy/temporary) |
| `NEXTAUTH_URL` | NextAuth base URL (localhost for dev) |
| `ALLOWED_IPS` | IP whitelist override (used in .env.local but not in middleware) |

---

## Deployment

### Vercel Configuration (`vercel.json`)
```json
{
    "framework": "nextjs",
    "buildCommand": "next build || true",
    "installCommand": "npm install",
    "regions": ["iad1"],
    "headers": [
        {
            "source": "/api/(.*)",
            "headers": [
                { "key": "Cache-Control", "value": "no-store" }
            ]
        }
    ],
    "functions": {
        "app/api/sync/route.ts": { "maxDuration": 60 },
        "app/api/webhooks/gmail/route.ts": { "maxDuration": 30 },
        "app/api/auth/google/callback/route.ts": { "maxDuration": 30 },
        "app/api/campaigns/process/route.ts": { "maxDuration": 60 },
        "app/api/cron/process-webhooks/route.ts": { "maxDuration": 30 },
        "app/api/cron/renew-gmail-watches/route.ts": { "maxDuration": 60 },
        "app/api/sync/poll/route.ts": { "maxDuration": 30 },
        "app/api/sync/health/route.ts": { "maxDuration": 60 },
        "app/api/cron/sync-imap/route.ts": { "maxDuration": 60 }
    },
    "crons": []
}
```

**Note:** `crons` array is empty -- all scheduled jobs use QStash instead of Vercel Cron.

### Next.js Configuration (`next.config.js`)
- Server external packages: `@prisma/client`, `prisma`, `nodemailer`, `imapflow`, `mailparser`, `googleapis`
- Compiler: strips `console.log` in production (keeps error/warn)
- Server actions: body size limit `10mb`
- Turbopack: enabled
- Dev indicators: disabled
- Security headers on all routes: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Cache-Control no-store
- Static assets: 1-year immutable cache

### TypeScript Configuration (`tsconfig.json`)
- `strict: true` with `noUncheckedIndexedAccess: true`
- `verbatimModuleSyntax: true` (enforces explicit type imports)
- `moduleResolution: bundler`
- Target/module: esnext

### Commands
```bash
npm run dev              # Dev server (Turbopack)
npm run build            # Production build
npm run start            # Production server
npm run lint             # ESLint via next lint
npm run format           # Prettier format all files
npm run format:check     # Check formatting without writing
npx tsc --noEmit         # Type-check (run before every commit)
npx prisma generate      # Regenerate Prisma client
npx prisma migrate dev   # Create and apply migration
npx prisma db push       # Push schema changes without migration (dev only)
```

---

## File Structure Summary

```
unibox/
+-- app/                          # Next.js App Router
|   +-- api/                      # 30 API routes
|   +-- components/               # 26+ shared components
|   |   +-- ui/                   # 4 UI primitives (Badge, Button, ErrorAlert, FormField)
|   |   +-- clients/              # DownloadExtensionModal
|   |   +-- projects/             # ProjectsClient
|   +-- context/                  # 3 context providers (Filter, UI, UndoToast)
|   +-- hooks/                    # 2 hooks (useMailbox, usePrefetch)
|   +-- utils/                    # 4 utility files (helpers, localCache, staleWhileRevalidate, useHydration)
|   +-- constants/                # 3 constant files (config, stages, emojis)
|   +-- [22 page directories]    # Each with page.tsx, some with loading.tsx
+-- src/
|   +-- actions/                  # 20 server action files (95 functions)
|   +-- services/                 # 20 service files
|   +-- utils/                    # 13 utility files
|   +-- lib/                      # 5 library files (auth, config, safe-action, supabase, supabase-client)
|   +-- hooks/                    # 1 hook (useRealtimeInbox)
|   +-- constants/                # 1 constants file (limits)
+-- prisma/
|   +-- schema.prisma             # 22 models, 18 enums
+-- chrome-extension/             # Browser extension source
+-- middleware.ts                  # IP whitelist + session validation (pages only)
+-- next.config.js                # Turbopack, security headers, server external packages
+-- vercel.json                   # Deployment: region, function timeouts, API cache headers
+-- package.json                  # 26 dependencies, 16 devDependencies
+-- tsconfig.json                 # Strict TypeScript with noUncheckedIndexedAccess
```

---

## Utilities Reference

### `src/utils/` (13 files)

| File | Purpose |
|------|---------|
| `accessControl.ts` | RBAC: `getAccessibleGmailAccountIds()` (returns 'ALL' for admins, IDs for SALES) and `requireAdmin()` |
| `accountHelpers.ts` | Builds Map of gmail account IDs to email/manager name for display |
| `csvParser.ts` | Parses CSV to structured `ParsedLead` objects with auto column mapping |
| `emailNormalizer.ts` | Extracts/normalizes email from RFC 2822 strings |
| `emailTransformers.ts` | Transforms DB email rows to frontend shape with account info and reply status |
| `encryption.ts` | AES-256-GCM encrypt/decrypt for OAuth tokens (server-only) |
| `migrationHelpers.ts` | One-time RBAC data migration helpers |
| `pagination.ts` | `clampPageSize()` to enforce [1, MAX_PAGE_SIZE] range |
| `phoneExtractor.ts` | Extracts phone numbers from email bodies (Pakistan, US, UK, international) |
| `placeholders.ts` | Replaces `{{first_name}}`, `{{company}}`, etc. in email content |
| `spintax.ts` | Resolves `{hello|hi|hey}` syntax with nested support |
| `threadHelpers.ts` | Builds Set of thread IDs that have replies |
| `unsubscribe.ts` | Generates base64url unsubscribe links and injects footer HTML |

### `src/lib/` (5 files)

| File | Purpose |
|------|---------|
| `auth.ts` | Session management: create/read/clear `unibox_session` cookie with AES-256-CBC |
| `config.ts` | `getDefaultUserId()` resolving admin user ID from env vars |
| `safe-action.ts` | `ensureAuthenticated()` validates session, `getUserId()` returns session without redirect |
| `supabase.ts` | Server-side Supabase client with service role key (server-only) |
| `supabase-client.ts` | Browser-safe Supabase client with anon key for realtime subscriptions |

### `src/constants/` (1 file)

| File | Constants |
|------|-----------|
| `limits.ts` | TRACKING (rate limit 20/min, dedup 1hr), PAGINATION (default 50, max 100), EMAIL_SYNC (max 100K messages) |

---

*Generated: 2026-04-09*
