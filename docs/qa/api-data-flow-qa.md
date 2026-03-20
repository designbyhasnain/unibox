# API & Data Flow Audit

## Overview
Comprehensive audit of all API routes, server actions, and data fetching patterns for duplicated logic, wasted API calls, and optimization opportunities.

---

## Critical Issues

### 1. Repeated `getAccountIds()` Calls (N+1 Pattern)
**Severity:** HIGH
**File:** `src/actions/emailActions.ts`

Every email-fetching action independently calls `getAccountIds(userId)`:
- `getInboxEmailsAction()` (line 157)
- `getSentEmailsAction()` (line 259)
- `getClientEmailsAction()` (line 372)
- `getTabCountsAction()` (line 690)
- `searchEmailsAction()` (line 761)

When `useMailbox.ts` fires inbox + tab counts in parallel, `getAccountIds()` runs twice with the same result.

**Fix:** Memoize at the request level, or create a unified `getMailboxStateAction()` that fetches accounts + inbox in one call.
**Estimated savings:** 4-5 queries per page load.

---

### 2. Duplicate Supabase Client Instantiation
**Severity:** HIGH
**Files:**
- `app/api/track/route.ts` (lines 4-7)
- `app/api/track/click/route.ts` (lines 4-7)
- `app/api/track/session/route.ts` (lines 4-7)

Each creates an inline `createClient()` instead of importing from `src/lib/supabase.ts`.

**Fix:** Import the shared client from `src/lib/supabase.ts`.

---

### 3. Redundant Email Enrichment Queries
**Severity:** HIGH
**File:** `src/actions/emailActions.ts`

Both `getInboxEmailsAction()` (lines 183-209) and `getSentEmailsAction()` (lines 281-306) run two extra queries after the RPC:
1. `gmail_accounts` table for email/manager info
2. `email_threads` table for `has_reply` flag

These could be included in the RPC or at least run in `Promise.all()`.

**Fix:** Modify RPCs to include account info and has_reply, or parallelize with `Promise.all()`.
**Estimated savings:** 2 round-trips per page load.

---

### 4. Duplicate Account Fetching Across Pages
**Severity:** MEDIUM-HIGH
**Files:** `Sidebar.tsx`, `page.tsx`, `accounts/page.tsx`, `settings/page.tsx`, `projects/page.tsx`, `clients/page.tsx`

`getAccountsAction()` is called independently on every page navigation since Sidebar mounts fresh each time.

**Fix:** Cache accounts in FilterContext at the layout level; fetch once, share everywhere.
**Estimated savings:** 3-5 queries per session.

---

## Medium Issues

### 5. Analytics Page — 13+ Sequential Queries
**Severity:** MEDIUM
**File:** `src/actions/analyticsActions.ts`

`getAnalyticsDataAction()` orchestrates 7 sub-functions making 13+ queries. Many query `email_messages` with overlapping filters (`fetchCoreStats`, `fetchDeliverability`, `fetchTopSubjects`, `fetchDailyData`, `fetchHourlyEngagement`).

**Fix:** Fetch `email_messages` once, aggregate in JavaScript.
**Estimated savings:** 5-7 queries per analytics load.

---

### 6. API Route vs Server Action Overlap — Sync
**Severity:** MEDIUM
**Files:** `app/api/sync/route.ts` vs `src/actions/accountActions.ts:reSyncAccountAction()`

Both trigger the same `syncGmailEmails()`. The API route is redundant.

**Fix:** Remove the API route; use the server action exclusively.

---

### 7. Duplicate Tracking Logic
**Severity:** MEDIUM
**Files:** `app/api/track/route.ts`, `app/api/track/click/route.ts`

Identical deduplication, rate-limiting, IP extraction, and owner-session filtering logic in both routes.

**Fix:** Extract to `src/lib/trackingHelpers.ts`.

---

### 8. `getManagersAction()` Called from Multiple Pages
**Severity:** LOW-MEDIUM
**Files:** `projects/page.tsx`, `analytics/page.tsx`, `clients/page.tsx`

Same static data fetched independently on each page.

**Fix:** Cache in React Context or SWR with long TTL.

---

### 9. `getTabCountsAction()` Never Cached
**Severity:** LOW
**File:** `app/hooks/useMailbox.ts` (line 228)

Re-fetches on every tab switch even if data hasn't changed.

**Fix:** Cache with short TTL (30s), only refetch after mutations.

---

## Summary

