import { google } from 'googleapis';
import { supabase } from '../lib/supabase';
import { handleEmailReceived, handleEmailSent } from './emailSyncLogic';
import { decrypt } from '../utils/encryption';
import { extractTrackingId } from './trackingService';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    maxMessages = 500
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
    sentThreadIds?: Set<string>
) {
    // Deduplication check
    const { data: existing } = await supabase
        .from('email_messages')
        .select('id, body')
        .eq('id', messageId)
        .maybeSingle();

    // If it exists and already has HTML tags, we can safely skip it to save API calls.
    // Otherwise, we re-fetch to upgrade plain text to rich HTML.
    if (existing?.body && (existing.body.includes('<div') || existing.body.includes('<p') || existing.body.includes('<br'))) {
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

        // ─── Smart Filtering ───
        // Skip Socia, Promotions, Updates, and Forums automatically
        const skipLabels = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];
        if (labelIds.some(l => skipLabels.includes(l))) {
            console.log(`[Sync] Skipping message ${messageId} due to category label.`);
            return;
        }

        const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        const from = getHeader('from');
        const senderEmail = (from.match(/<([^>]+)>/)?.[1] || from).toLowerCase();
        const senderDomain = senderEmail.split('@')[1];

        // ─── Aggressive Keyword Filtering ───
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

        // Check if specific sender or a manually ignored item exists
        // We only check for specific email exact matches now to avoid blocking entire client domains
        const { data: isIgnored } = await supabase
            .from('ignored_senders')
            .select('id')
            .eq('email', senderEmail)
            .maybeSingle();

        if (isIgnored) {
            console.log(`[Sync] Skipping ignored sender: ${senderEmail}`);
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
            const tId = extractTrackingId(body);
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
                trackingId: tId || undefined,
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
    concurrency = 2,
    sentThreadIds?: Set<string>
) {
    for (let i = 0; i < messageIds.length; i += concurrency) {
        const batch = messageIds.slice(i, i + concurrency);
        await Promise.allSettled(
            batch.map((msg) => processSingleMessage(gmail, account, msg.id, direction, sentThreadIds))
        );
        // Add a small delay between batches to throttle database load
        if (i + concurrency < messageIds.length) {
            await sleep(500);
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

    const gmail = google.gmail({ version: 'v1', auth: getOAuthClient(account) });

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

    // No stored historyId → must do full sync first
    if (!account.history_id) {
        return syncGmailEmails(accountId);
    }

    const gmail = google.gmail({ version: 'v1', auth: getOAuthClient(account) });

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
            const gmail2 = google.gmail({ version: 'v1', auth: getOAuthClient(account) });

            // OPTIMIZATION: pre-fetch threads that have SENT messages
            const { data: sentThreads } = await supabase
                .from('email_messages')
                .select('thread_id')
                .eq('gmail_account_id', accountId)
                .eq('direction', 'SENT');
            const sentThreadIds = new Set((sentThreads || []).map(t => t.thread_id));

            await processBatch(gmail2, account, addedMessageIds, undefined, 2, sentThreadIds);
        }

        // Advance stored historyId to the new one from the webhook or google's response
        const newIdToStore = newHistoryId || historyRes.data.historyId || account.history_id;
        await supabase
            .from('gmail_accounts')
            .update({
                history_id: newIdToStore?.toString(),
                last_synced_at: new Date().toISOString(),
            })
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

    const gmail = google.gmail({ version: 'v1', auth: getOAuthClient(account) });

    await supabase.from('gmail_accounts').update({ status: 'SYNCING' }).eq('id', accountId);

    try {
        // Per Gmail docs: using multiple labelIds in messages.list acts as an AND filter.
        // To get messages from ANY of these, we should use the 'q' parameter.
        const combinedQuery = `(label:INBOX OR label:SPAM OR label:TRASH)`;
        console.log(`[Full Sync] Starting for ${account.email}, query: ${combinedQuery}`);

        // ── Step 1: Fetch all INBOX/SPAM/TRASH message IDs ──────────
        console.log(`[Full Sync] Fetching received message IDs...`);
        const inboxIds = await fetchAllMessageIds(
            gmail,
            [], // No specific labelIds, use query instead
            combinedQuery,
            500 // Search depth
        );
        console.log(`[Full Sync] Found ${inboxIds.length} received messages`);

        // ── Step 2: Fetch all SENT message IDs ─────────────────────────────────
        console.log(`[Full Sync] Fetching SENT message IDs...`);
        const sentIds = await fetchAllMessageIds(
            gmail,
            ['SENT'],
            '', // No query needed for sent
            200
        );
        console.log(`[Full Sync] Found ${sentIds.length} SENT messages`);

        // ── Step 3: Store historyId from the most recent message ────────────────
        // Per docs: "store the historyId of the most recent message (first in list)"
        if (inboxIds.length > 0 || sentIds.length > 0) {
            // Fetch historyId by getting the first (most recent) message metadata
            const firstId = inboxIds[0]?.id || sentIds[0]?.id;
            if (firstId) {
                try {
                    const firstMsg = await gmail.users.messages.get({
                        userId: 'me',
                        id: firstId,
                        format: 'minimal', // Only need metadata for historyId
                    });
                    const historyId = firstMsg.data.historyId;
                    if (historyId) {
                        await supabase
                            .from('gmail_accounts')
                            .update({ history_id: historyId.toString() })
                            .eq('id', accountId);
                        console.log(`[Full Sync] Stored historyId: ${historyId}`);
                    }
                } catch {
                    // Non-critical — continue
                }
            }
        }

        // ── Step 4: Batch process INBOX messages in parallel ────────────────────
        console.log(`[Full Sync] Processing INBOX messages in batches...`);

        // OPTIMIZATION: pre-fetch threads that have SENT messages to avoid N+1 queries in handleEmailReceived
        const { data: sentThreads } = await supabase
            .from('email_messages')
            .select('thread_id')
            .eq('gmail_account_id', accountId)
            .eq('direction', 'SENT');

        const sentThreadIds = new Set((sentThreads || []).map(t => t.thread_id));

        await processBatch(gmail, account, inboxIds, undefined, 2, sentThreadIds);

        // ── Step 5: Batch process SENT messages in parallel ─────────────────────
        console.log(`[Full Sync] Processing SENT messages in batches...`);
        await processBatch(gmail, account, sentIds, 'SENT', 2);

        await supabase
            .from('gmail_accounts')
            .update({ status: 'ACTIVE', last_synced_at: new Date().toISOString() })
            .eq('id', accountId);

        console.log(`[Full Sync] Complete for ${account.email}. Inbox: ${inboxIds.length}, Sent: ${sentIds.length}`);

        // ── Step 6: Register Pub/Sub watch for real-time push ──────────────────
        await startGmailWatch(accountId);

    } catch (error: any) {
        console.error('[Full Sync] Error:', error?.message || error);
        await supabase.from('gmail_accounts').update({ status: 'ERROR' }).eq('id', accountId);
        throw error;
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

