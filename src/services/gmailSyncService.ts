import 'server-only';
import { supabase } from '../lib/supabase';
import { handleEmailReceived, handleEmailSent } from './emailSyncLogic';
import { getGmailClientFromAccount } from './gmailClientFactory';
import { getMessageBody, extractPlainText } from '../utils/gmailBodyParser';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isAuthError(error: any) {
    const msg = error?.message?.toLowerCase() || '';
    return msg.includes('invalid_grant') ||
        msg.includes('invalid_token') ||
        error.code === 401 ||
        error.status === 401 ||
        (error.code === 403 && msg.includes('unauthorized'));
}

function isRateLimitError(err: any): boolean {
    return err?.code === 429 ||
        err?.status === 429 ||
        err?.message?.includes('rateLimitExceeded') ||
        err?.message?.includes('userRateLimitExceeded') ||
        err?.message?.includes('quotaExceeded');
}

// ─── Paginated Message ID Fetcher ─────────────────────────────────────────────

/**
 * Fetches ALL message IDs for a given label using pagination (following nextPageToken).
 * Per the docs: messages.list returns pages of IDs, not full messages.
 * Max 500 per page. We follow nextPageToken until exhausted.
 */
async function fetchAllMessageIds(
    gmail: any,
    labelIds: string[],
    query?: string,
    maxMessages = 100000
): Promise<Array<{ id: string; threadId?: string }>> {
    const allIds: Array<{ id: string; threadId?: string }> = [];
    let pageToken: string | undefined = undefined;

    do {
        const res: any = await gmail.users.messages.list({
            userId: 'me',
            labelIds,
            maxResults: Math.min(500, maxMessages - allIds.length), // Max 500 per page per docs
            ...(pageToken ? { pageToken } : {}),
            ...(query ? { q: query } : {}),
        });

        const messages: Array<{ id: string; threadId?: string }> = res.data.messages || [];
        allIds.push(...messages);
        pageToken = res.data.nextPageToken;

        // Stop if we've hit our cap or there are no more pages
    } while (pageToken && allIds.length < maxMessages);

    return allIds;
}

// ─── Single Message Processor ─────────────────────────────────────────────────

/**
 * Fetches full message details and upserts into Supabase.
 * - Uses format=FULL for new messages (per docs)
 * - Skips messages already in DB (deduplication)
 * - Determines direction from labelIds (SENT label) per docs — not from-email heuristic
 * - Reads UNREAD label to set is_unread correctly per docs
 */