| Issue | Severity | Est. Calls Saved | Fix Complexity |
|-------|----------|-----------------|----------------|
| Repeated `getAccountIds()` | HIGH | 4-5/load | Medium |
| Duplicate Supabase clients | HIGH | N/A (resource) | Low |
| Redundant email enrichment | HIGH | 2/load | Medium |
| Duplicate account fetching | MEDIUM-HIGH | 3-5/session | Medium |
| Analytics query overload | MEDIUM | 5-7/load | High |
| API/Action sync overlap | MEDIUM | 1/sync | Low |
| Duplicate tracking logic | MEDIUM | ~3/event | Low |
| Manager data re-fetch | LOW-MEDIUM | 2/session | Low |
| Tab counts caching | LOW | 5-10/session | Low |

**Typical inbox page load:** 6-8 DB calls → reducible to 3-4 (50% improvement)
**Analytics page load:** 13+ queries → reducible to 5-7 (50% improvement)

---

## Implementation Log

**Date:** 2026-03-16

### Fixes completed

**Fix 1 — Created `src/utils/botDetection.ts`**
Unified bot/proxy detection into two functions (`isGoogleProxy`, `isBot`) that were previously inlined in `app/api/track/route.ts` (line 26) and duplicated in `app/utils/parseUserAgent.ts` (line 11). Both modules now share the same regex patterns.

**Fix 2 — Created `src/lib/trackingHelpers.ts`**
Extracted four shared helpers from the three tracking routes:
- `extractTrackingContext(request)` — IP extraction (x-forwarded-for / x-real-ip), user-agent, referer, owner cookie, and tracking ID. Previously duplicated across all three routes.
- `validateTrackingId(id)` — hex-32 format validation with type guard. Previously inlined in `track/route.ts` (line 121) and `track/click/route.ts` (line 36).
- `checkRateLimit(ip)` — 20-events-per-60s check against `email_tracking_events`. Previously duplicated in `track/route.ts` (lines 29-38) and `track/click/route.ts` (lines 58-67).
- `shouldSkipAsOwner(ctx)` — three-layer owner filtering (referer vs `NEXT_PUBLIC_APP_URL`, owner cookie, owner session DB lookup). Previously duplicated in `track/route.ts` (lines 53-75) and `track/click/route.ts` (lines 52-86). The old pixel route hardcoded `localhost` / `vercel.app` for referer checking; now uses `NEXT_PUBLIC_APP_URL` consistently.

**Fix 3 — Refactored the three tracking routes**
- `app/api/track/route.ts` — removed inline Supabase client (4 lines), inline IP extraction (3 lines), inline rate limiting (8 lines), inline owner filtering (18 lines), inline validation (1 line). Now imports from `trackingHelpers` and `botDetection`. Route-specific logic (pixel response, proxy_open logging, open deduplication, open counting) preserved.
- `app/api/track/click/route.ts` — same deduplication. Removed inline Supabase client, IP extraction, rate limiting, owner filtering. Route-specific logic (URL validation, redirect, click deduplication, click counting) preserved.
- `app/api/track/session/route.ts` — removed inline Supabase client, inline IP extraction. Now imports shared `supabase` and `extractTrackingContext`. Route-specific logic (owner session upsert, probabilistic cleanup, cookie setting) preserved.

### Lines of code deduplicated

| Before | After | Reduction |
|--------|-------|-----------|
| `track/route.ts`: 132 lines | 97 lines | -35 |
| `track/click/route.ts`: 121 lines | 93 lines | -28 |
| `track/session/route.ts`: 62 lines | 57 lines | -5 |
| `botDetection.ts`: 0 (new) | 16 lines | — |
| `trackingHelpers.ts`: 0 (new) | 119 lines | — |
| **Total** | **382 lines** (was 315) | Net +67 (shared modules), but ~68 lines of duplicated logic consolidated into single definitions |

### Behavior changes
- **Referer check in pixel route:** Previously matched `localhost` or `vercel.app` substrings. Now matches `NEXT_PUBLIC_APP_URL` prefix, consistent with the click route. This is a correctness fix — the old check could false-positive on unrelated `localhost` referers and missed custom domains.

### What remains
- Issues #1, #3, #4, #5 (query deduplication / caching) are not yet addressed.
- Issue #6 (API/action sync overlap) is not yet addressed.
- `app/utils/parseUserAgent.ts` still has its own inline bot regex; it could import `isBot` from `src/utils/botDetection.ts` but was left untouched since it is outside the assigned file scope.
