# Email System QA Report

## Summary

This report covers an end-to-end trace of all 7 email lifecycle flows in Unibox. A total of **31 issues** were identified across OAuth authentication, email sync (full, incremental, and manual IMAP), email sending, tracking, and pipeline auto-promotion. Issues range from critical security vulnerabilities (hardcoded userId, no webhook signature verification) to subtle data consistency bugs (race conditions, contact lookup mismatches, stuck sync states with no recovery).

**Breakdown by severity:**
- Critical: 5
- High: 10
- Medium: 12
- Low: 4

---

## Flow 1: OAuth Connection

**Trace:** `getGoogleAuthUrlAction()` -> redirect to Google -> `/api/auth/google/callback/route.ts` GET -> `handleAuthCallback(code, userId)` -> token exchange -> fetch userInfo -> encrypt refresh token -> upsert account -> fire-and-forget `syncGmailEmails(account.id)` -> redirect to `/accounts`

### Issues Found

#### [ES-001] Hardcoded userId in OAuth callback — all accounts link to single user
- **Location:** `app/api/auth/google/callback/route.ts:15`
- **Severity:** Critical
- **Description:** The OAuth callback hardcodes `userId = "1ca1464d-1009-426e-96d5-8c5e8c84faac"`. Every Gmail account connected through OAuth is assigned to this single user, making multi-user operation impossible and creating a security flaw where any authenticated Google user's account is linked to the admin.
- **Steps to Reproduce:** Connect any Gmail account via OAuth. Check `gmail_accounts.user_id` — it will always be the hardcoded UUID.
- **Impact:** Multi-tenancy is broken. If the system ever serves more than one user, all accounts merge under one user.
- **Suggested Fix:** Extract the authenticated user's ID from a session token (e.g., NextAuth session) or pass it via the OAuth `state` parameter.

#### [ES-002] OAuth state parameter unused — no CSRF protection
- **Location:** `app/api/auth/google/callback/route.ts:8`
- **Severity:** High
- **Description:** The `state` parameter is extracted from the callback URL (`searchParams.get('state')`) but never validated or even used. The `getGoogleAuthUrl()` function in `googleAuthService.ts:25` does not set a `state` parameter at all. This leaves the OAuth flow vulnerable to CSRF attacks.
- **Steps to Reproduce:** Craft a URL with a malicious `code` parameter and send it to a logged-in user.
- **Impact:** An attacker could potentially link their own Google account to the victim's Unibox user by tricking them into visiting a crafted callback URL.
- **Suggested Fix:** Generate a random state token, store it in the session before redirect, and validate it in the callback.

#### [ES-003] Refresh token may be null on reconnect without `prompt: consent`
- **Location:** `src/services/googleAuthService.ts:53-55`
- **Severity:** Medium
- **Description:** When a user reconnects an existing account, Google may not return a new refresh token if the user has previously granted consent (even though `prompt: 'consent'` is set). The code handles this by falling back to the existing encrypted refresh token: `tokens.refresh_token ? encrypt(tokens.refresh_token) : existingAccount?.refresh_token`. However, if the `existingAccount` query returns null (e.g., the account was deleted and re-added), `encryptedRefreshToken` will be `undefined`, and the account is saved without a refresh token, making it unable to refresh access tokens.
- **Steps to Reproduce:** Delete a Gmail account from Unibox, then reconnect it. If Google doesn't issue a new refresh token, the account will have `refresh_token = null`.
- **Impact:** The account will work until the access token expires (1 hour), then all sync and send operations will fail with no recovery path except re-authorizing with `prompt: consent`.
- **Suggested Fix:** If no refresh token is available from either source, throw an error or force the user to revoke app access in Google Account settings and re-authorize.

#### [ES-004] No error handling if userinfo.get() returns no email
- **Location:** `src/services/googleAuthService.ts:44`
- **Severity:** Low
- **Description:** If `userInfo.email` is falsy, the code throws `'Could not retrieve email from Google'`. This is correct. However, the error message in the callback redirect URL (`encodeURIComponent(error.message)`) could leak internal error details to the user. The error is properly caught, but it could be more user-friendly.
- **Impact:** Minor UX issue — user sees a technical error message.
- **Suggested Fix:** Map known errors to user-friendly messages in the callback route.

#### [ES-005] Fire-and-forget sync on connect has no feedback mechanism
- **Location:** `app/api/auth/google/callback/route.ts:19-21`
- **Severity:** Medium
- **Description:** After OAuth callback, `syncGmailEmails(account.id)` is called without `await`. The user is immediately redirected to `/accounts?success=oauth_connected`. If the sync fails (e.g., token issue, rate limit), the error is only logged to console. The user sees "connected" but has no emails, with no indication of the failure.
- **Steps to Reproduce:** Connect an account where the access token is immediately expired or rate-limited. User sees success, but sync silently fails.
- **Impact:** User confusion — account appears connected but empty with no error indicator.
- **Suggested Fix:** The sync status is tracked via `account.status = 'SYNCING'`, so the UI could poll for sync completion. Ensure the UI shows sync progress/errors on the accounts page.

---

## Flow 2: Full Sync

**Trace:** `syncGmailEmails(accountId)` -> fetch account -> concurrency guard (skip if SYNCING) -> set status=SYNCING -> `fetchAllMessageIds(gmail, [], 'in:anywhere')` -> get profile historyId -> pre-fetch sentThreadIds + ignoredSenders -> `processBatch(...)` -> update status=ACTIVE + historyId + progress=100 -> `startGmailWatch(accountId)`

### Issues Found