async function processSingleMessage(
    gmail: any,
    account: any,
    messageId: string,
    knownDirection?: 'SENT' | 'RECEIVED',
    sentThreadIds?: Set<string>,
    ignoredSenders?: Set<string>
) {
    // Deduplication check
    const { data: existing } = await supabase
        .from('email_messages')
        .select('id, body_text, gmail_account_id')
        .eq('id', messageId)
        .maybeSingle();

    // If it exists and already has the CORRECT account ID and plain text body, we skip.
    // Optimization: we only skip if it's already linked to THIS account.
    // If gmail_account_id is NULL (orphaned email from a delete), we MUST continue to re-link it.
    if (existing?.gmail_account_id === account.id && existing?.body_text) {
        return;
    }

    try {
        // Per docs: use format=FULL for initial fetch, format=MINIMAL for already-cached
        let detailRes: any;
        try {
            detailRes = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full',
            });
        } catch (fetchErr: any) {
            if (isRateLimitError(fetchErr)) {
                // Wait 2 seconds and retry once on rate limit
                await new Promise(r => setTimeout(r, 2000));
                detailRes = await gmail.users.messages.get({
                    userId: 'me',
                    id: messageId,
                    format: 'full',
                });
            } else {
                throw fetchErr;
            }
        }

        const detail = detailRes.data;
        const headers: Array<{ name: string; value: string }> = detail.payload?.headers || [];
        const labelIds: string[] = detail.labelIds || [];

        // ─── Filtering (Optional/Relaxed for "All Mail") ───
        // We now sync everything as requested, but we still skip basic promotional categories if they are very noisy.
        // If the user wants ABSOLUTUTELY EVERYTHING, we could even remove these category checks.
        /* 
        const skipLabels = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];
        if (labelIds.some(l => skipLabels.includes(l))) {
            console.log(`[Sync] Skipping message ${messageId} due to category label.`);
            return;
        }
        */

        const getHeader = (name: string) =>
            headers.find((h) => h.name && h.name.toLowerCase() === name.toLowerCase())?.value || '';

        const from = getHeader('from') || '';
        const senderEmail = (from.match(/<([^>]+)>/)?.[1] || from || '').toLowerCase();
        // const senderDomain = senderEmail.split('@')[1];

        /*
        // Aggressive Keyword Filtering (Disabled per user request for "all mail")
        const junkKeywords = [
            'noreply', 'no-reply', 'support', 'alert', 'notification',
            'statement', 'security', 'billing', 'invoice', 'newsletter',
            'bounce', 'daemon', 'verify', 'update', 'promotion'
        ];

        const fromLower = from.toLowerCase();
        if (junkKeywords.some(kw => fromLower.includes(kw))) {
            console.log(`[Sync] Skipping message ${messageId} due to junk keyword in from: ${from}`);
            return;
        }
        */

        // Check if specific sender is in our ignored list
        // NEVER skip if it's from the account user themselves (otherwise SENT mail is lost)
        if (ignoredSenders?.has(senderEmail) && senderEmail !== account.email.toLowerCase()) {
            console.log(`[Sync] Skipping ignored sender: ${senderEmail}`);
            return;
        }

        const to = getHeader('to');
        const subject = getHeader('subject') || '(No Subject)';
        const dateStr = getHeader('date');
        const body = getMessageBody(detail.payload) || detail.snippet || '';
        const bodyText = extractPlainText(body, 2000);

        // Per docs: check labelIds for SENT and UNREAD — this is more reliable than email parsing
        const isSent = knownDirection
            ? knownDirection === 'SENT'
            : labelIds.includes('SENT');

        // Per docs: UNREAD label indicates email hasn't been read
        const isUnread = labelIds.includes('UNREAD');

        const parsedDate = dateStr ? new Date(dateStr) : new Date();

        if (isSent) {
            console.log(`[Sync] Processing SENT email: "${subject}" to ${to}`);
            await handleEmailSent({
                gmailAccountId: account.id,
                threadId: detail.threadId || '',
                messageId: detail.id || '',
                fromEmail: from,
                toEmail: to,
                subject,
                body,
                bodyText,
                isUnread,
                sentAt: parsedDate,
            });
        } else {
            console.log(`[Sync] Processing RECEIVED email: "${subject}" from ${from}`);
            await handleEmailReceived({
                gmailAccountId: account.id,
                threadId: detail.threadId || '',
                messageId: detail.id || '',
                fromEmail: from,
                toEmail: to || account.email,
                subject,
                body,
                bodyText,
                isUnread,
                receivedAt: parsedDate,
                isSpam: labelIds.includes('SPAM'),
            }, sentThreadIds);
        }
    } catch (e: any) {
        console.error(`[Sync] Error processing message ${messageId}:`, e?.message || e);
    }
}

// ─── Batch Processor ─────────────────────────────────────────────────────────

/**
 * Processes messages in parallel batches using Promise.allSettled.
 * Per the sync docs: batch requests are recommended to avoid sequential fetching.
 * We use a concurrency limit of 10 to avoid hitting rate limits.
 */
