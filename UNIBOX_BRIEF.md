# Unibox — Multi-Account Email CRM for Video Production

## What is Unibox?

Unibox is a **multi-account email CRM** built for video production agencies (specifically Wedits). It connects multiple Gmail accounts into a single inbox, tracks leads through a sales pipeline, sends cold outreach campaigns, and provides email analytics — all in one app.

**Think of it as:** Gmail + HubSpot + Mailshake combined into one custom tool.

---

## What Problems Does It Solve?

1. **Scattered inboxes** — Video agencies manage 10+ Gmail accounts. Unibox unifies them into one view.
2. **No lead tracking** — Emails come in but there's no pipeline. Unibox auto-creates contacts and tracks them from Cold Lead → Lead → Offer Accepted → Closed.
3. **Manual outreach is slow** — Unibox automates cold email campaigns with multi-step sequences, A/B testing, and auto-stop on reply.
4. **No visibility into team performance** — Analytics show sent/received/open rates per account, per manager, per time period.
5. **Tracking email opens** — WhatsApp-style ticks show if an email was delivered and opened.

---

## Core Features

### 1. Unified Inbox
- Connects **12+ Gmail accounts** via OAuth
- Also supports **manual IMAP/SMTP** accounts (non-Gmail)
- Tabs by pipeline stage: Cold, Lead, Offer Accepted, Closed, Not Interested, Spam
- Real-time sync via Google Pub/Sub webhooks + 30-second polling fallback
- Full thread view with inline reply

### 2. Contact/Client Management (CRM)
- Auto-creates contacts when you send an email
- Pipeline: `COLD_LEAD → LEAD → OFFER_ACCEPTED → CLOSED`
- Inline editing of name, company, priority, estimated value, account manager
- Board view (Kanban-style) for visual pipeline management
- Search by name, email, or company

### 3. Email Campaigns
- Multi-step cold outreach sequences with configurable delays
- **A/B testing** — split subject/body variants with weight percentages
- Schedule by timezone, day of week, time window
- Auto-stop on reply, auto-reply detection, company domain matching
- Daily send limits, stagger delays between emails
- Spintax support: `{Hi|Hello|Hey}` for variation
- Placeholder variables: `{name}`, `{email}`, `{company}`
- Unsubscribe link injection

### 4. Email Tracking
- 1x1 tracking pixel injected before sending
- WhatsApp-style ticks: ✓ delivered, ✓✓ opened
- Owner session detection (filters out your own opens)
- Open rate analytics

### 5. Projects
- Link contacts to video production projects
- Track: paid status, deadline, quote, project value
- Final review: Pending → Approved → Revisions Needed
- Priority levels: Low, Medium, High, Urgent

### 6. Analytics Dashboard
- Email volume: sent, received, opened, spam
- Daily/weekly trends with charts (Recharts)
- Hourly engagement heatmap
- Top subjects by volume and open rate
- Pipeline funnel visualization
- Revenue analytics (by month, paid/unpaid breakdown)
- Manager leaderboard
- Account performance comparison
- Thread depth analysis
- Response time buckets

### 7. Team Management
- Invite users with roles: **Admin** (full access) or **Sales** (limited to assigned accounts)
- Assign specific Gmail accounts to team members
- Role-based access control throughout the app

### 8. Email Templates
- Save reusable templates with categories
- Categories: General, Cold Outreach, Follow-up, Retargeting, Project Update
- Share templates across team
- Usage tracking

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router) + React 19 |
| **Backend** | Next.js Server Actions + API Routes |
| **Database** | PostgreSQL via Supabase |
| **ORM** | Prisma 6 |
| **Email** | Gmail API (OAuth) + IMAP/SMTP (nodemailer + imapflow) |
| **Real-time** | Supabase Realtime subscriptions |
| **Charts** | Recharts |
| **Auth** | Custom session cookies (AES-256-CBC) |
| **Encryption** | AES-256-GCM for tokens/passwords |
| **Deployment** | Vercel (US East - iad1) |
| **Bundler** | Turbopack |

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `next` | React framework with App Router, Turbopack |
| `react` / `react-dom` | UI rendering |
| `@supabase/supabase-js` | Database client + real-time subscriptions |
| `@prisma/client` | Type-safe database ORM |
| `googleapis` | Gmail API (read, send, sync, labels) |
| `imapflow` | IMAP protocol for manual email accounts |
| `nodemailer` | SMTP email sending |
| `mailparser` | MIME email parsing |
| `recharts` | Analytics chart visualizations |
| `dompurify` | HTML sanitization for email bodies |
| `lucide-react` | Icon library |
| `uuid` | Unique ID generation |

