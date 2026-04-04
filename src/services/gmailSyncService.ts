import 'server-only';
import { google } from 'googleapis';
import { supabase } from '../lib/supabase';
import { handleEmailReceived, handleEmailSent } from './emailSyncLogic';
import { decrypt } from '../utils/encryption';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isAuthError(error: any) {
    const msg = error?.message?.toLowerCase() || '';
    return msg.includes('invalid_grant') ||
        msg.includes('invalid_token') ||
        error.code === 401 ||
        error.status === 401 ||
        (error.code === 403 && msg.includes('unauthorized'));
}

// ─── OAuth Client ─────────────────────────────────────────────────────────────

function getOAuthClient(account: any) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    let refreshToken = account.refresh_token;
    if (refreshToken && refreshToken.includes(':')) {
        try {
            refreshToken = decrypt(refreshToken);
        } catch (e) {
            console.error('Failed to decrypt refresh token:', e);
        }
    }

    oauth2Client.setCredentials({
        access_token: account.access_token,
        refresh_token: refreshToken,
    });

    // Automatically save new access tokens when googleapis refreshes them
    oauth2Client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
            console.log(`[OAuth] Auto-refreshing access token for account ${account.email}`);
            await supabase
                .from('gmail_accounts')
                .update({ access_token: tokens.access_token })
                .eq('id', account.id);
        }
    });

    return oauth2Client;
}

// ─── Body Extractor ───────────────────────────────────────────────────────────

/**
 * Recursively walks a Gmail message payload to find text/plain or text/html body.
 * Falls back to snippet if no body found.
 */
