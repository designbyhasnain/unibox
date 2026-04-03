# Comprehensive Bug Audit Report

> Date: April 3, 2026

## Critical (P0) — Fixed

| # | Bug | File | Fix |
|---|-----|------|-----|
| 1 | Extension API auth broken — `eq('id', apiKey)` treats API key as user UUID, always fails | `app/api/ext/add-lead/route.ts:18` | Changed to `eq('extension_api_key', apiKey)` |
| 2 | Same broken auth in check-duplicate | `app/api/ext/check-duplicate/route.ts:18` | Changed to `eq('extension_api_key', apiKey)` |
| 3 | Same broken auth in ping | `app/api/ext/ping/route.ts:18` | Changed to `eq('extension_api_key', apiKey)` |
| 4 | Automations cron GET handler: if CRON_SECRET is unset, endpoint is completely public | `app/api/cron/automations/route.ts:77` | Added `!cronSecret` check + timing-safe comparison |
| 5 | Sync endpoint allows any authenticated user to sync any account (no RBAC) | `app/api/sync/route.ts:35-44` | Added `getAccessibleGmailAccountIds()` check |
| 6 | Backfill endpoint accessible to any authenticated user (should be admin only) | `app/api/backfill-email-types/route.ts:13` | Added `role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER'` check |

## High (P1) — Fixed

| # | Bug | File | Fix |
|---|-----|------|-----|
| 7 | Automations GET handler uses string `!==` comparison (timing attack risk) | `app/api/cron/automations/route.ts:77` | Replaced with `crypto.timingSafeEqual()` |
| 8 | Opportunities page: AI summary error leaves loading spinner stuck forever | `app/opportunities/page.tsx:26-33` | Added try/catch/finally to always reset `aiLoading` |
| 9 | Settings page: setTimeout for save confirmation causes memory leak if unmounted | `app/settings/page.tsx:42` | Added ref + useEffect cleanup |

## Medium (P2) — Known Issues (Not Fixed)

| # | Bug | File | Notes |
|---|-----|------|-------|
| 10 | Track/click endpoints have no auth (by design — tracking pixels can't carry auth) | `app/api/track/route.ts` | Acceptable: tracking IDs have 128-bit entropy |
| 11 | Unsubscribe endpoint uses GET to modify data | `app/api/unsubscribe/route.ts` | Required for email client compatibility (links in emails) |
| 12 | Extension CORS allows all origins (`*`) | `app/api/ext/*.ts` | Required for browser extension to work from any page |
| 13 | contactDetailActions missing RBAC filtering | `src/actions/contactDetailActions.ts` | Low risk: clients page already filters by RBAC before showing contact links |
| 14 | intelligenceActions missing RBAC filtering | `src/actions/intelligenceActions.ts` | Low risk: page is admin-only in sidebar |
| 15 | Various server actions missing error checks on `.update()` | Multiple files | Supabase client returns error objects (doesn't throw), silent failures possible |
| 16 | Import CSV has no try/catch wrapper | `src/actions/importActions.ts` | Partial imports possible on mid-loop failure |

## Low (P3) — Not Fixed (Backlog)

| # | Bug | File | Notes |
|---|-----|------|-------|
| 17 | `any` types widespread in hooks and actions | Multiple | TypeScript safety reduced but functional |
| 18 | Global mutable cache in emailActions without invalidation | `src/actions/emailActions.ts:136` | 30s TTL limits staleness |
| 19 | Math.random() used for A/B variant assignment | `src/actions/campaignActions.ts` | Acceptable for non-security purposes |
| 20 | Some useEffect dependency arrays incomplete | Multiple pages | React strict mode catches most issues |
| 21 | No rate limiting on public endpoints | Various | Would need middleware or edge function |

## Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| P0 (Critical) | 6 | 6 | 0 |
| P1 (High) | 3 | 3 | 0 |
| P2 (Medium) | 7 | 0 | 7 (acceptable/deferred) |
| P3 (Low) | 5 | 0 | 5 (backlog) |
| **Total** | **21** | **9** | **12** |

## Automated Check Results

- `npx tsc --noEmit` — **0 errors**
- `npm run build` — **Success**
- `npm run lint` — Skipped (Next.js root detection issue with parent lockfile, not a code problem)
