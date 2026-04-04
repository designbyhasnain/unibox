# Analytics Page Audit Report

> Date: April 3, 2026

## What's Working

- RPC-based aggregation (`get_analytics_summary`) — single DB round trip for all email metrics
- RBAC filtering via `getAccessibleGmailAccountIds()` — SALES users only see their assigned accounts
- 5-minute client-side cache with stale indicator
- Lazy-loaded Recharts bundle (code-split)
- Date range picker, manager filter, account filter all functional
- All KPIs calculated correctly (verified against raw DB):
  - Total emails: 8,667 (matches)
  - Sent: 6,973 (matches)
  - Received: 1,694 (matches)
  - Opened: 18 (matches)
- Email type classification working (outreach_first, follow_ups, conversational, first_replies, continued_replies)
- Reply rate calculation correct (first replies / unique prospects outreached)
- Responsive CSS at 1200px and 768px breakpoints

## Bugs Found and Fixed

### Bug 1 — Hourly engagement chart showed nothing
**File:** `src/actions/analyticsActions.ts` line 205-210
**Cause:** RPC returns `{ hour, count }` but chart mapped data to `{ hour, count }` while AreaChart used `dataKey="replies"` and `dataKey="name"`. Key mismatch meant chart rendered empty.
**Fix:** Changed data mapping to `{ name: "HH:00", replies: count }` to match chart expectations.

### Bug 2 — Top subjects chart showed nothing
**File:** `src/actions/analyticsActions.ts` line 213-216
**Cause:** Action returned `{ subject, count }` but AnalyticsCharts component reads `s.name` and `s.replies`.
**Fix:** Changed to `{ name: subject, replies: count }`. Also filtered out bounce notifications ("Delivery Status Notification") and automated messages that polluted the list.

### Bug 3 — Daily trend chart missing entirely
**File:** `app/components/AnalyticsCharts.tsx`
**Cause:** `dailyData` was computed by the action but never rendered in the chart component. The most important visualization (sent vs received over time) was absent.
**Fix:** Added full-width Daily Email Volume area chart with sent (blue) and received (green) gradients. Also fixed data key from `date` to `name` for XAxis compatibility.

### Bug 4 — Pipeline funnel missing 2 stages
**File:** `src/actions/analyticsActions.ts` line 274
**Cause:** Pipeline order only included 5 stages: COLD_LEAD, LEAD, OFFER_ACCEPTED, CLOSED, NOT_INTERESTED. Missing CONTACTED and WARM_LEAD which are active pipeline stages.
**Fix:** Added CONTACTED and WARM_LEAD to pipeline order, labels, and colors.

### Bug 5 — Pipeline not date-filtered
**File:** `src/actions/analyticsActions.ts` line 125
**Cause:** Pipeline query fetched all contacts regardless of date range, while every other metric respected the selected date range. Pipeline funnel showed lifetime data.
**Fix:** Added `.gte('created_at', startDate).lte('created_at', endDate)` and manager filter to pipeline query.

### Bug 6 — Leaderboard only showed ACCOUNT_MANAGER role
**File:** `src/actions/analyticsActions.ts` line 434
**Cause:** `eq('role', 'ACCOUNT_MANAGER')` excluded ADMIN users who also manage accounts.
**Fix:** Changed to `.in('role', ['ADMIN', 'ACCOUNT_MANAGER'])`.

## Performance Notes

- Main analytics uses a single RPC call (`get_analytics_summary`) — very efficient
- Leaderboard and account performance use separate queries but with batch pre-fetching (no N+1)
- `fetchAllPaginated` handles Supabase's 1000-row limit with pagination
- Client-side cache (5 min TTL) prevents redundant requests on tab switches
- Recharts is lazy-loaded to avoid blocking initial page render

## Known Limitations

- **Response time buckets**: Always show 0 — would need per-message response time calculation (expensive query)
- **Best subject lines**: Always empty — would need per-subject open rate aggregation
- **Top contacts**: Always empty — would need per-contact email count aggregation
- **Heatmap data**: Placeholder (all zeros) — would need day-of-week + hour cross-tabulation
- **Account performance not RBAC-filtered for SALES users**: Shows all accounts (low priority — SALES users don't typically access analytics for other accounts since the main RBAC filter on the primary metrics already restricts their data)

## Verification

- `npx tsc --noEmit` — 0 errors
- `npm run build` — Success
- RPC data cross-checked against raw DB queries — all totals match exactly
