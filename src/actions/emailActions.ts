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
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, canAccessGmailAccount, blockEditorAccess } from '../utils/accessControl';

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
        const { userId, role } = await ensureAuthenticated();
        blockEditorAccess(role);

        // Input validation
        if (!params.accountId || !params.to || !params.subject) {
            return { success: false, error: 'accountId, to, and subject are required' };
        }

        // RBAC: verify current user can send from this account
        if (!(await canAccessGmailAccount(userId, role, params.accountId))) {
            return { success: false, error: 'You do not have access to this sending account' };
        }

        const { data: account, error: accError } = await supabase
            .from('gmail_accounts')
            .select('connection_method, sent_count_today')
            .eq('id', params.accountId)
            .single();

        if (accError || !account) {
            console.error('[sendEmailAction] Sender account not found:', accError?.message);
            throw new Error('Sender account not found');
        }

        // We can't safely reset sent_count_today without tracking last_send_date in the DB
        // For now, allow sending and increment the counter.
        // TODO: add last_send_date column to gmail_accounts table and implement daily reset

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
                    .update({ sent_count_today: newCount })
                    .eq('id', params.accountId);
            } else {
                // Also update last_send_date for the RPC path if it existed.
                // Skipped since last_send_date is not in DB.
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
                        delivered_at: new Date().toISOString(),
                        body: trackedBody,
                    })
                    .eq('id', cleanMsgId);
            }
        }

        // Update contact stats so they drop out of "Reply Now" queue immediately
        if (result && result.success) {
            const cleanTo = normalizeEmail(params.to);
            if (cleanTo) {
                void supabase
                    .from('contacts')
                    .update({
                        last_message_direction: 'SENT',
                        last_email_at: new Date().toISOString(),
                        days_since_last_contact: 0,
                    })
                    .eq('email', cleanTo)
                    .then();
            }
        }

        revalidatePath('/');
        return { ...result, trackingId: isTracked ? trackingId : undefined };
    } catch (error: any) {
        console.error('[emailActions] sendEmailAction error:', error);
        return {
            success: false,
            error: error.message === 'AUTH_REQUIRED'
                ? 'Authentication required: Please reconnect your Gmail account from the Accounts page.'
                : (process.env.NODE_ENV === 'development'
                    ? `Dev Error: ${error.message || error}`
                    : 'An error occurred while processing your request'),
        };
    }
}


// ─── Resolve account IDs from user + optional filter (RBAC-aware) ─────────────

// Cache all account IDs for 60 seconds to avoid repeated DB queries
let _allAccountIdsCache: { ids: string[]; ts: number } | null = null;
const ALL_ACCOUNTS_CACHE_TTL = 60_000;

async function getAllAccountIds(): Promise<string[]> {
    if (_allAccountIdsCache && (Date.now() - _allAccountIdsCache.ts < ALL_ACCOUNTS_CACHE_TTL)) {
        return _allAccountIdsCache.ids;
    }
    const { data } = await supabase.from('gmail_accounts').select('id');
    const ids = data?.map(a => a.id) || [];
    _allAccountIdsCache = { ids, ts: Date.now() };
    return ids;
}

async function resolveAccountIds(userId: string, role: string, gmailAccountId?: string): Promise<string[] | null> {
    if (gmailAccountId && gmailAccountId !== 'ALL') {
        if (role === 'ADMIN' || role === 'ACCOUNT_MANAGER') return [gmailAccountId];
        const accessible = await getAccessibleGmailAccountIds(userId, role);
        if (accessible === 'ALL') return [gmailAccountId];
        if (accessible.includes(gmailAccountId)) return [gmailAccountId];
        return [];
    }
    if (role === 'ADMIN' || role === 'ACCOUNT_MANAGER') {
        return await getAllAccountIds();
    }
    const accessible = await getAccessibleGmailAccountIds(userId, role);
    if (accessible === 'ALL') return await getAllAccountIds();
    return accessible.length > 0 ? accessible : null;
}

