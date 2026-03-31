# Unibox — Developer Guide for Changes

> Quick reference for making changes to the codebase. Updated March 2026.

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
