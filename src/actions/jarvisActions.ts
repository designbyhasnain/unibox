'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, blockEditorAccess } from '../utils/accessControl';
import { generateReplySuggestion } from '../services/replySuggestionService';
import { generateDailyBriefing, type DailyBriefing } from '../services/dailyBriefingService';

export async function getDailyBriefingAction(): Promise<{ success: boolean; briefing?: DailyBriefing; error?: string }> {
    try {
        const { userId, role } = await ensureAuthenticated();
        const briefing = await generateDailyBriefing(userId, role);
        return { success: true, briefing };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Failed to generate briefing' };
    }
}

function guessRegion(email: string, company: string | null): string | null {
    const domain = email.split('@')[1] || '';
    if (domain.endsWith('.uk') || domain.endsWith('.co.uk')) return 'UK';
    if (domain.endsWith('.au') || domain.endsWith('.com.au')) return 'AUS';
    if (domain.endsWith('.de') || domain.endsWith('.fr') || domain.endsWith('.it') || domain.endsWith('.es') || domain.endsWith('.nl') || domain.endsWith('.eu') || domain.endsWith('.pt') || domain.endsWith('.ch') || domain.endsWith('.at') || domain.endsWith('.be')) return 'EU';
    if (domain.endsWith('.ca')) return 'CA';
    if (domain.endsWith('.com') || domain.endsWith('.net') || domain.endsWith('.org')) return 'US';
    return null;
}

export async function suggestReplyAction(threadId: string) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!threadId) return { success: false as const, error: 'threadId is required' };

    const accessible = await getAccessibleGmailAccountIds(userId, role);
    if (Array.isArray(accessible) && accessible.length === 0) {
        return { success: false as const, error: 'No accessible accounts' };
    }

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

    const latestReceived = [...messages].reverse().find(m => m.direction === 'RECEIVED');
    const contactEmailGuess = latestReceived
        ? (latestReceived.from_email.match(/<([^>]+)>/)?.[1] || latestReceived.from_email).toLowerCase().trim()
        : '';
    const contactId = latestReceived?.contact_id || messages[messages.length - 1]?.contact_id || null;

    let contact: {
        name: string | null; email: string; company: string | null;
        pipelineStage: string | null; region?: string | null;
        totalEmails?: number; totalProjects?: number; totalRevenue?: number;
        contactType?: string | null; lastEmailDate?: string | null;
    } = {
        name: null, email: contactEmailGuess, company: null,
        pipelineStage: null,
    };

    const resolvedId = contactId;
    if (resolvedId) {
        const { data: c } = await supabase
            .from('contacts')
            .select('id, name, email, company, pipeline_stage, contact_type, location')
            .eq('id', resolvedId)
            .maybeSingle();

        if (c) {
            const [emailCount, projectData] = await Promise.all([
                supabase.from('email_messages').select('*', { count: 'exact', head: true }).eq('contact_id', c.id),
                supabase.from('projects').select('id, total_cost').eq('contact_id', c.id),
            ]);

            const projects = projectData.data || [];
            const totalRevenue = projects.reduce((sum, p) => sum + (p.total_cost || 0), 0);

            contact = {
                name: c.name,
                email: c.email,
                company: c.company,
                pipelineStage: c.pipeline_stage,
                region: c.location || guessRegion(c.email, c.company),
                totalEmails: emailCount.count || messages.length,
                totalProjects: projects.length,
                totalRevenue,
                contactType: c.contact_type,
            };
        }
    } else if (contactEmailGuess) {
        const { data: c } = await supabase
            .from('contacts')
            .select('id, name, email, company, pipeline_stage, contact_type, location')
            .eq('email', contactEmailGuess)
            .maybeSingle();

        if (c) {
            contact = {
                name: c.name, email: c.email, company: c.company,
                pipelineStage: c.pipeline_stage,
                region: c.location || guessRegion(c.email, c.company),
                contactType: c.contact_type,
            };
        }
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

/**
 * Agent feedback — log when an agent sends a different reply than Jarvis suggested.
 * This teaches Jarvis what the agent actually prefers.
 */
export async function logJarvisFeedbackAction(params: {
    threadId: string;
    jarvisSuggestion: string;
    actualReply: string;
    contactId?: string;
    wasUsed: boolean;
}) {
    try {
        await ensureAuthenticated();
        const { jarvisSuggestion, actualReply, wasUsed, contactId } = params;

        if (wasUsed) {
            await supabase.from('jarvis_feedback').insert({
                thread_id: params.threadId,
                jarvis_suggestion: jarvisSuggestion,
                actual_reply: actualReply,
                was_used: true,
                contact_id: contactId || null,
            });
            return { success: true };
        }

        const similarity = calculateSimilarity(jarvisSuggestion, actualReply);

        await supabase.from('jarvis_feedback').insert({
            thread_id: params.threadId,
            jarvis_suggestion: jarvisSuggestion,
            actual_reply: actualReply,
            was_used: false,
            similarity_score: similarity,
            contact_id: contactId || null,
        });

        return { success: true };
    } catch {
        return { success: false };
    }
}

function calculateSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    let overlap = 0;
    for (const w of wordsA) if (wordsB.has(w)) overlap++;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : Math.round((overlap / union) * 100) / 100;
}

/**
 * Agent verifies or corrects a knowledge base entry.
 * Called from a UI where the agent sees Jarvis's extracted Q&A and can approve or fix it.
 */
export async function verifyKnowledgeAction(params: {
    knowledgeId: string;
    verified: boolean;
    correction?: string;
    correctPrice?: number;
}) {
    try {
        const { role } = await ensureAuthenticated();
        if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') {
            return { success: false, error: 'Admin only' };
        }

        const update: Record<string, unknown> = {
            agent_verified: params.verified,
        };
        if (params.correction) update.agent_correction = params.correction;
        if (params.correctPrice !== undefined) update.price_mentioned = params.correctPrice;
        if (params.verified) update.success_score = 1.0;

        await supabase
            .from('jarvis_knowledge')
            .update(update)
            .eq('id', params.knowledgeId);

        return { success: true };
    } catch {
        return { success: false };
    }
}
