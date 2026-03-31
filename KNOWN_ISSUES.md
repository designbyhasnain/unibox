# Known Issues & Technical Debt

> Auto-generated: March 2026 | Unibox 360° Audit

---

## CRITICAL (Fix Immediately)

### ~~SEC-001: First User Auto-Creation Bypass~~ FIXED
### ~~SEC-002: HTML Injection in Unsubscribe Page~~ FIXED
### ~~SEC-003: SQL-like Injection in Search Queries~~ FIXED
### ~~SEC-004: Weak Session Validation in Middleware~~ FIXED

### SEC-005: Hardcoded IP Whitelist
- **File:** `middleware.ts` (lines 4-61)
- **Issue:** IP whitelist is hardcoded in source code. `X-Forwarded-For` header is trusted without proxy chain validation (spoofable). Wide prefixes like `192.168.` allow any LAN access.
- **Fix:** Move IPs to environment variables. Validate proxy chain for production deployments.

### SEC-006: CRON_SECRET Optional in Automations
- **File:** `app/api/cron/automations/route.ts` (line 10)
- **Issue:** If `CRON_SECRET` env var is not set, the endpoint is completely public. No default-deny behavior.
- **Fix:** Return 401 immediately if `CRON_SECRET` is not configured.

---

## HIGH (Fix This Week)

### PERF-001: N+1 Queries in Campaign Processing
- **File:** `app/api/campaigns/process/route.ts` (lines 65-131)
- **Issue:** For each campaign, loops through substeps, then for each substep loops through parent emails, then for each email makes DB queries. Could generate 1000+ queries for 100 campaigns.
- **Fix:** Batch-fetch all parent emails and thread data before the loop.

### PERF-002: N+1 Queries in Email Sync
- **File:** `src/services/emailSyncLogic.ts` (lines 206-418)
- **Issue:** `handleEmailReceived()` makes 3-4 sequential DB queries per email (contact, thread, messages, campaign). Processing 1000 emails = 3000-4000 queries.
- **Fix:** Use `Promise.all()` to parallelize independent queries per email, and batch-fetch contacts/threads.

### SEC-007: Race Condition on Invitation Acceptance
- **File:** `app/api/auth/crm/google/callback/route.ts` (lines 58-60)
- **Issue:** Invitation expiry check and acceptance update are not atomic. Between check and update, another request could process the same invitation.
- **Fix:** Use a single atomic update with a `WHERE` clause that includes status and expiry checks.

### SEC-008: Authorization Bypass in Sync Endpoint
- **File:** `app/api/sync/route.ts` (lines 52-54)
- **Issue:** Checks `account.user_id !== DEFAULT_USER_ID` but doesn't verify current user has access via `user_gmail_assignments`. Any authenticated user could sync any account.
- **Fix:** Use `getAccessibleGmailAccountIds()` to verify access.

### SEC-009: Role Assignment Without Validation
- **File:** `app/api/auth/crm/google/callback/route.ts` (lines 80-84)
- **Issue:** User role is assigned directly from invitation without validating against allowed enum values. Could accept arbitrary role strings.
- **Fix:** Validate role against `['ADMIN', 'SALES', 'ACCOUNT_MANAGER']` whitelist.

### PERF-003: Missing Transactions in Send Queue
- **File:** `src/services/sendQueueProcessorService.ts` (lines 57-150)
- **Issue:** Email send, queue update, campaign_emails insert, and contact advancement happen without a transaction. If any step fails after email is sent, the email is sent but not recorded.
- **Fix:** Use a Supabase RPC function for atomic multi-step operations.

### SEC-010: Missing `server-only` Imports
- **Files:** `src/services/emailSyncLogic.ts`, `src/services/gmailSenderService.ts`, `src/services/pipelineLogic.ts`
- **Issue:** Missing `import 'server-only'` allows accidental client-side import of services that handle OAuth tokens and email operations.
- **Fix:** Add `import 'server-only';` as the first line of each file.

