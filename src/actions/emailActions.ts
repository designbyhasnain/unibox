'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '../lib/supabase';
import { sendGmailEmail } from '../services/gmailSenderService';
import { sendManualEmail, unspamManualMessage } from '../services/manualEmailService';
import { unspamGmailMessage } from '../services/gmailSyncService';
import { prepareTrackedEmail } from '../services/trackingService';
import { normalizeEmail } from '../utils/emailNormalizer';
import { buildAccountMap } from '../utils/accountHelpers';
import { buildThreadRepliesMap } from '../utils/threadHelpers';
import { transformEmailRow, transformJoinedEmailRow } from '../utils/emailTransformers';
import { clampPageSize } from '../utils/pagination';
import { PAGINATION } from '../constants/limits';

const PAGE_SIZE = PAGINATION.DEFAULT_PAGE_SIZE;

/**
 * Escape special characters for ILIKE patterns to prevent SQL injection.
 * Characters %, _, and \ have special meaning in ILIKE and must be escaped.
 */
function escapeIlike(str: string): string {
    return str.replace(/[%_\\]/g, '\\$&');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaginatedEmailResult = {
    emails: any[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    error?: boolean;
};

// ─── Send Email ───────────────────────────────────────────────────────────────

export async function sendEmailAction(params: {
    accountId: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    threadId?: string;
    isTracked?: boolean;
}) {
    try {
        // Input validation
        if (!params.accountId || !params.to || !params.subject) {
            return { success: false, error: 'accountId, to, and subject are required' };
        }

        const { data: account, error: accError } = await supabase
            .from('gmail_accounts')
            .select('connection_method, sent_count_today, last_send_date')
            .eq('id', params.accountId)
            .single();

        if (accError || !account) {
            throw new Error('Sender account not found.');
        }

        // Reset sent_count_today if last_send_date is not today
        const todayStr = new Date().toISOString().split('T')[0];
        if (account.last_send_date !== todayStr) {
            account.sent_count_today = 0;
        }

        // Inject tracking pixel and wrap links
        const isTracked = params.isTracked !== false; // default true
        const { body: trackedBody, trackingId } = prepareTrackedEmail(params.body, isTracked);
        const sendParams = { ...params, body: trackedBody };

        let result: { success: boolean; messageId?: string | null | undefined; threadId?: string | null | undefined; error?: string };
        if (account.connection_method === 'MANUAL') {
            result = await sendManualEmail(sendParams);
        } else {
            result = await sendGmailEmail(sendParams);
        }

        // Increment sent count and save tracking_id on success
        if (result && result.success) {
            // Use atomic increment via RPC to avoid read-modify-write race condition
            const { error: rpcError } = await supabase.rpc('increment_sent_count', { p_account_id: params.accountId });
            if (rpcError) {
                // Fallback to non-atomic increment if RPC doesn't exist yet
                console.warn('increment_sent_count RPC not available, falling back:', rpcError.message);
                const newCount = (account.sent_count_today || 0) + 1;
                await supabase
                    .from('gmail_accounts')
                    .update({ sent_count_today: newCount, last_send_date: todayStr })
                    .eq('id', params.accountId);
            } else {
                // Also update last_send_date for the RPC path
                await supabase
                    .from('gmail_accounts')
                    .update({ last_send_date: todayStr })
                    .eq('id', params.accountId);
            }

            // Update only tracking-specific fields on the message already created by handleEmailSent.
            // This avoids a full upsert that would overwrite contact_id and pipeline_stage.
            if (result.messageId) {
                const cleanMsgId = result.messageId.replace(/[<>]/g, '');

                await supabase
                    .from('email_messages')
                    .update({
                        is_tracked: isTracked,
                        tracking_id: isTracked ? trackingId : null,
                        opens_count: 0,
                        body: trackedBody, // Update body to include tracking pixel
                    })
                    .eq('id', cleanMsgId);
            }
        }

        revalidatePath('/');
        return { ...result, trackingId: isTracked ? trackingId : undefined };
    } catch (error: any) {
        console.error('[emailActions] sendEmailAction error:', error);
        return {
            success: false,
            error: error.message === 'AUTH_REQUIRED'
                ? 'AUTH_REQUIRED'
                : 'An error occurred while processing your request',
        };
    }
}


// ─── Get Account IDs for a user ───────────────────────────────────────────────

async function getAccountIds(userId: string): Promise<string[] | null> {
    const { data: accounts, error } = await supabase
        .from('gmail_accounts')
        .select('id')
        .eq('user_id', userId);

    if (error || !accounts || accounts.length === 0) return null;
    return accounts.map((a) => a.id);
}

// ─── Resolve account IDs from user + optional filter ──────────────────────────

async function resolveAccountIds(userId: string, gmailAccountId?: string): Promise<string[] | null> {
    if (gmailAccountId && gmailAccountId !== 'ALL') {
        return [gmailAccountId];
    }
    return getAccountIds(userId);
}

// ─── Inbox Emails (DB-level thread grouping via RPC) ──────────────────────────

export async function getInboxEmailsAction(
    userId: string,
    page = 1,
    pageSize = PAGE_SIZE,
    stage: string = 'ALL',
    gmailAccountId?: string
): Promise<PaginatedEmailResult> {
    // Clamp pageSize to prevent unbounded queries
    const clampedPageSize = clampPageSize(pageSize);
    const empty: PaginatedEmailResult = { emails: [], totalCount: 0, page, pageSize: clampedPageSize, totalPages: 0 };

    if (!userId) return empty;

    const accountIds = await resolveAccountIds(userId, gmailAccountId);
    if (!accountIds || accountIds.length === 0) return empty;

    const { data, error } = await supabase.rpc('get_inbox_threads', {
        p_account_ids: accountIds,
        p_pipeline_stage: stage === 'ALL' || stage === 'SPAM' ? null : stage,
        p_page: page,
        p_page_size: clampedPageSize,
        p_is_spam: stage === 'SPAM',
    });

    if (error) {
        console.error('[getInboxEmailsAction] RPC error:', error);
        return { ...empty, error: true };
    }


    const rows = data as any[];
    if (!rows || rows.length === 0) return empty;

    const totalCount = Number(rows[0].total_count ?? 0);
    const totalPages = Math.ceil(totalCount / clampedPageSize);

    // Enrich row shape to match what frontend expects
    // Parallelize independent queries for account info and thread replies
    const threadIds = Array.from(new Set(rows.map(r => r.thread_id).filter(Boolean)));
    const [accountMap, threadRepliesMap] = await Promise.all([
        buildAccountMap(accountIds, supabase),
        buildThreadRepliesMap(threadIds, supabase),
    ]);

    const stageOverride = stage === 'SPAM' ? { pipeline_stage: 'SPAM' } : undefined;
    const emails = rows.map((r) => transformEmailRow(r, accountMap, threadRepliesMap, stageOverride));

    return { emails, totalCount, page, pageSize: clampedPageSize, totalPages };
}

// ─── Sent Emails (DB-level thread grouping via RPC) ───────────────────────────

export async function getSentEmailsAction(
    userId: string,
    page = 1,
    pageSize = PAGE_SIZE,
    gmailAccountId?: string
): Promise<PaginatedEmailResult> {
    const clampedPageSize = clampPageSize(pageSize);
    const empty: PaginatedEmailResult = { emails: [], totalCount: 0, page, pageSize: clampedPageSize, totalPages: 0 };

    if (!userId) return empty;

    const accountIds = await resolveAccountIds(userId, gmailAccountId);
    if (!accountIds || accountIds.length === 0) return empty;

    const { data, error } = await supabase.rpc('get_sent_threads', {
        p_account_ids: accountIds,
        p_page: page,
        p_page_size: clampedPageSize,
    });

    if (error) {
        console.error('getSentEmailsAction RPC error:', error);
        return { ...empty, error: true };
    }

    const rows = data as any[];
    if (!rows || rows.length === 0) return empty;

    const totalCount = Number(rows[0].total_count ?? 0);
    const totalPages = Math.ceil(totalCount / clampedPageSize);

    // Parallelize independent queries for account info and thread replies
    const threadIds = Array.from(new Set(rows.map(r => r.thread_id).filter(Boolean)));
    const [accountMap, threadRepliesMap] = await Promise.all([
        buildAccountMap(accountIds, supabase),
        buildThreadRepliesMap(threadIds, supabase),
    ]);

    const emails = rows.map((r) => transformEmailRow(r, accountMap, threadRepliesMap));

    return { emails, totalCount, page, pageSize: clampedPageSize, totalPages };
}

// ─── Client Emails ────────────────────────────────────────────────────────────

export async function markClientEmailsAsReadAction(clientEmail: string) {
    if (!clientEmail || typeof clientEmail !== 'string') return { success: false };

    const normalizedEmail_ = normalizeEmail(clientEmail);
    const { data: messages } = await supabase
        .from('email_messages')
        .select('id')
        .or(`from_email.ilike.%${escapeIlike(normalizedEmail_)}%,to_email.ilike.%${escapeIlike(normalizedEmail_)}%`)
        .eq('is_unread', true)
        .limit(500);

    if (messages && messages.length > 0) {
        const ids = messages.map(m => m.id);
        return await bulkMarkAsReadAction(ids);
    }

    revalidatePath('/');
    return { success: true };
}

export async function getClientEmailsAction(params: {
    clientEmail: string;
    accountIds: string[];
    page?: number;
    pageSize?: number;
}): Promise<{ success: boolean; emails: any[]; total: number; page: number; pageSize: number }>;
// Legacy overload for backward compatibility (returns plain array)
export async function getClientEmailsAction(
    userId: string,
    targetEmail: string,
    gmailAccountId?: string
): Promise<any[]>;
export async function getClientEmailsAction(
    userIdOrParams: string | { clientEmail: string; accountIds: string[]; page?: number; pageSize?: number },
    targetEmail?: string,
    gmailAccountId?: string
): Promise<any[] | { success: boolean; emails: any[]; total: number; page: number; pageSize: number }> {
    // Normalize arguments: support both old positional and new object style
    const isLegacy = typeof userIdOrParams === 'string';
    let clientEmail: string;
    let accountIds: string[];
    let page: number;
    let pageSize: number;

    if (!isLegacy) {
        const params = userIdOrParams as { clientEmail: string; accountIds: string[]; page?: number; pageSize?: number };
        clientEmail = params.clientEmail;
        accountIds = params.accountIds;
        page = params.page || 1;
        pageSize = Math.min(params.pageSize || 50, 100); // Cap at 100
    } else {
        // Legacy call: getClientEmailsAction(userId, targetEmail, gmailAccountId?)
        const userId = userIdOrParams;
        if (!userId || !targetEmail) return [];

        clientEmail = targetEmail;
        const resolved = await resolveAccountIds(userId, gmailAccountId);
        if (!resolved || resolved.length === 0) return [];
        accountIds = resolved;
        page = 1;
        pageSize = 50;
    }

    if (!clientEmail || !accountIds || accountIds.length === 0) {
        return isLegacy ? [] : { success: true, emails: [], total: 0, page, pageSize };
    }

    const normalizedTarget = normalizeEmail(clientEmail);
    const offset = (page - 1) * pageSize;

    const { data: messages, error, count } = await supabase
        .from('email_messages')
        .select(`
            id, thread_id, from_email, to_email, subject,
            snippet, direction, sent_at, is_unread, pipeline_stage,
            gmail_account_id,
            gmail_accounts ( email, users ( name ) )
        `, { count: 'exact' })
        .in('gmail_account_id', accountIds)
        .or(`from_email.ilike.%${escapeIlike(normalizedTarget)}%,to_email.ilike.%${escapeIlike(normalizedTarget)}%`)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .range(offset, offset + pageSize - 1);

    if (error) {
        console.error('[emailActions] getClientEmailsAction error:', error);
        return isLegacy ? [] : { success: false, emails: [], total: 0, page, pageSize };
    }

    // Group by thread_id to mimic Gmail's conversation list view
    const threadMap = new Map();
    const groupedMessages: any[] = [];

    for (const m of (messages || [])) {
        if (!threadMap.has(m.thread_id)) {
            threadMap.set(m.thread_id, true);
            groupedMessages.push(transformJoinedEmailRow(m));
        }
    }

    // Legacy callers expect a plain array; new callers get paginated response
    if (isLegacy) {
        return groupedMessages;
    }
    return { success: true, emails: groupedMessages, total: count ?? 0, page, pageSize };
}

// ─── Mark Email As Read ───────────────────────────────────────────────────────

export async function markEmailAsReadAction(messageId: string) {
    if (!messageId) return { success: false };
    const { error } = await supabase
        .from('email_messages')
        .update({ is_unread: false })
        .eq('id', messageId);

    if (error) {
        console.error('markEmailAsReadAction error:', error);
        return { success: false };
    }
    revalidatePath('/');
    return { success: true };
}

export async function markEmailAsUnreadAction(messageId: string) {
    if (!messageId) return { success: false };
    const { error } = await supabase
        .from('email_messages')
        .update({ is_unread: true })
        .eq('id', messageId);

    if (error) {
        console.error('markEmailAsUnreadAction error:', error);
        return { success: false };
    }
    revalidatePath('/');
    return { success: true };
}

export async function bulkMarkAsReadAction(messageIds: string[]) {
    if (!messageIds || messageIds.length === 0) return { success: true };

    const { error } = await supabase
        .from('email_messages')
        .update({ is_unread: false })
        .in('id', messageIds);

    if (error) {
        console.error('bulkMarkAsReadAction error:', error);
        return { success: false };
    }
    revalidatePath('/');
    return { success: true };
}

export async function bulkMarkAsUnreadAction(messageIds: string[]) {
    if (!messageIds || messageIds.length === 0) return { success: true };

    const { error } = await supabase
        .from('email_messages')
        .update({ is_unread: true })
        .in('id', messageIds);

    if (error) {
        console.error('bulkMarkAsUnreadAction error:', error);
        return { success: false };
    }
    revalidatePath('/');
    return { success: true };
}

// ─── Update Pipeline Stage ────────────────────────────────────────────────────

export async function updateEmailStageAction(messageId: string, stage: string) {
    if (!messageId || !stage) return { success: false };

    // 1. Fetch the email to get the sender details
    const { data: emailMsg } = await supabase
        .from('email_messages')
        .select('*')
        .eq('id', messageId)
        .single();

    if (!emailMsg) return { success: false };

    // 2. Extract the clean email address and normalize
    const rawEmail = emailMsg.direction === 'RECEIVED' ? emailMsg.from_email : emailMsg.to_email;
    const actualEmail = normalizeEmail(rawEmail || '');

    let contactId = emailMsg.contact_id;

    if (!contactId && actualEmail) {
        // Try to find if contact already exists
        let { data: contact } = await supabase
            .from('contacts')
            .select('*')
            .eq('email', actualEmail)
            .maybeSingle();

        if (!contact) {
            // Create a new contact so they appear in Clients page
            const nameMatch = rawEmail?.split('<')[0]?.trim()?.replace(/"/g, '');
            const finalName = nameMatch && nameMatch !== actualEmail ? nameMatch : actualEmail.split('@')[0];

            const { data: newContact } = await supabase
                .from('contacts')
                .insert({
                    email: actualEmail,
                    name: finalName || null,
                    is_lead: true,
                    is_client: true,
                    pipeline_stage: stage
                })
                .select()
                .single();
            contact = newContact;
        } else {
            // Promote existing contact to lead
            await supabase
                .from('contacts')
                .update({ is_lead: true, is_client: true, pipeline_stage: stage })
                .eq('id', contact.id);
        }

        if (contact) {
            contactId = contact.id;
            // Also link the email message to this newly found/created contact
            await supabase.from('email_messages').update({ contact_id: contactId }).eq('id', messageId);

            // Link all other unlinked emails from this sender too
            if (emailMsg.direction === 'RECEIVED') {
                await supabase.from('email_messages').update({ contact_id: contactId }).eq('from_email', rawEmail).is('contact_id', null);
            }
        }
    } else if (contactId) {
        // Contact exists and is linked, update its stage to match
        await supabase
            .from('contacts')
            .update({ is_lead: true, is_client: true, pipeline_stage: stage })
            .eq('id', contactId);
    }

    // 3. Update the pipeline stage on ALL messages from this contact/email
    // This handles the user request: "all emails of this address follow the tag"
    const { error } = await supabase
        .from('email_messages')
        .update({ pipeline_stage: stage })
        .or(`id.eq.${messageId}${contactId ? `,contact_id.eq.${contactId}` : ''}${actualEmail ? `,from_email.ilike.%${escapeIlike(actualEmail)}%,to_email.ilike.%${escapeIlike(actualEmail)}%` : ''}`);

    if (error) {
        console.error('updateEmailStageAction error:', error);
        return { success: false };
    }

    // 4. Remove from ignored_senders if moving out of NOT_INTERESTED
    if (stage !== 'NOT_INTERESTED' && actualEmail) {
        await supabase
            .from('ignored_senders')
            .delete()
            .eq('email', actualEmail);
    }

    revalidatePath('/');
    return { success: true };
}

// ─── Get Thread Messages ──────────────────────────────────────────────────────

export async function getThreadMessagesAction(threadId: string) {
    if (!threadId) return [];

    const { data: messages, error } = await supabase
        .from('email_messages')
        .select(`
            id, thread_id, from_email, to_email, subject,
            snippet, body, direction, sent_at, is_unread, pipeline_stage,
            gmail_account_id, is_tracked, opens_count, clicks_count, last_opened_at,
            gmail_accounts ( email, users ( name ) )
        `)
        .eq('thread_id', threadId)
        .order('sent_at', { ascending: true });

    if (error) {
        console.error('getThreadMessagesAction error:', error);
        return [];
    }

    // Since has_reply might not be a column, we compute it:
    // a thread "has_reply" if at least one message is RECEIVED.
    const threadHasReply = (messages || []).some((m: any) => m.direction === 'RECEIVED');

    return (messages || []).map((m: any) => ({
        ...m,
        has_reply: threadHasReply,
        account_email: m.gmail_accounts?.email,
        manager_name: m.gmail_accounts?.users?.name || 'System',
        gmail_accounts: {
            email: m.gmail_accounts?.email,
            user: { name: m.gmail_accounts?.users?.name || 'System' }
        }
    }));
}

// ─── Delete Email ─────────────────────────────────────────────────────────────

export async function deleteEmailAction(messageId: string) {
    if (!messageId) return { success: false, error: 'messageId is required' };

    // Nullify source_email_id on linked projects instead of deleting them
    await supabase.from('projects').update({ source_email_id: null }).eq('source_email_id', messageId);

    // Delete the message itself
    const { error } = await supabase
        .from('email_messages')
        .delete()
        .eq('id', messageId);

    if (error) {
        console.error('[emailActions] deleteEmailAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
    revalidatePath('/');
    return { success: true };
}

export async function bulkDeleteEmailsAction(messageIds: string[]) {
    if (!messageIds || messageIds.length === 0) return { success: true };

    // Nullify source_email_id on linked projects instead of deleting them
    await supabase.from('projects').update({ source_email_id: null }).in('source_email_id', messageIds);

    // Delete the messages
    const { error } = await supabase
        .from('email_messages')
        .delete()
        .in('id', messageIds);

    if (error) {
        console.error('[emailActions] bulkDeleteEmailsAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
    revalidatePath('/');
    return { success: true };
}

// ─── Not Interested (Ignore Sender) ──────────────────────────────────────────

export async function markAsNotInterestedAction(email: string) {
    if (!email) return { success: false };

    try {
        const senderEmail = normalizeEmail(email);

        // 1. Add specific email to ignored_senders
        const { error: ignoreError } = await supabase
            .from('ignored_senders')
            .upsert({ email: senderEmail }, { onConflict: 'email' });

        if (ignoreError) throw ignoreError;

        // Update all messages from this specific email to NOT_INTERESTED stage
        const { error: updateError } = await supabase
            .from('email_messages')
            .update({ pipeline_stage: 'NOT_INTERESTED' })
            .ilike('from_email', `%${escapeIlike(senderEmail)}%`);

        if (updateError) throw updateError;

        // 3. Update contact if exists
        await supabase
            .from('contacts')
            .update({ pipeline_stage: 'NOT_INTERESTED' })
            .ilike('email', `%${escapeIlike(senderEmail)}%`);

        revalidatePath('/');
        return { success: true };
    } catch (err: any) {
        console.error('[emailActions] markAsNotInterestedAction error:', err);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}

export async function getTabCountsAction(userId: string, gmailAccountId?: string) {
    if (!userId) return {};
    const accountIds = await resolveAccountIds(userId, gmailAccountId);
    if (!accountIds || accountIds.length === 0) return {};

    try {
        const { data, error } = await supabase.rpc('get_all_tab_counts', {
            p_account_ids: accountIds
        });

        if (error) throw error;
        return data as Record<string, number>;
    } catch (err) {
        console.error('getTabCountsAction error:', err);
        return {};
    }
}

export async function markAsNotSpamAction(messageId: string) {
    if (!messageId) return { success: false, error: 'messageId is required' };
    try {
        // 1. Fetch message and account details
        const { data: message, error: msgError } = await supabase
            .from('email_messages')
            .select('id, gmail_account_id, gmail_accounts(*)')
            .eq('id', messageId)
            .single();

        if (msgError || !message) throw new Error('Message not found');

        const account = message.gmail_accounts as any;
        if (!account) throw new Error('Account not found');

        // 2. Call the appropriate service to move it back to Inbox on the server
        if (account.connection_method === 'MANUAL') {
            await unspamManualMessage(account, messageId);
        } else {
            await unspamGmailMessage(account, messageId);
        }

        // 3. Mark as not spam in DB and reset stage to COLD_LEAD
        await supabase
            .from('email_messages')
            .update({ is_spam: false, pipeline_stage: 'COLD_LEAD' })
            .eq('id', messageId);

        revalidatePath('/');
        return { success: true };
    } catch (error: any) {
        console.error('[emailActions] markAsNotSpamAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}



// ─── Search Emails ────────────────────────────────────────────────────────────

export async function searchEmailsAction(
    userId: string,
    query: string,
    limit = 6,
    gmailAccountId?: string
) {
    if (!userId || !query || query.trim().length < 1) return [];
    // Clamp limit to prevent unbounded queries
    const clampedLimit = clampPageSize(limit, PAGINATION.SEARCH_MAX);

    const accountIds = await resolveAccountIds(userId, gmailAccountId);
    if (!accountIds || accountIds.length === 0) return [];

    let q = query.trim();
    let rpcQuery = supabase.from('email_messages').select(`
        id, thread_id, from_email, to_email, subject, snippet, direction, sent_at, is_unread, pipeline_stage, gmail_account_id,
        gmail_accounts ( email, users ( name ) )
    `);

    // Advanced operator handling
    // 1. from:
    const fromMatch = q.match(/from:([^\s]+)/);
    if (fromMatch) {
        const value = fromMatch[1] ?? '';
        if (value === 'me') {
            rpcQuery = rpcQuery.eq('direction', 'SENT');
        } else {
            rpcQuery = rpcQuery.ilike('from_email', `%${escapeIlike(value)}%`);
        }
        q = q.replace(/from:[^\s]+/, '').trim();
    }

    // 2. to:
    const toMatch = q.match(/to:([^\s]+)/);
    if (toMatch) {
        const toValue = toMatch[1] ?? '';
        rpcQuery = rpcQuery.ilike('to_email', `%${escapeIlike(toValue)}%`);
        q = q.replace(/to:[^\s]+/, '').trim();
    }

    // 3. subject: (supports quoted multi-word: subject:"hello world" or single word: subject:hello)
    const subjectMatch = q.match(/subject:"([^"]+)"|subject:(\S+)/);
    if (subjectMatch) {
        const subjectValue = subjectMatch[1] || subjectMatch[2] || '';
        rpcQuery = rpcQuery.ilike('subject', `%${escapeIlike(subjectValue)}%`);
        q = q.replace(/subject:"[^"]+"|subject:\S+/, '').trim();
    }

    // 4. has:attachment (placeholder)
    if (q.includes('has:attachment')) {
        q = q.replace('has:attachment', '').trim();
    }

    // 5. newer_than:
    const match = q.match(/newer_than:(\d+)([dwmy])/);
    if (match && match[1] && match[2]) {
        const val = parseInt(match[1]);
        const unit = match[2];
        const date = new Date();
        if (unit === 'd') date.setDate(date.getDate() - val);
        if (unit === 'w') date.setDate(date.getDate() - val * 7);
        if (unit === 'm') date.setMonth(date.getMonth() - val);
        if (unit === 'y') date.setFullYear(date.getFullYear() - val);
        rpcQuery = rpcQuery.gte('sent_at', date.toISOString());
        q = q.replace(/newer_than:\d+[dwmy]/, '').trim();
    }

    if (q) {
        const escapedQ = escapeIlike(q);
        rpcQuery = rpcQuery.or(`subject.ilike.%${escapedQ}%,from_email.ilike.%${escapedQ}%,snippet.ilike.%${escapedQ}%,to_email.ilike.%${escapedQ}%`);
    }

    const { data, error } = await rpcQuery
        .in('gmail_account_id', accountIds)
        .order('sent_at', { ascending: false })
        .limit(clampedLimit);

    if (error) {
        console.error('searchEmailsAction error:', error);
        return [];
    }

    return (data || []).map((m: any) => transformJoinedEmailRow(m));
}

// ─── Email Tracking ──────────────────────────────────────────────────────────

export async function getEmailTrackingAction(messageId: string) {
    if (!messageId) return null;
    try {
        // 1. Get tracking info from email_messages
        const { data: email, error: emailError } = await supabase
            .from('email_messages')
            .select('tracking_id, is_tracked, opens_count, last_opened_at, clicks_count')
            .eq('id', messageId)
            .single();

        if (emailError || !email) return null;
        if (!email.tracking_id) return { ...email, events: [] };

        // 2. Get tracking events
        const { data: events, error: eventsError } = await supabase
            .from('email_tracking_events')
            .select('*')
            .eq('tracking_id', email.tracking_id)
            .order('created_at', { ascending: false })
            .limit(50);

        return {
            ...email,
            events: events || [],
        };
    } catch (err) {
        console.error('getEmailTrackingAction error:', err);
        return null;
    }
}
