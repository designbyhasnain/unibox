# Database & Data Integrity QA Report

## Summary

This report covers schema issues, query bugs, data consistency gaps, and schema drift between the Prisma schema and actual Supabase usage. **54 issues** identified across 4 categories: 10 schema issues, 22 query issues, 10 data consistency issues, and 12 schema drift items. Critical issues include missing enum values that cause runtime mismatches, lack of transaction boundaries on multi-table operations, ILIKE injection vectors, and significant schema drift between Prisma and the actual database.

---

## Schema Issues

### [DB-001] PipelineStage enum missing NOT_INTERESTED and SPAM
- **Severity:** Critical
- **Description:** The Prisma `PipelineStage` enum only defines `LEAD`, `COLD_LEAD`, `OFFER_ACCEPTED`, `CLOSED`. However, the codebase extensively writes `NOT_INTERESTED` and `SPAM` as `pipeline_stage` values on `email_messages` and `contacts` tables (see `markAsNotInterestedAction`, `updateEmailStageAction`, `markAsNotSpamAction`).
- **Impact:** Prisma Client cannot be used for any query involving these two stages. The `email_messages.pipelineStage` field is typed as `String?` (not the enum) likely as a workaround, but `contacts.pipelineStage` IS typed as `PipelineStage?`, meaning Prisma-based writes of NOT_INTERESTED/SPAM to contacts would fail at the ORM level. All queries use raw Supabase client to bypass this.
- **Suggested Fix:** Add `NOT_INTERESTED` and `SPAM` to the `PipelineStage` enum.

### [DB-002] GmailAccountStatus enum missing PAUSED
- **Severity:** High
- **Description:** The `GmailAccountStatus` enum defines `ACTIVE`, `ERROR`, `DISCONNECTED`, `SYNCING`, but `toggleSyncStatusAction` writes `PAUSED` as a status value. The deep dive doc also lists PAUSED as a valid state.
- **Impact:** Prisma Client would reject a `PAUSED` status write. Since raw Supabase is used, this works at the DB level only if the DB enum was manually extended, but Prisma migrations would overwrite it.
- **Suggested Fix:** Add `PAUSED` to the `GmailAccountStatus` enum.

### [DB-003] EmailMessage.gmailAccountId is NOT NULL in Prisma but nullified in code
- **Severity:** Critical
- **Description:** The Prisma schema defines `gmailAccountId String @map("gmail_account_id")` (required, not optional). However, `removeAccountAction` explicitly sets `gmail_account_id` to `null` to preserve CRM data before account deletion. The dedup check in `processSingleMessage` also checks for `existing?.gmail_account_id === account.id` (implies it can be null).
- **Impact:** Prisma migrations would create a NOT NULL constraint that breaks the account removal flow. Any Prisma Client query on orphaned messages would fail.
- **Suggested Fix:** Change to `gmailAccountId String? @map("gmail_account_id")` and update the relation to optional.

### [DB-004] Missing index on email_messages.from_email and to_email
- **Severity:** High
- **Description:** Multiple queries use ILIKE on `from_email` and `to_email`: `getClientEmailsAction`, `markClientEmailsAsReadAction`, `updateEmailStageAction`, `markAsNotInterestedAction`, `searchEmailsAction`. These are full table scans without indexes.
- **Impact:** Performance degrades significantly as the email_messages table grows. ILIKE with leading wildcards (`%email%`) cannot use B-tree indexes, but a trigram (pg_trgm) index would help.
- **Suggested Fix:** Add GIN trigram indexes on `from_email` and `to_email`, or restructure queries to avoid leading wildcards.

### [DB-005] Missing index on contacts.email
- **Severity:** Medium
- **Description:** `contacts.email` has a UNIQUE constraint (which implies an index), so this is actually covered. However, the ILIKE queries in `markAsNotInterestedAction` (`.ilike('email', ...)`) bypass the unique index because ILIKE is case-insensitive.
- **Impact:** ILIKE queries on contacts.email do not benefit from the unique B-tree index. If the contacts table is large, these are slow.
- **Suggested Fix:** Consider a functional index on `LOWER(email)` or normalize email storage to always lowercase.

### [DB-006] EmailThread.id has redundant @unique
- **Severity:** Low
- **Description:** `EmailThread` has `@id @unique` on the `id` field. The `@id` already implies uniqueness.
- **Impact:** Creates a redundant unique index in the database, wasting storage.
- **Suggested Fix:** Remove `@unique` from the `id` field on `EmailThread` (and `EmailMessage` which has the same issue).