### BUG-001: Null Decrypt on Manual Accounts
- **File:** `src/actions/accountActions.ts` (line 290)
- **Issue:** `decrypt(account.refresh_token)` is called without null check. Manual (IMAP) accounts have no refresh_token, causing decrypt to crash.
- **Fix:** Add `if (account.refresh_token)` guard before decrypt.

---

## MEDIUM (Fix This Sprint)

### PERF-004: Context Providers Missing useMemo
- **File:** `app/context/UIContext.tsx` (lines 18-24)
- **Issue:** Provider value object is recreated on every render, causing all consumers to re-render unnecessarily.
- **Fix:** Wrap value in `useMemo(() => ({...}), [isComposeOpen, composeDefaultTo])`.

### PERF-005: EmailRow Memo Comparison Incomplete
- **File:** `app/components/InboxComponents.tsx` (lines 173-183)
- **Issue:** Custom `React.memo` comparator doesn't include `onPrefetch` callback. New callback reference on parent re-render causes all rows to re-render.
- **Fix:** Include `onPrefetch` in comparison, or memoize the callback in the parent.

### PERF-006: useMailbox Thread Cache Unbounded
- **File:** `app/hooks/useMailbox.ts` (lines 486-495)
- **Issue:** Thread prefetch cache (Map) grows infinitely. No eviction of old entries. Memory leak in long sessions.
- **Fix:** Implement LRU eviction with max size limit (e.g., 200 entries).

### PERF-007: Campaign Steps Fetched Per Email Send
- **File:** `src/services/sendQueueProcessorService.ts` (lines 190-246)
- **Issue:** `advanceCampaignContact()` fetches ALL campaign steps on every email send. For 1000 emails, 1000 identical queries.
- **Fix:** Cache steps per campaign for the duration of the processing cycle.

### PERF-008: Unsubscribe Check Queries Per Contact
- **File:** `src/services/campaignProcessorService.ts` (lines 163-169)
- **Issue:** Queries all unsubscribed emails for every batch of campaign contacts. Should be pre-fetched once per campaign.
- **Fix:** Batch-query all unsubscribed emails for the campaign before the contact loop.

### SEC-011: Unsubscribe Uses GET to Modify Data
- **File:** `app/api/unsubscribe/route.ts` (line 27)
- **Issue:** GET request modifies database (inserts unsubscribe record). Should use POST with CSRF protection.
- **Fix:** Change to POST method or accept GET for email client compatibility but add rate limiting.

### SEC-012: Fire-and-Forget Tracking Update
- **File:** `app/api/track/route.ts` (lines 47-53)
- **Issue:** Database update for email open tracking is fire-and-forget (`void supabase...`). If it fails, no error logged or retried.
- **Fix:** Log errors from the `.then()` chain.

### BUG-002: Webhook JSON Parse Without Try-Catch
- **File:** `app/api/webhooks/gmail/route.ts` (line 53)
- **Issue:** `JSON.parse(decodedData)` can throw on malformed base64 data, crashing the endpoint.
- **Fix:** Wrap in try-catch.

### BUG-003: InboxPage Tab Switch Doesn't Clear Selection
- **File:** `app/page.tsx` (lines 337-349)
- **Issue:** Changing tabs doesn't clear the selected email, causing orphaned selection state showing email from a different tab.
- **Fix:** Call `setSelectedEmail(null)` on tab change.

### PERF-009: Full Message List Loaded Into Memory
- **File:** `src/services/gmailSyncService.ts` (line 559)
- **Issue:** Fetches up to 100,000 message IDs into memory array before processing. Should stream/paginate.
- **Fix:** Use generator pattern to process in batches without loading all IDs first.

### BUG-004: ComposeModal Props Don't Update Form
- **File:** `app/components/ComposeModal.tsx` (lines 19-29)
- **Issue:** `defaultTo` and `defaultSubject` props are used only for initial state. If parent changes them, form doesn't update.
- **Fix:** Add `useEffect` to sync props to state when they change.