async function processBatch(
    gmail: any,
    account: any,
    messageIds: Array<{ id: string }>,
    direction?: 'SENT' | 'RECEIVED',
    concurrency = 20,
    sentThreadIds?: Set<string>,
    ignoredSenders?: Set<string>,
    totalMessages?: number,
    processedCount = 0
) {
    for (let i = 0; i < messageIds.length; i += concurrency) {
        // 1. Periodic Status Check for Cancellation
        if (i % (concurrency * 5) === 0) {
            const { data: currentAcc } = await supabase
                .from('gmail_accounts')
                .select('status')
                .eq('id', account.id)
                .single();

            if (currentAcc && currentAcc.status !== 'SYNCING') {
                console.log(`[Sync] Aborting background sync for ${account.email} because status is ${currentAcc.status}`);
                return; // Graceful stop
            }
        }

        const batch = messageIds.slice(i, i + concurrency);
        await Promise.allSettled(
            batch.map((msg) => processSingleMessage(gmail, account, msg.id, direction, sentThreadIds, ignoredSenders))
        );

        // Update progress in DB every batch or two
        if (totalMessages && totalMessages > 0) {
            const currentTotalProcessed = processedCount + i + batch.length;
            const progress = Math.min(Math.round((currentTotalProcessed / totalMessages) * 100), 100);

            // Update DB every 10 batches to avoid over-pressure, or at 100%
            if (i % (concurrency * 10) === 0 || progress === 100) {
                await supabase
                    .from('gmail_accounts')
                    .update({ sync_progress: progress })
                    .eq('id', account.id)
                    .eq('status', 'SYNCING'); // Only update if still in syncing mode
            }
        }

        // Throttle to avoid rate limits
        if (i + concurrency < messageIds.length) {
            await sleep(100);
        }
    }
}

// ─── Gmail Watch (Push Notifications) ────────────────────────────────────────

/**
 * Registers this account for Google Pub/Sub push notifications.
 * Should be called on account connect and renewed every 7 days.
 * Stores the returned historyId for future partial syncs.
 */
export async function startGmailWatch(accountId: string) {
    const { data: account } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

    if (!account || account.connection_method !== 'OAUTH') return;

    const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
    if (!topicName) {
        console.warn('[Watch] GOOGLE_PUBSUB_TOPIC not set. Skipping push notification registration.');
        return;
    }

    const gmail = getGmailClientFromAccount(account);

    try {
        const watchRes = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName,
                // Per labels doc: INBOX for incoming, SENT for outgoing
                labelIds: ['INBOX', 'SENT'],
                labelFilterBehavior: 'INCLUDE',
            },
        });

        await supabase
            .from('gmail_accounts')
            .update({ history_id: watchRes.data.historyId?.toString() })
            .eq('id', accountId);

        console.log(`[Watch] Registered for ${account.email}. historyId: ${watchRes.data.historyId}`);
    } catch (error: any) {
        console.error(`[Watch] Failed for ${account.email}:`, error.message);
    }
}

// ─── Partial Sync (History API) ───────────────────────────────────────────────

/**
 * Triggered by Pub/Sub webhook. Uses history.list to get only changes since
 * the stored historyId — exactly as described in the Gmail sync docs.
 *
 * Per docs:
 * - Filter historyTypes to 'messageAdded' only (no label changes we don't care about)
 * - If 404 or no history_id: fall back to full sync and reset history_id
 */