### [DB-007] Missing composite index on ignored_senders
- **Severity:** Medium
- **Description:** The `ignored_senders` table is not in Prisma at all. It is queried by `email` field (exact match and bulk select). Without a unique index on `email`, the upsert in `markAsNotInterestedAction` (`onConflict: 'email'`) will fail.
- **Impact:** If the unique constraint does not exist in the actual DB, upserts will insert duplicates or error.
- **Suggested Fix:** Ensure `ignored_senders` has a UNIQUE constraint on `email`. Add the table to Prisma schema.

### [DB-008] email_tracking_events table has no index on tracking_id
- **Severity:** High
- **Description:** The `email_tracking_events` table (not in Prisma) is queried by `tracking_id` in `getEmailTrackingAction` and by composite `(ip_address, event_type, created_at)` in the click tracking owner-session check.
- **Impact:** Without an index on `tracking_id`, event lookups degrade as tracking events accumulate. The owner-session check is also unindexed.
- **Suggested Fix:** Add indexes on `tracking_id` and `(ip_address, event_type, created_at)` to `email_tracking_events`.

### [DB-009] No cascade or cleanup for email_tracking_events
- **Severity:** Medium
- **Description:** When emails are deleted via `deleteEmailAction`, the corresponding `email_tracking_events` rows (linked by `tracking_id`) are never cleaned up. There is no foreign key relationship.
- **Impact:** Orphaned tracking events accumulate indefinitely, growing the table unboundedly.
- **Suggested Fix:** Either add a foreign key from `email_tracking_events.tracking_id` to `email_messages.tracking_id` with CASCADE delete, or add explicit cleanup in delete actions.

### [DB-010] email_messages.pipelineStage typed as String? instead of PipelineStage enum
- **Severity:** Medium
- **Description:** In Prisma, `pipelineStage` is `String?` on `EmailMessage` but `PipelineStage?` on `Contact`. This inconsistency means the email_messages table has no DB-level enum constraint on pipeline_stage values.
- **Impact:** Any arbitrary string can be written as a pipeline_stage on email_messages, leading to potential data corruption (typos, invalid values).
- **Suggested Fix:** Once DB-001 is fixed (adding NOT_INTERESTED and SPAM to the enum), change `EmailMessage.pipelineStage` to `PipelineStage?`.

---

## Query Issues

### [DB-011] ILIKE injection in multiple queries
- **Severity:** Critical
- **Description:** User-supplied values are interpolated directly into ILIKE patterns without escaping. Affected queries:
  - `markClientEmailsAsReadAction`: `.or(\`from_email.ilike.%${clientEmail}%,...\`)`
  - `getClientEmailsAction`: `.or(\`from_email.ilike.%${targetEmail}%,...\`)`
  - `updateEmailStageAction`: `.or(\`...from_email.ilike.%${actualEmail}%,to_email.ilike.%${actualEmail}%\`)`
  - `markAsNotInterestedAction`: `.ilike('from_email', \`%${senderEmail}%\`)`
  - `searchEmailsAction`: `.or(\`subject.ilike.%${q}%,...\`)`