function getMessageBody(payload: any): string {
    if (!payload) return '';

    let htmlBody = '';
    let textBody = '';
    const attachments: any[] = [];

    function walk(part: any) {
        if (part.parts) {
            part.parts.forEach(walk);
        }

        if (part.body?.attachmentId) {
            attachments.push({
                id: part.body.attachmentId,
                filename: part.filename,
                mimeType: part.mimeType,
                size: part.body.size
            });
        }

        if (part.mimeType === 'text/html' && part.body?.data) {
            htmlBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/plain' && part.body?.data) {
            textBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
    }

    walk(payload);

    let result = htmlBody || textBody || '';

    // If no body found in parts, check root body
    if (!result && payload.body?.data) {
        result = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    // Strip unnecessary HTML bloat to save database storage
    if (result.length > 0) {
        // Remove HTML comments (except our ATTACHMENTS marker)
        result = result.replace(/<!--(?!\s*ATTACHMENTS:)[\s\S]*?-->/g, '');
        // Remove excessive whitespace
        result = result.replace(/\n\s*\n\s*\n/g, '\n\n');
        // Cap at 100KB to prevent massive marketing emails from bloating the DB
        if (result.length > 100000) {
            result = result.substring(0, 100000);
        }
    }

    // Append metadata for UI
    if (attachments.length > 0) {
        result += `\n<!-- ATTACHMENTS: ${JSON.stringify(attachments)} -->`;
    }

    return result;
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
        .select('id, body, gmail_account_id')
        .eq('id', messageId)
        .maybeSingle();

    // If it exists and already has the CORRECT account ID and rich body, we skip.
    // Optimization: we only skip if it's already linked to THIS account.
    // If gmail_account_id is NULL (orphaned email from a delete), we MUST continue to re-link it.
    if (existing?.gmail_account_id === account.id &&
        existing?.body &&
        (existing.body.includes('<div') || existing.body.includes('<p') || existing.body.includes('<br'))) {
        return;
    }

    try {
        // Per docs: use format=FULL for initial fetch, format=MINIMAL for already-cached
        const detailRes = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
        });

        const detail = detailRes.data;
        const headers: Array<{ name: string; value: string }> = detail.payload?.headers || [];
        const labelIds: string[] = detail.labelIds || [];

        // ─── Filtering ───
        // Skip Gmail categories: Promotions, Social, Updates, Forums
        const skipLabels = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];
        if (labelIds.some(l => skipLabels.includes(l))) {
            return;
        }

        const getHeader = (name: string) =>
            headers.find((h) => h.name && h.name.toLowerCase() === name.toLowerCase())?.value || '';

        const from = getHeader('from') || '';
        const senderEmail = (from.match(/<([^>]+)>/)?.[1] || from || '').toLowerCase();
        const senderDomain = senderEmail.split('@')[1] || '';

        // Skip junk sender domains (security, social media, automated)
        const blockedDomains = [
            'facebookmail.com', 'facebook.com', 'mail.instagram.com', 'instagram.com',
            'twitter.com', 'x.com', 'linkedin.com', 'linkedinmail.com',
            'youtube.com', 'accounts.google.com', 'foodpanda.com', 'foodpanda.pk',
        ];
        if (blockedDomains.some(d => senderDomain.endsWith(d))) {
            return;
        }

        // Skip noreply/no-reply/donotreply senders (automated notifications)
        const senderLocal = senderEmail.split('@')[0] || '';
        if (['noreply', 'no-reply', 'donotreply', 'do-not-reply'].includes(senderLocal)) {
            return;
        }

        // Check if specific sender is in our ignored list
        // NEVER skip if it's from the account user themselves (otherwise SENT mail is lost)
        if (ignoredSenders?.has(senderEmail) && senderEmail !== account.email.toLowerCase()) {
            return;
        }

        const to = getHeader('to');
        const subject = getHeader('subject') || '(No Subject)';
        const dateStr = getHeader('date');
        const body = getMessageBody(detail.payload) || detail.snippet || '';

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

            if (currentAcc && !['SYNCING', 'ACTIVE'].includes(currentAcc.status)) {
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
export async function startGmailWatch(accountId: string): Promise<{
    success: boolean;
    expiry?: Date;
    error?: string;
}> {
    const { data: account } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

    if (!account || account.connection_method !== 'OAUTH') {
        return { success: false, error: 'Account not found or not OAuth' };
    }

    const HARDCODED_TOPIC = 'projects/my-unibox/topics/gmail-push';
    const rawEnv = process.env.GOOGLE_PUBSUB_TOPIC;
    const topicName = (rawEnv?.trim() || HARDCODED_TOPIC);

    console.warn(`[Watch] Topic debug — env raw: "${rawEnv}" (len=${rawEnv?.length}), resolved: "${topicName}" (len=${topicName.length})`);

    const gmail = google.gmail({ version: 'v1', auth: getOAuthClient(account) });

    try {
        const watchRes = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName,
                labelIds: ['INBOX', 'SENT'],
                labelFilterBehavior: 'INCLUDE',
            },
        });

        // Gmail watch expires in 7 days — save exact expiry
        const expiry = watchRes.data.expiration
            ? new Date(parseInt(String(watchRes.data.expiration)))
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Only set history_id if the account doesn't already have one.
        // Overwriting an existing history_id would cause partial sync to miss
        // messages between the old and new history_id.
        const updateData: Record<string, unknown> = {
            watch_expiry: expiry.toISOString(),
            watch_status: 'ACTIVE',
        };
        if (!account.history_id) {
            updateData.history_id = watchRes.data.historyId?.toString();
        }

        await supabase
            .from('gmail_accounts')
            .update(updateData)
            .eq('id', accountId);

        console.warn(`[Watch] Registered for ${account.email}. watchHistoryId: ${watchRes.data.historyId}, existingHistoryId: ${account.history_id || 'none'}, expires: ${expiry.toISOString()}`);
        return { success: true, expiry };
    } catch (error: any) {
        console.error(`[Watch] Failed for ${account.email}. topicName used: "${topicName}". Error:`, error.message);

        await supabase
            .from('gmail_accounts')
            .update({ watch_status: 'ERROR' })
            .eq('id', accountId);

        return { success: false, error: error.message };
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

    const gmail = google.gmail({ version: 'v1', auth: getOAuthClient(account) });

    try {
        const historyRes = await gmail.users.history.list({
            userId: 'me',
            startHistoryId: account.history_id,
            historyTypes: ['messageAdded'],
        });

        const histories = historyRes.data.history || [];

        // Collect unique message IDs (dedup — history can report same message multiple times)
        const seenIds = new Set<string>();
        const addedMessageIds: string[] = [];
        for (const historyItem of histories) {
            for (const msg of historyItem.messagesAdded || []) {
                if (msg.message?.id && !seenIds.has(msg.message.id)) {
                    seenIds.add(msg.message.id);
                    addedMessageIds.push(msg.message.id);
                }
            }
        }

        // Skip if nothing new — just update last_synced_at
        if (addedMessageIds.length === 0) {
            await supabase.from('gmail_accounts')
                .update({ last_synced_at: new Date().toISOString() })
                .eq('id', accountId);
            return;
        }

        console.log(`[History Sync] ${account.email}: ${addedMessageIds.length} new messages`);

        // Pre-check which messages already exist in DB (skip re-processing)
        const { data: existingMsgs } = await supabase
            .from('email_messages')
            .select('id')
            .in('id', addedMessageIds.slice(0, 100));
        const existingIds = new Set((existingMsgs || []).map((m: any) => m.id));
        const newIds = addedMessageIds.filter(id => !existingIds.has(id));

        if (newIds.length === 0) {
            // All already synced — just advance historyId
            const newIdToStore = newHistoryId || historyRes.data.historyId || account.history_id;
            await supabase.from('gmail_accounts')
                .update({ history_id: newIdToStore?.toString(), last_synced_at: new Date().toISOString() })
                .eq('id', accountId);
            return;
        }

        // Fetch all new messages from Gmail in parallel (fast)
        const fetchResults = await Promise.allSettled(
            newIds.slice(0, 50).map(id =>
                gmail.users.messages.get({ userId: 'me', id, format: 'full' })
                    .then((res: any) => res.data)
            )
        );

        // Filter out "not found" (deleted/draft messages) — these are normal
        const messages = fetchResults
            .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
            .map(r => r.value);

        // Process each message through the existing sync logic
        for (const detail of messages) {
            try {
                const headers: Array<{ name: string; value: string }> = detail.payload?.headers || [];
                const labelIds: string[] = detail.labelIds || [];

                // Skip Gmail categories
                const skipLabels = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];
                if (labelIds.some((l: string) => skipLabels.includes(l))) continue;

                const getHeader = (name: string) =>
                    headers.find((h) => h.name && h.name.toLowerCase() === name.toLowerCase())?.value || '';

                const from = getHeader('from');
                const senderEmail = (from.match(/<([^>]+)>/)?.[1] || from || '').toLowerCase();
                const senderDomain = senderEmail.split('@')[1] || '';

                // Skip blocked domains
                const blockedDomains = [
                    'facebookmail.com', 'facebook.com', 'mail.instagram.com', 'instagram.com',
                    'twitter.com', 'x.com', 'linkedin.com', 'linkedinmail.com',
                    'youtube.com', 'accounts.google.com', 'foodpanda.com', 'foodpanda.pk',
                ];
                if (blockedDomains.some(d => senderDomain.endsWith(d))) continue;

                // Skip noreply
                const senderLocal = senderEmail.split('@')[0] || '';
                if (['noreply', 'no-reply', 'donotreply', 'do-not-reply'].includes(senderLocal)) continue;

                const to = getHeader('to');
                const subject = getHeader('subject') || '(No Subject)';
                const dateStr = getHeader('date');
                const body = getMessageBody(detail.payload) || detail.snippet || '';
                const isSent = labelIds.includes('SENT');
                const isUnread = labelIds.includes('UNREAD');
                const parsedDate = dateStr ? new Date(dateStr) : new Date();

                if (isSent) {
                    await handleEmailSent({
                        gmailAccountId: account.id,
                        threadId: detail.threadId || '',
                        messageId: detail.id || '',
                        fromEmail: from, toEmail: to, subject, body,
                        isUnread, sentAt: parsedDate,
                    });
                } else {
                    await handleEmailReceived({
                        gmailAccountId: account.id,
                        threadId: detail.threadId || '',
                        messageId: detail.id || '',
                        fromEmail: from, toEmail: to || account.email, subject, body,
                        isUnread, receivedAt: parsedDate,
                        isSpam: labelIds.includes('SPAM'),
                    });
                }
            } catch (e: any) {
                // Log but don't fail the whole sync
                console.error(`[History Sync] Message ${detail.id}:`, e?.message?.slice(0, 80));
            }
        }

        // Only advance historyId AFTER all messages are processed
        const newIdToStore = newHistoryId || historyRes.data.historyId || account.history_id;
        const newIdNum = parseInt(newIdToStore?.toString() || '0', 10);
        const currentIdNum = parseInt(account.history_id?.toString() || '0', 10);

        const updateData: any = { last_synced_at: new Date().toISOString(), sync_progress: 100 };
        if (newIdNum > currentIdNum) {
            updateData.history_id = newIdToStore?.toString();
        }

        await supabase.from('gmail_accounts').update(updateData).eq('id', accountId);

        console.log(`[History Sync] ${account.email}: synced ${messages.length} messages`);

    } catch (error: any) {
        if (error.code === 404 || error.status === 404) {
            console.warn(`[History Sync] historyId expired for ${account.email}, running full sync.`);
            await supabase.from('gmail_accounts')
                .update({ history_id: null })
                .eq('id', accountId);
            return syncGmailEmails(accountId);
        }
        console.error(`[History Sync] Error:`, error.message);
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
    if (['ERROR', 'DISCONNECTED', 'PAUSED'].includes(account.status)) {
        console.error(`[Full Sync] Skipping ${account.email} — status is ${account.status}`);
        return;
    }
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
        // Check for stale SYNCING state — if stuck for > 5 minutes, force-recover
        if (account.status === 'SYNCING') {
            const lastSync = account.last_synced_at ? new Date(account.last_synced_at).getTime() : 0;
            const staleMins = (Date.now() - lastSync) / 60000;
            if (staleMins > 5) {
                console.warn(`[Sync] Recovering stale SYNCING state for ${account.email} (${Math.round(staleMins)}min stale)`);
                await supabase
                    .from('gmail_accounts')
                    .update({ status: 'ACTIVE' })
                    .eq('id', accountId)
                    .eq('status', 'SYNCING');
                // Re-attempt the lock after recovery
                const { data: retryLock } = await supabase
                    .from('gmail_accounts')
                    .update({ status: 'SYNCING', sync_progress: 0 })
                    .eq('id', accountId)
                    .eq('status', 'ACTIVE')
                    .select('id');
                if (!retryLock || retryLock.length === 0) {
                    console.log(`[Sync] Could not acquire lock after recovery for ${account.email}. Skipping.`);
                    return;
                }
            } else {
                console.log(`[Sync] Sync already in progress for ${account.email} (${Math.round(staleMins)}min). Skipping.`);
                return;
            }
        } else {
            console.log(`[Sync] Account not ACTIVE for ${account.email} (status: ${account.status}). Skipping.`);
            return;
        }
    }

    const gmail = google.gmail({ version: 'v1', auth: getOAuthClient(account) });

    try {
        console.log(`[Full Sync] Starting for ${account.email} at ${new Date().toISOString()}`);

        // OPTIMIZATION: pre-fetch threads that have SENT messages to avoid N+1 queries
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

        // ── Page-by-page sync: fetch one page of IDs, process, checkpoint, repeat ──
        // This makes full sync resumable — if interrupted, deduplication check in
        // processSingleMessage means already-synced messages are skipped on retry.
        let pageToken: string | undefined = undefined;
        let totalProcessed = 0;
        const PAGE_SIZE = 500; // Gmail max per page

        do {
            const res: any = await gmail.users.messages.list({
                userId: 'me',
                q: 'in:anywhere',
                maxResults: PAGE_SIZE,
                ...(pageToken ? { pageToken } : {}),
            });

            const messages: Array<{ id: string; threadId?: string }> = res.data.messages || [];
            if (messages.length === 0) break;

            await processBatch(gmail, account, messages, undefined, 20, sentThreadIds, ignoredSenders, res.data.resultSizeEstimate || 10000, totalProcessed);
            totalProcessed += messages.length;

            // Checkpoint progress after each page — saves last_synced_at so stale
            // detection works correctly, and sync_progress for UI feedback
            const estimatedTotal = res.data.resultSizeEstimate || totalProcessed;
            const progress = Math.min(Math.round((totalProcessed / estimatedTotal) * 100), 99);
            await supabase
                .from('gmail_accounts')
                .update({ sync_progress: progress, last_synced_at: new Date().toISOString() })
                .eq('id', accountId);

            console.log(`[Full Sync] ${account.email}: processed ${totalProcessed} messages (${progress}%)`);

            pageToken = res.data.nextPageToken;
        } while (pageToken);

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
                sync_progress: 100
            })
            .eq('id', accountId);

        console.log(`[Full Sync] Complete for ${account.email}. Total: ${totalProcessed} messages. historyId: ${latestHistoryId}`);

        // Register Pub/Sub watch for real-time push
        await startGmailWatch(accountId);

    } catch (error: any) {
        console.error(`[SYNC ERROR] ${new Date().toISOString()}: ${error?.message || error}`, error?.stack);

        if (isAuthError(error)) {
            await supabase.from('gmail_accounts').update({
                status: 'ERROR',
                last_error_message: error?.message?.slice(0, 200) || 'Auth error',
            }).eq('id', accountId);
        } else {
            // Revert to ACTIVE so they can retry — deduplication ensures already-synced
            // messages are skipped, making retry safe and resumable
            await supabase.from('gmail_accounts').update({
                status: 'ACTIVE',
                last_error_message: error?.message?.slice(0, 200) || 'Sync error',
            }).eq('id', accountId);
        }
        throw new Error(isAuthError(error) ? 'AUTH_REQUIRED' : 'Email sync failed. Please try again later.');
    }
}

/**
 * Removes SPAM/TRASH labels and adds INBOX label for a Gmail message
 */
export async function unspamGmailMessage(account: any, messageId: string) {
    const gmail = google.gmail({ version: 'v1', auth: getOAuthClient(account) });

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