### BUG-005: CSVImportModal File Input Doesn't Reset
- **File:** `app/components/CSVImportModal.tsx` (lines 79-81)
- **Issue:** Reset function clears state but doesn't reset file input element. User can't re-import the same file.
- **Fix:** Add `fileRef.current.value = ''` in reset function.

### SEC-013: Hardcoded Pub/Sub Topic Fallback
- **File:** `src/services/gmailSyncService.ts` (lines 364-368)
- **Issue:** Hardcoded `projects/my-unibox/topics/gmail-push` as fallback exposes GCP project name. Debug logging also prints env var values.
- **Fix:** Remove hardcoded fallback. Throw error if env var missing. Remove debug logging in production.

---

## LOW (Backlog)

### TYPE-001: Widespread Use of `any` Type
- **Files:** `app/hooks/useMailbox.ts` (lines 34, 72, 78, 81-83, 385), `app/api/backfill-email-types/route.ts` (line 20), multiple page files
- **Issue:** Many variables and parameters typed as `any`, losing TypeScript safety.
- **Fix:** Define proper interfaces for Email, Account, Thread, Campaign types.

### TYPE-002: Unsafe `as unknown as` Type Casting
- **Files:** `app/campaigns/page.tsx` (line 109), `app/campaigns/[id]/page.tsx` (line 127)
- **Issue:** API responses cast with `as unknown as Campaign[]` bypassing type checking.
- **Fix:** Define proper return types on server actions.

### UX-001: Missing Error Boundaries
- **Files:** All pages
- **Issue:** No `<ErrorBoundary>` components. If any component errors, entire page goes blank.
- **Fix:** Add error boundaries around major feature sections (inbox, analytics, clients, modals).

### UX-002: Missing Suspense Boundaries
- **File:** `app/analytics/page.tsx`
- **Issue:** `dynamic()` import has loading fallback but no `<Suspense>` boundary for interaction-time suspensions.
- **Fix:** Wrap lazy-loaded components in `<Suspense>`.

### UX-003: Hardcoded Widths Breaking Mobile
- **Files:** `app/components/InboxComponents.tsx` (lines 152-163), `app/campaigns/page.tsx` (line 205)
- **Issue:** EmailRow sender column: `flex: 0 0 220px`. Campaign stats: 4-column grid on all sizes.
- **Fix:** Use responsive breakpoints.

### UX-004: Tab Counts Show 0 During Hydration
- **File:** `app/page.tsx` (line 38-39)
- **Issue:** Before hydration completes, tab counts show "0" which is misleading.
- **Fix:** Show skeleton loaders instead of "0" during hydration.

### UX-005: Settings Page Missing Validation
- **File:** `app/settings/page.tsx` (lines 25-43)
- **Issue:** Polling interval can be set to negative numbers or 0.
- **Fix:** Add min/max validation on the range input.

### PERF-010: Redundant DB Query for User Role
- **File:** `src/actions/authActions.ts` (line 13)
- **Issue:** `getCurrentUserAction()` always fetches role from DB even though role is in session cookie.
- **Fix:** Only fetch from DB when role change is suspected, otherwise use session value.

### SCHEMA-001: Missing Foreign Keys
- **Files:** `prisma/schema.prisma`
- **Issue:** `WebhookEvent.email_address` is a plain string (no FK to gmail_accounts). `ActivityLog.performed_by` is a string (no FK to users).
- **Fix:** Add proper relations.

### SCHEMA-002: No Soft Delete on Critical Models
- **File:** `prisma/schema.prisma`
- **Issue:** Hard deletes with cascades mean historical data is lost permanently.
- **Fix:** Add `deletedAt` field to Contact, Campaign, Project models.

### SCHEMA-003: Missing Composite Index
- **File:** `prisma/schema.prisma`
- **Issue:** Missing `(campaignId, status, nextSendAt)` composite index on CampaignContact, which is queried frequently during campaign processing.
- **Fix:** Add `@@index([campaignId, status, nextSendAt])`.