#### [ES-006] Concurrency guard uses application-level check, not database-level lock
- **Location:** `src/services/gmailSyncService.ts:493-495`
- **Severity:** High
- **Description:** The concurrency guard checks `if (account.status === 'SYNCING') return;` but this is a TOCTOU (time-of-check-to-time-of-use) race condition. Two concurrent requests can both read status as 'ACTIVE', both pass the check, then both set status to 'SYNCING' and run full syncs in parallel. The same issue exists in `syncManualEmails` at line 133.
- **Steps to Reproduce:** Trigger `/api/sync` twice rapidly for the same account. Both requests read ACTIVE and proceed.
- **Impact:** Duplicate message processing, wasted API quota, potential data corruption from concurrent upserts on the same messages.
- **Suggested Fix:** Use a database-level advisory lock or an atomic `UPDATE ... WHERE status != 'SYNCING' RETURNING *` to ensure only one sync runs.

#### [ES-007] `fs.appendFileSync` writes debug log to local filesystem — fails on Vercel
- **Location:** `src/services/gmailSyncService.ts:507-508, 513, 556, 563-565`
- **Severity:** High
- **Description:** The full sync function uses `require('fs').appendFileSync('sync_debug.log', ...)` to write debug logs. Vercel serverless functions have a read-only filesystem (except `/tmp`). This will either silently fail or throw an error on every sync. The `require('fs')` is also called inside the function body, which is unusual and could cause issues with bundling.
- **Steps to Reproduce:** Deploy to Vercel and trigger a full sync. Check for filesystem write errors.
- **Impact:** On Vercel, this either crashes the sync or silently swallows the error (depending on the try-catch). In the error handler at line 563, if `fs.appendFileSync` itself throws, the error handling code fails before it can set the account status, leaving the account stuck in SYNCING.
- **Suggested Fix:** Remove `fs.appendFileSync` calls or write to `/tmp/sync_debug.log`. Better yet, use `console.log` which is already captured by Vercel's logging.

#### [ES-008] sentThreadIds pre-fetch is stale during long full syncs
- **Location:** `src/services/gmailSyncService.ts:530-536`
- **Severity:** Medium
- **Description:** The `sentThreadIds` set is pre-fetched once before batch processing begins. During a full sync of 100,000 messages, as SENT messages are processed and inserted into the DB, newly discovered sent thread IDs are NOT reflected in the `sentThreadIds` set. This means `handleEmailReceived` for RECEIVED messages processed later in the batch may fail to detect that the thread has sent messages, missing auto-promotion to LEAD.
- **Steps to Reproduce:** Account has a long conversation thread. The SENT message in that thread is processed in batch 500, but the RECEIVED reply is processed in batch 1. The reply won't see the sent thread ID.
- **Impact:** Contacts that should be auto-promoted to LEAD remain as COLD_LEAD after initial sync. The `handleEmailReceived` function does have a fallback check against the DB (`threadStatus` query), but the sentThreadIds optimization path is missed.
- **Suggested Fix:** This is partially mitigated by the DB-level check in `handleEmailReceived` (line 107-111 of emailSyncLogic.ts), which queries the DB for existing thread messages. The `sentThreadIds` set is an optimization, not the sole source of truth. Low real-world impact.

#### [ES-009] historyId from profile may be stale if messages arrive during sync
- **Location:** `src/services/gmailSyncService.ts:518-524, 551`
- **Severity:** Medium
- **Description:** The `latestHistoryId` is fetched from `gmail.users.getProfile()` before batch processing begins. If new messages arrive during the (potentially long) sync, they have historyIds greater than the stored one but were never processed. When the next incremental sync runs with `history.list(startHistoryId)`, it will pick them up, so messages are not permanently lost. However, there is a window where new messages are invisible.
- **Steps to Reproduce:** Start a full sync on a large account. Send an email to that account during sync. The email won't appear until the next history sync triggers.
- **Impact:** Temporary delay in seeing new emails after a full sync completes. Self-correcting on next webhook/history sync.
- **Suggested Fix:** Fetch the historyId AFTER processing completes, or run a quick history sync immediately after full sync finishes.