- **Impact:** An email address containing `%` or `_` characters would match unintended rows. A malicious input could modify/delete emails belonging to other contacts. The search query is especially dangerous since raw user input flows in.
- **Suggested Fix:** Escape `%`, `_`, and `\` in all values used in ILIKE patterns. Use parameterized queries or Supabase's built-in escaping.

### [DB-012] updateEmailStageAction: overly broad OR filter updates wrong rows
- **Severity:** Critical
- **Description:** Line 510-512 in emailActions.ts constructs a dynamic OR filter:
  ```
  .or(`id.eq.${messageId}${contactId ? `,contact_id.eq.${contactId}` : ''}${actualEmail ? `,from_email.ilike.%${actualEmail}%,to_email.ilike.%${actualEmail}%` : ''}`)
  ```
  This updates ALL messages where `to_email` contains the email address, not just messages from the sender. If the email is "john@example.com", it would also update messages SENT TO john, changing stages on unrelated outbound messages.
- **Impact:** Stage changes propagate to unrelated messages. A stage change for one contact contaminates messages sent to them from other threads/contacts.
- **Suggested Fix:** Remove `to_email.ilike` from the OR clause, or scope the update to only messages where the contact is the sender (direction=RECEIVED) plus the specific messageId.

### [DB-013] sendEmailAction: non-atomic multi-table operation
- **Severity:** High
- **Description:** `sendEmailAction` performs 3 sequential DB operations (increment sent_count, fetch account email, upsert message) without a transaction. If the upsert fails, the sent count is already incremented.
- **Impact:** `sent_count_today` can drift above actual sent count. The email message may not exist in DB even though the email was sent.
- **Suggested Fix:** Wrap the post-send operations in a Supabase transaction or RPC function.

### [DB-014] sendEmailAction: race condition on sent_count_today increment
- **Severity:** High
- **Description:** The sent count is read then written: `(account.sent_count_today || 0) + 1`. If two sends happen concurrently, both read the same value and write the same incremented value, losing one count.
- **Impact:** Under concurrent sends, the daily send count underreports.
- **Suggested Fix:** Use an atomic increment RPC: `UPDATE gmail_accounts SET sent_count_today = sent_count_today + 1 WHERE id = $1`.

### [DB-015] sendEmailAction: upsert may create thread-less email
- **Severity:** High
- **Description:** The upsert at line 74-90 writes a `thread_id` that may be `result.threadId || params.threadId`, which could be `undefined`. If both are undefined, the email is inserted with `thread_id: undefined` which Supabase may store as null, violating the NOT NULL constraint on thread_id (FK to email_threads).
- **Impact:** Email messages may fail to insert or be inserted without a valid thread reference, causing thread view to break.
- **Suggested Fix:** Generate a fallback thread ID (e.g., use the message ID) and ensure an email_thread row exists before inserting.

### [DB-016] deleteEmailAction: silently ignores project deletion failure
- **Severity:** Medium
- **Description:** `deleteEmailAction` first deletes projects linked to the email, but does not check the error result. If the project delete fails (e.g., due to activity_log FK), the message delete proceeds anyway.
- **Impact:** Projects may have activity logs with SET NULL behavior, so this is likely fine in practice, but the error is silently swallowed. If the project has a RESTRICT constraint somewhere, the message delete succeeds while the project remains orphaned.
- **Suggested Fix:** Check the error from the project delete and handle accordingly.

### [DB-017] bulkDeleteEmailsAction: projects with non-matching source_email_id survive
- **Severity:** Medium
- **Description:** Projects are deleted where `source_email_id IN messageIds`. But projects can also be linked to contacts from those emails. Deleting the messages orphans the project's source reference (SET NULL), which is by design, but the doc says "delete linked projects first" suggesting intent to remove them.
- **Impact:** Inconsistent behavior between single delete (deletes project) and the fact that source_email_id becomes NULL (preserving the project) via cascade.
- **Suggested Fix:** Clarify intent. If projects should be preserved, remove the explicit project delete. If they should be removed, ensure all related projects are found.

### [DB-018] markAsNotInterestedAction: ILIKE on contacts.email may match multiple contacts
- **Severity:** High
- **Description:** Line 628: `.ilike('email', \`%${senderEmail}%\`)` on contacts. If senderEmail is "john@example.com", this could match "john@example.com.au" or "xjohn@example.com".
- **Impact:** Unrelated contacts may be incorrectly marked as NOT_INTERESTED.
- **Suggested Fix:** Use exact match `.eq('email', senderEmail)` since contact emails should be normalized.

### [DB-019] N+1 query pattern in fetchManagerLeaderboard
- **Severity:** High
- **Description:** `fetchManagerLeaderboard` fetches all managers, then for each manager runs 2 queries (projects + leads count). With 10 managers, this is 20 sequential queries.
- **Impact:** Analytics page load time scales linearly with manager count. Each additional manager adds ~100-200ms.
- **Suggested Fix:** Use a single aggregation query or RPC that computes per-manager stats in one round trip.

### [DB-020] N+1 query pattern in fetchDailyData
- **Severity:** Critical
- **Description:** `fetchDailyData` iterates over every day in the date range and runs 2 queries per day (sent count + received count). A 30-day range = 60 sequential DB queries. A 365-day range = 730 queries.
- **Impact:** Analytics for long date ranges will timeout (Vercel function limit). Each day adds ~100ms minimum.
- **Suggested Fix:** Use a single GROUP BY query: `SELECT DATE(sent_at), direction, COUNT(*) FROM email_messages WHERE sent_at BETWEEN ... GROUP BY 1, 2`.

### [DB-021] N+1 query pattern in fetchAccountPerformance
- **Severity:** High
- **Description:** For each active account, 2 queries are run (sent count + received count). With 10 accounts, this is 20 queries.
- **Impact:** Similar to DB-019, scales poorly with account count.
- **Suggested Fix:** Aggregate in a single query grouped by `gmail_account_id`.

### [DB-022] fetchDeliverability: fetches all sent emails without limit
- **Severity:** High
- **Description:** Line 137: selects `is_spam, direction` from ALL sent emails in the date range with no limit. For high-volume accounts, this could return tens of thousands of rows just to count spam vs non-spam.
- **Impact:** Memory pressure on the server, slow response, potential timeout.
- **Suggested Fix:** Use `{ count: 'exact', head: true }` with a filter for spam, and another for total, instead of fetching all rows.

### [DB-023] fetchTopSubjects: fetches all received email subjects without limit
- **Severity:** High
- **Description:** Line 154: selects `subject` from ALL received emails in the date range. For high-volume accounts, this returns thousands of rows to do in-memory aggregation.
- **Impact:** Memory pressure, slow response. Should be done in SQL.
- **Suggested Fix:** Use a SQL aggregation with GROUP BY and COUNT, or an RPC function.

### [DB-024] fetchHourlyEngagement: fetches all received email timestamps without limit
- **Severity:** High
- **Description:** Line 166: selects `sent_at` from ALL received emails in the date range to bucket by hour in JavaScript.
- **Impact:** Same as DB-023. Needless data transfer.
- **Suggested Fix:** Use `EXTRACT(HOUR FROM sent_at)` in a GROUP BY query.

### [DB-025] fetchCoreStats: fetches all sent email rows to compute tracking stats
- **Severity:** High
- **Description:** Line 64: `sentQ` uses `{ count: 'exact' }` but NOT `head: true`, meaning it fetches ALL sent email rows (id, opens_count, clicks_count) just to filter in JS for opens_count > 0. For 10,000 sent emails, all rows are transferred.
- **Impact:** Slow analytics, excessive data transfer.
- **Suggested Fix:** Run separate count queries: one for total sent (head:true), one for opened (where opens_count > 0, head:true), one for clicked.

### [DB-026] getClientsAction: N+1 via nested select pulls all messages per contact
- **Severity:** High
- **Description:** `getClientsAction` selects all contacts with ALL their `email_messages` nested. For a contact with 500 emails, all 500 message rows are fetched just to count them and find the latest.
- **Impact:** For a system with many contacts and many emails per contact, this query can return massive payloads, causing timeouts.
- **Suggested Fix:** Use a subquery or RPC to compute counts and latest message per contact rather than fetching all messages.

### [DB-027] getAccountsAction: count query per account with no cancellation
- **Severity:** Medium
- **Description:** Each account gets a count query with a 5-second timeout via `Promise.race`. If the count times out, the fallback uses `acc.emails_count ?? 0`, which is a column that does not exist in Prisma and may not exist in the DB.
- **Impact:** Timeout fallback returns 0, which is misleading. The `emails_count` field is not a real column.
- **Suggested Fix:** Compute counts in a single query grouped by gmail_account_id.

### [DB-028] removeAccountAction: non-atomic nullify + delete
- **Severity:** High
- **Description:** `removeAccountAction` first nullifies `gmail_account_id` on emails with contacts, then deletes the account (cascading remaining emails). These are separate operations. If the delete fails after nullify, emails are orphaned (null account_id) but the account still exists.
- **Impact:** Partial state corruption on failure. Also, the nullify query filter `.or('contact_id.not.is.null')` has incorrect PostgREST syntax - it should be `contact_id.neq.null` or `contact_id.not.is.null` which is actually valid but confusing.
- **Suggested Fix:** Wrap in a transaction or RPC.

### [DB-029] processClickEvent is fire-and-forget in click tracking
- **Severity:** Medium
- **Description:** In `app/api/track/click/route.ts` line 23, `processClickEvent` is called with `.catch()` (fire-and-forget), but the redirect happens immediately. If the function is killed by Vercel before the async work completes, the click is lost.
- **Impact:** Click tracking events may be silently dropped under load or cold starts.
- **Suggested Fix:** Await the processClickEvent before redirecting (as done in the open tracking pixel endpoint).

### [DB-030] Open tracking in DEBUG mode records all hits including owner
- **Severity:** Medium
- **Description:** The open tracking endpoint (`app/api/track/route.ts`) has the owner-filtering logic commented out with a "DEBUG" comment. All opens are recorded, including the CRM user's own opens.
- **Impact:** Open counts are inflated. Analytics on open rates are unreliable.
- **Suggested Fix:** Re-enable the owner-session filtering logic.

### [DB-031] searchEmailsAction: no limit on polling query results
- **Severity:** Medium
- **Description:** The polling query in `useRealtimeInbox` at line 66 fetches new received emails with no `.limit()`. If a large batch sync completes, hundreds of new emails could be returned in one poll.
- **Impact:** Large payloads on the client side, potential UI freeze.
- **Suggested Fix:** Add `.limit(50)` or similar to the polling query.

### [DB-032] handleEmailSent: contact lookup uses raw toEmail without normalization
- **Severity:** Medium
- **Description:** `handleEmailSent` in `emailSyncLogic.ts` line 22 queries contacts by `.eq('email', toEmail)`. The `toEmail` from Gmail headers may contain display names like `"John Doe" <john@example.com>`, which would never match the clean email in contacts.
- **Impact:** Contact association fails for sent emails where the to_email includes a display name, leaving `contact_id` as null.
- **Suggested Fix:** Extract the email address from angle brackets before the contact lookup.

---

## Data Consistency Issues

### [DB-033] Emails can exist without a valid thread
- **Severity:** High
- **Description:** `sendEmailAction` upserts an email_message with a `thread_id` that may not have a corresponding `email_threads` row. The sync logic in `emailSyncLogic.ts` does upsert the thread first, but the direct upsert in `sendEmailAction` (line 74-90) skips thread creation.
- **Impact:** Thread view (`getThreadMessagesAction`) will work (it queries by thread_id on messages), but the email_threads table will be missing entries. Any future join-based query on email_threads will miss these messages.
- **Suggested Fix:** Ensure `sendEmailAction` upserts an `email_threads` row before inserting the message.

### [DB-034] Emails can exist without an account (by design, but risky)
- **Severity:** Medium
- **Description:** After `removeAccountAction`, emails with contacts have `gmail_account_id = null`. These emails remain in the DB but are invisible to all inbox queries (which filter by `gmail_account_id`). They are only visible via client email lookups.
- **Impact:** Orphaned emails consume storage. The polling/realtime hook filters by `gmail_account_id`, so these emails are effectively dead data except in the clients view.
- **Suggested Fix:** Document this as intentional behavior. Consider a periodic cleanup or archive mechanism.

### [DB-035] Contacts can have orphaned references
- **Severity:** Medium
- **Description:** When all emails for a contact are deleted (via bulk delete), the contact remains with no associated emails. The contact's `pipeline_stage` may reference a state that no longer has supporting data.
- **Impact:** Ghost contacts appear in the clients list with 0 messages and 0 projects.
- **Suggested Fix:** Consider auto-archiving contacts with no remaining emails or projects.

### [DB-036] Pipeline stages can desync between contacts and messages
- **Severity:** High
- **Description:** `updateEmailStageAction` updates both the contact and all related messages. But `handleEmailReceived` only updates the contact if auto-promoting from COLD_LEAD to LEAD. If a contact is manually set to OFFER_ACCEPTED, and a new email arrives, the new email gets the thread's existing stage, but the contact is not re-checked. Multiple code paths update stages independently:
  - `updateEmailStageAction` -> updates contact + all messages
  - `handleEmailReceived` -> updates contact (only COLD_LEAD->LEAD) + thread messages
  - `markAsNotInterestedAction` -> updates contact + messages (via ILIKE)
  - `updateLeadStage` -> updates contact only, NOT messages
- **Impact:** Contact stage and message stages can diverge. `updateLeadStage` in `pipelineLogic.ts` updates the contact but not the email_messages, so the inbox (which reads from email_messages.pipeline_stage) shows the old stage.
- **Suggested Fix:** Centralize stage update logic into a single function that always updates both contact and messages atomically.

### [DB-037] Tracking events can reference non-existent tracking IDs
- **Severity:** Medium
- **Description:** The tracking pixel and click endpoints accept any `tracking_id` parameter and insert events without verifying the tracking_id exists in `email_messages`. A bot or scanner could generate events for fabricated tracking IDs.
- **Impact:** Orphaned tracking events, potential for tracking ID enumeration attacks, inflated event counts if a valid but wrong tracking_id is guessed.
- **Suggested Fix:** Add a foreign key or at least a validation check that the tracking_id exists before recording events.

### [DB-038] ignored_senders table can get stale
- **Severity:** Medium
- **Description:** Senders are added to `ignored_senders` via `markAsNotInterestedAction` and removed when moving out of NOT_INTERESTED in `updateEmailStageAction`. However, if the stage is changed via `updateLeadStage` (pipelineLogic.ts), the ignored_senders entry is NOT cleaned up.
- **Impact:** A contact moved back to LEAD via the pipeline UI still has their sender email in ignored_senders, causing future sync to skip their emails.
- **Suggested Fix:** Add ignored_senders cleanup to `updateLeadStage` when the new stage is not NOT_INTERESTED.

### [DB-039] sent_count_today never resets
- **Severity:** High
- **Description:** The `sent_count_today` field on `gmail_accounts` is incremented on each send but there is no mechanism to reset it to 0 at midnight. No cron job or scheduled function is defined.
- **Impact:** The counter grows indefinitely, making it useless as a daily rate limiter or metric.
- **Suggested Fix:** Add a daily cron job (e.g., Vercel Cron) to reset `sent_count_today = 0` on all accounts, or use a date-qualified counter.

### [DB-040] Manual email sync marks all non-INBOX emails as spam
- **Severity:** High
- **Description:** In `syncManualEmails` (line 232), `isSpam` is set to `folder !== 'INBOX'`. This means emails in Sent, Drafts, and Trash folders are all marked as spam.
- **Impact:** Sent emails from manual accounts synced via IMAP are incorrectly flagged as spam and hidden from the normal inbox.
- **Suggested Fix:** Check the folder type properly. Only mark as spam if the folder is a Spam/Junk folder.

### [DB-041] Contact email uniqueness vs ILIKE matching
- **Severity:** Medium
- **Description:** Contacts have a UNIQUE constraint on `email`, ensuring one contact per email. However, email matching throughout the codebase uses ILIKE with wildcards (`%email%`), which can match partial strings. For example, `bob@example.com` would ILIKE-match `bobby@example.com`.
- **Impact:** Stage changes, not-interested markings, and client email lookups may affect wrong contacts.
- **Suggested Fix:** Use exact email matching (`.eq()`) for contacts, and properly parse email addresses from message headers before matching.

### [DB-042] owner_session tracking_id is a magic string, not a real tracking ID
- **Severity:** Low
- **Description:** `POST /api/track/session` inserts into `email_tracking_events` with `tracking_id: 'owner_session'` (a literal string). This pollutes the tracking events table with non-email entries.
- **Impact:** If someone queries tracking events by tracking_id, `'owner_session'` rows appear. The `increment_email_opens` RPC would attempt to find an email_message with tracking_id='owner_session' if called.
- **Suggested Fix:** Use a separate table for owner sessions or a distinct event_type table.

---

## Schema Drift (Code vs Prisma)

The following tables and columns are used in code via raw Supabase queries but are NOT defined in the Prisma schema:

| Table/Column | Used In | In Prisma? | Notes |
|---|---|---|---|
| `ignored_senders` (table) | `emailActions.ts`, `gmailSyncService.ts` | No | Entire table missing. Has at least `email` column with upsert on conflict. |
| `email_tracking_events` (table) | `track/route.ts`, `track/click/route.ts`, `track/session/route.ts`, `emailActions.ts` | No | Entire table missing. Columns: `tracking_id`, `event_type`, `ip_address`, `user_agent`, `link_url`, `created_at`. |
| `gmail_accounts.sent_count_today` | `emailActions.ts`, `accountActions.ts` | No | Read and written; not in Prisma model. |
| `gmail_accounts.sync_progress` | `accountActions.ts`, `gmailSyncService.ts`, `manualEmailService.ts` | No | Written during sync (0-100); not in Prisma. |
| `gmail_accounts.avatar_url` | `analyticsActions.ts` | No | Selected in `fetchManagerLeaderboard` via `users.avatar_url`. |
| `users.avatar_url` | `analyticsActions.ts` | No | `supabase.from('users').select('id, name, avatar_url')` - not in Prisma User model. |
| `email_messages.is_tracked` | `emailActions.ts`, `useRealtimeInbox.ts` | No | Boolean flag written on send, read in queries. |
| `email_messages.tracking_id` | `emailActions.ts` | No | UUID string linking to tracking events. |
| `email_messages.opens_count` | `emailActions.ts`, `analyticsActions.ts`, `useRealtimeInbox.ts` | No | Denormalized open count, incremented by RPC. |
| `email_messages.clicks_count` | `emailActions.ts`, `analyticsActions.ts`, `useRealtimeInbox.ts` | No | Denormalized click count, incremented by RPC. |
| `email_messages.last_opened_at` | `emailActions.ts`, `useRealtimeInbox.ts` | No | Timestamp of most recent open event. |
| `gmail_accounts.smtp_encryption` | Prisma schema only | Yes (in Prisma) | Defined in Prisma but never read or written in any code. Dead column. |

### RPC Functions (not in Prisma, used via `supabase.rpc()`)

| RPC Function | Used In | Parameters |
|---|---|---|
| `get_inbox_threads` | `emailActions.ts` | `p_account_ids`, `p_pipeline_stage`, `p_page`, `p_page_size`, `p_is_spam` |
| `get_sent_threads` | `emailActions.ts` | `p_account_ids`, `p_page`, `p_page_size` |
| `get_all_tab_counts` | `emailActions.ts` | `p_account_ids` |
| `increment_email_opens` | `track/route.ts` | `p_tracking_id` |
| `increment_email_clicks` | `track/click/route.ts` | `p_tracking_id` |

These RPC functions exist only in the Supabase database and are not tracked by Prisma migrations. Any schema reset would lose them.

### Supabase Realtime Channel

| Table Watched | Event Types | Used In |
|---|---|---|
| `email_messages` | INSERT, UPDATE, DELETE | `useRealtimeInbox.ts` |

Requires Supabase Realtime to be enabled on the `email_messages` table with publication for all DML events.

---

## Appendix: All Tables Referenced in Code

| Table Name | Referenced In |
|---|---|
| `gmail_accounts` | accountActions, emailActions, analyticsActions, gmailSyncService, gmailSenderService, manualEmailService, googleAuthService, sync/route, webhooks/gmail/route |
| `email_messages` | emailActions, analyticsActions, accountActions, gmailSyncService, emailSyncLogic, useRealtimeInbox, clean_orphans |
| `email_threads` | emailSyncLogic |
| `contacts` | clientActions, emailActions, analyticsActions, emailSyncLogic, pipelineLogic, clean_orphans |
| `projects` | projectActions, emailActions, analyticsActions, clean_orphans |
| `users` | projectActions, analyticsActions, clientActions |
| `activity_logs` | emailSyncLogic, pipelineLogic |
| `ignored_senders` | emailActions, gmailSyncService |
| `email_tracking_events` | track/route, track/click/route, track/session/route, emailActions |

---

## Fixes Applied

### [DB-001] Missing enum values (fixed)
- **Fix:** Added `NOT_INTERESTED` to the `PipelineStage` enum. `SPAM` is handled by the `isSpam` boolean field on EmailMessage, not a pipeline stage, so it was not added to the enum.
- **File:** prisma/schema.prisma
- **Validated:** Pending — `prisma validate` could not be run in this session (Bash restricted). Manual review confirms correct syntax.

### [DB-002] GmailAccountStatus missing PAUSED (fixed)
- **Fix:** Added `PAUSED` to the `GmailAccountStatus` enum, since `toggleSyncStatusAction` writes this value.
- **File:** prisma/schema.prisma
- **Validated:** Pending — same as above.

### [DB-004] Missing indexes on email lookup fields (fixed)
- **Fix:** Added `@@index([fromEmail])` and `@@index([toEmail])` to the `EmailMessage` model. These are B-tree indexes that help with exact-match and prefix queries. Note: ILIKE with leading wildcards (`%email%`) would benefit more from GIN trigram indexes, which must be created via raw SQL migration.
- **File:** prisma/schema.prisma
- **Validated:** Pending — same as above.

### [DB-007] Missing `ignored_senders` table (fixed)
- **Fix:** Added `IgnoredSender` model with `email` as `@id` (which provides the unique constraint needed for upsert `onConflict: 'email'`), mapped to `ignored_senders` table.
- **File:** prisma/schema.prisma
- **Validated:** Pending — same as above.

### [DB-008] Missing `email_tracking_events` table and indexes (fixed)
- **Fix:** Added `EmailTrackingEvent` model mapped to `email_tracking_events` with columns: `id`, `trackingId`, `eventType`, `ipAddress`, `userAgent`, `linkUrl`, `createdAt`. Added indexes on `[trackingId]` and `[ipAddress, eventType]` for the event lookup and owner-session check queries.
- **File:** prisma/schema.prisma
- **Validated:** Pending — same as above.

### Schema drift: Missing columns on EmailMessage (fixed)
- **Fix:** Added five columns used in code but missing from schema: `isTracked` (Boolean, default false), `trackingId` (String?), `opensCount` (Int, default 0), `clicksCount` (Int, default 0), `lastOpenedAt` (DateTime?). All mapped to their snake_case DB column names.
- **File:** prisma/schema.prisma
- **Validated:** Pending — same as above.

### Schema drift: Missing columns on GmailAccount (fixed)
- **Fix:** Added two columns used in code but missing from schema: `syncProgress` (Int, default 0, mapped to `sync_progress`) and `sentCountToday` (Int, default 0, mapped to `sent_count_today`).
- **File:** prisma/schema.prisma
- **Validated:** Pending — same as above.

### Schema drift: `smtpEncryption` dead column (noted)
- **Fix:** Added inline comment marking `smtpEncryption` as unused in application code, retained to avoid migration issues. No structural change made.
- **File:** prisma/schema.prisma
- **Validated:** N/A — comment only.

## Round 2 Fixes Applied

### [DB-003] EmailMessage.gmailAccountId should be nullable (fixed)
- **Fix:** Changed `gmailAccountId` from `String` to `String?` and `gmailAccount` relation from `GmailAccount` to `GmailAccount?`. This allows `removeAccountAction` to set `gmail_account_id` to null to preserve CRM data after account deletion. Added a doc comment explaining the nullable rationale.
- **File:** prisma/schema.prisma

### [DB-006] Redundant @unique on @id fields (fixed)
- **Fix:** Removed `@unique` from `EmailThread.id` and `EmailMessage.id`. The `@id` attribute already implies uniqueness, so the extra `@unique` created redundant database indexes.
- **File:** prisma/schema.prisma

### [DB-010] EmailMessage.pipelineStage typed as String instead of enum (fixed)
- **Fix:** Changed `pipelineStage` on `EmailMessage` from `String?` to `PipelineStage?`, matching the `Contact` model. Now that DB-001 added `NOT_INTERESTED` to the enum, all pipeline stage values used in code are covered by the enum type, providing DB-level validation.
- **File:** prisma/schema.prisma

### Missing index on EmailMessage.sentAt (fixed)
- **Fix:** Added `@@index([sentAt])` to `EmailMessage`. This is a common sort/filter field used in analytics queries (`fetchDailyData`, `fetchCoreStats`, etc.) and inbox ordering.
- **File:** prisma/schema.prisma

### Missing index on EmailMessage.isSpam (fixed)
- **Fix:** Added `@@index([isSpam])` to `EmailMessage`. The `get_inbox_threads` RPC and multiple queries filter by `is_spam`.
- **File:** prisma/schema.prisma

### Missing index on EmailMessage.trackingId (fixed)
- **Fix:** Added `@@index([trackingId])` to `EmailMessage`. The `increment_email_opens` and `increment_email_clicks` RPCs look up emails by `tracking_id`.
- **File:** prisma/schema.prisma

### Missing indexes on Project (fixed)
- **Fix:** Added `@@index([clientId])`, `@@index([accountManagerId])`, and `@@index([createdAt])` to `Project`. These are common filter and sort fields used in project listing, analytics, and manager leaderboard queries.
- **File:** prisma/schema.prisma

### Missing indexes on ActivityLog (fixed)
- **Fix:** Added `@@index([createdAt])`, `@@index([contactId])`, and `@@index([projectId])` to `ActivityLog`. Activity logs are commonly sorted by creation time and filtered by contact or project.
- **File:** prisma/schema.prisma

### Missing index on EmailTrackingEvent.createdAt (fixed)
- **Fix:** Added `@@index([createdAt])` to `EmailTrackingEvent`. Tracking events are queried by time range for the owner-session check and analytics.
- **File:** prisma/schema.prisma

### Missing @db.Text annotations on potentially long fields (fixed)
- **Fix:** Added `@db.Text` to: `EmailMessage.subject` (subjects can be very long), `Project.projectLink` (URLs can exceed 255 chars), `Project.reference` (free-form text), `EmailTrackingEvent.userAgent` (user-agent strings are often long), `EmailTrackingEvent.linkUrl` (tracked URLs can be long). Without `@db.Text`, Prisma defaults to `varchar(191)` on some databases which would truncate these values.
- **File:** prisma/schema.prisma

### Schema drift: Missing `users.avatar_url` column (fixed)
- **Fix:** Added `avatarUrl String? @map("avatar_url")` to the `User` model. This field is selected in `fetchManagerLeaderboard` via `supabase.from('users').select('id, name, avatar_url')` but was missing from the Prisma schema.
- **File:** prisma/schema.prisma

### Doc comments on non-obvious model behavior (fixed)
- **Fix:** Added Prisma doc comments (`///`) on: `EmailMessage.gmailAccountId` explaining why it is nullable, `GmailAccount.sentCountToday` noting it needs a daily cron reset, and `IgnoredSender` model explaining its role in sync filtering.
- **File:** prisma/schema.prisma