---

## Database Schema (Key Models)

```
User ──────────────── GmailAccount (1:many)
  │                      │
  │                      ├── EmailMessage (1:many)
  │                      │      │
  │                      │      ├── EmailThread (many:1)
  │                      │      └── Contact (many:1)
  │                      │
  │                      └── Campaign (1:many)
  │                             ├── CampaignStep (1:many)
  │                             │      └── CampaignVariant (1:many, A/B)
  │                             ├── CampaignContact (many:many)
  │                             └── CampaignEmail (1:many)
  │
  ├── Contact ──────── Project (1:many)
  │      │
  │      └── ActivityLog (1:many)
  │
  └── Invitation (1:many)
```

**Key tables:**
- `users` — Team members (Admin/Sales roles)
- `gmail_accounts` — Connected email accounts (OAuth or IMAP/SMTP)
- `email_messages` — All synced emails (~104K rows)
- `email_threads` — Gmail thread grouping
- `contacts` — Leads and clients (~12K rows)
- `projects` — Video production projects
- `campaigns` — Cold outreach campaigns
- `campaign_steps` — Multi-step sequences
- `campaign_variants` — A/B test variants
- `campaign_contacts` — Enrolled contacts per campaign
- `webhook_events` — Gmail push notification queue
- `campaign_send_queue` — Queued campaign emails
- `email_templates` — Reusable email templates

---

## How Email Sync Works

### Three Sync Modes

1. **Push (Real-time)** — Google Pub/Sub sends a webhook to `/api/webhooks/gmail` when new emails arrive. Processed by `webhookProcessorService`.

2. **History-based (Incremental)** — Uses Gmail `historyId` to fetch only new/changed messages since last sync. Fast and efficient.

3. **Full Sync** — Downloads all messages for initial setup or reconciliation. Paginated via Gmail API.

### Sync Flow
```
New Email in Gmail
    ↓
Google Pub/Sub → /api/webhooks/gmail → WebhookEvent table
    ↓
Cron: /api/cron/process-webhooks (every 5 min)
    ↓
gmailSyncService.syncGmailEmails()
    ↓
emailSyncLogic.handleEmailReceived()
    ↓
- Store in email_messages
- Classify type (OUTREACH_FIRST, FOLLOW_UP, etc.)
- Match to contact
- Update pipeline stage if needed
```

---

## How Analytics Work

Analytics are powered by **database-side aggregation** via PostgreSQL RPC functions:

1. **`get_analytics_summary`** — Single SQL function that computes all email stats (sent, received, opened, spam, daily trends, hourly engagement, thread depth, etc.) in one query instead of fetching 50K+ rows to JavaScript.

2. **`get_inbox_page`** — Combined RPC for inbox emails + tab counts + account info in one round trip.

3. **`get_clients_page`** — Single RPC for paginated client list with email stats, manager info, and project counts.

The analytics page uses **Recharts** for visualization:
- Line charts for daily trends
- Bar charts for hourly engagement
- Funnel charts for pipeline
- Pie charts for paid/unpaid breakdown
- Heatmaps for busiest hours

---

## How Campaigns Work

```
Create Campaign
    ↓
Add Steps (with delays, subject, body)
    ↓ (optional)
Add A/B Variants per step
    ↓
Enroll Contacts
    ↓
Cron: /api/campaigns/process (daily)
    ↓
campaignProcessorService.enqueueCampaignSends()
    ↓
- Check schedule window (timezone, day, time)
- Respect daily send limit
- Calculate stagger delays
- Select A/B variant by weight
- Replace placeholders ({name}, {email})
- Resolve spintax ({Hi|Hello|Hey})
- Queue to campaign_send_queue
    ↓
sendQueueProcessorService → gmailSenderService
    ↓
- Inject tracking pixel
- Inject unsubscribe link
- Send via Gmail API
- Store in campaign_emails
    ↓
On Reply Detected:
- Auto-stop campaign for that contact
- Move contact to LEAD stage
```

---

## Security

| Feature | Implementation |
|---|---|
| **IP Whitelist** | Middleware blocks non-whitelisted IPs with 403 |
| **Session Auth** | AES-256-CBC encrypted cookies (7-day expiry) |
| **Token Encryption** | AES-256-GCM for OAuth refresh tokens & app passwords |
| **CSRF Protection** | Random state tokens for OAuth flows |
| **RBAC** | Admin (full) vs Sales (assigned accounts only) |
| **XSS Prevention** | DOMPurify sanitizes email HTML bodies |
| **Headers** | X-Frame-Options: DENY, X-Content-Type-Options: nosniff |
| **Input Validation** | Server-side validation on all mutations |
| **Pagination Limits** | Clamped page sizes to prevent unbounded queries |

