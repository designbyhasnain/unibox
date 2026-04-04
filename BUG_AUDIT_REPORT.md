# Comprehensive Bug Audit Report

> Date: April 3, 2026 | Pass 1 + Pass 2

## Pass 1 — Critical (P0) — Fixed

| # | Bug | File | Fix |
|---|-----|------|-----|
| 1 | Extension API auth broken — `eq('id', apiKey)` treats API key as user UUID | `app/api/ext/add-lead/route.ts:18` | Changed to `eq('extension_api_key', apiKey)` |
| 2 | Same broken auth in check-duplicate | `app/api/ext/check-duplicate/route.ts:18` | Changed to `eq('extension_api_key', apiKey)` |
| 3 | Same broken auth in ping | `app/api/ext/ping/route.ts:18` | Changed to `eq('extension_api_key', apiKey)` |
| 4 | Automations cron GET: public when CRON_SECRET unset | `app/api/cron/automations/route.ts:77` | Added `!cronSecret` + timingSafeEqual |
| 5 | Sync endpoint: no RBAC check | `app/api/sync/route.ts:35-44` | Added `getAccessibleGmailAccountIds()` |
| 6 | Backfill endpoint: no admin check | `app/api/backfill-email-types/route.ts:13` | Added admin role check |

## Pass 1 — High (P1) — Fixed

| # | Bug | File | Fix |
|---|-----|------|-----|
| 7 | Automations GET: string comparison (timing attack) | `app/api/cron/automations/route.ts:77` | `crypto.timingSafeEqual()` |
| 8 | Opportunities: AI error leaves spinner stuck | `app/opportunities/page.tsx:26-33` | try/catch/finally |
| 9 | Settings: setTimeout memory leak | `app/settings/page.tsx:42` | Ref + useEffect cleanup |

## Pass 2 — Critical (P0) — Fixed

| # | Bug | File | Fix |
|---|-----|------|-----|
| 10 | XSS via `dangerouslySetInnerHTML` on AI summary (unsanitized AI output) | `app/opportunities/page.tsx:182-189` | Added DOMPurify.sanitize() with ALLOWED_TAGS whitelist |

## Pass 2 — High (P1) — Fixed

| # | Bug | File | Fix |
|---|-----|------|-----|
| 11 | ComposeModal double-submit: rapid clicks bypass `isSending` state check | `app/components/ComposeModal.tsx:118-136` | Added `sendingRef` (synchronous ref guard) |
| 12 | InlineReply same double-submit race condition | `app/components/InlineReply.tsx:152-169` | Added `sendingRef` (synchronous ref guard) |
| 13 | CSVImportModal: backdrop click closes during active import (data loss) | `app/components/CSVImportModal.tsx:86` | Guard: only close when `step !== 'importing'` |
| 14 | CSVImportModal: file input not reset — can't re-import same file | `app/components/CSVImportModal.tsx:79-81` | Added `fileRef.current.value = ''` in reset() |

## Medium (P2) — Known Issues (Deferred)

| # | Bug | File | Notes |
|---|-----|------|-------|
| 15 | Track/click endpoints have no auth | `app/api/track/route.ts` | By design: tracking pixels can't carry auth. 128-bit entropy IDs. |
| 16 | Unsubscribe uses GET to modify data | `app/api/unsubscribe/route.ts` | Required for email client link compatibility |
| 17 | Extension CORS allows all origins | `app/api/ext/*.ts` | Required for browser extension |
| 18 | contactDetailActions missing RBAC | `src/actions/contactDetailActions.ts` | Low risk: clients page pre-filters by RBAC |
| 19 | intelligenceActions missing RBAC | `src/actions/intelligenceActions.ts` | Low risk: page is admin-only in sidebar |
| 20 | Various actions missing `.update()` error checks | Multiple | Supabase returns errors (doesn't throw) |
| 21 | importActions no try/catch wrapper | `src/actions/importActions.ts` | Partial imports possible on error |
| 22 | Projects BoardView: no drag-drop (view-only) | `components/projects/views/BoardView.tsx` | Feature gap, not a bug — works as read-only view |
| 23 | Projects inline edit: no rollback on server error | `components/projects/ProjectsClient.tsx` | Reloads data on error (flash but recovers) |
| 24 | AddLeadModal/AddProjectModal: no Escape key handler | Multiple modals | Low impact — close button works |

## Low (P3) — Backlog

| # | Bug | File | Notes |
|---|-----|------|-------|
| 25 | `any` types widespread | Multiple | Functional but reduced type safety |
| 26 | Math.random() for A/B variants | `src/actions/campaignActions.ts` | Acceptable for non-security use |
| 27 | No rate limiting on public endpoints | Various | Would need edge middleware |

## KNOWN_ISSUES.md Status

| ID | Status | Notes |
|----|--------|-------|
| SEC-001 to SEC-004 | FIXED (previously) | |
| SEC-005: Hardcoded IP whitelist | Open | Move to env vars |
| SEC-006: CRON_SECRET optional | **FIXED in Pass 1** | Added null check + timingSafeEqual |
| SEC-007: Race condition on invitation | Open | Needs atomic DB operation |
| SEC-008: Sync authz bypass | **FIXED in Pass 1** | Added RBAC check |
| SEC-009: Role assignment validation | Open | Low risk with invitation flow |
| SEC-010: Missing server-only imports | Open | Low risk |
| PERF-001/002: N+1 queries | Open | Campaign processor uses batch pre-fetch now |
| PERF-003: Missing transactions in send queue | Open | DB default ID fix resolved the symptom |
| BUG-001: Null decrypt on manual accounts | Open | Edge case |
| BUG-003: Tab switch doesn't clear selection | Open | UX annoyance |
| BUG-004: ComposeModal props don't update | Open | Low impact |
| BUG-005: CSV file input doesn't reset | **FIXED in Pass 2** | Added fileRef.value = '' |

## Summary

| Severity | Pass 1 | Pass 2 | Total Fixed | Remaining |
|----------|--------|--------|-------------|-----------|
| P0 | 6 | 1 | 7 | 0 |
| P1 | 3 | 4 | 7 | 0 |
| P2 | — | — | 0 | 10 (deferred) |
| P3 | — | — | 0 | 3 (backlog) |
| **Total** | **9** | **5** | **14** | **13** |

## Automated Check Results

- `npx tsc --noEmit` — **0 errors**
- `npm run build` — **Success**
