'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, blockEditorAccess } from '../utils/accessControl';
import { generateReplySuggestion } from '../services/replySuggestionService';
import { generateDailyBriefing, type DailyBriefing } from '../services/dailyBriefingService';

/**
 * Jarvis Daily Briefing — role-aware 24h summary.
 * All three roles call the same action; the service routes based on role.
 */
export async function getDailyBriefingAction(): Promise<{ success: boolean; briefing?: DailyBriefing; error?: string }> {
    try {
        const { userId, role } = await ensureAuthenticated();
        const briefing = await generateDailyBriefing(userId, role);
        return { success: true, briefing };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Failed to generate briefing' };
    }
}

/**
 * Generate a Jarvis-suggested reply for the given thread.
 * Only returns data the current user is allowed to see (RBAC enforced via
 * gmail_account_id scoping on thread messages).
 */
export async function suggestReplyAction(threadId: string) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!threadId) return { success: false as const, error: 'threadId is required' };

    const accessible = await getAccessibleGmailAccountIds(userId, role);
    if (Array.isArray(accessible) && accessible.length === 0) {
        return { success: false as const, error: 'No accessible accounts' };
    }

    // Pull the last ~10 messages for the thread, scoped to user's accounts.
    let msgQuery = supabase
        .from('email_messages')
        .select('id, from_email, to_email, subject, body, snippet, direction, sent_at, gmail_account_id, contact_id')
        .eq('thread_id', threadId)
        .order('sent_at', { ascending: true })
        .limit(20);
    if (accessible !== 'ALL') msgQuery = msgQuery.in('gmail_account_id', accessible);
    const { data: messages, error: msgErr } = await msgQuery;

    if (msgErr) {
        console.error('[suggestReplyAction] fetch error:', msgErr);
        return { success: false as const, error: 'Failed to load thread' };
    }
    if (!messages || messages.length === 0) {
        return { success: false as const, error: 'No messages found in thread' };
    }

    // Resolve contact: prefer the contact_id on the latest RECEIVED message.
    const latestReceived = [...messages].reverse().find(m => m.direction === 'RECEIVED');
    const contactEmailGuess = latestReceived
        ? (latestReceived.from_email.match(/<([^>]+)>/)?.[1] || latestReceived.from_email).toLowerCase().trim()
        : '';
    const contactId = latestReceived?.contact_id || messages[messages.length - 1]?.contact_id || null;

    let contact: { name: string | null; email: string; company: string | null; pipelineStage: string | null } = {
        name: null,
        email: contactEmailGuess,
        company: null,
        pipelineStage: null,
    };
    if (contactId) {
        const { data: c } = await supabase
            .from('contacts')
            .select('name, email, company, pipeline_stage')
            .eq('id', contactId)
            .maybeSingle();
        if (c) contact = { name: c.name, email: c.email, company: c.company, pipelineStage: c.pipeline_stage };
    } else if (contactEmailGuess) {
        const { data: c } = await supabase
            .from('contacts')
            .select('name, email, company, pipeline_stage')
            .eq('email', contactEmailGuess)
            .maybeSingle();
        if (c) contact = { name: c.name, email: c.email, company: c.company, pipelineStage: c.pipeline_stage };
    }

    const thread = messages.map(m => ({
        direction: m.direction as 'SENT' | 'RECEIVED',
        fromEmail: m.from_email || '',
        subject: m.subject || '',
        body: (m.body || m.snippet || '') as string,
        sentAt: m.sent_at || '',
    }));

    const { suggestion, error } = await generateReplySuggestion(contact, thread);
    if (!suggestion) {
        return { success: false as const, error: error || 'Jarvis could not generate a draft' };
    }
    return { success: true as const, suggestion };
}
