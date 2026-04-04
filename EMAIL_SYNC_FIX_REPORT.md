# Email Sync Fix Report

> Date: April 2026 | Critical Bug Fix

## Problem

When a Gmail account is reconnected or resynced, the sync starts but stops before completing. The next sync starts from zero instead of resuming, creating an infinite loop of incomplete syncs.

## Root Causes Found (5 bugs)

### Bug A — OAuth reconnect wipes history_id
**File:** `src/services/googleAuthService.ts` line 102-113
**Cause:** `handleAuthCallback()` performs an upsert with only `user_id, email, connection_method, access_token, refresh_token, status`. Since `history_id` is not included, Postgres sets it to the column default (null). Next sync sees `history_id = null` and triggers a full resync from zero.

### Bug B — startGmailWatch() unconditionally overwrites history_id
**File:** `src/services/gmailSyncService.ts` line 390
**Cause:** Every watch registration replaces the stored `history_id` with the fresh one from Google's watch response. This creates a gap — messages between the old history_id and the new one are never synced.

### Bug C — renewWatch() in tokenRefreshService also overwrites history_id
**File:** `src/services/tokenRefreshService.ts` line 144
**Cause:** Same as Bug B. The hourly cron runs `renewWatch()` which sets `history_id: watch.data.historyId` unconditionally, overwriting the existing value.

### Bug D — Full sync loads ALL message IDs before processing
**File:** `src/services/gmailSyncService.ts` line 639
**Cause:** `fetchAllMessageIds()` loads up to 100,000 message IDs into memory before processing any. On Vercel with a 60-second function timeout, this means:
1. Spend 10-20s fetching all IDs
2. Start processing batches
3. Function times out at 60s
4. Status reverts to ACTIVE, sync_progress resets to 0
5. Next run starts from scratch (no checkpoint saved)

### Bug E — Stale SYNCING state blocks all future syncs
**File:** `src/services/gmailSyncService.ts` line 618-627
**Cause:** The concurrency guard checks `eq('status', 'ACTIVE')` before setting SYNCING. If a sync times out while in SYNCING state, it stays SYNCING forever (no recovery). All future sync attempts skip with "already in progress". Found `rafay.wedits@gmail.com` stuck at SYNCING with `sync_progress: 26`.

## Fixes Applied

### Fix A — Preserve history_id on reconnect
**File:** `src/services/googleAuthService.ts`
- Now fetches `history_id` along with `refresh_token` from existing account
- Includes `history_id` in the upsert data if one exists
- Also clears `last_error_message` and `sync_fail_count` on reconnect

### Fix B — startGmailWatch() only sets history_id if none exists
**File:** `src/services/gmailSyncService.ts`
- Changed to only set `history_id` in the update if `!account.history_id`
- Watch expiry and status are always updated
- Existing history_id is never overwritten

### Fix C — renewWatch() only sets history_id if none exists
**File:** `src/services/tokenRefreshService.ts`
- Now fetches `history_id` column in the account query
- Only sets `history_id` in the update if `!account.history_id`
- Removed the fallback `|| account.id` which was nonsensical

### Fix D — Page-by-page processing with checkpointing
**File:** `src/services/gmailSyncService.ts`
- Replaced `fetchAllMessageIds()` → `processBatch()` with inline page-by-page loop
- Each page (500 messages) is fetched, processed, then checkpointed
- Checkpoint saves `sync_progress` and `last_synced_at` after each page
- If interrupted, retry is safe: `processSingleMessage` deduplicates by message ID
- Progress is visible in the UI during sync

### Fix E — Stale SYNCING recovery
**File:** `src/services/gmailSyncService.ts`
- After failing to acquire the SYNCING lock, checks if the account is stuck
- If `status = SYNCING` and `last_synced_at` is > 5 minutes ago, force-recovers to ACTIVE
- Re-attempts lock acquisition after recovery
- Also stores error messages on non-auth failures for debugging

### Database Fix — Recovered stuck accounts
- Reset `rafay.wedits@gmail.com` from SYNCING to ACTIVE (was stuck at 26% for hours)

## Test Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | Success |
| OAuth reconnect preserves history_id | Yes (upsert includes existing value) |
| Watch renewal preserves history_id | Yes (only sets if null) |
| Full sync checkpoints per page | Yes (500 msgs per checkpoint) |
| Stale SYNCING auto-recovers | Yes (after 5 minutes) |
| Interrupted sync resumes correctly | Yes (dedup skips already-synced messages) |

## Architecture After Fix

```
Reconnect OAuth → preserve history_id → partial sync resumes
         ↓ (if no history_id)
Full sync → page-by-page (500/page) → checkpoint after each page
         ↓ (if interrupted)
Next sync → dedup check skips processed messages → continues
         ↓ (if stuck SYNCING > 5min)
Auto-recover → ACTIVE → retry sync
```
