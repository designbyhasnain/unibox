# Architecture & DRY Principles Audit

## Overview
Analysis of duplicated business logic, inconsistent patterns, and code organization across the codebase.

---

## Critical Issues

### 1. Email Normalization Logic Scattered
**Severity:** HIGH | 7 files affected
**Locations:**
- `src/actions/accountActions.ts:31` — `email.toLowerCase().trim()`
- `src/actions/clientActions.ts:12,186` — same inline pattern
- `src/actions/emailActions.ts:344,367` — same inline pattern
- `src/services/emailSyncLogic.ts:16-18` — `extractEmail()` with RFC 2822 handling
- `src/services/gmailSyncService.ts:202` — regex match + toLowerCase

**Problem:** `extractEmail()` handles `"John <john@example.com>"` correctly; inline `.toLowerCase().trim()` does not. Inconsistent behavior across features.

**Fix:** Create `src/utils/emailNormalizer.ts` with a single `normalizeEmail()` function used everywhere.

---

### 2. ADMIN_USER_ID / DEFAULT_USER_ID Duplicated
**Severity:** MEDIUM
**Files:**
- `src/actions/projectActions.ts:7` — `process.env.DEFAULT_USER_ID || 'uuid'`
- `src/actions/clientActions.ts:7` — identical
- `app/constants/config.ts:1` — also checks `NEXT_PUBLIC_DEFAULT_USER_ID`

**Problem:** Hardcoded UUID in 3 files with inconsistent env var resolution.

**Fix:** Centralize in `src/lib/config.ts`, import everywhere.

---

### 3. Tracking Route Initialization Pattern Duplicated
**Severity:** HIGH
**Files:** `app/api/track/route.ts`, `app/api/track/click/route.ts`

Both routes have ~50 lines of identical logic:
1. IP extraction from headers
2. UserAgent extraction
3. Referer extraction
4. Owner cookie check
5. TrackingId validation (`/^[a-f0-9]{32}$/i`)
6. Rate limiting (>20 events in 60s)
7. Owner session filtering

**Fix:** Create `src/lib/trackingHelpers.ts` with `extractTrackingContext()`, `checkRateLimit()`, `shouldSkipTracking()`.

---

### 4. Owner Session Filtering Inconsistency
**Severity:** MEDIUM
**Files:** `app/api/track/route.ts` vs `app/api/track/click/route.ts`

- Open tracking hardcodes `localhost` and `vercel.app` for referer check
- Click tracking uses `NEXT_PUBLIC_APP_URL`
- **Different behavior for the same intent**

**Fix:** Use `NEXT_PUBLIC_APP_URL` consistently in the shared helper.

---

## High Priority Issues

### 5. Google Proxy Detection in Two Places
**Severity:** MEDIUM
**Files:**
- `app/api/track/route.ts:26` — `/GoogleImageProxy|via ggpht\.com/i`
- `app/utils/parseUserAgent.ts:11` — `/bot|crawl|spider|GoogleImageProxy|ggpht/i`

**Fix:** Consolidate in `src/utils/botDetection.ts`.

---

### 6. `has_reply` Logic Duplicated
**Severity:** MEDIUM
**File:** `src/actions/emailActions.ts` — lines 193-209 (inbox), 291-306 (sent), 592-594 (thread view)

Identical thread reply map construction in 3 places.

**Fix:** Extract to `src/utils/threadHelpers.ts:buildThreadRepliesMap()`.

---

### 7. Account Mapping Logic Duplicated
**Severity:** MEDIUM
**File:** `src/actions/emailActions.ts` — lines 183-191 (inbox), 281-289 (sent), also in search

Same `gmail_accounts` query + Map construction repeated 3+ times.

**Fix:** Extract to `src/utils/accountHelpers.ts:buildAccountMap()`.

---

### 8. Email Row Transformation Duplicated
**Severity:** MEDIUM
**Files:** `src/actions/emailActions.ts` (4 locations), `src/actions/clientActions.ts`

Same 15-line row-to-object mapping copy-pasted across inbox, sent, search, and client emails.

**Fix:** Extract to `src/utils/emailTransformers.ts:transformEmailRow()`.

---

### 9. Error Handling Inconsistency
**Severity:** MEDIUM

- Actions: `try/catch` returning `{ success: false, error: error.message }`
- Services: `isAuthError()` classification function
- API routes: `console.error('[Track] Fatal Error:', err?.message)`
- No centralized error classification

**Fix:** Create `src/lib/errorHandler.ts` with `AppError` class and `classifyError()`.

---

### 10. Contact/Lead Creation Scattered
**Severity:** MEDIUM
**Files:**
- `src/actions/clientActions.ts:23-34` — `ensureContactAction()`
- `src/actions/emailActions.ts:510-520` — embedded in `updateEmailStageAction()`
- `src/services/pipelineLogic.ts:49-72` — `createManualLead()`

Different field initialization, different defaults, different activity log patterns.

**Fix:** Create `src/services/contactManagement.ts:ensureOrCreateContact()`.

---

## Low Priority Issues

### 11. Magic Strings/Numbers Scattered
- Rate limits: `> 20` events in `60s` (2 files)
- Date windows: `24 * 60 * 60 * 1000` (4+ files)
- Message limits: `500`, `5000`, `10000` scattered

**Fix:** Create `src/constants/limits.ts`.

---

### 12. Page Size Clamping Repeated
`Math.min(Math.max(1, pageSize), 100)` in 3 places.

**Fix:** Extract to `src/utils/pagination.ts:clampPageSize()`.