export async function syncAccountHistory(accountId: string, newHistoryId?: string) {
    const { data: account } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

    if (!account) return;

    // Don't sync if account is paused, disconnected, or in error state
    if (['PAUSED', 'DISCONNECTED', 'ERROR'].includes(account.status)) {
        console.log(`[History Sync] Skipping sync for ${account.email} — status is ${account.status}`);
        return;
    }

    // No stored historyId → must do full sync first
    if (!account.history_id) {
        return syncGmailEmails(accountId);
    }

    const gmail = getGmailClientFromAccount(account);

    try {
        const historyRes = await gmail.users.history.list({
            userId: 'me',
            startHistoryId: account.history_id,
            // Per docs: filter to only new messages, not label changes
            historyTypes: ['messageAdded'],
        });

        const histories = historyRes.data.history || [];

        // Collect all newly added message IDs
        const addedMessageIds: Array<{ id: string }> = [];
        for (const historyItem of histories) {
            for (const msg of historyItem.messagesAdded || []) {
                if (msg.message?.id) {
                    addedMessageIds.push({ id: msg.message.id });
                }
            }
        }

        // Process in parallel batches
        if (addedMessageIds.length > 0) {
            // Reuse the existing gmail client to avoid creating a redundant OAuth client
            // OPTIMIZATION: pre-fetch threads that have SENT messages
            const { data: sentThreads } = await supabase
                .from('email_messages')
                .select('thread_id')
                .eq('gmail_account_id', accountId)
                .eq('direction', 'SENT');
            const sentThreadIds = new Set((sentThreads || []).map((t: any) => t.thread_id));

            // OPTIMIZATION: pre-fetch ignored senders
            const { data: ignoredData } = await supabase.from('ignored_senders').select('email');
            const ignoredSenders = new Set((ignoredData || []).map((i: any) => i.email.toLowerCase()));

            await processBatch(gmail, account, addedMessageIds, undefined, 5, sentThreadIds, ignoredSenders, addedMessageIds.length);
        }

        // Advance stored historyId — only if the new value is greater (prevent regression)
        const newIdToStore = newHistoryId || historyRes.data.historyId || account.history_id;
        const newIdNum = parseInt(newIdToStore?.toString() || '0', 10);
        const currentIdNum = parseInt(account.history_id?.toString() || '0', 10);

        const updateData: any = {
            last_synced_at: new Date().toISOString(),
            sync_progress: 100,
            last_error_message: null,
            last_error_at: null,
            sync_fail_count: 0,
        };
        // Only advance historyId, never regress
        if (newIdNum > currentIdNum) {
            updateData.history_id = newIdToStore?.toString();
        }

        await supabase
            .from('gmail_accounts')
            .update(updateData)
            .eq('id', accountId);

    } catch (error: any) {
        // Per docs: 404 means historyId is too old → fall back to full sync
        if (error.code === 404 || error.status === 404) {
            console.warn(`[History Sync] historyId expired for ${account.email}, running full sync.`);
            // Reset history_id so we don't loop
            await supabase
                .from('gmail_accounts')
                .update({ history_id: null })
                .eq('id', accountId);
            return syncGmailEmails(accountId);
        }
        console.error(`[History Sync] Error:`, error.message);

        if (isAuthError(error)) {
            await supabase.from('gmail_accounts').update({
                status: 'ERROR',
                last_error_message: error?.message || 'Authentication error',
                last_error_at: new Date().toISOString(),
                sync_fail_count: 0,
            }).eq('id', accountId);
        } else {
            const { data: acc } = await supabase.from('gmail_accounts')
                .select('sync_fail_count')
                .eq('id', accountId)
                .single();
            await supabase.from('gmail_accounts').update({
                last_error_message: error?.message || 'Unknown sync error',
                last_error_at: new Date().toISOString(),
                sync_fail_count: (acc?.sync_fail_count || 0) + 1,
            }).eq('id', accountId);
        }
    }
}

// ─── Full Sync (Initial / Fallback) ──────────────────────────────────────────

/**
 * Full synchronization per the Gmail sync docs:
 * 1. messages.list(INBOX) → paginate with nextPageToken → get all IDs
 * 2. messages.list(SENT) → paginate → get all SENT IDs  
 * 3. Batch-fetch full message details (format=FULL) in parallel
 * 4. Store historyId of the first (most recent) message for future partial syncs
 * 5. Register Pub/Sub watch for real-time push
 */