// ─── Inbox Emails (DB-level thread grouping via RPC) ──────────────────────────

// ─── Inbox Emails (DB-level thread grouping via RPC) ──────────────────────────

export async function getInboxEmailsAction(
    page = 1,
    pageSize = PAGE_SIZE,
    stage: string = 'ALL',
    gmailAccountId?: string
): Promise<PaginatedEmailResult> {
    const { userId, role } = await ensureAuthenticated();
    if (page < 1 || !Number.isFinite(page)) page = 1;
    if (page > 10000) page = 1;
    const clampedPageSize = clampPageSize(pageSize);
    const empty: PaginatedEmailResult = { emails: [], totalCount: 0, page, pageSize: clampedPageSize, totalPages: 0 };

    const accountIds = await resolveAccountIds(userId, role, gmailAccountId);
    if (!accountIds || accountIds.length === 0) return empty;

    const offset = (page - 1) * clampedPageSize;

    const stageParam = stage === 'SPAM' ? null : (stage !== 'ALL' ? stage : null);
    const isSpamParam = stage === 'SPAM';

    // Overfetch to compensate for post-fetch direction filtering
    const fetchLimit = clampedPageSize + 20;

    const { data, error } = await supabase.rpc('get_inbox_emails', {
        p_account_ids: accountIds,
        p_is_spam: isSpamParam,
        p_stage: stageParam,
        p_limit: fetchLimit,
        p_offset: offset,
    });

    if (error) {
        console.error('[getInboxEmailsAction] query error:', error);
        return { ...empty, error: true, errorMessage: error.message || 'Unknown DB error', errorCode: error.code } as any;
    }

    const rawRows = data as any[];
    if (!rawRows || rawRows.length === 0) return empty;

    // Filter to RECEIVED only + deduplicate across accounts
    const seen = new Set<string>();
    const rows = rawRows.filter((r: any) => {
        if (r.direction !== 'RECEIVED') return false;
        const key = `${r.from_email}|${r.sent_at}|${(r.subject || '').slice(0, 50)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, clampedPageSize);

    if (rows.length === 0) return empty;

    // Fetch account info separately
    const uniqueAccountIds = [...new Set(rows.map(r => r.gmail_account_id).filter(Boolean))];
    const accountMap: Record<string, { email: string; managerName: string }> = {};
    if (uniqueAccountIds.length > 0) {
        const { data: accs } = await supabase
            .from('gmail_accounts')
            .select('id, email, users ( name )')
            .in('id', uniqueAccountIds);
        (accs || []).forEach((a: any) => {
            const user = Array.isArray(a.users) ? a.users[0] : a.users;
            accountMap[a.id] = { email: a.email, managerName: user?.name || 'System' };
        });
    }

    const hasMore = rows.length === clampedPageSize;
    const totalCount = hasMore ? (page * clampedPageSize + 1) : ((page - 1) * clampedPageSize + rows.length);
    const totalPages = hasMore ? page + 1 : page;

    const stageOverride = stage === 'SPAM' ? { pipeline_stage: 'SPAM' } : undefined;
    const emails = rows.map((r) => {
        const acc = accountMap[r.gmail_account_id];
        return {
            ...r,
            account_email: acc?.email,
            manager_name: acc?.managerName || 'System',
            gmail_accounts: { email: acc?.email, user: { name: acc?.managerName || 'System' } },
            has_reply: false,
            ...stageOverride,
        };
    });

    return { emails, totalCount, page, pageSize: clampedPageSize, totalPages };
}

// ─── Combined Inbox + Tab Counts (single server action = 1 network round trip) ─

export async function getInboxWithCountsAction(
    page = 1,
    pageSize = PAGE_SIZE,
    stage: string = 'ALL',
    gmailAccountId?: string
): Promise<{ emails: PaginatedEmailResult; counts: Record<string, number> }> {
    const { userId, role } = await ensureAuthenticated();
    const clampedPageSize = clampPageSize(pageSize);
    if (page < 1 || !Number.isFinite(page)) page = 1;
    const empty: PaginatedEmailResult = { emails: [], totalCount: 0, page, pageSize: clampedPageSize, totalPages: 0 };

    const accountIds = await resolveAccountIds(userId, role, gmailAccountId);
    if (!accountIds || accountIds.length === 0) return { emails: empty, counts: {} };

    const offset = (page - 1) * clampedPageSize;
    const stageParam = stage === 'SPAM' ? null : (stage !== 'ALL' ? stage : null);
    const isSpamParam = stage === 'SPAM';
    const fetchLimit = clampedPageSize + 20;

    const { data: rpcData, error } = await supabase.rpc('get_inbox_page', {
        p_account_ids: accountIds,
        p_is_spam: isSpamParam,
        p_stage: stageParam,
        p_limit: fetchLimit,
        p_offset: offset,
    });

    if (error || !rpcData) {
        console.error('[getInboxWithCountsAction] RPC error:', error);
        return { emails: empty, counts: {} };
    }

    const rawRows = rpcData.emails || [];
    const accountMap = rpcData.accounts || {};
    const counts: Record<string, number> = {};
    const rawCounts = rpcData.counts || {};
    for (const [k, v] of Object.entries(rawCounts)) {
        counts[k] = Number(v);
    }

    // Filter to RECEIVED only + deduplicate across accounts
    const seenInbox = new Set<string>();
    const rows = rawRows.filter((r: any) => {
        if (r.direction !== 'RECEIVED') return false;
        const key = `${r.from_email}|${r.sent_at}|${(r.subject || '').slice(0, 50)}`;
        if (seenInbox.has(key)) return false;
        seenInbox.add(key);
        return true;
    }).slice(0, clampedPageSize);

    const hasMore = rows.length === clampedPageSize;
    const totalCount = hasMore ? (page * clampedPageSize + 1) : ((page - 1) * clampedPageSize + rows.length);
    const totalPages = hasMore ? page + 1 : page;

    const stageOverride = stage === 'SPAM' ? { pipeline_stage: 'SPAM' } : undefined;
    const emails = rows.map((r: any) => {
        const acc = accountMap[r.gmail_account_id] || {};
        return {
            ...r,
            account_email: acc.email,
            manager_name: acc.managerName || 'System',
            gmail_accounts: { email: acc.email, user: { name: acc.managerName || 'System' } },
            has_reply: false,
            ...stageOverride,
        };
    });

    return { emails: { emails, totalCount, page, pageSize: clampedPageSize, totalPages }, counts };
}

// ─── Sent Emails (DB-level thread grouping via RPC) ───────────────────────────

export async function getSentEmailsAction(
    page = 1,
    pageSize = PAGE_SIZE,
    gmailAccountId?: string
): Promise<PaginatedEmailResult> {
    const { userId, role } = await ensureAuthenticated();
    if (page < 1 || !Number.isFinite(page)) page = 1;
    if (page > 10000) page = 1;
    const clampedPageSize = clampPageSize(pageSize);
    const empty: PaginatedEmailResult = { emails: [], totalCount: 0, page, pageSize: clampedPageSize, totalPages: 0 };

    const accountIds = await resolveAccountIds(userId, role, gmailAccountId);
    if (!accountIds || accountIds.length === 0) return empty;

    const offset = (page - 1) * clampedPageSize;

    // Direct query for sent emails — works reliably for SALES users with few accounts
    // For ADMIN with 77+ accounts, use RPC fallback
    const useDirectQuery = accountIds.length <= 20;

    let rows: any[] = [];

    if (useDirectQuery) {
        const { data, error } = await supabase
            .from('email_messages')
            .select(`
                id, thread_id, from_email, to_email, subject, snippet, direction,
                sent_at, is_unread, pipeline_stage, gmail_account_id, is_tracked,
                delivered_at, opened_at, contact_id,
                gmail_accounts ( email, users ( name ) )
            `)
            .in('gmail_account_id', accountIds)
            .eq('direction', 'SENT')
            .order('sent_at', { ascending: false, nullsFirst: false })
            .range(offset, offset + clampedPageSize - 1);

        if (error) {
            console.error('getSentEmailsAction direct query error:', error);
            return { ...empty, error: true };
        }

        // Deduplicate
        const seenSent = new Set<string>();
        rows = (data || []).filter((r: any) => {
            const key = `${r.to_email}|${r.sent_at}|${(r.subject || '').slice(0, 50)}`;
            if (seenSent.has(key)) return false;
            seenSent.add(key);
            return true;
        });
    } else {
        // Fallback to RPC for large account sets
        const fetchLimit = clampedPageSize + 20;
        const { data, error } = await supabase.rpc('get_inbox_emails', {
            p_account_ids: accountIds,
            p_is_spam: false,
            p_stage: null,
            p_limit: fetchLimit,
            p_offset: offset,
        });

        if (error) {
            console.error('getSentEmailsAction RPC error:', error);
            return { ...empty, error: true };
        }

        const seenSent = new Set<string>();
        rows = (data as any[] || []).filter((r: any) => {
            if (r.direction !== 'SENT') return false;
            const key = `${r.to_email}|${r.sent_at}|${(r.subject || '').slice(0, 50)}`;
            if (seenSent.has(key)) return false;
            seenSent.add(key);
            return true;
        }).slice(0, clampedPageSize);
    }

    if (rows.length === 0) return empty;

    const hasMore = rows.length === clampedPageSize;
    const totalCount = hasMore ? (page * clampedPageSize + 1) : ((page - 1) * clampedPageSize + rows.length);
    const totalPages = hasMore ? page + 1 : page;

    const emails = rows.map((r: any) => {
        // Direct query has gmail_accounts joined; RPC does not
        const joinedAcc = Array.isArray(r.gmail_accounts) ? r.gmail_accounts[0] : r.gmail_accounts;
        const user = joinedAcc ? (Array.isArray(joinedAcc.users) ? joinedAcc.users[0] : joinedAcc.users) : null;
        return {
            ...r,
            account_email: joinedAcc?.email,
            manager_name: user?.name || 'System',
            gmail_accounts: { email: joinedAcc?.email, user: { name: user?.name || 'System' } },
            has_reply: false,
        };
    });

    return { emails, totalCount, page, pageSize: clampedPageSize, totalPages };
}

// ─── Client Emails ────────────────────────────────────────────────────────────

export async function markClientEmailsAsReadAction(clientEmail: string) {
    if (!clientEmail || typeof clientEmail !== 'string' || clientEmail.length > 254) return { success: false };

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


export async function getClientEmailsAction(
    paramsOrTargetEmail: string | { clientEmail: string; accountIds: string[]; page?: number; pageSize?: number },
    maybeTargetEmail?: string,
    gmailAccountId?: string
): Promise<any[] | { success: boolean; emails: any[]; total: number; page: number; pageSize: number }> {
    const { userId, role } = await ensureAuthenticated();
    // Normalize arguments
    const isLegacy = typeof paramsOrTargetEmail === 'string';
    let clientEmail: string;
    let accountIds: string[];
    let page: number;
    let pageSize: number;

    if (!isLegacy) {
        const params = paramsOrTargetEmail as { clientEmail: string; accountIds: string[]; page?: number; pageSize?: number };
        clientEmail = params.clientEmail;
        accountIds = params.accountIds;
        page = params.page || 1;
        pageSize = Math.min(params.pageSize || 50, 100);
    } else {
        // Legacy call: getClientEmailsAction(targetEmail, gmailAccountId?)
        clientEmail = paramsOrTargetEmail;
        const resolved = await resolveAccountIds(userId, role, gmailAccountId);
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
    // Build filter parts safely — avoid string interpolation of user-controlled values
    const filterParts: string[] = [`id.eq.${messageId}`];
    if (contactId) {
        filterParts.push(`contact_id.eq.${contactId}`);
    }
    if (actualEmail) {
        const escaped = escapeIlike(actualEmail);
        filterParts.push(`from_email.ilike.%${escaped}%`);
        filterParts.push(`to_email.ilike.%${escaped}%`);
    }
    const { error } = await supabase
        .from('email_messages')
        .update({ pipeline_stage: stage })
        .or(filterParts.join(','));

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
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!threadId) return [];

    const accessible = await getAccessibleGmailAccountIds(userId, role);
    if (Array.isArray(accessible) && accessible.length === 0) return [];

    let threadQuery = supabase
        .from('email_messages')
        .select(`
            id, thread_id, from_email, to_email, subject,
            snippet, body, direction, sent_at, is_unread, pipeline_stage,
            gmail_account_id, is_tracked, delivered_at, opened_at,
            gmail_accounts ( email, users ( name ) )
        `)
        .eq('thread_id', threadId);
    if (accessible !== 'ALL') {
        threadQuery = threadQuery.in('gmail_account_id', accessible);
    }
    const { data: messages, error } = await threadQuery.order('sent_at', { ascending: true });

    if (error) {
        console.error('getThreadMessagesAction error:', error);
        return [];
    }

    // Deduplicate: same email synced under multiple gmail accounts
    const seen = new Set<string>();
    const unique = (messages || []).filter((m: any) => {
        const key = `${m.from_email}|${m.sent_at}|${(m.subject || '').slice(0, 50)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const threadHasReply = unique.some((m: any) => m.direction === 'RECEIVED');

    return unique.map((m: any) => ({
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

export async function getTabCountsAction(gmailAccountId?: string) {
    const { userId, role } = await ensureAuthenticated();
    const accountIds = await resolveAccountIds(userId, role, gmailAccountId);
    if (!accountIds || accountIds.length === 0) return {};

    try {
        // Use RPC function (30s timeout, GROUP BY in DB - much faster)
        const { data: rpcCounts, error: rpcError } = await supabase.rpc('get_tab_counts', {
            p_account_ids: accountIds,
        });

        if (!rpcError && rpcCounts) {
            const counts: Record<string, number> = {};
            rpcCounts.forEach((r: any) => {
                if (r.stage) counts[r.stage] = Number(r.cnt);
            });
            return counts;
        }

        console.error('get_tab_counts RPC error:', rpcError);
        return {};
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
    query: string,
    limit = 6,
    gmailAccountId?: string
) {
    const { userId, role } = await ensureAuthenticated();
    if (!query || query.trim().length < 1) return [];
    // Clamp limit to prevent unbounded queries
    const clampedLimit = clampPageSize(limit, PAGINATION.SEARCH_MAX);

    const accountIds = await resolveAccountIds(userId, role, gmailAccountId);
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
        const { data, error } = await supabase
            .from('email_messages')
            .select('tracking_id, is_tracked, delivered_at, opened_at')
            .eq('id', messageId)
            .single();
        if (error || !data) return null;
        return data;
    } catch (err) {
        console.error('getEmailTrackingAction error:', err);
        return null;
    }
}

// ─── Bulk Actions ────────────────────────────────────────────────────────────

export async function bulkUpdateStageAction(contactIds: string[], stage: string) {
    await ensureAuthenticated();
    const { error } = await supabase
        .from('contacts')
        .update({ pipeline_stage: stage })
        .in('id', contactIds);
    if (error) throw new Error(error.message);
    revalidatePath('/');
    return { updated: contactIds.length };
}

export async function bulkMarkReadAction(messageIds: string[]) {
    await ensureAuthenticated();
    const { error } = await supabase
        .from('email_messages')
        .update({ is_unread: false })
        .in('id', messageIds);
    if (error) throw new Error(error.message);
    return { updated: messageIds.length };
}

export async function bulkMarkUnreadAction(messageIds: string[]) {
    await ensureAuthenticated();
    const { error } = await supabase
        .from('email_messages')
        .update({ is_unread: true })
        .in('id', messageIds);
    if (error) throw new Error(error.message);
    return { updated: messageIds.length };
}