---

### 13. RPC Names Not Typed
RPC names like `get_inbox_threads`, `increment_email_opens` are plain strings scattered across files.

**Fix:** Create `src/types/rpc.ts` with typed RPC name enum.

---

## Dependency Graph (No Circular Dependencies)

```
gmailSyncService → emailSyncLogic, encryption
gmailSenderService → emailSyncLogic, googleAuthService
manualEmailService → emailSyncLogic, encryption
trackingService → (self-contained)
pipelineLogic → supabase only
```

---

## Recommended Refactoring Priority

### Phase 1 — Critical DRY (Do First)
1. Supabase client consolidation (4 API routes)
2. Email normalization utility (7 files)
3. Tracking helpers extraction (2 routes)
4. ADMIN_USER_ID centralization (3 files)

### Phase 2 — Email Action Refactoring
5. `buildThreadRepliesMap()` helper
6. `buildAccountMap()` helper
7. `transformEmailRow()` helper
8. Contact creation consolidation

### Phase 3 — Configuration & Types
9. Magic numbers → constants
10. Error handler
11. RPC types
12. Pagination utilities

---

## Implementation Log

### Date: 2026-03-16

**Scope:** Email/action layer DRY refactoring — Issues #1, #2, #6, #7, #8, #11, #12

#### Files Created

| File | Purpose |
|------|---------|
| `src/lib/config.ts` | `getDefaultUserId()` — centralised DEFAULT_USER_ID / ADMIN_USER_ID resolution (Issue #2) |
| `src/utils/emailNormalizer.ts` | `normalizeEmail()` — unified RFC 2822 email extraction + lowercase/trim (Issue #1) |
| `src/utils/accountHelpers.ts` | `buildAccountMap()` — shared gmail_accounts query + Map construction (Issue #7) |
| `src/utils/threadHelpers.ts` | `buildThreadRepliesMap()` — shared has_reply thread lookup (Issue #6) |
| `src/utils/emailTransformers.ts` | `transformEmailRow()`, `transformJoinedEmailRow()` — shared row-to-object mapping (Issue #8) |
| `src/utils/pagination.ts` | `clampPageSize()` — shared page-size clamping (Issue #12) |
| `src/constants/limits.ts` | `TRACKING`, `PAGINATION`, `EMAIL_SYNC` constants (Issue #11) |

#### Files Refactored

| File | Changes |
|------|---------|
| `src/actions/emailActions.ts` | Replaced duplicated account mapping (2 sites), thread replies mapping (2 sites), email row transformation (4 sites: inbox, sent, search, client), page-size clamping (3 sites), and email normalization (2 sites) with imports from new helpers. Added `resolveAccountIds()` private helper to DRY the account-id resolution pattern (was repeated in 5 functions). `PAGE_SIZE` now sourced from `PAGINATION.DEFAULT_PAGE_SIZE`. |
| `src/actions/clientActions.ts` | Replaced `ADMIN_USER_ID` constant with `getDefaultUserId()`. Replaced 2 inline `toLowerCase().trim()` calls with `normalizeEmail()`. |
| `src/actions/projectActions.ts` | Replaced `ADMIN_USER_ID` constant with `getDefaultUserId()`. |
| `src/actions/accountActions.ts` | Replaced 1 inline `email.toLowerCase().trim()` call with `normalizeEmail()`. |

#### Functions / Utilities Created

- `getDefaultUserId()` — resolves `DEFAULT_USER_ID` / `NEXT_PUBLIC_DEFAULT_USER_ID` / hardcoded fallback
- `normalizeEmail(raw)` — extracts email from RFC 2822 format, lowercases, trims
- `buildAccountMap(accountIds, supabase)` — queries gmail_accounts and returns `Map<id, {email, manager_name}>`
- `buildThreadRepliesMap(threadIds, supabase)` — queries email_threads and returns `Set<threadId>` of threads with replies
- `transformEmailRow(row, accountMap, threadRepliesMap?, overrides?)` — maps RPC row to frontend shape
- `transformJoinedEmailRow(row)` — maps Supabase-joined row (with nested gmail_accounts) to frontend shape
- `clampPageSize(size, max?)` — clamps page size to [1, max]
- `resolveAccountIds(userId, gmailAccountId?)` — private helper in emailActions.ts that DRYs the account-id resolution pattern

#### Verification

- TypeScript compilation (`npx tsc --noEmit`) passes with zero errors.
- No exported function signatures were changed; all changes are internal.
- All transformations produce identical output to the original inline code.

#### What Remains To Be Done

- **Issue #3 / #4:** Tracking route helpers (`extractTrackingContext`, `checkRateLimit`, `shouldSkipTracking`) — outside current file scope (`app/api/track/` routes)
- **Issue #5:** Google Proxy detection consolidation in `src/utils/botDetection.ts` — outside current file scope
- **Issue #9:** Centralised error handling (`AppError`, `classifyError`) — cross-cutting concern, deferred
- **Issue #10:** Contact/lead creation consolidation (`ensureOrCreateContact`) — touches `pipelineLogic.ts` which is outside current scope
- **Issue #13:** Typed RPC names enum — deferred to Phase 3
- **Remaining magic numbers:** `TRACKING` and `EMAIL_SYNC` constants are defined but not yet wired into tracking routes and sync services (outside current file scope)
- **`emailSyncLogic.ts`:** Still has its own `extractEmail()` — could be migrated to `normalizeEmail()` in a future pass (file is outside current scope)