---

## How to Scale This App

### Current Limits
- 104K emails, 12 Gmail accounts, 13K contacts
- Single Supabase instance (free/pro tier)
- Vercel serverless functions (10s/60s timeout)

### Scaling Strategies

1. **Database**
   - Add **read replicas** for analytics queries
   - Use **materialized views** for expensive aggregations (tab counts, pipeline stats)
   - Move to Supabase Pro for connection pooling + higher limits
   - Add **Redis** cache layer for hot data (tab counts, account lists)

2. **Email Sync**
   - Move webhook processing to **background workers** (Bull/BullMQ)
   - Implement **incremental sync only** (disable full sync in production)
   - Add **rate limiting** per Gmail account to avoid API quota issues

3. **Campaigns**
   - Move campaign processing to **dedicated workers** (not Vercel cron)
   - Implement **send queuing with priorities**
   - Add **warm-up mode** for new accounts (gradual send increase)
   - Implement **email deliverability monitoring** (bounce tracking, domain reputation)

4. **Frontend**
   - Implement **virtual scrolling** for large lists (react-window)
   - Add **service worker** for offline support
   - Implement **optimistic updates** for all mutations
   - Move to **edge runtime** for middleware (faster cold starts)

5. **Infrastructure**
   - Move to **dedicated PostgreSQL** for heavy analytics workloads
   - Add **CDN** for static assets (already on Vercel)
   - Implement **WebSocket connections** for true real-time updates
   - Add **monitoring** (Sentry for errors, Grafana for performance)

---

## Performance Optimizations (Already Implemented)

| Optimization | Before | After |
|---|---|---|
| Clients page (RPC) | 27-35s | ~200ms |
| Inbox (combined RPC) | 8.8s | ~250ms |
| Analytics (DB aggregation) | 10-30s | ~120ms |
| Projects (pagination) | ~5s | ~250ms |
| Covering indexes | Full table scans | Index-only scans |
| Server-side pagination | 500-5000 rows | 50 rows per page |
| localStorage caching | No cache | 5-min TTL caches |

---

## Deployment

**Platform:** Vercel
**Region:** US East (iad1)
**Domain:** txb-unibox.vercel.app

**Cron Jobs (vercel.json):**
- `/api/cron/cleanup-tracking` — Daily at 3 AM
- `/api/campaigns/process` — Daily at 6 AM
- `/api/cron/process-webhooks` — Daily at midnight
- `/api/cron/renew-gmail-watches` — Every 6 days at 3 AM

**Function Timeouts:**
- `/api/sync` — 60s
- `/api/webhooks/gmail` — 30s
- `/api/campaigns/process` — 60s
- `/api/cron/renew-gmail-watches` — 60s

---

## File Structure

```
unibox/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Inbox (home)
│   ├── layout.tsx                # Root layout
│   ├── clients/page.tsx          # CRM contacts
│   ├── accounts/page.tsx         # Gmail account management
│   ├── projects/page.tsx         # Video projects
│   ├── campaigns/                # Campaign management
│   │   ├── page.tsx              # Campaign list
│   │   ├── new/page.tsx          # Create campaign
│   │   └── [id]/page.tsx         # Campaign detail
│   ├── templates/page.tsx        # Email templates
│   ├── analytics/page.tsx        # Analytics dashboard
│   ├── team/page.tsx             # Team management
│   ├── settings/page.tsx         # App settings
│   ├── login/page.tsx            # Authentication
│   ├── api/                      # API routes
│   │   ├── auth/                 # OAuth flows
│   │   ├── webhooks/gmail/       # Gmail push notifications
│   │   ├── track/                # Email open tracking
│   │   ├── cron/                 # Scheduled jobs
│   │   ├── sync/                 # Manual sync trigger
│   │   └── campaigns/process/    # Campaign processor
│   ├── components/               # UI components
│   ├── hooks/                    # Custom React hooks
│   ├── context/                  # React contexts
│   ├── constants/                # App constants
│   └── utils/                    # Client utilities
├── src/
│   ├── actions/                  # Server actions
│   ├── services/                 # Business logic
│   ├── lib/                      # Database & auth setup
│   └── utils/                    # Server utilities
├── prisma/schema.prisma          # Database schema
├── middleware.ts                 # Auth + IP whitelist
├── next.config.js                # Next.js config
├── vercel.json                   # Deployment config
└── package.json                  # Dependencies
```
