# Unibox — Developer Guide for Changes

> Quick reference for making changes to the codebase. Last synced with git history: **2026-04-21** (commit `038a3bb`).

---

## Changelog (Apr 2026 — most recent first)

_Synced from `git log` on 2026-04-21. Only merged `main` commits shown; see `git log` for the full history._

### Infrastructure
- **`038a3bb`** chore: rename `middleware.ts` → `proxy.ts` (Next.js 16 convention)
- **`71dcf84`** feat: push all local UI changes to production
- **`877a545`** fix: resolve type errors in warmup script blocking Vercel build

### Design system overhaul (floating shell, oklch tokens, dark mode)
- **`522d37f`** feat: rewrite Intelligence page as Jarvis audit card-based UI
- **`84a407f`** feat: Sidebar full rewrite — pixel-match to design prototype
- **`cf97ac2`** feat: Inbox design overhaul — all hardcoded colors replaced with tokens
- **`d2264a6`** feat: Design system Phase 4 — component styles from prototype
- **`788924a`** feat: Design system overhaul Phase 0+1+2 — oklch tokens, floating shell, sidebar
- **`48998c6`** feat: complete dark mode polish for all components
- **`f69ef27`** feat: dark mode with floating shell + theme toggle

### Jarvis AI evolution
- **`1f8371d`** feat: Jarvis coaching mode — feedback when agent already replied
- **`2cf8091`** feat: Jarvis Phase 2+3 — knowledge retrieval + agent feedback loop
- **`ebde325`** feat: Jarvis knowledge mining script + training-plan doc
- **`c0084fc`** feat: Jarvis Phase 1 — smarter replies with business knowledge
- **`2181866`** feat: Jarvis Daily Briefing — role-aware 24h summary on `/dashboard`
- **`5ff704b`** feat: Jarvis Suggested Replies — AI-drafted reply above every thread

### UX polish & performance
- **`51722dc`** feat: animated loading text on all in-page loading states
- **`a931b31`** feat: animated loading text with sales/editing personality
- **`7013f44`** perf: lightning performance — Phase 1, 6, 10
- **`d65d65e`** polish: Phase 2 — empty states, responsive grid, data-health cleanup
- **`2bcf338`** feat: tier-1 upgrade across 7 target pages
- **`00c425b`** feat: instant UX + smart role-based team management

### Email / sync hardening
- **`5a5e89c`** fix: open tracking now works on Gmail web + Android app
- **`7fd5e9e`** fix: inbox was 3–15 rows/page because RPC returned mixed directions
- **`0cc8c87`** feat: `deepGapFillSync` — backfill mail after recovery without rate limits
- **`d160279`** feat: mass-Gmail stability — never disconnect over transient errors
- **`23198c8`** fix: deduplicate emails across 77 Gmail accounts
- **`95926ed`** fix: Sent tab uses RPC to avoid timeout on 77-account IN query
- **`ad85310`** fix: restore RPC for inbox (prevents timeout), post-filter for RECEIVED only
- **`b524815`** fix: inbox shows only RECEIVED, Sent shows only SENT
- **`ccaedd9`** fix: inbox shows all stages, not just COLD_LEAD
- **`0e0f683`** fix: inbox count shows real total; Sent uses direct query for SALES
- **`35ce2ba` / `c5b7f46`** fix: inbox badge shows unread count and updates live
- **`5310248`** feat: strict identity-based data scoping across all surfaces

### Lead / campaign / ops tooling
- **`d876778`** feat: Lead Scraper Phase 5 + warm-up failure badges
- **`4494bf4`** feat: `scripts/backfill-warmup-badges.mjs` — reusable credential probe
- **`f8f1e21`** feat: db-maintenance Phase 5 + 6 (ownerless contacts + fuzzy project matcher)
- **`b770c2b`** feat: `scripts/db-maintenance.mjs` — safe DB maintenance utility
- **`dc59da5`** feat: `scripts/warmup.mjs` — local-only Gmail warm-up via Prisma

### Deep System Discovery — 2026-04-21
- Full codebase re-audit after undocumented drift. `PROJECT_OVERVIEW.md` rewritten from scratch as a shareable source-of-truth.
- `CLAUDE.md` updated: removed non-existent routes `/api/auth/google` and `/api/track/session`; fixed IMAP cron to 15 min; documented `components/projects/`, `lib/projects/`, `app/utils/`, `src/constants/`, `src/hooks/`, `src/scripts/`, `docs/`.
- Flagged 7 orphan files + root-level detritus for cleanup (pending user approval).

---

## Feature Inventory

| # | Feature | Status | Key Files |
|---|---------|--------|-----------|
| 1 | Unified Inbox | Active | `app/page.tsx`, `app/hooks/useMailbox.ts`, `src/actions/emailActions.ts` |
| 2 | Email Compose & Reply | Active | `app/components/ComposeModal.tsx`, `app/components/InlineReply.tsx` |
| 3 | Gmail OAuth Connection | Active | `src/services/googleAuthService.ts`, `app/api/auth/google/callback/route.ts` |
| 4 | Manual IMAP/SMTP Connection | Active | `src/services/manualEmailService.ts`, `src/actions/accountActions.ts` |
| 5 | Gmail Push Sync (Pub/Sub) | Active | `app/api/webhooks/gmail/route.ts`, `src/services/webhookProcessorService.ts` |
| 6 | Gmail History Sync | Active | `src/services/gmailSyncService.ts` → `syncAccountHistory()` |
| 7 | Gmail Full Sync | Active | `src/services/gmailSyncService.ts` → `syncGmailEmails()` |
| 8 | Email Open Tracking | Active | `src/services/trackingService.ts`, `app/api/track/route.ts` |
| 9 | Pipeline / Stages | Active | `app/constants/stages.ts`, `src/services/pipelineLogic.ts` |
| 10 | Client Management | Active | `app/clients/page.tsx`, `src/actions/clientActions.ts` |
| 11 | Project Management | Active | `app/projects/page.tsx`, `src/actions/projectActions.ts` |
| 12 | Campaign Automation | Active | `app/campaigns/`, `src/services/campaignProcessorService.ts`, `src/services/sendQueueProcessorService.ts` |
| 13 | A/B Testing (Campaigns) | Active | `app/components/ABTestingAnalytics.tsx`, `prisma/schema.prisma` (CampaignVariant) |
| 14 | Email Templates | Active | `app/templates/page.tsx`, `src/actions/templateActions.ts` |
| 15 | Analytics Dashboard | Active | `app/analytics/page.tsx`, `app/components/AnalyticsCharts.tsx`, `src/actions/analyticsActions.ts` |
| 16 | Team & Invitations | Active | `app/team/page.tsx`, `src/actions/inviteActions.ts`, `src/actions/userManagementActions.ts` |
| 17 | CRM Auth (Login) | Active | `src/services/crmAuthService.ts`, `app/api/auth/crm/google/` |
| 18 | Session Management | Active | `src/lib/auth.ts`, `middleware.ts` |
| 19 | RBAC (Role-Based Access) | Active | `src/utils/accessControl.ts` |
| 20 | Cron: Webhook Processing | Active | `app/api/cron/process-webhooks/route.ts` |
| 21 | Cron: Watch Renewal | Active | `app/api/cron/renew-gmail-watches/route.ts` |
| 22 | Cron: Data Cleanup | Active | `app/api/cron/cleanup-tracking/route.ts` |
| 23 | Cron: Campaign Processing | Active | `app/api/campaigns/process/route.ts` |
| 24 | Cron: Automations | Active | `app/api/cron/automations/route.ts` |
| 25 | CSV Import | Active | `app/components/CSVImportModal.tsx`, `src/actions/importActions.ts` |
| 26 | Finance Dashboard | Active | `app/finance/page.tsx`, `src/actions/financeActions.ts` |
| 27 | Intelligence Dashboard | Active | `app/intelligence/page.tsx`, `src/actions/intelligenceActions.ts` |
| 28 | Opportunities Pipeline | Active | `app/opportunities/page.tsx` |
| 29 | AI Summaries | Active | `src/services/aiSummaryService.ts`, `src/actions/summaryActions.ts` |
| 30 | Sales Automation | Active | `src/services/salesAutomationService.ts`, `src/actions/automationActions.ts` |
| 31 | Account Health Monitoring | Active | `src/services/accountHealthService.ts` |
| 32 | Account Rotation | Active | `src/services/accountRotationService.ts` |
| 33 | Unsubscribe Handling | Active | `app/api/unsubscribe/route.ts`, `src/utils/unsubscribe.ts` |
| 34 | Sent Mail View | Active | `app/sent/page.tsx` |
| 35 | Settings | Active | `app/settings/page.tsx` |

