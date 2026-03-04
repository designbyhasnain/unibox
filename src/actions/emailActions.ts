'use server';

import { supabase } from '../lib/supabase';
import { sendGmailEmail } from '../services/gmailSenderService';
import { sendManualEmail, unspamManualMessage } from '../services/manualEmailService';
import { unspamGmailMessage } from '../services/gmailSyncService';

const PAGE_SIZE = 25;

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaginatedEmailResult = {
    emails: any[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

// ─── Send Email ───────────────────────────────────────────────────────────────

export async function sendEmailAction(params: {
    accountId: string;
    to: string;
    subject: string;
    body: string;
    threadId?: string;
}) {
    try {
        const { data: account, error: accError } = await supabase
            .from('gmail_accounts')
            .select('connection_method, sent_count_today')
            .eq('id', params.accountId)
            .single();

        if (accError || !account) {
            throw new Error('Sender account not found.');
        }

        /* Daily Limit check removed with Phase 2 */

        let result;
        if (account.connection_method === 'MANUAL') {
            result = await sendManualEmail(params);
        } else {
            result = await sendGmailEmail(params);
        }

        // Increment sent count on success
        if (result && result.success) {
            await supabase
                .from('gmail_accounts')
                .update({ sent_count_today: (account.sent_count_today || 0) + 1 })
                .eq('id', params.accountId);
        }

        return result;
    } catch (error: any) {
        console.error('sendEmailAction error:', error);
        return {
            success: false,
            error: error.message === 'AUTH_REQUIRED'
                ? 'AUTH_REQUIRED'
                : (error.message || 'Failed to send email'),
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

// ─── Inbox Emails (DB-level thread grouping via RPC) ──────────────────────────

export async function getInboxEmailsAction(
    userId: string,
    page = 1,
    pageSize = PAGE_SIZE,
    stage: string = 'ALL'
): Promise<PaginatedEmailResult> {
    const empty: PaginatedEmailResult = { emails: [], totalCount: 0, page, pageSize, totalPages: 0 };

    const accountIds = await getAccountIds(userId);
    if (!accountIds) return empty;

    const { data, error } = await supabase.rpc('get_inbox_threads', {
        p_account_ids: accountIds,
        p_pipeline_stage: stage === 'ALL' || stage === 'SPAM' ? null : stage,
        p_page: page,
        p_page_size: pageSize,
        p_is_spam: stage === 'SPAM',
    });

    if (error) {
        console.error('[getInboxEmailsAction] RPC error:', error);
        return empty;
    }


    const rows = data as any[];
    if (!rows || rows.length === 0) return empty;

    const totalCount = Number(rows[0].total_count ?? 0);
    const totalPages = Math.ceil(totalCount / pageSize);

    // 4. Enrich row shape to match what frontend expects
    const { data: accountsData } = await supabase
        .from('gmail_accounts')
        .select('id, email, users(name)')
        .in('id', accountIds);

    const accountMap = new Map((accountsData || []).map((a: any) => [a.id, {
        email: a.email,
        manager_name: a.users?.name
    }]));

    const emails = rows.map((r) => {
        const accInfo = accountMap.get(r.gmail_account_id);
        return {
            id: r.id,
            thread_id: r.thread_id,
            from_email: r.from_email,
            to_email: r.to_email,
            subject: r.subject,
            snippet: r.snippet,
            direction: r.direction,
            sent_at: r.sent_at,
            is_unread: r.is_unread,
            pipeline_stage: r.pipeline_stage,
            gmail_account_id: r.gmail_account_id,
            contact_id: r.contact_id,
            gmail_accounts: {
                email: accInfo?.email || r.account_email,
                user: { name: accInfo?.manager_name || 'System' }
            },
        };
    });

    return { emails, totalCount, page, pageSize, totalPages };
}

// ─── Sent Emails (DB-level thread grouping via RPC) ───────────────────────────

export async function getSentEmailsAction(
    userId: string,
    page = 1,
    pageSize = PAGE_SIZE
): Promise<PaginatedEmailResult> {
    const empty: PaginatedEmailResult = { emails: [], totalCount: 0, page, pageSize, totalPages: 0 };

    const accountIds = await getAccountIds(userId);
    if (!accountIds) return empty;

    const { data, error } = await supabase.rpc('get_sent_threads', {
        p_account_ids: accountIds,
        p_page: page,
        p_page_size: pageSize,
    });

    if (error) {
        console.error('getSentEmailsAction RPC error:', error);
        return empty;
    }

    const rows = data as any[];
    if (!rows || rows.length === 0) return empty;

    const totalCount = Number(rows[0].total_count ?? 0);
    const totalPages = Math.ceil(totalCount / pageSize);

    const { data: accountsData } = await supabase
        .from('gmail_accounts')
        .select('id, email, users(name)')
        .in('id', accountIds);

    const accountMap = new Map((accountsData || []).map((a: any) => [a.id, {
        email: a.email,
        manager_name: a.users?.name
    }]));

    const emails = rows.map((r) => {
        const accInfo = accountMap.get(r.gmail_account_id);
        return {
            id: r.id,
            thread_id: r.thread_id,
            from_email: r.from_email,
            to_email: r.to_email,
            subject: r.subject,
            snippet: r.snippet,
            direction: r.direction,
            sent_at: r.sent_at,
            is_unread: r.is_unread,
            pipeline_stage: r.pipeline_stage,
            gmail_account_id: r.gmail_account_id,
            contact_id: r.contact_id,
            gmail_accounts: {
                email: accInfo?.email || r.account_email,
                user: { name: accInfo?.manager_name || 'System' }
            },
        };
    });

    return { emails, totalCount, page, pageSize, totalPages };
}

// ─── Client Emails ────────────────────────────────────────────────────────────

export async function markClientEmailsAsReadAction(clientEmail: string) {
    if (!clientEmail) return { success: false };

    const { data: messages } = await supabase
        .from('email_messages')
        .select('id')
        .or(`from_email.ilike.%${clientEmail}%,to_email.ilike.%${clientEmail}%`)
        .eq('is_unread', true);

    if (messages && messages.length > 0) {
        const ids = messages.map(m => m.id);
        return await bulkMarkAsReadAction(ids);
    }

    return { success: true };
}

export async function getClientEmailsAction(userId: string, targetEmail: string) {
    const accountIds = await getAccountIds(userId);
    if (!accountIds) return [];

    const { data: messages, error } = await supabase
        .from('email_messages')
        .select(`
            id, thread_id, from_email, to_email, subject,
            snippet, direction, sent_at, is_unread, pipeline_stage,
            gmail_account_id,
            gmail_accounts!inner ( email, users ( name ) )
        `)
        .in('gmail_account_id', accountIds)
        .or(`from_email.ilike.%${targetEmail}%,to_email.ilike.%${targetEmail}%`)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .limit(100);

    if (error) {
        console.error('getClientEmailsAction error:', error);
        return [];
    }

    return (messages || []).map((m: any) => ({
        ...m,
        gmail_accounts: {
            email: m.gmail_accounts?.email,
            user: { name: m.gmail_accounts?.users?.name || 'System' }
        }
    }));
}

// ─── Mark Email As Read ───────────────────────────────────────────────────────

export async function markEmailAsReadAction(messageId: string) {
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
    // 1. Fetch the email to get the sender details
    const { data: emailMsg } = await supabase
        .from('email_messages')
        .select('*')
        .eq('id', messageId)
        .single();

    if (!emailMsg) return { success: false };

    // 2. Extract the clean email address
    const rawEmail = emailMsg.direction === 'RECEIVED' ? emailMsg.from_email : emailMsg.to_email;
    const emailMatch = rawEmail?.match(/<([^>]+)>/);
    const actualEmail = emailMatch ? emailMatch[1] : (rawEmail || '');

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

    // 3. Update the pipeline stage on the targeted email message
    const { error } = await supabase
        .from('email_messages')
        .update({ pipeline_stage: stage })
        .eq('id', messageId);

    if (error) {
        console.error('updateEmailStageAction error:', error);
        return { success: false };
    }

    return { success: true };
}

// ─── Get Thread Messages ──────────────────────────────────────────────────────

export async function getThreadMessagesAction(threadId: string) {
    const { data: messages, error } = await supabase
        .from('email_messages')
        .select(`
            id, thread_id, from_email, to_email, subject,
            body, direction, sent_at, is_unread, pipeline_stage,
            gmail_account_id,
            gmail_accounts ( email, users ( name ) )
        `)
        .eq('thread_id', threadId)
        .order('sent_at', { ascending: true });

    if (error) {
        console.error('getThreadMessagesAction error:', error);
        return [];
    }

    return (messages || []).map((m: any) => ({
        ...m,
        gmail_accounts: {
            email: m.gmail_accounts?.email,
            user: { name: m.gmail_accounts?.users?.name || 'System' }
        }
    }));
}

// ─── Delete Email ─────────────────────────────────────────────────────────────

export async function deleteEmailAction(messageId: string) {
    const { data: message } = await supabase
        .from('email_messages')
        .select('contact_id')
        .eq('id', messageId)
        .maybeSingle();

    if (message?.contact_id) {
        await supabase.from('projects').delete().eq('client_id', message.contact_id);
        await supabase.from('contacts').delete().eq('id', message.contact_id);
    }
    await supabase.from('projects').delete().eq('source_email_id', messageId);

    const { error } = await supabase
        .from('email_messages')
        .delete()
        .eq('id', messageId);

    if (error) {
        console.error('deleteEmailAction error:', error);
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function bulkDeleteEmailsAction(messageIds: string[]) {
    if (!messageIds || messageIds.length === 0) return { success: true };

    const { data: messages } = await supabase
        .from('email_messages')
        .select('contact_id')
        .in('id', messageIds);

    if (messages && messages.length > 0) {
        const contactIds = Array.from(new Set(messages.map(m => m.contact_id).filter(Boolean)));

        await supabase.from('projects').delete().in('source_email_id', messageIds);

        if (contactIds.length > 0) {
            await supabase.from('projects').delete().in('client_id', contactIds);
            await supabase.from('contacts').delete().in('id', contactIds);
        }
    }

    const { error } = await supabase
        .from('email_messages')
        .delete()
        .in('id', messageIds);

    if (error) {
        console.error('bulkDeleteEmailsAction error:', error);
        return { success: false, error: error.message };
    }
    return { success: true };
}

// ─── Not Interested (Ignore Sender) ──────────────────────────────────────────

export async function markAsNotInterestedAction(email: string) {
    if (!email) return { success: false };

    try {
        const senderEmail = email.toLowerCase();

        // 1. Add specific email to ignored_senders
        const { error: ignoreError } = await supabase
            .from('ignored_senders')
            .upsert({ email: senderEmail }, { onConflict: 'email' });

        if (ignoreError) throw ignoreError;

        // 2. Find the contact IDs before deleting messages (to cleanup projects)
        const { data: contacts } = await supabase
            .from('contacts')
            .select('id')
            .ilike('email', `%${senderEmail}%`);

        // 3. Delete all associated projects if contacts exist
        if (contacts && contacts.length > 0) {
            const contactIds = contacts.map(c => c.id);

            await supabase
                .from('projects')
                .delete()
                .in('client_id', contactIds);

            // 4. Delete the contacts themselves
            await supabase
                .from('contacts')
                .delete()
                .in('id', contactIds);
        }

        // 5. Find all messages from this sender to cleanup any projects linked by `source_email_id`
        const { data: messages } = await supabase
            .from('email_messages')
            .select('id')
            .ilike('from_email', `%${senderEmail}%`);

        if (messages && messages.length > 0) {
            const messageIds = messages.map(m => m.id);
            await supabase
                .from('projects')
                .delete()
                .in('source_email_id', messageIds);
        }

        // 6. Delete all existing messages from this specific email
        const { error: deleteError } = await supabase
            .from('email_messages')
            .delete()
            .ilike('from_email', `%${senderEmail}%`);

        if (deleteError) throw deleteError;

        return { success: true };
    } catch (err: any) {
        console.error('markAsNotInterestedAction error:', err);
        return { success: false, error: err.message };
    }
}

export async function getTabCountsAction(userId: string) {
    const accountIds = await getAccountIds(userId);
    if (!accountIds) return {};

    // We want the count of THREADS for each stage
    const { data, error } = await supabase
        .from('email_messages')
        .select('thread_id, pipeline_stage, is_spam, sent_at')
        .in('gmail_account_id', accountIds)
        .order('sent_at', { ascending: false });

    if (error) return {};

    // Group by thread_id to count conversations, then by stage/spam
    const threads = new Map<string, { stage: string | null; isSpam: boolean }>();
    data.forEach((m) => {
        if (!threads.has(m.thread_id)) {
            // Because we sorted by sent_at desc, this is the most recent message's status
            threads.set(m.thread_id, { stage: m.pipeline_stage, isSpam: !!m.is_spam });
        } else if (m.is_spam) {
            // Also consider spam if any message in the thread is spam
            const current = threads.get(m.thread_id)!;
            current.isSpam = true;
        }
    });

    const counts: Record<string, number> = {
        ALL: 0,
        COLD_LEAD: 0,
        LEAD: 0,
        OFFER_ACCEPTED: 0,
        CLOSED: 0,
        SPAM: 0,
    };

    threads.forEach((info) => {
        if (info.isSpam) {
            counts['SPAM'] = (counts['SPAM'] || 0) + 1;
        } else {
            const effectiveStage = info.stage || 'COLD_LEAD';
            counts[effectiveStage] = (counts[effectiveStage] || 0) + 1;
            counts['ALL'] = (counts['ALL'] || 0) + 1;
        }
    });

    return counts;
}

export async function markAsNotSpamAction(messageId: string) {
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

        // 3. Mark as not spam in DB
        await supabase
            .from('email_messages')
            .update({ is_spam: false })
            .eq('id', messageId);

        return { success: true };
    } catch (error: any) {
        console.error('[markAsNotSpamAction] error:', error);
        return { success: false, error: error.message };
    }
}