export async function syncGmailEmails(accountId: string) {
    const { data: account, error: accountError } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

    if (accountError || !account) throw new Error('Account not found');
    if (!account.access_token || account.connection_method !== 'OAUTH') {
        throw new Error('Invalid account for Gmail API sync');
    }

    // CONCURRENCY GUARD: Atomic check-and-set to prevent TOCTOU race condition.
    // Only update to SYNCING if currently ACTIVE, and check if the row was actually updated.
    const { data: lockResult, error: lockError } = await supabase
        .from('gmail_accounts')
        .update({ status: 'SYNCING', sync_progress: 0 })
        .eq('id', accountId)
        .eq('status', 'ACTIVE')
        .select('id');

    if (lockError || !lockResult || lockResult.length === 0) {
        console.log(`[Sync] Sync already in progress or account not ACTIVE for ${account.email}. Skipping.`);
        return;
    }

    const gmail = getGmailClientFromAccount(account);

    try {
        // Per Gmail docs: using multiple labelIds in messages.list acts as an AND filter.
        // To get messages from ANY of these, we should use the 'q' parameter.
        const combinedQuery = `in:anywhere`;
        console.log(`[Full Sync] Starting for ${account.email} at ${new Date().toISOString()}`);
        // One broad fetch is much more efficient than separate label fetches
        // 'in:anywhere' includes Inbox, Sent, Drafts, Trash, Spam
        const allMessageIds = await fetchAllMessageIds(gmail, [], 'in:anywhere', 100000);

        console.log(`[Full Sync] Found ${allMessageIds.length} total messages for ${account.email} at ${new Date().toISOString()}`);

        // ── Step 3: Batch process all messages in parallel ────────────────────
        console.log(`[Full Sync] Processing messages in batches...`);

        // OPTIMIZATION: pre-fetch threads that have SENT messages to avoid N+1 queries in handleEmailReceived
        const { data: sentThreads } = await supabase
            .from('email_messages')
            .select('thread_id')
            .eq('gmail_account_id', accountId)
            .eq('direction', 'SENT');

        const sentThreadIds = new Set((sentThreads || []).map((t: any) => t.thread_id));

        // OPTIMIZATION: pre-fetch ignored senders to avoid N queries
        const { data: ignoredData } = await supabase.from('ignored_senders').select('email');
        const ignoredSenders = new Set((ignoredData || [])
            .map((i: any) => i.email?.toLowerCase())
            .filter(Boolean));

        await processBatch(gmail, account, allMessageIds, undefined, 20, sentThreadIds, ignoredSenders, allMessageIds.length);

        // Fetch historyId AFTER processing to avoid stale historyId when messages
        // arrive during a long sync. This ensures the next incremental sync won't miss them.
        let latestHistoryId: string | undefined = undefined;
        try {
            const profile = await gmail.users.getProfile({ userId: 'me' });
            latestHistoryId = profile.data.historyId || undefined;
            console.log(`[Full Sync] Post-sync profile historyId: ${latestHistoryId}`);
        } catch (e) {
            console.warn('[Full Sync] Failed to get latest historyId from profile, partial sync might be delayed.');
        }

        await supabase
            .from('gmail_accounts')
            .update({
                status: 'ACTIVE',
                last_synced_at: new Date().toISOString(),
                history_id: latestHistoryId?.toString(),
                sync_progress: 100,
                last_error_message: null,
                last_error_at: null,
                sync_fail_count: 0,
            })
            .eq('id', accountId);

        console.log(`[Full Sync] Finished processing ${allMessageIds.length} messages at ${new Date().toISOString()}`);
        console.log(`[Full Sync] Complete for ${account.email}. Total messages: ${allMessageIds.length}. historyId: ${latestHistoryId}`);

        // ── Step 6: Register Pub/Sub watch for real-time push ──────────────────
        await startGmailWatch(accountId);

    } catch (error: any) {
        // Log full error details server-side but sanitize what propagates to the client
        console.error(`[SYNC ERROR] ${new Date().toISOString()}: ${error?.message || error}`, error?.stack);

        // Only set status to ERROR if it's a permanent auth failure
        if (isAuthError(error)) {
            await supabase.from('gmail_accounts').update({
                status: 'ERROR',
                last_error_message: error?.message || 'Authentication error',
                last_error_at: new Date().toISOString(),
                sync_fail_count: 0,
            }).eq('id', accountId);
        } else {
            // Revert to ACTIVE so they can retry without re-authenticating
            const { data: acc } = await supabase.from('gmail_accounts')
                .select('sync_fail_count')
                .eq('id', accountId)
                .single();
            await supabase.from('gmail_accounts').update({
                status: 'ACTIVE',
                last_error_message: error?.message || 'Unknown sync error',
                last_error_at: new Date().toISOString(),
                sync_fail_count: (acc?.sync_fail_count || 0) + 1,
            }).eq('id', accountId);
        }
        // Throw sanitized error to avoid leaking internal details
        throw new Error(isAuthError(error) ? 'AUTH_REQUIRED' : 'Email sync failed. Please try again later.');
    }
}

/**
 * Removes SPAM/TRASH labels and adds INBOX label for a Gmail message
 */
export async function unspamGmailMessage(account: any, messageId: string) {
    const gmail = getGmailClientFromAccount(account);

    try {
        await gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: {
                removeLabelIds: ['SPAM', 'TRASH'],
                addLabelIds: ['INBOX'],
            },
        });
        return { success: true };
    } catch (error: any) {
        console.error(`[Gmail] Failed to unspam ${messageId}:`, error.message);
        throw error;
    }
}