---

## Component Inventory

| Component | File | Purpose |
|-----------|------|---------|
| ClientLayout | `app/components/ClientLayout.tsx` | Main layout (sidebar + content + compose modal) |
| Sidebar | `app/components/Sidebar.tsx` | Left navigation |
| Topbar | `app/components/Topbar.tsx` | Top search bar with live results |
| EmailRow | `app/components/InboxComponents.tsx` | Single email row (memoized) |
| EmailDetail | `app/components/InboxComponents.tsx` | Email thread detail panel |
| PaginationControls | `app/components/InboxComponents.tsx` | Page navigation |
| ToastStack | `app/components/InboxComponents.tsx` | Toast notifications |
| ComposeModal | `app/components/ComposeModal.tsx` | Email compose dialog |
| InlineReply | `app/components/InlineReply.tsx` | Inline reply editor |
| AddProjectModal | `app/components/AddProjectModal.tsx` | New project form |
| AddLeadModal | `app/components/AddLeadModal.tsx` | New lead form |
| TemplatePickerModal | `app/components/TemplatePickerModal.tsx` | Template selector |
| CSVImportModal | `app/components/CSVImportModal.tsx` | CSV import flow |
| AnalyticsCharts | `app/components/AnalyticsCharts.tsx` | Analytics charts (lazy-loaded) |
| CampaignTabs | `app/components/CampaignTabs.tsx` | Campaign detail tabs |
| ABTestingAnalytics | `app/components/ABTestingAnalytics.tsx` | A/B test analytics |
| ABTestingChart | `app/components/ABTestingChart.tsx` | A/B test chart |
| DateRangePicker | `app/components/DateRangePicker.tsx` | Date range filter |
| LoadingStates | `app/components/LoadingStates.tsx` | Skeleton loaders |
| Button | `app/components/ui/Button.tsx` | Reusable button |
| FormField | `app/components/ui/FormField.tsx` | Form primitives |
| Badge | `app/components/ui/Badge.tsx` | Stage badges |
| ErrorAlert | `app/components/ui/ErrorAlert.tsx` | Error display |

---

## API Route Inventory

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/ping` | None | Health check (Edge) |
| GET | `/api/auth/crm/google` | None | Initiate CRM OAuth |
| GET | `/api/auth/crm/google/callback` | None (OAuth) | CRM OAuth callback |
| GET | `/api/auth/google/callback` | Session | Gmail OAuth callback |
| POST | `/api/sync` | Session | Trigger email sync |
| POST | `/api/webhooks/gmail` | OIDC | Gmail Pub/Sub webhook |
| GET | `/api/track` | None | Open tracking pixel |
| GET | `/api/unsubscribe` | None | Unsubscribe handler |
| GET | `/api/campaigns/process` | CRON_SECRET | Campaign processor |
| GET | `/api/cron/process-webhooks` | CRON_SECRET | Webhook processor |
| GET | `/api/cron/renew-gmail-watches` | CRON_SECRET | Watch renewal |
| GET | `/api/cron/cleanup-tracking` | CRON_SECRET | Data cleanup |
| GET | `/api/cron/automations` | CRON_SECRET | Sales automations |
| POST | `/api/backfill-email-types` | Session | Email type backfill |
| POST | `/api/migrate` | Admin | Data migration |

---

## Database Model Inventory

| Model | Table | Key Relations |
|-------|-------|---------------|
| User | `users` | → GmailAccount, Contact, Project, Campaign, Invitation |
| Contact | `contacts` | → EmailMessage, Project, CampaignContact, ActivityLog |
| GmailAccount | `gmail_accounts` | → User, EmailMessage, UserGmailAssignment, Campaign |
| EmailThread | `email_threads` | → EmailMessage |
| EmailMessage | `email_messages` | → GmailAccount, EmailThread, Contact, Project, CampaignEmail |
| Project | `projects` | → Contact, User, EmailMessage, ActivityLog |
| Invitation | `invitations` | → User (inviter) |
| UserGmailAssignment | `user_gmail_assignments` | → User, GmailAccount |
| IgnoredSender | `ignored_senders` | standalone |
| ActivityLog | `activity_logs` | → Contact, Project |
| Campaign | `campaigns` | → GmailAccount, User, CampaignStep, CampaignContact |
| CampaignStep | `campaign_steps` | → Campaign, CampaignVariant, CampaignEmail |
| CampaignVariant | `campaign_variants` | → CampaignStep |
| CampaignContact | `campaign_contacts` | → Campaign, Contact |
| CampaignEmail | `campaign_emails` | → Campaign, CampaignStep, Contact, EmailMessage |
| CampaignSendQueue | `campaign_send_queue` | → Campaign |
| CampaignAnalytics | `campaign_analytics` | → Campaign |
| Unsubscribe | `unsubscribes` | standalone |
| WebhookEvent | `webhook_events` | standalone |
| EmailTemplate | `email_templates` | → User |

---

## How to Add a New Feature

### 1. Plan the data model
```bash
# Edit prisma/schema.prisma
# Add your model with @@map("snake_case_table_name")
# Run migration:
npx prisma migrate dev --name add_feature_name
```

### 2. Create server actions
```typescript
// src/actions/featureActions.ts
'use server';
import { ensureAuthenticated } from '@/lib/safe-action';
import { supabase } from '@/lib/supabase';