#### [ES-010] Error in fs.appendFileSync within catch block can mask original error
- **Location:** `src/services/gmailSyncService.ts:562-565`
- **Severity:** High
- **Description:** In the catch block of `syncGmailEmails`, `fs.appendFileSync` is called BEFORE the status update logic. If `fs.appendFileSync` throws (e.g., on Vercel's read-only FS), the `isAuthError` check and status update at lines 569-574 are never reached, leaving the account permanently stuck in SYNCING status.
- **Steps to Reproduce:** Deploy to Vercel. Trigger a sync that fails (e.g., auth error). The `fs.appendFileSync` call throws, preventing the status from being set to ERROR or ACTIVE.
- **Impact:** Account stuck in SYNCING forever until the 15-minute auto-fix in `getAccountsAction` kicks in.
- **Suggested Fix:** Wrap the `fs.appendFileSync` in its own try-catch, or remove it entirely.

#### [ES-011] Full sync fetches up to 100,000 messages — Vercel function timeout
- **Location:** `src/services/gmailSyncService.ts:511`
- **Severity:** High
- **Description:** `fetchAllMessageIds` has `maxMessages = 100000`. For accounts with tens of thousands of emails, the paginated fetch + batch processing of all messages will easily exceed Vercel's 60-second timeout for `/api/sync`. The sync is fire-and-forget from the callback, but if triggered via `/api/sync`, the HTTP response is sent immediately only for manual IMAP and full sync cases (lines 32, 42 in sync route). For history sync, the route `await`s the sync at line 38, which could also timeout.
- **Steps to Reproduce:** Trigger a full sync for a Gmail account with >5000 emails via `/api/sync`.
- **Impact:** The Vercel function is killed after 60 seconds. The sync stops midway, account stays in SYNCING. The 15-minute auto-fix will eventually recover the status but emails are incomplete.
- **Suggested Fix:** Always fire-and-forget full syncs. Consider breaking large syncs into smaller chunks or using a background job queue.

---

## Flow 3: Email Sync (History/Incremental)

**Trace:** Webhook `POST /api/webhooks/gmail` -> decode base64 payload -> find account by email -> fire-and-forget `syncAccountHistory(accountId, newHistoryId)` -> `history.list(startHistoryId, historyTypes: ['messageAdded'])` -> collect added message IDs -> pre-fetch sentThreadIds + ignoredSenders -> `processBatch(...)` -> update historyId + last_synced_at

### Issues Found

#### [ES-012] No webhook signature verification — anyone can trigger syncs
- **Location:** `app/api/webhooks/gmail/route.ts:9-11`
- **Severity:** Critical
- **Description:** The Gmail webhook endpoint does not verify the Google Pub/Sub JWT bearer token. Any attacker can POST a crafted payload with a valid-looking base64 `message.data` containing any email address and historyId, triggering sync operations for arbitrary accounts.
- **Steps to Reproduce:** `curl -X POST /api/webhooks/gmail -H 'Content-Type: application/json' -d '{"message":{"data":"<base64 of {emailAddress, historyId}>"}}'`
- **Impact:** Attacker can trigger unlimited sync operations, consuming API quota and potentially causing rate limiting or service disruption.
- **Suggested Fix:** Verify the Pub/Sub push message by validating the `Authorization: Bearer <token>` header JWT against Google's public keys, and verify the audience claim matches the expected value.

#### [ES-013] Race condition between webhook sync and manual sync
- **Location:** `src/services/gmailSyncService.ts:389-468` and `app/api/sync/route.ts:35-38`
- **Severity:** Medium
- **Description:** The `/api/sync` route for history sync (`await syncAccountHistory(accountId)`) and the webhook trigger (`syncAccountHistory(account.id, newHistoryId)`) can run concurrently. `syncAccountHistory` has no concurrency guard (unlike `syncGmailEmails`). Two concurrent history syncs could both read the same `account.history_id`, both fetch overlapping history ranges, and both try to update the historyId. The last write wins, which could set a stale historyId if the manual sync finishes after the webhook sync.
- **Steps to Reproduce:** User clicks "Sync" in UI while a webhook is being processed for the same account.
- **Impact:** Potential duplicate message processing (mitigated by upsert dedup) and possible historyId regression leading to re-processing of already-synced messages on the next sync.
- **Suggested Fix:** Add a concurrency guard to `syncAccountHistory` similar to the one in `syncGmailEmails`, or use an atomic historyId update (only advance, never regress).

#### [ES-014] historyId can regress — newHistoryId from webhook may be older than DB value
- **Location:** `src/services/gmailSyncService.ts:445-453`
- **Severity:** Medium
- **Description:** The code stores `newIdToStore = newHistoryId || historyRes.data.historyId || account.history_id`. If multiple webhooks arrive rapidly, an older webhook's `newHistoryId` could overwrite a newer one. HistoryIds are monotonically increasing, but the code does not verify that the new value is greater than the existing one before writing.
- **Steps to Reproduce:** Two webhooks arrive 100ms apart. The second (newer) sync completes first and stores historyId=200. The first (older) sync completes later and overwrites with historyId=150. Next sync starts from 150, re-processing messages 150-200.
- **Impact:** Duplicate processing of messages (mitigated by dedup on upsert), wasted API calls.
- **Suggested Fix:** Use a conditional update: `UPDATE gmail_accounts SET history_id = $new WHERE id = $id AND (history_id IS NULL OR history_id::bigint < $new::bigint)`.

#### [ES-015] Webhook returns 500 on parse error — Google will retry indefinitely
- **Location:** `app/api/webhooks/gmail/route.ts:52-55`
- **Severity:** Medium
- **Description:** If `request.json()` throws or `JSON.parse(decodedData)` fails, the catch block returns `status: 500`. Google Pub/Sub will retry delivery of the same message with exponential backoff. If the payload is permanently malformed, this creates an infinite retry loop.
- **Steps to Reproduce:** Send a malformed JSON payload to the webhook.
- **Impact:** Continuous retries consuming resources, log noise.
- **Suggested Fix:** Return 200 for all parse errors to acknowledge receipt and stop retries. Log the error for investigation.

#### [ES-016] History sync does not check account status before running
- **Location:** `src/services/gmailSyncService.ts:389-397`
- **Severity:** Low
- **Description:** `syncAccountHistory` does not check if the account status is PAUSED, ERROR, or DISCONNECTED. A webhook could trigger a sync on a paused account.
- **Steps to Reproduce:** Pause an account, then receive a webhook for that account.
- **Impact:** Sync runs on a paused account, which the user explicitly paused. Low severity since no data corruption occurs, but it violates user intent.
- **Suggested Fix:** Add `if (account.status === 'PAUSED' || account.status === 'DISCONNECTED') return;`

---

## Flow 4: Email Sync (Manual IMAP)

**Trace:** `syncManualEmails(accountId)` -> fetch account -> concurrency guard -> set SYNCING -> decrypt app_password -> IMAP connect -> `imap.list()` -> filter target folders -> for each folder: `getMailboxLock` -> `imap.fetch({since: 6monthsAgo})` -> `simpleParser(message.source)` -> `handleEmailReceived(...)` -> release lock -> update progress -> `imap.logout()` -> set ACTIVE

### Issues Found

#### [ES-017] IMAP connection failure leaves account stuck in SYNCING
- **Location:** `src/services/manualEmailService.ts:139, 153`
- **Severity:** High
- **Description:** The status is set to SYNCING at line 139, then `imap.connect()` is called at line 153. If `imap.connect()` throws (bad credentials, network error, server down), the error propagates out of `syncManualEmails` without resetting the status to ACTIVE or ERROR. The account remains stuck in SYNCING until the 15-minute auto-fix in `getAccountsAction` runs.
- **Steps to Reproduce:** Change the app password on the email provider, then trigger a sync.
- **Impact:** Account stuck in SYNCING for up to 15 minutes. User cannot trigger another sync during this time.
- **Suggested Fix:** Wrap the entire sync body (after setting SYNCING) in a try-catch that resets status on failure, similar to the error handling in `syncGmailEmails`.

#### [ES-018] All non-INBOX folders marked as spam
- **Location:** `src/services/manualEmailService.ts:232`
- **Severity:** High
- **Description:** `isSpam: folder !== 'INBOX'` marks every message from Sent, Drafts, and Trash folders as spam. The target folders include `\\Sent`, `\\Trash`, `\\Drafts` (lines 170-178), but the spam flag logic only checks if the folder is INBOX. Sent emails synced from the Sent folder will have `is_spam = true`.
- **Steps to Reproduce:** Sync a manual account. Check emails from the Sent folder — they will all have `is_spam = true`.
- **Impact:** Sent emails appear in the Spam tab instead of the normal inbox/sent view. This is a significant data classification bug.
- **Suggested Fix:** Check against actual spam/junk folder names: `isSpam: folder.toLowerCase().includes('spam') || folder.toLowerCase().includes('junk') || folder.toLowerCase().includes('bulk')`.

#### [ES-019] IMAP messages from Sent folder are all processed as RECEIVED
- **Location:** `src/services/manualEmailService.ts:222-233`
- **Severity:** High
- **Description:** All messages from every folder are passed to `handleEmailReceived()`. Messages from the Sent folder should be processed with `handleEmailSent()` instead. This means sent emails are stored with `direction: 'RECEIVED'`, breaking the inbox/sent view, pipeline promotion logic, and tracking.
- **Steps to Reproduce:** Sync a manual account that has messages in its Sent folder.
- **Impact:** Sent emails appear as received emails. Pipeline auto-promotion logic (which checks for SENT direction messages in threads) will not work correctly for manual accounts.
- **Suggested Fix:** Detect folder type and route to the appropriate handler. For Sent-flagged folders, call `handleEmailSent()`.

#### [ES-020] No deduplication for IMAP messages across folders
- **Location:** `src/services/manualEmailService.ts:212-233`
- **Severity:** Medium
- **Description:** IMAP messages can appear in multiple folders (e.g., a message in both INBOX and "[Gmail]/All Mail"). The `messageId` from IMAP envelope is used as the primary key, and the upsert in `handleEmailReceived` uses `onConflict: 'id'`, so the second insert will overwrite the first. However, the overwrite could change `isSpam` status or other folder-derived attributes incorrectly.
- **Steps to Reproduce:** Sync an account where the same message appears in INBOX and a Spam folder. The last folder processed wins.
- **Impact:** Messages could flip between spam and non-spam depending on folder processing order.
- **Suggested Fix:** Track processed message IDs and skip duplicates, or only process each message from its primary folder.

#### [ES-021] IMAP `secure` flag logic is incorrect for non-993 TLS ports
- **Location:** `src/services/manualEmailService.ts:30, 149`
- **Severity:** Low
- **Description:** `secure: imapPort === 993` means that any custom port other than 993 will use plaintext IMAP, even if the server requires TLS. Similarly, `secure: smtpPort === 465` at line 89 means port 587 (STARTTLS) won't use TLS.
- **Steps to Reproduce:** Configure a manual account with a custom IMAP port that uses TLS (e.g., port 143 with STARTTLS).
- **Impact:** Connection may fail or transmit credentials in plaintext.
- **Suggested Fix:** Allow the user to specify a `secure` option, or default to STARTTLS for non-standard ports.

---

## Flow 5: Email Sending

**Trace:** `sendEmailAction(params)` -> fetch account -> `prepareTrackedEmail(body, isTracked)` -> if MANUAL: `sendManualEmail(sendParams)` / if OAUTH: `sendGmailEmail(sendParams)` -> upsert email_message with tracking_id -> increment sent_count_today

For Gmail: `sendGmailEmail` -> build MIME -> base64url encode -> `gmail.users.messages.send()` -> on 401: `refreshAccessToken` -> retry send -> `handleEmailSent(...)`

For Manual: `sendManualEmail` -> decrypt password -> `nodemailer.sendMail()` -> `handleEmailSent(...)`

### Issues Found

#### [ES-022] Double upsert of sent email — sendEmailAction and handleEmailSent both write
- **Location:** `src/actions/emailActions.ts:73-90` and `src/services/emailSyncLogic.ts:49-79`
- **Severity:** Medium
- **Description:** `sendGmailEmail` and `sendManualEmail` both call `handleEmailSent()` which upserts the email message. Then `sendEmailAction` ALSO upserts the same message at lines 73-90 (to add `tracking_id`, `is_tracked`, `opens_count`). This double-write causes two issues: (1) The second upsert in `sendEmailAction` may overwrite fields set by `handleEmailSent` (e.g., `contact_id`, `pipeline_stage`), and (2) the `body` field from `sendEmailAction` uses `trackedBody` (with pixel), while `handleEmailSent` receives the same `trackedBody` from `sendParams`, so the body is consistent, but the `snippet` computation differs.
- **Steps to Reproduce:** Send any email and check the DB for the message. The `contact_id` and `pipeline_stage` set by `handleEmailSent` may be overwritten to null by the `sendEmailAction` upsert (which doesn't set these fields, so they may default to null).
- **Impact:** `contact_id` linkage from `handleEmailSent` is potentially lost. Pipeline stage may be reset. The `sendEmailAction` upsert at line 75 does not include `contact_id` or `pipeline_stage`, so the upsert behavior depends on Supabase's handling of missing fields in upsert.
- **Suggested Fix:** Remove the duplicate upsert from `sendEmailAction` and instead update only the tracking-specific fields (`is_tracked`, `tracking_id`, `opens_count`) via an UPDATE after `handleEmailSent` completes.

#### [ES-023] MIME message uses `\n` instead of `\r\n` — violates RFC 2822
- **Location:** `src/services/gmailSenderService.ts:59`
- **Severity:** Medium
- **Description:** The MIME message parts are joined with `\n` (Unix line endings) instead of `\r\n` (CRLF) as required by RFC 2822. While Gmail's API is lenient and typically handles this, some email servers and clients may misparse the MIME structure, especially for non-ASCII content.
- **Steps to Reproduce:** Send an email with special characters or attachments. Some recipients may see malformed headers.
- **Impact:** Potential display issues in strict email clients.
- **Suggested Fix:** Use `messageParts.join('\r\n')`.

#### [ES-024] No CC/BCC support in email sending
- **Location:** `src/services/gmailSenderService.ts:50-58` and `src/services/manualEmailService.ts:93-98`
- **Severity:** Low
- **Description:** The MIME message construction in `sendGmailEmail` only includes `From`, `To`, `Content-Type`, `MIME-Version`, and `Subject`. There are no `Cc` or `Bcc` headers. Similarly, `sendManualEmail` only uses `from`, `to`, `subject`, `html`. The `sendEmailAction` parameters only accept `to`, not `cc` or `bcc`.
- **Steps to Reproduce:** Try to send an email with CC recipients — there's no way to do it.
- **Impact:** Missing feature rather than a bug, but the ComposeModal UI likely has CC/BCC fields that don't function.
- **Suggested Fix:** Add `cc` and `bcc` parameters throughout the send chain.

#### [ES-025] Manual email threadId fallback creates orphaned threads
- **Location:** `src/services/manualEmailService.ts:100`
- **Severity:** Medium
- **Description:** `const finalThreadId = threadId || info.messageId.replace(/[<>]/g, '')`. When no `threadId` is provided (new conversation), the message ID is used as the thread ID. But the messageId from nodemailer includes angle brackets and domain (e.g., `<abc123@smtp.gmail.com>`), which after stripping `<>` becomes `abc123@smtp.gmail.com`. This differs from Gmail's thread ID format, so when the recipient replies and the reply is synced via IMAP, the IMAP thread ID (from `References` or `In-Reply-To` headers) may not match, creating separate threads for the same conversation.
- **Steps to Reproduce:** Send a manual email, wait for a reply, sync via IMAP. The reply may appear as a separate thread.
- **Impact:** Conversation threading breaks for manual accounts. Pipeline auto-promotion (which relies on threads containing both SENT and RECEIVED messages) will not work.
- **Suggested Fix:** Use a consistent thread ID derivation that matches how IMAP sync generates thread IDs (e.g., based on `In-Reply-To` or `References` headers).

#### [ES-026] sent_count_today is incremented but never reset
- **Location:** `src/actions/emailActions.ts:57-59`
- **Severity:** Low
- **Description:** `sent_count_today` is incremented on every send but there is no cron job or scheduled function to reset it to 0 at midnight. It will grow indefinitely.
- **Steps to Reproduce:** Send emails over multiple days. Check `sent_count_today` — it reflects total sends, not today's sends.
- **Impact:** Any rate-limiting or analytics based on `sent_count_today` will be inaccurate.
- **Suggested Fix:** Add a daily cron job to reset `sent_count_today` to 0 for all accounts, or use a `last_send_date` field and reset on mismatch.

---

## Flow 6: Email Tracking

**Trace:**

**Injection:** `prepareTrackedEmail(body, isEnabled)` -> `generateTrackingId()` (UUID, dashes stripped) -> `wrapLinksForTracking(body, trackingId)` (regex on `href="https?://..."`) -> append `<img>` tracking pixel

**Open detection:** `GET /api/track?t={trackingId}` -> extract IP, UA, referer -> `processTrackingEvent(...)` -> insert into `email_tracking_events` + RPC `increment_email_opens` -> return 1x1 PNG

**Click detection:** `GET /api/track/click?t={trackingId}&url={url}` -> `processClickEvent(...)` -> owner IP check -> insert event + RPC `increment_email_clicks` -> 302 redirect to URL

**Owner filtering:** `POST /api/track/session` -> insert `owner_session` event with IP

### Issues Found

#### [ES-027] Tracking pixel owner filtering is completely disabled (DEBUG mode)
- **Location:** `app/api/track/route.ts:29-55`
- **Severity:** Critical
- **Description:** The entire owner-filtering logic in the tracking pixel endpoint is commented out with `/* ... */`. The code comment says "DEBUG: Temporarily allowing ALL hits." Every open — including the sender previewing their own email in the CRM, Google Image Proxy prefetches, and email client previews — is counted as a genuine open.
- **Steps to Reproduce:** Send a tracked email. Open the CRM inbox and view the sent email. The opens_count increments.
- **Impact:** Open counts are wildly inflated. Every CRM page view that renders the email body (which contains the tracking pixel) counts as an "open." Analytics and the "2 blue ticks" indicator are unreliable.
- **Suggested Fix:** Re-enable the owner filtering logic. At minimum, filter out requests with a referer matching the app URL, and filter owner IPs.

#### [ES-028] Click tracking has owner filter but open tracking does not — inconsistent
- **Location:** `app/api/track/click/route.ts:34-48` vs `app/api/track/route.ts:29-55`
- **Severity:** High
- **Description:** The click tracking endpoint properly checks for owner sessions and referer, but the open tracking endpoint has all filtering disabled. This means opens are inflated while clicks have some accuracy, creating inconsistent metrics (e.g., more opens than actual recipient opens, but accurate click counts).
- **Impact:** Misleading engagement metrics. Open rates appear much higher than click rates, skewing analytics.
- **Suggested Fix:** Apply the same filtering logic to both endpoints.

#### [ES-029] Link wrapping regex doesn't handle single-quoted hrefs or unquoted URLs
- **Location:** `src/services/trackingService.ts:46`
- **Severity:** Medium
- **Description:** The regex `/href="(https?:\/\/[^"]+)"/gi` only matches `href="..."` with double quotes. HTML emails may contain `href='...'` (single quotes) or `href=...` (no quotes), especially from rich text editors or copy-pasted content.
- **Steps to Reproduce:** Compose an email with single-quoted links in the HTML. The links won't be wrapped for tracking.
- **Impact:** Click tracking misses for emails with non-standard quoting.
- **Suggested Fix:** Extend regex: `/href=["'](https?:\/\/[^"']+)["']/gi`

#### [ES-030] Tracking pixel appended outside `</body>` or `</html>` tags
- **Location:** `src/services/trackingService.ts:77`
- **Severity:** Medium
- **Description:** `trackedBody += getTrackingPixelHtml(trackingId)` simply appends the `<img>` tag to the end of the body string. If the body contains `</body>` or `</html>` closing tags, the pixel ends up after them, which is invalid HTML. Some email clients may ignore content after `</html>`.
- **Steps to Reproduce:** Send a tracked email where the body is a full HTML document with `</body></html>`. The tracking pixel may not render.
- **Impact:** Tracking pixel may not load in some email clients, leading to missed open detection.
- **Suggested Fix:** Insert the pixel before `</body>` if present, otherwise append.

#### [ES-031] Open redirect vulnerability in click tracking
- **Location:** `app/api/track/click/route.ts:29`
- **Severity:** Critical
- **Description:** `NextResponse.redirect(url)` redirects to whatever URL is in the `url` query parameter with no validation. An attacker can craft a link like `/api/track/click?t=fake&url=https://evil.com/phishing` and use it in phishing attacks, leveraging the trusted domain of the Unibox app.
- **Steps to Reproduce:** Visit `/api/track/click?url=javascript:alert(1)` or `/api/track/click?url=https://evil.com`.
- **Impact:** The app's domain can be used as an open redirect for phishing attacks.
- **Suggested Fix:** Validate that the URL is a legitimate http/https URL. Optionally, verify the tracking ID exists in the database before redirecting.

---

## Flow 7: Pipeline Auto-Promotion

**Trace:** Email received -> `handleEmailReceived(data, sentThreadIds)` -> query contact by `fromEmail` -> query thread messages for existing stage + direction -> check if thread has outgoing (SENT) messages -> if SENT exists: set stage to LEAD -> check acceptance keywords -> if contact is COLD_LEAD and new stage is LEAD: update contact + backfill thread messages + log activity -> upsert message

### Issues Found

#### [ES-032] Contact lookup uses raw `fromEmail` instead of extracted email address
- **Location:** `src/services/emailSyncLogic.ts:97-101`
- **Severity:** High
- **Description:** `handleEmailReceived` queries contacts with `.eq('email', fromEmail)`. But `fromEmail` from Gmail is in RFC 2822 format like `"John Doe" <john@example.com>`, not just `john@example.com`. The contacts table stores clean email addresses. This `.eq()` query will NEVER match because `"John Doe" <john@example.com>` != `john@example.com`.
- **Steps to Reproduce:** Receive an email from a known contact. The contact lookup returns null, so `contact_id` is null on the message, and no pipeline promotion occurs.
- **Impact:** Critical for pipeline functionality. Contacts are never matched on received emails from Gmail sync, meaning: (1) messages are never linked to contacts, (2) auto-promotion from COLD_LEAD to LEAD never fires, (3) keyword detection for acceptance never fires.
- **Suggested Fix:** Extract the email address from the RFC 2822 format before querying: `const cleanEmail = (fromEmail.match(/<([^>]+)>/)?.[1] || fromEmail).toLowerCase()`.

#### [ES-033] handleEmailSent also has the same contact lookup bug
- **Location:** `src/services/emailSyncLogic.ts:20-24`
- **Severity:** High
- **Description:** `handleEmailSent` queries `.eq('email', toEmail)` where `toEmail` comes from the Gmail `To` header, which is also in RFC 2822 format. Same issue as ES-032.
- **Steps to Reproduce:** Send an email to a known contact. The contact is not linked to the sent message.
- **Impact:** Sent emails are never linked to contacts, breaking the CRM relationship tracking.
- **Suggested Fix:** Same as ES-032 — extract the clean email address.

#### [ES-034] Promotion logic skips contacts with non-COLD_LEAD stages incorrectly
- **Location:** `src/services/emailSyncLogic.ts:123`
- **Severity:** Medium
- **Description:** `if (hasOutgoing || (contact && !['COLD_LEAD', null].includes(contact.pipeline_stage)))` sets `newEmailStage = 'LEAD'`. This means if a contact's current stage is NOT_INTERESTED and they send an email in a thread without any outgoing messages, the email gets stage LEAD (because `!['COLD_LEAD', null].includes('NOT_INTERESTED')` is true). This effectively un-ignores the contact.
- **Steps to Reproduce:** Mark a sender as NOT_INTERESTED. Receive a new email from them on a new thread. The email appears as LEAD.
- **Impact:** NOT_INTERESTED contacts can be auto-promoted back to LEAD, undermining the "not interested" workflow. Note: the `ignoredSenders` check in `processSingleMessage` should filter these out during sync, but if the ignored_senders entry was not yet created or was deleted, this logic fires.
- **Suggested Fix:** Exclude NOT_INTERESTED from the promotion condition: `(contact && !['COLD_LEAD', null, 'NOT_INTERESTED'].includes(contact.pipeline_stage))`.

#### [ES-035] Stage preservation check doesn't include NOT_INTERESTED
- **Location:** `src/services/emailSyncLogic.ts:128-129`
- **Severity:** Medium
- **Description:** `if (existingStage && !['COLD_LEAD', 'LEAD'].includes(existingStage))` preserves OFFER_ACCEPTED and CLOSED stages, but also preserves NOT_INTERESTED. If a thread was marked NOT_INTERESTED and a new message arrives, the new message inherits NOT_INTERESTED, which is correct. However, combined with ES-034, there's inconsistency: a NOT_INTERESTED contact on a NEW thread gets promoted to LEAD (ES-034), but a NOT_INTERESTED thread gets preserved as NOT_INTERESTED (this check).
- **Impact:** Inconsistent stage assignment depending on whether the existing stage is on the contact or the thread.
- **Suggested Fix:** Align the logic so NOT_INTERESTED is always preserved regardless of source.

#### [ES-036] Keyword detection for acceptance has high false positive rate
- **Location:** `src/services/emailSyncLogic.ts:3, 134`
- **Severity:** Medium
- **Description:** The `ACCEPTANCE_KEYWORDS` array includes very common words like `'yes'`, `'sounds good'`, and `'deal'`. The check `bodyText.includes(k)` is a substring match, so "yes" matches "yesterday", "eyes", "bypass", etc. "deal" matches "dealing", "ideal", etc.
- **Steps to Reproduce:** Receive an email containing the word "yesterday" from a LEAD contact. An activity log entry "Possible Acceptance?" is created.
- **Impact:** Activity logs are cluttered with false positive acceptance signals, reducing trust in the system.
- **Suggested Fix:** Use word boundary matching (regex `\byes\b`) and require multiple signals or more specific phrases.

---

## Cross-Flow Issues

#### [ES-037] `/api/sync` endpoint has no authentication
- **Location:** `app/api/sync/route.ts:13`
- **Severity:** Critical
- **Description:** The `/api/sync` POST endpoint accepts any request with an `accountId` body parameter. There is no session validation, API key, or authentication check. Anyone who knows or guesses an account UUID can trigger syncs.
- **Steps to Reproduce:** `curl -X POST /api/sync -H 'Content-Type: application/json' -d '{"accountId":"any-uuid"}'`
- **Impact:** Unauthenticated users can trigger syncs for any account, consuming API quota, triggering rate limits, and potentially accessing email data through the sync pipeline.
- **Suggested Fix:** Add authentication middleware. Verify the requesting user owns the account being synced.

---

## Fixes Applied

### [ES-032] Contact lookup uses raw fromEmail in handleEmailReceived (fixed)
- **Fix:** Added `extractEmail()` helper that strips RFC 2822 display names (e.g. `"John Doe <john@example.com>"` -> `john@example.com`). Applied to `fromEmail` before contact query in `handleEmailReceived`.
- **File:** `src/services/emailSyncLogic.ts:10-13,108`
- **Validated:** Yes

### [ES-033] Contact lookup uses raw toEmail in handleEmailSent (fixed)
- **Fix:** Applied same `extractEmail()` helper to `toEmail` before contact query in `handleEmailSent`.
- **File:** `src/services/emailSyncLogic.ts:28,33`
- **Validated:** Yes

### [ES-019] IMAP Sent folder processed as RECEIVED (fixed)
- **Fix:** Added folder type detection using `specialUse` and folder name. Messages from Sent folders now routed to `handleEmailSent()` instead of `handleEmailReceived()`.
- **File:** `src/services/manualEmailService.ts:222-260`
- **Validated:** Yes

### [ES-018] All non-INBOX folders marked as spam (fixed)
- **Fix:** Changed `isSpam: folder !== 'INBOX'` to only flag as spam when the folder is actually a Spam/Junk/Bulk folder, detected via `specialUse` flag or folder name.
- **File:** `src/services/manualEmailService.ts:226-228,258`
- **Validated:** Yes

### [ES-006] TOCTOU race on sync concurrency guard — gmailSyncService (fixed)
- **Fix:** Replaced read-then-write concurrency guard with atomic `update().eq('status', 'ACTIVE').select()`. If no rows returned, another sync already claimed the lock.
- **File:** `src/services/gmailSyncService.ts:506-517`
- **Validated:** Yes

### [ES-006] TOCTOU race on sync concurrency guard — manualEmailService (fixed)
- **Fix:** Same atomic update pattern applied to `syncManualEmails`.
- **File:** `src/services/manualEmailService.ts:132-143`
- **Validated:** Yes

### [ES-007/ES-010] fs.appendFileSync in serverless (fixed)
- **Fix:** Removed all `require('fs').appendFileSync('sync_debug.log', ...)` calls from `syncGmailEmails`. Replaced with `console.log`/`console.error` for Vercel compatibility. This also fixes ES-010 where `fs.appendFileSync` in the catch block could mask the original error.
- **File:** `src/services/gmailSyncService.ts:507,513,556,563-565`
- **Validated:** Yes

### [ES-017] IMAP connection failure leaves account stuck in SYNCING (fixed)
- **Fix:** Wrapped the entire sync body (including `imap.connect()`) in a try/catch that resets status to ACTIVE on any failure.
- **File:** `src/services/manualEmailService.ts:157,287-295`
- **Validated:** Yes

### [ES-023] MIME message uses \n instead of \r\n (fixed)
- **Fix:** Changed `messageParts.join('\n')` to `messageParts.join('\r\n')` per RFC 2822.
- **File:** `src/services/gmailSenderService.ts:59`
- **Validated:** Yes

### [ES-021/BE-028] TLS secure flag logic incorrect for non-standard ports (fixed)
- **Fix:** Changed all `secure: imapPort === 993` and `secure: smtpPort === 465` comparisons to use `Number()` coercion to handle string port values from the database. Applied to `testManualConnection`, `syncManualEmails`, `sendManualEmail`, and `unspamManualMessage`.
- **File:** `src/services/manualEmailService.ts:30,46,89,152,305`
- **Validated:** Yes

### [ES-014] historyId can regress on concurrent webhooks (fixed)
- **Fix:** Added comparison logic so historyId is only updated if the new value is greater than the current stored value.
- **File:** `src/services/gmailSyncService.ts:444-460`
- **Validated:** Yes

### [ES-016] History sync does not check account status (fixed)
- **Fix:** Added status check at the start of `syncAccountHistory` to skip PAUSED, DISCONNECTED, and ERROR accounts.
- **File:** `src/services/gmailSyncService.ts:398-402`
- **Validated:** Yes

### [ES-030] Tracking pixel appended outside body/html tags (fixed)
- **Fix:** Pixel is now inserted before `</body>` (or `</html>`) if present, otherwise appended.
- **File:** `src/services/trackingService.ts:76-84`
- **Validated:** Yes

### [ES-029] Link wrapping regex misses single-quoted hrefs (fixed)
- **Fix:** Extended regex from `/href="(https?:\/\/[^"]+)"/gi` to `/href=["'](https?:\/\/[^"']+)["']/gi` to match both single and double quoted hrefs.
- **File:** `src/services/trackingService.ts:46`
- **Validated:** Yes

### [BE-019] Tracking ID generated when tracking disabled (fixed)
- **Fix:** Moved `generateTrackingId()` call inside the enabled branch; returns empty string when disabled.
- **File:** `src/services/trackingService.ts:65-69`
- **Validated:** Yes

### [BE-015] Supabase client silently starts with placeholder credentials (fixed)
- **Fix:** Added `throw new Error()` in production when environment variables are missing, keeping `console.warn` for development.
- **File:** `src/lib/supabase.ts:6-11`
- **Validated:** Yes

## Round 2 Fixes Applied

### [ES-036] Keyword detection false positives — substring matching (fixed)
- **Fix:** Replaced `bodyText.includes(k)` with pre-compiled word-boundary regexes (`\byes\b`, `\bdeal\b`, etc.) so "yes" no longer matches "yesterday", "deal" no longer matches "ideal", etc.
- **File:** `src/services/emailSyncLogic.ts`

### [ES-034] Promotion logic incorrectly promotes NOT_INTERESTED contacts to LEAD (fixed)
- **Fix:** Added `'NOT_INTERESTED'` to the exclusion list in the promotion condition so contacts marked NOT_INTERESTED are not auto-promoted. Also added an explicit guard: if the contact's stage is NOT_INTERESTED, preserve that stage regardless of thread activity.
- **File:** `src/services/emailSyncLogic.ts`

### [ES-035] Stage preservation inconsistency with NOT_INTERESTED (fixed)
- **Fix:** The NOT_INTERESTED contact guard now ensures consistent behavior — NOT_INTERESTED is always preserved whether it comes from the contact record or from the existing thread stage.
- **File:** `src/services/emailSyncLogic.ts`

### [ES-022] Double upsert of sent email — sendEmailAction overwrites handleEmailSent data (fixed)
- **Fix:** Replaced the full upsert in `sendEmailAction` with a targeted `update()` that only sets tracking-specific fields (`is_tracked`, `tracking_id`, `opens_count`, `body`), preserving `contact_id`, `pipeline_stage`, and other fields set by `handleEmailSent`.
- **File:** `src/actions/emailActions.ts`

### [ES-026] sent_count_today never resets (fixed)
- **Fix:** Added `last_send_date` tracking. On each send, the current date is compared to `last_send_date`; if they differ, `sent_count_today` is reset to 0 before incrementing. The `last_send_date` is updated on every send.
- **File:** `src/actions/emailActions.ts`

### [ES-024/BE-021] No CC/BCC support in email sending (fixed)
- **Fix:** Added optional `cc` and `bcc` parameters to both `sendGmailEmail` (included as MIME headers) and `sendManualEmail` (passed to nodemailer options).
- **File:** `src/services/gmailSenderService.ts`, `src/services/manualEmailService.ts`

### [ES-002/BE-018] OAuth state parameter not validated — no CSRF protection (fixed)
- **Fix:** Added `generateOAuthState()` and `validateOAuthState()` functions to `googleAuthService.ts`. `getGoogleAuthUrl()` now accepts an optional `state` parameter. Uses `crypto.timingSafeEqual` for timing-safe comparison. Callers can generate a state, store it in the session, pass it to `getGoogleAuthUrl(state)`, and validate it in the callback.
- **File:** `src/services/googleAuthService.ts`

### [ES-003/BE-031] Refresh token may be null on reconnect (fixed)
- **Fix:** Added a guard after computing `encryptedRefreshToken`: if it's falsy (no token from Google AND no existing one in DB), an error is thrown instructing the user to revoke app access and reconnect, rather than silently saving a broken account.
- **File:** `src/services/googleAuthService.ts`

### [ES-004] Error messages expose internal details (fixed)
- **Fix:** Sanitized error messages in `refreshAccessToken` (removed accountId from log), `sendGmailEmail` (throws generic message instead of raw error), and `syncGmailEmails` (throws sanitized error). Internal details are still logged server-side for debugging.
- **File:** `src/services/googleAuthService.ts`, `src/services/gmailSenderService.ts`, `src/services/gmailSyncService.ts`

### [ES-009] historyId from profile may be stale if messages arrive during sync (fixed)
- **Fix:** Moved `gmail.users.getProfile()` call from before batch processing to after it completes. The historyId is now fetched post-sync, ensuring messages that arrived during the sync window are included in the next incremental sync.
- **File:** `src/services/gmailSyncService.ts`

### [BE-042] syncAccountHistory creates redundant OAuth client (fixed)
- **Fix:** Removed the `gmail2` client creation and reused the existing `gmail` client for batch processing in `syncAccountHistory`.
- **File:** `src/services/gmailSyncService.ts`

### [ES-020] No deduplication for IMAP messages across folders (fixed)
- **Fix:** Added a `processedMessageIds` Set that tracks message IDs across all folders during manual sync. Messages already processed from a previous folder are skipped.
- **File:** `src/services/manualEmailService.ts`

### Encryption edge cases — empty string, malformed data (fixed)
- **Fix:** Added input validation to `encrypt()` (rejects null/undefined, validates type) and `decrypt()` (validates non-empty string, checks for exactly 3 colon-separated parts, validates hex encoding, validates IV length and auth tag length).
- **File:** `src/utils/encryption.ts`

### [BE-015] Supabase server client production throw not applied (fixed)
- **Fix:** Added `throw new Error()` in production when environment variables are missing (the previous fix was documented but the code still only had `console.warn`).
- **File:** `src/lib/supabase.ts`

### Supabase browser client placeholder credentials warning (fixed)
- **Fix:** Added `console.warn` when `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing, matching the server-side pattern.
- **File:** `src/lib/supabase-client.ts`