export async function getFeatureDataAction() {
    const { userId, role } = await ensureAuthenticated();
    const { data, error } = await supabase.from('your_table').select('*');
    if (error) return { success: false, error: error.message };
    return { success: true, data };
}
```

### 3. Create the page
```typescript
// app/feature/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { getFeatureDataAction } from '@/actions/featureActions';

export default function FeaturePage() {
    const [data, setData] = useState([]);
    useEffect(() => {
        getFeatureDataAction().then(res => {
            if (res.success) setData(res.data);
        });
    }, []);
    return <div>...</div>;
}
```

### 4. Create loading state
```typescript
// app/feature/loading.tsx
export default function Loading() {
    return <div className="page-skeleton">Loading...</div>;
}
```

### 5. Add to sidebar navigation
```typescript
// app/components/Sidebar.tsx — add to the nav items array
{ href: '/feature', icon: <IconName size={20} />, label: 'Feature Name' }
```

---

## How to Add a New API Route

```typescript
// app/api/your-route/route.ts
import { getSession } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    // 1. Auth check
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Parse and validate input
    const body = await request.json();
    if (!body.requiredField) return NextResponse.json({ error: 'Missing field' }, { status: 400 });

    // 3. Business logic
    try {
        // ... your logic
        return NextResponse.json({ success: true, data: result });
    } catch (error: any) {
        console.error('[your-route] Error:', error.message);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
```

---

## How to Add a New Database Model

```prisma
// prisma/schema.prisma

model YourModel {
  id        String   @id @default(uuid())
  name      String
  status    YourStatus @default(ACTIVE)
  createdBy String   @map("created_by")
  user      User     @relation(fields: [createdBy], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([createdBy])
  @@index([status])
  @@map("your_models")  // snake_case table name
}

enum YourStatus {
  ACTIVE
  INACTIVE
  @@map("your_status")
}
```

Then run:
```bash
npx prisma migrate dev --name add_your_model
npx prisma generate
```

---

## How to Add a New Cron Job

### 1. Create the API route
```typescript
// app/api/cron/your-job/route.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(request: Request) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || !authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const expected = `Bearer ${cronSecret}`;
    const isValid = crypto.timingSafeEqual(
        Buffer.from(authHeader), Buffer.from(expected)
    );
    if (!isValid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Your cron logic
    try {
        const result = await yourCronFunction();
        return NextResponse.json({ success: true, ...result });
    } catch (error: any) {
        console.error('[cron/your-job] Error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
```

### 2. Register in vercel.json
```json
{
  "crons": [
    { "path": "/api/cron/your-job", "schedule": "0 */6 * * *" }
  ]
}
```

### 3. Common schedules
- Every 2 minutes: `*/2 * * * *`
- Every 15 minutes: `*/15 * * * *`
- Every 6 hours: `0 */6 * * *`
- Daily at 3 AM: `0 3 * * *`
- Weekly Monday 3 AM: `0 3 * * 1`

---

## Quick Win Improvements (Ranked by Impact)

### 1. Fix Critical Security Issues
> "Fix all CRITICAL security issues from KNOWN_ISSUES.md — SEC-001 through SEC-006"

### 2. Add useMemo to Context Providers
> "Add useMemo to UIContext and FilterContext provider values to prevent unnecessary re-renders across the entire app"

### 3. Add Error Boundaries
> "Add React error boundaries around InboxPage, AnalyticsPage, ClientsPage, and all modal components"

### 4. Fix N+1 Queries in Campaign Processing
> "Optimize campaign processing to batch-fetch parent emails and thread data instead of querying per-contact"

### 5. Add Input Validation to All Search Fields
> "Add proper input escaping to all Supabase .or() and .ilike() queries to prevent filter injection"

### 6. Add `server-only` to All Services
> "Add import 'server-only' to all files in src/services/ to prevent accidental client-side imports"

### 7. Add Transaction Boundaries to Send Queue
> "Wrap send queue processing in atomic operations so email sends are always properly recorded"

### 8. Fix ComposeModal Props Sync
> "Fix ComposeModal so it updates when defaultTo/defaultSubject props change after initial mount"

### 9. Implement Proper Type Definitions
> "Replace all 'any' types in useMailbox hook with proper Email, Account, and Thread interfaces"

### 10. Add Environment Variable Validation
> "Add startup validation for all required environment variables so missing config fails fast instead of at runtime"

---

# Detailed Build Notes (extracted from CLAUDE.md, 2026-05-04)

> Pruned out of CLAUDE.md to keep that file under 30k chars. These are the per-build narratives — root-cause analyses, design rationales, and migration impacts. Most-recent first. Architecture facts live in `PROJECT_OVERVIEW.md`; this file is the *journal*.

## Build 2026-05-06 (dashboard audit) — Need-Reply subjects, KPI delta arrows, label & empty-state fixes

A proactive audit of /dashboard against the live admin account surfaced four real bugs and two UX gaps. No "the user reported X" — these were caught by code-reading + browser inspection.

**Found via browser inspection of live KPIs:**
- `Sent today: 48 — ▲ -30 vs yesterday` — the up-arrow rendered for a *negative* delta on every KPI tile, including Sent (-30), Replies (-26), and Reply rate (-25 pts). Cause: the JSX hardcoded `▲`, only the colour class flipped between `up` (green) and `down` (red). Fix: switch the glyph to `▼` when delta < 0 so the icon and the text agree.
- `Need reply` table's middle column was empty for all 4 rows — `Iharvphoto`, `Memento Collective`, `Tobi (via Calendly)`, `Chris Schmauch` all rendered with no subject. Cause: `dashboardActions.getSalesDashboardAction` returned only contact-level fields (id, name, email, days_since_last_contact, total_revenue), no subject join. The PageClient had `r.subject || r.lastSubject || ''` ready but the server never populated either. Fix: in the server, do one batched query against `email_messages` filtered by `contact_id IN (…) AND direction = 'RECEIVED'` ordered desc, take the first subject per contact in JS, attach as `lastSubject`. Same number of round-trips as before for everything else (one extra batched query). The PageClient now also renders `(no subject)` in italic-faint when the field is genuinely empty rather than a blank cell.

**Found via code-read:**
- "Top closers this month" labelled top-revenue *clients* (the payload is `topClients` from `contacts` ordered by `total_revenue desc`). A "closer" reads as a sales rep — labelling the section "Top closers" was misleading. Renamed to **"Top revenue clients"** with sub-label `all accounts · lifetime` (admin) or `mine · lifetime` (sales). The data and the label now match.
- Briefing card layout shift on first load: the `<span class="jarvis-thinking">analyzing today's data…</span>` placeholder collapsed the card to ~60px while the Groq fetch was in flight, then expanded ~120px taller when the 2-3 paragraph summary landed. Set `min-height: 168px` on `.db-briefing` so the card reserves space for both states; longer summaries still expand naturally.

**Empty-state Tips (proactive UX fix per the user's spec):** added actionable hints for the three states the user is most likely to see early in the lifecycle:
- Empty Revenue chart: *"Tip: Mark a project as PAID in Projects to see revenue here."* (with link to /projects)
- Empty Need Reply table: *"Tip: Reply rate (week) climbs with consistency. Keep the streak."*
- Empty Top Revenue Clients table: *"Tip: Top revenue clients show up here once a project is marked PAID."*

**Click-throughs verified:** Clicking a Need-Reply row navigates to `/clients/<contactId>` (verified live: routed to `…/77948758-2ecc-4a08-ae5f-b2a90b965603`); clicking a Top Revenue Client row also routes correctly (verified live: `…/85869f7b-23e1-4623-88a1-5b25385deca8`). Both rows already had cursor:pointer + onClick handlers — no fix needed there.

**Roles audit:** Live test as ADMIN passed. SALES path verified by code-read (the `accountIds` branch in `dashboardActions.ts` scopes every contact/project query to `account_manager_id = userId`, so a SALES user only sees their own pipeline). VIDEO_EDITOR path: PageClient short-circuits to `<EditorTodayView />` before calling `getSalesDashboardAction` (which itself rejects editors via `blockEditorAccess(role)` server-side as a defence-in-depth).

**Files touched:**
- `src/actions/dashboardActions.ts` — needReply enriched with `lastSubject` via batched email_messages query.
- `app/dashboard/PageClient.tsx` — KPI delta arrow direction, "Top revenue clients" rename, empty-state Tips, briefing min-height.

## Build 2026-05-06 (inbox polish) — Relationship card overflow + unread/read distinction

Two screenshot bugs from the inbox detail sidebar + a request for clearer unread state in the email list.

**Relationship card: 'Closed' chip pushed outside the rounded container.** `.inbox-grid .stage-bar` was `display: flex` (no wrap), so 6 stage chips (Cold / Contacted / Warm / Lead / Offer / Closed) at the rendered widths overflowed past the right edge. Added `flex-wrap: wrap`, tightened chip padding (8px → 7px horizontal, 10.5px → 10px font), reduced gap (4px → 2px), and gave each button `flex: 0 0 auto; white-space: nowrap` so chips sit comfortably in 1 row at the common widths and gracefully wrap to 2 on narrow panes.

**Account email could push card layout.** `.inbox-grid .kv .v` had no overflow handling. With long mailboxes (`photographybyrafay@gmail.com` and similar) the row could break the card. Added `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 100%` and `gap: 12px` between key/value so the value gets to flex without crowding the label.

**Unread vs. read was hard to distinguish at a glance.** Two changes:

1. Added a small accent-coloured dot (`8x8`, `box-shadow` halo) at the left edge of `.gmail-email-row.unread::after`. Sits in the row's natural left padding (x=6), past the `.selected::before` 2px bar. Hidden when the row is also `.selected` so the two indicators don't fight visually.
2. Replaced the global `.gmail-email-row.read { opacity: 0.75 }` rule with per-element colour muting: read sender + subject use `var(--ink-muted)` and `font-weight: 400`; preview + date use `var(--ink-faint)`. Read rows now look secondary instead of ghosty, and the WhatsApp-style tracking ticks regain their full contrast.

Existing rules already made unread sender + subject `font-weight: 600`, so we didn't have to change those.

**Mail parity check (sent vs inbox):** verified at the SQL layer — `getInboxEmailsAction` filters `direction = 'RECEIVED'`, `getSentEmailsAction` filters `direction = 'SENT'`. They're correctly mirrored. The cross-account dedup in inbox is a deliberate defence against the same email being synced under multiple owned mailboxes (shared inboxes), not a hide. No code change.

**File touched:** `app/globals.css` (only).

## Build 2026-05-06 (polish) — /actions card visibility + readable previews + faster expand

Three bug reports + a perf ask after the morning's /actions launch:

**Buttons rendered white-on-white.** Collapse and Send used `background: var(--ink)` with `color: '#fff'` — but `--ink` is the foreground colour token (light cream in dark mode), so the button became light-on-light. Fixed both by using the project's established primary-button pattern (`btn-dark` in globals.css line 423-425): `background: var(--ink); color: var(--canvas)`. The Collapse pill, which doesn't need primary emphasis, now uses `surface-2 + ink + hairline border` for a high-contrast secondary look. Snooze (clock icon) was previously `background: var(--shell)` which matched the surrounding card surface — also bumped to `surface-2 + ink`.

**Message previews cut mid-sentence.** "Their Message" was capped at `maxHeight: 100px` with a `linear-gradient` fade mask, "Your Last Email" at 48px. Long messages (e.g. an OOO auto-reply that buried the actual question) were truncated to 2-3 lines with a ghostly fade. Bumped to 360px / 240px with `overflowY: auto`, removed the mask, and bumped the underlying `extractReplyPreview` cap from 200/300 → 4000 so the body actually has content to render. `whiteSpace: pre-wrap` keeps email line breaks.

**Expand felt slow + re-fetched on every toggle.** The `useEffect` keyed on `[isExpanded, action.contactId, accounts]` re-fired every time the card toggled because it only short-circuited on `loadingEmails`, never on `emailsLoaded`. So collapsing then re-expanding made another `getContactLastEmailsAction` round-trip. Three changes:

1. Extracted the fetch into a `prefetch()` `useCallback` that short-circuits on `emailsLoaded || loadingEmails`.
2. Wired `prefetch()` to `onMouseEnter` so the request starts on hover — by the time the user clicks, the data is in flight (often already there for snappy expansion).
3. Wrapped `ActionCard` in `React.memo` with a custom comparator: cards that aren't actively expanding don't re-render when a sibling's snooze popover toggles or another card's AI loading state flips.

**Files touched:**
- `app/components/ActionCard.tsx` — button colours (Collapse/Snooze/Send), message-preview heights + scroll, prefetch-on-hover, emailsLoaded short-circuit, React.memo wrapper.

## Build 2026-05-06 (post-launch) — /actions page: click-to-open + Ask AI wiring

First post-launch bug fix pass. Two reported issues on `/actions`:

**Bug 1: rows weren't clickable.** `app/actions/PageClient.tsx` was rendering its own simple inline rows that had `cursor: pointer` for show but no `onClick`. The richer `app/components/ActionCard.tsx` (which expands inline to show the conversation + a reply composer, plus snooze/done) already existed but was never used by the page. Refactor: drop the inline rows, render `ActionCard` for each item, and lift `expandedId` into the page so only one card is open at a time. Wired `accounts` from `useGlobalFilter`, `onSnooze`/`onDone` to the existing `snoozeActionAction` / `markActionDoneAction` server actions with optimistic remove + rollback on error.

**Bug 2: "Ask AI" button was a noop.** Two surfaces had this button:

1. `ComposeModal.tsx` — `<button className="ask-ai">…</button>` had no `onClick`. Now wired to `suggestReplyAction(threadId)`. When the modal was opened from a thread context (reply flow) it drafts and injects the suggestion into the contentEditable editor (with `DOMPurify.sanitize`); when there's no `threadId` (fresh compose), it shows a toast asking the user to open a thread first instead of failing silently.
2. `ActionCard.tsx` — never had an Ask AI button at all. Added one beside Send in the expanded composer's bottom bar, wired to `suggestReplyAction(threadId)` using the most-recent RECEIVED email's `thread_id`. Loading state ("Jarvis thinking…"), inline error row, button disabled while the thread is still loading or empty.

**Audit pass (no code changes needed):**
- Sorting: server sorts by urgency descending (critical → low) before returning. Confirmed.
- Badge counts: `med` tab folds `medium + low`, matching the original 3-bucket UI design. Counts memoized off `actions` state.
- Layout shifts: cards expand inline and shift the list — acceptable tradeoff vs. a separate modal. The card itself uses `transition: all .25s` so the expand is animated.
- Slow queries: `getActionQueueAction` already has a 30s in-memory cache and was previously refactored from 150 round-trips to 1 batched query (Phase 7). No further optimization needed.

**Files touched:**
- `app/actions/PageClient.tsx` — refactored to use `ActionCard`, lifted expand state, wired snooze/done with optimistic UI.
- `app/components/ActionCard.tsx` — added `Ask AI` button + `handleAskAI` calling `suggestReplyAction`, plus `aiLoading` / `aiError` states.
- `app/components/ComposeModal.tsx` — wired the previously-noop Ask AI button to `suggestReplyAction(threadId)`, sanitises the result before injecting into contentEditable.

## Build 2026-05-06 (later) — Search coverage on remaining list pages + intelligence scroll fix

Follow-on to the morning's global-search overhaul. Three list pages still had no topbar search and the `/intelligence` page had a scroll bug that hid most of the Jarvis audit cards below the fold.

**Search wiring (all client-side, real-time):**
- **`/my-projects`** — filter by `project_name`, `client_name`, `person`, `status`, or `editor`. Operates on the loaded page (max 100 projects); separate "No results found" empty state distinguishes a filtered-empty list from "No projects yet".
- **`/link-projects`** — filter the orphaned-projects list (by `project_name`, `account_manager`, `status`, `client_name`) and the suspicious-links list (by `name`, `email`). The per-card contact search inside an active orphan project's panel is left untouched — it's a different UX (server-side `searchContactsForLinkingAction` against the contacts table) and the topbar would be ambiguous between "filter the list" and "find a contact to link".
- **`/data-health`** — filter the Recent Failures list (by `email` or `lastError`) and the Perf Routes table (by route path). Counts in the section heading update with the filter so the user can see "5/12 match".

**`/intelligence` scroll fix:**

Root cause: the page was structured as a flex column with the topbar (`flexShrink: 0`), page head (`flexShrink: 0`), KPI chips (`flexShrink: 0`), and the cards list (`flex: 1; overflowY: auto`). But `<PageLoader>` wraps its rendered children in `<div className="content-loaded">` — a plain block-level div with no flex props. That extra wrapper became a single flex child carrying KPI chips + cards together, so the cards' `flex: 1` had nothing to compete against and the `overflowY: auto` clipped without ever activating. Result: anything past the first viewport's worth of cards was invisible.

Fix: collapse the inner scroll container. The outer `div` now has `overflow: hidden` and a sibling scrollable wrapper (`flex: 1; overflowY: auto; minHeight: 0`) that owns the page head, PageLoader, KPI chips, and cards together. Everything below the topbar scrolls as one. No more nested overflow boxes; no more reliance on PageLoader preserving flex-child semantics.

**Files touched:**
- `app/my-projects/PageClient.tsx` — `useRegisterGlobalSearch('/my-projects', …)`, `filteredProjects` memo, search-empty state.
- `app/link-projects/PageClient.tsx` — `useRegisterGlobalSearch('/link-projects', …)`, two filtered memos for the two tabs, search-empty state for each.
- `app/data-health/PageClient.tsx` — `useRegisterGlobalSearch('/data-health', …)`, two filtered memos, `PerfTable` accepts `searchTerm` + `totalRows` so it can render the right empty-state copy.
- `app/intelligence/PageClient.tsx` — restructured into `outer (flex column, overflow hidden) → topbar (fixed) → scroll wrapper (flex:1; overflowY:auto; minHeight:0) → page head + PageLoader → KPIs + cards`.
- `PROJECT_OVERVIEW.md` §4.12 — updated the "registers / doesn't register" lists.

**Now wired across 10 list-heavy routes:** `/`, `/sent`, `/clients`, `/projects`, `/my-projects`, `/link-projects`, `/campaigns`, `/accounts`, `/scraper`, `/data-health`. Hidden everywhere else.

## Build 2026-05-06 — Global search: contextual, list-only, per-page history

One-pass overhaul of the topbar search so it actually works the same way on every list-heavy page and disappears on routes where there's nothing to search. Driven by a complaint that the bar showed up on the dashboard / intelligence / finance / data-health / team views (where it does nothing) and that "recent searches" was a single global pile that bled queries across unrelated pages.

**Where search is wired (each route's PageClient registers `useRegisterGlobalSearch(key, …)`):**

| Route | Side | Fields |
|-------|------|--------|
| `/` | server | sender, subject, body |
| `/sent` | server | sender, subject, body |
| `/clients` | server (debounced 300ms) | name, email, company, phone |
| `/projects` | server (debounced 300ms) | name, client_name, **editor** (added) |
| `/campaigns` | client | name, goal, createdBy |
| `/accounts` | client | email, status |
| `/scraper` | client | url, domain, email, phone, score label (results); status / id-prefix (jobs) |

**Where search is hidden:** `/dashboard`, `/intelligence`, `/finance`, `/data-health`, `/team`, `/calendar`, `/jarvis`, `/analytics`, `/login`, `/invite/accept`. The form simply isn't rendered on these — `GlobalTopbar` short-circuits when no page registers (was previously `disabled` styling, which still showed an empty bar).

**Per-page history:** `unibox_search_history` was a single global key, so typing "invoice" on `/clients` would suggest itself on `/campaigns`. Now partitioned as `unibox_search_history:<key>` (e.g. `:/clients`, `:/projects`). The legacy global key is removed on first load. History reloads when the active page changes — so the dropdown always reflects what you've searched on the page you're on.

**`/projects` rewire:**
- Added `useRegisterGlobalSearch('/projects', …)` in `components/projects/ProjectsClient.tsx` with a 300ms debounce so each keystroke doesn't hit Supabase.
- Extended `lib/projects/actions.ts` `getEditProjects` `OR` clause from `name, client_name` → `name, client_name, editor` so the topbar can find a project by editor.
- Removed the local 🔍 toggle/input from `components/projects/toolbar/TableToolbar.tsx` — having two inputs that could drift was a UX trap.
- Added a "No results found" empty state when search returns zero rows.

**`/scraper` wire-up:** new `useRegisterGlobalSearch('/scraper', …)` in `app/scraper/ScraperClient.tsx`. With a job selected, the topbar filters the results table client-side; with no job selected, it filters the recent jobs sidebar by status or id prefix. Empty-state text matches the topbar `placeholder` swap (`"Search results"` vs `"Search scrape jobs"`).

**Snapshot shape change:** `GlobalSearchContext` snapshot now exposes the active `key` alongside the `config` so `GlobalTopbar` can scope history without prop-drilling. SSR snapshot updated to `{ key: null, config: null, version: 0 }`.

**Pre-existing tsc errors fixed in passing:** two `Object is possibly undefined` errors in `src/actions/emailActions.ts` (`m[1]` after `raw.match(...)` — `noUncheckedIndexedAccess` strictness). Replaced with `m?.[1] ?? raw`.

**Files touched:**
- `app/context/GlobalSearchContext.tsx` — emit `key` in snapshot.
- `app/components/GlobalTopbar.tsx` — hide form when inactive, partition history per page.
- `components/projects/ProjectsClient.tsx` + `components/projects/toolbar/TableToolbar.tsx` — register global search, drop local search input.
- `lib/projects/actions.ts` — search by editor in addition to name + client.
- `app/scraper/ScraperClient.tsx` — register global search, filter results + jobs.
- `app/accounts/PageClient.tsx` — empty-state copy switches to "No results found" when filtered to zero.
- `src/actions/emailActions.ts` — strict-mode tsc fix.
- `PROJECT_OVERVIEW.md` §4.12 — refreshed Global Search section.

## Build 2026-05-04 (later) — Merged /branding into /accounts; deleted standalone route; strengthened sender-identity headers

Reversal of the previous build's separate `/branding` route. The deliverability info belongs alongside the account it describes, not on its own page.

**UI merger** (`app/accounts/PageClient.tsx`):
- Each account card's meta line now shows DNS health pills (`SPF`, `DKIM`, `DMARC`) plus a `Google` / `Gravatar` / `No avatar` identity badge and a per-domain `↻ DNS` re-check button.
- New "Register w/ Google" button on the action bar for non-OAuth, non-free-mail accounts — opens the Google sign-up magic URL pre-filled with the address.
- Persona button stays as the single place to set display name + photo.
- Collapsible "Deliverability & sender avatars" details block at the top of the page documents the **honest** reality of which clients render which avatar signals (Gmail = paid VMC/CMC only, Yahoo/AOL = free BIMI, Apple = Apple Business Connect, Outlook = nothing).
- Compute sha256 client-side via `crypto.subtle.digest` for Gravatar lookup — no extra server round-trip.
- Branding actions (`checkAllDomainsAction`, `checkDomainDNSAction`, `checkGravatarsAction`) loaded once when accounts mount; cached in component state.

**Deleted** `app/branding/page.tsx` + `app/branding/PageClient.tsx`. Removed Branding entry from Sidebar Admin group. `src/actions/brandingActions.ts` retained — actions are now consumed by `/accounts`.

**BIMI-without-VMC research** (full report in agent transcript): summary —
- Gmail avatar circle is hard-blocked without VMC (~$1500/yr) or CMC (~$500–$1200/yr). No header/HTML/JSON-LD trick changes this. The only free path for Gmail is registering each address as a Google account (Register-w/-Google button).
- Yahoo / AOL render BIMI without VMC since 2021 — DNS TXT at `default._bimi.<domain>` + DMARC enforcement + hosted SVG Tiny PS. Free win.
- Apple Mail (iCloud-recipient only) renders via Apple Business Connect "Branded Mail" enrollment — free, ~7-day review, no VMC.
- Outlook does not render BIMI as of April 2026.
- `BIMI-Selector` MIME header tells receivers which DNS selector to fetch — costs nothing, harmless when no DNS record exists.
- `BIMI-Indicator` is a receiver-inserted header per IETF draft; sender-asserted ones are ignored.
- Schema.org JSON-LD is parsed by Gmail for action chips, NOT for sender avatar.
- Native Gmail / Apple / Outlook do NOT read Gravatar (per Gravatar's own docs). Useful only for third-party clients.

**Sender-identity header changes** (`src/utils/identitySchema.ts`, `src/services/manualEmailService.ts`, `src/services/gmailSenderService.ts`):
- New `buildBimiSelectorHeader(selector = 'default')` → emits `BIMI-Selector: v=BIMI1; s=default;` on every send. Both senders now wire it.
- New `gravatarUrl(email, size)` + `resolveSenderImage(profileImage, email)` — falls back to a Gravatar URL when no `profile_image` is set on the account, so the JSON-LD identity block always carries an image. (Honest: this only helps third-party clients that read Gravatar.)
- Doc comment in `identitySchema.ts` rewritten to document the verified May-2026 client matrix (was overselling JSON-LD as an avatar source).
- Existing `injectIdentitySchema` and `buildUnsubscribeHeaders` unchanged.

**Net code shipped this build**:
- Modified: `app/accounts/PageClient.tsx`, `app/components/Sidebar.tsx`, `src/services/manualEmailService.ts`, `src/services/gmailSenderService.ts`, `src/utils/identitySchema.ts`, `CLAUDE.md`, `CHANGES.md`.
- Deleted: `app/branding/page.tsx`, `app/branding/PageClient.tsx`.
- Retained for re-use: `src/actions/brandingActions.ts` (now consumed by /accounts).

## Build 2026-05-04 — Branding & Deliverability dashboard at `/branding`

> ⚠ Superseded by the same-day "Merged /branding into /accounts" build above. The standalone route was removed. The server actions in `src/actions/brandingActions.ts` survived the merge.

New admin-only route to drive 100% Gmail avatar visibility across all 77+ sender accounts.

- New route [`app/branding/page.tsx`](app/branding/page.tsx) + [`PageClient.tsx`](app/branding/PageClient.tsx) — high-density table with columns: Email + tiny avatar preview, Display name, DNS health (overall ✓ Trusted / ⚠ Untrusted), per-record SPF/DKIM/DMARC pills, Google identity, Gravatar status, action links.
- New server actions in [`src/actions/brandingActions.ts`](src/actions/brandingActions.ts):
  - `checkDomainDNSAction(domain)` — `node:dns/promises` (`resolveTxt` + `resolveCname`) verifies SPF (`v=spf1`), DKIM (tries 9 common selectors: `google`, `default`, `selector1/2`, `s1/2`, `k1`, `mxvault`, `dkim` — TXT or CNAME), DMARC (`v=DMARC1` at `_dmarc.<domain>`).
  - `checkAllDomainsAction(domains)` — bulk variant; de-dupes domains, parallel batches of 8.
  - `getBrandingDashboardAction()` — one row per `gmail_accounts` with email, domain, persona, sha256 Gravatar hash, pre-built Google sign-up "magic URL".
  - `checkGravatarsAction(hashes)` — server-side HEAD against `gravatar.com/avatar/{hash}?d=404` in batches of 10 (avoids browser CORS / rate-limit issues). Uses sha256.
- "Register with Google" button generates `https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&email=<email>` — forces "Use my current email address instead" so each custom-domain inbox can have its own Google identity.
- JSON-LD identity metadata already correctly injected in `src/services/manualEmailService.ts:106-112` via `injectIdentitySchema()` — Person + Organization (Wedits). Confirmed unchanged.
- All checks read-only; nothing written to DB. Re-scan is a button press, no polling.
- Honest limit documented in UI footer: Gmail BIMI (forced avatar circle) needs $1500/yr VMC — out of scope. The DNS + Gravatar + Google-signup combo is what gets to ~100% photo visibility on Gmail/Apple/Outlook web without BIMI.
- Sidebar: Branding entry added to Admin group, admin-only.

## Build 2026-04-30 — Phase 1 Launch-Ready security + dashboard truth fixes

Full audit + fix plan in `docs/AUDIT-2026-04-30-GRAND-DISCOVERY.md`.

- **Closed `getClientsAction` SALES fallthrough** (`src/actions/clientActions.ts`): SALES users with empty Gmail assignments fell through to the admin branch and received the workspace-wide contact list. Now fail-closed. Same commit added `blockEditorAccess()` to `ensureContactAction`, `createClientAction`, `checkDuplicateAction`; stopped `createClientAction` honouring caller-supplied `account_manager_id` for SALES (mass-assignment guard).
- **Login null-role no longer defaults to ADMIN** (`app/api/auth/login/route.ts`): `user.role || 'ADMIN'` was a silent privilege-escalation path. Now whitelists ADMIN/ACCOUNT_MANAGER/SALES/VIDEO_EDITOR and returns 403 otherwise.
- **Session cookies migrated AES-CBC → AES-GCM** (`src/lib/auth.ts`). The CBC scheme had no integrity check and was malleable. New format `iv:authTag:cipher` with 12-byte IV + 16-byte tag; tampered cookies fail at decrypt. `proxy.ts` validator updated. Dropped the dev-only-insecure-fallback secret — `NEXTAUTH_SECRET` is now strictly required everywhere. Migration impact: every existing session invalidated once.
- **Gmail webhook verifies OIDC JWT** (`app/api/webhooks/gmail/route.ts`): previously trusted any caller. Now uses `OAuth2Client.verifyIdToken`. Required env: `GMAIL_WEBHOOK_AUDIENCE`. Optional: `GMAIL_WEBHOOK_SERVICE_ACCOUNT_EMAIL`. Local-dev escape hatch: `GMAIL_WEBHOOK_VERIFY=false`.
- **Invitation tokens hashed at rest** (`src/actions/inviteActions.ts`): SHA-256, never returned by `listInvitesAction`. `validateInviteTokenAction` accepts both hashed and legacy plaintext (legacy fallback expires within 7 days).
- **Reflected XSS in proxy 403 fixed** (`proxy.ts`): the IP rendered in the "your IP X is not authorized" page was attacker-controlled and unescaped. Now HTML-escaped.
- **Dashboard fake data removed** (`app/dashboard/PageClient.tsx` + `src/actions/dashboardActions.ts`): four KPI tiles previously rendered hardcoded sparkline arrays + 12%-of-today fake deltas + a literal "12 hours ago" string + a hardcoded `[42,12],[51,18]…` revenue fallback. `getSalesDashboardAction` now returns `kpiTrends` with real 9-day daily buckets for sent / replies / new-leads / reply-rate plus today-vs-yesterday deltas plus `newestLeadAt`. Revenue chart shows empty state instead of fake bars.
- **Pipeline-counts N+1 collapsed** (`src/actions/dashboardActions.ts`): 7 sequential `head:true` count queries replaced by `get_pipeline_counts(p_user_id)` RPC (single GROUP BY). SQL in `scripts/dashboard-pipeline-rpc.sql`. Falls back to `Promise.all` of the 7 counts if RPC isn't deployed yet (still ~6× faster). Same migration adds missing indexes: `contacts(pipeline_stage)`, `contacts(account_manager_id, pipeline_stage)`, `projects(paid_status, project_date)`, `activity_logs(contact_id, created_at desc)`, `edit_projects(user_id, due_date)`.
- **`/opportunities` "drag cards between stages" copy removed** — there was no DnD wired. TODO left for proper `@dnd-kit` wiring.
- **Native `alert()` swept across 13 user-facing surfaces** — replaced with `useUndoToast`'s `showSuccess` + existing `showError` (with `onRetry`). Native `confirm()` left in 7 destructive paths with `TODO(*-modal)` markers.

Stale-entry correction: lint workflow has been on ESLint 9 flat config since `f4bda8e`; `npm run lint` passes 0 warnings. Vercel's `buildCommand` is `next build --experimental-build-mode=compile`, NOT `next build || true` — broken builds fail the deploy.

## Build 2026-04-26 — AM Credit & Ownership separation

Full design in `docs/AM-CREDIT-AND-OWNERSHIP-SCOPE.md`.

- **Principle**: Historical credit (`projects.account_manager_id`) is immutable once `paid_status='PAID'`. Current ownership (`contacts.account_manager_id`) is mutable. Two facts, two fields, never conflated.
- **Schema lock**: `updateProjectAction` refuses to mutate `account_manager_id` on a PAID project unless caller passes `{ adminOverride: true, reason: '...' (≥10 chars) }` AND has ADMIN role. Successful overrides write `AM_CREDIT_OVERRIDE` row to `activity_logs`. Refunds (PAID → PENDING) implicitly release the lock.
- **Transfer chokepoint**: `transferContactAction(contactId, newAmId, opts?)` is the **only** path that writes `contacts.account_manager_id`. Migrated `updateClientAction` to defer the AM field to it. Each call writes an `OWNERSHIP_TRANSFER` audit row. `OwnershipTransferSource` enum: `'manual' | 'bulk' | 'admin_override' | 'import' | 'campaign' | 'scraper' | 'invite' | 'system'`. Companion `recordOwnershipChange()` for creation paths.
- **History action**: `getOwnershipTransferHistoryAction(contactId)` returns parsed history with resolved actor + from + to user names, batched in one `users` query.
- **Activity log payload shape**: `activity_logs` columns: `action, performed_by, note, contact_id, project_id, created_at`. `note` is TEXT, NOT JSON. We `JSON.stringify(payload)` and parse on read. Code reading `activity_logs` should handle both `note` (current) and `details` (legacy if present).
- **UI surfaces** (`app/clients/[id]/PageClient.tsx`): Profile header shows `Owner: <FirstName>` + collapsible "Transfer history ▾" panel. Projects tab AM column shows `Closed by <Closer> · Now: <Owner>` when project's AM differs from contact's. Activity tab parses JSON in `note` for `OWNERSHIP_TRANSFER` and `AM_CREDIT_OVERRIDE`.
- **Out of scope (v1.5+)**: Project-list views still show single AM. Inbox row tooltip enrichment deferred. Multi-rep commission splits explicitly out (would need `project_commissions` table).

## Build 2026-04-25 — Inbox row "AM" label

Full design in `docs/INBOX-ACCOUNT-MANAGER-DISPLAY.md`.

- **Root cause**: Inbox row was rendering `email.gmail_accounts.user.name` — i.e. the user who *connected the Gmail account*. For Wedits, that's the team admin who onboarded all 62 inboxes, so every row showed the same name.
- **Three distinct ownership pointers in the schema**:
  1. **Gmail-account creator** — `gmail_accounts.user_id` → who connected the OAuth. Audit/refresh only. **Never use for display.**
  2. **Gmail-account assignment** — `user_gmail_assignments` (M:N pivot) → which user(s) own this inbox. Drives RBAC AND is the **default AM** for any contact on that inbox.
  3. **Account manager for the contact** — `contacts.account_manager_id` → explicit per-contact override. **Wins over the default when set.**
- **Resolution chain**: `contacts.account_manager_id` → `user_gmail_assignments` for the row's `gmail_account_id` (multi-user → prefer SALES role over ADMIN, tie-break by oldest `assigned_at`) → `Unassigned`.
- **Fix — server** (`src/actions/emailActions.ts:194` — `getInboxEmailsAction`): SELECT now includes `contact_id`. Three batched lookups (`contacts.in()`, `user_gmail_assignments.in()`, deduped `users.in()`). Each row gets `account_manager_name`, `account_manager_email`, `account_manager_source: 'contact' | 'gmail_account' | null`.
- **Fix — UI** (`app/components/InboxComponents.tsx:54-61, 141-149`): renders `<gmail-account-email> · AM(<name>)`.
- **Follow-up TODO**: lift AM-attach logic into `attachAccountManagerNames(rows)` and reuse on sent / search / thread-side-panel paths flagged in the doc.

## Build 2026-04-25 (later) — Jarvis Reply/Coach mode detection + long-thread bug

Full design in `docs/JARVIS-MODE-DETECTION-FIX.md`.

- **Root cause #1**: `Reply` / `Coach` toggle in `app/PageClient.tsx:671-672` was decorative — `jarvisMode` state never reached `<JarvisSuggestionBox>`.
- **Root cause #2**: `suggestReplyAction` used `.order('sent_at', { ascending: true }).limit(20)`, which returned the OLDEST 20 messages. Long threads (>20 msgs) had wrong mode + wrong prompt context. Now `ascending: false` + `limit(30)` + `.reverse()`.
- **Root cause #3**: Sync race — Gmail webhook → `email_messages` insert isn't transactional with the inbox UI's live thread display.
- **Fix — server contract** (`src/actions/jarvisActions.ts`, `src/services/replySuggestionService.ts`): `suggestReplyAction(threadId, opts?: { forceMode?: 'reply' | 'coach' })`. Returns `{ ..., mode, modeSource: 'forced' | 'auto', staleData: boolean }`. Staleness check compares `email_threads.last_message_at` vs newest fetched `email_messages.sent_at` (10s grace).
- **Fix — coaching prompt**: Adapts when there's no SENT message to coach.
- **Fix — UI**: `JarvisSuggestionBox` accepts `forceMode?: 'reply' | 'coach' | null`. Renders `· auto` badge when auto-detected, `· sync catching up` warn badge when DB is behind.

## Build 2026-04-25 — Claude reply-suggestion proxy gngn.my → Gloy

- `ANTHROPIC_BASE_URL` default `https://api.gngn.my` → `https://api.gloyai.fun`. `CLAUDE_MODEL` `claude-sonnet-4-6` → `claude-sonnet-4.5` (Gloy uses dot-versioning).
- Auth header still `x-api-key` (Gloy accepts both `Authorization: Bearer` and `x-api-key`); `anthropic-version: 2023-06-01` kept.
- Key prefix changed `sk_live_*` → `sk-funpay-*`. Validate with `GET https://api.gloyai.fun/claude/key`.
- Patched `scripts/mine-jarvis-knowledge.ts` to coerce object-typed `price_mentioned` → smallest numeric, non-finite → null.

## Build 2026-04-24 — Claude reply suggestion + RAG infrastructure

- Anthropic Claude (via gngn.my proxy initially, model `claude-sonnet-4-6`) added as primary LLM for in-thread reply suggestions; Groq + Gemini remain as fallback chain.
- New env vars: `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`.
- New table: `jarvis_lessons` (anti-patterns from lost deals — Q&A + `why_lost` + `lesson` columns).
- Confirmed: `jarvis_knowledge` and `jarvis_feedback` tables previously documented but DID NOT EXIST in DB. Setup SQL added at `scripts/jarvis-tables.sql`.
- Upgraded `replySuggestionService.ts`: V2 system prompt with explicit Empathy Opener + Closing Playbook + Pricing Table (~3KB, prompt-cached). New `fetchTopExamples()` 3-tier fallback. `fetchRelevantLessons()` injects 1 anti-pattern. `formatInboxSignalsBlock()` injects auto-detected signals.
- Updated `scripts/mine-jarvis-knowledge.ts`: `--limit=N` flag for first-run trial.
- New playbook doc: `docs/CLAUDE-REPLY-SUGGESTION-PLAYBOOK.md`.

## Deep System Discovery 2026-04-21 — drift corrections applied

- Removed non-existent routes `/api/auth/google` and `/api/track/session` from API table.
- Fixed IMAP cron cadence 30 min → 15 min.
- Documented undocumented directories: `components/projects/` (25-file Notion-style tracker at repo root), `lib/projects/`, `app/utils/` (helpers, localCache, staleWhileRevalidate, useHydration), `src/constants/limits.ts`, `src/hooks/useRealtimeInbox.ts`, `src/scripts/backfillClients.ts`, `docs/`.
- Flagged orphan files (zero imports outside docs): `src/actions/automationActions.ts`, `src/actions/relationshipActions.ts`, `src/services/pipelineLogic.ts`, `app/components/RevenueChart.tsx`, `app/components/RevenueBarChart.tsx`, `app/components/OnboardingWizard.tsx`, `app/components/JarvisDailyBriefing.tsx`.
