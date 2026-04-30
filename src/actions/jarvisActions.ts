'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, blockEditorAccess } from '../utils/accessControl';
import { generateReplySuggestion } from '../services/replySuggestionService';
import { generateDailyBriefing, type DailyBriefing } from '../services/dailyBriefingService';

// ── Daily-briefing cache ─────────────────────────────────────────────────────
// Jarvis briefing is an expensive Groq call (~5-8s) that summarises a 24h
// window — it's fine to compute it once per user per day. This in-memory map
// is per-server-instance: warm Vercel lambdas hit the cache, cold starts
// recompute (fine). Key is userId:YYYY-MM-DD so it rolls over naturally.
type CachedBriefing = { briefing: DailyBriefing; key: string };
const briefingCache = new Map<string, CachedBriefing>();
const MAX_CACHE_ENTRIES = 200;

function todayKey(userId: string): string {
    return `${userId}:${new Date().toISOString().slice(0, 10)}`;
}

function evictIfFull() {
    if (briefingCache.size <= MAX_CACHE_ENTRIES) return;
    // Drop the oldest entry (Map iteration is insertion order).
    const firstKey = briefingCache.keys().next().value;
    if (firstKey) briefingCache.delete(firstKey);
}

export async function getDailyBriefingAction(): Promise<{ success: boolean; briefing?: DailyBriefing; error?: string; cached?: boolean }> {
    try {
        const { userId, role } = await ensureAuthenticated();
        const key = todayKey(userId);
        const hit = briefingCache.get(key);
        if (hit) return { success: true, briefing: hit.briefing, cached: true };

        const briefing = await generateDailyBriefing(userId, role);
        briefingCache.set(key, { briefing, key });
        evictIfFull();
        return { success: true, briefing, cached: false };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Failed to generate briefing' };
    }
}

// Lightweight stats for the Jarvis chat empty-state ("12,695 contacts...").
// Pulls live counts from Supabase so the welcome copy never goes stale. Cached
// per-process for 5 minutes — this is the chat splash, not analytics.
type JarvisQuickStats = { contactCount: number; cached: boolean };
let _quickStatsCache: { value: JarvisQuickStats; exp: number } | null = null;
export async function getJarvisQuickStatsAction(): Promise<{ success: boolean; stats?: JarvisQuickStats; error?: string }> {
    try {
        await ensureAuthenticated();
        const now = Date.now();
        if (_quickStatsCache && _quickStatsCache.exp > now) {
            return { success: true, stats: { ...(_quickStatsCache.value), cached: true } };
        }
        // RBAC-agnostic: this is a global headline number for the splash.
        const { count, error } = await supabase
            .from('contacts')
            .select('id', { count: 'exact', head: true });
        if (error) return { success: false, error: error.message };
        const stats: JarvisQuickStats = { contactCount: count ?? 0, cached: false };
        _quickStatsCache = { value: stats, exp: now + 5 * 60 * 1000 };
        return { success: true, stats };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Failed to load stats' };
    }
}

// Force-refresh path for the "Regenerate" button — bypasses cache and
// overwrites today's entry with a fresh result.
export async function regenerateDailyBriefingAction(): Promise<{ success: boolean; briefing?: DailyBriefing; error?: string }> {
    try {
        const { userId, role } = await ensureAuthenticated();
        const briefing = await generateDailyBriefing(userId, role);
        briefingCache.set(todayKey(userId), { briefing, key: todayKey(userId) });
        evictIfFull();
        return { success: true, briefing };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Failed to regenerate briefing' };
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

export type SuggestReplyOpts = { forceMode?: 'reply' | 'coach' };

export async function suggestReplyAction(threadId: string, opts?: SuggestReplyOpts) {
    // Global timeout: if entire action takes > 25s, bail out with error
    const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Jarvis timed out after 25s')), 25_000)
    );
    try {
        return await Promise.race([_suggestReplyImpl(threadId, opts), timeoutPromise]);
    } catch (e: any) {
        return { success: false as const, error: e?.message || 'Jarvis timed out' };
    }
}

async function _suggestReplyImpl(threadId: string, opts?: SuggestReplyOpts) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    if (!threadId) return { success: false as const, error: 'threadId is required' };

    const accessible = await getAccessibleGmailAccountIds(userId, role);
    if (Array.isArray(accessible) && accessible.length === 0) {
        return { success: false as const, error: 'No accessible accounts' };
    }

    // Newest 30 first, then reverse for chronological prompt context.
    // Old code did `ascending: true` + `limit(20)`, which silently returned the
    // OLDEST 20 messages — wrong mode + wrong context for any thread > 20 msgs.
    let msgQuery = supabase
        .from('email_messages')
        .select('id, from_email, to_email, subject, body, snippet, direction, sent_at, gmail_account_id, contact_id')
        .eq('thread_id', threadId)
        .order('sent_at', { ascending: false })
        .limit(30);
    if (accessible !== 'ALL') msgQuery = msgQuery.in('gmail_account_id', accessible);
    const { data: rawMessages, error: msgErr } = await msgQuery;
    const messages = (rawMessages || []).slice().reverse();

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
        paidRevenue?: number; unpaidAmount?: number;
        contactType?: string | null; lastEmailDate?: string | null;
        daysSinceLastContact?: number | null;
        relationshipHealth?: string | null;
        clientSince?: string | null;
        clientTier?: string | null;
        isClient?: boolean;
        accountManagerName?: string | null;
    } = {
        name: null, email: contactEmailGuess, company: null,
        pipelineStage: null,
    };

    const contactCols = `id, name, email, company, pipeline_stage, contact_type, location,
        total_revenue, paid_revenue, unpaid_amount, total_projects,
        days_since_last_contact, relationship_health, client_since,
        client_tier, is_client, account_manager_id`;

    const resolvedId = contactId;
    if (resolvedId) {
        const { data: c } = await supabase
            .from('contacts')
            .select(contactCols)
            .eq('id', resolvedId)
            .maybeSingle();

        if (c) {
            const [emailCount, projectData, am] = await Promise.all([
                supabase.from('email_messages').select('*', { count: 'exact', head: true }).eq('contact_id', c.id),
                supabase.from('projects').select('id, total_cost').eq('contact_id', c.id),
                c.account_manager_id
                    ? supabase.from('users').select('name').eq('id', c.account_manager_id).maybeSingle()
                    : Promise.resolve({ data: null }),
            ]);

            const projects = projectData.data || [];
            // Prefer pre-aggregated values from contacts table; fall back to live computation
            const totalRevenue = (typeof c.total_revenue === 'number' && c.total_revenue > 0)
                ? c.total_revenue
                : projects.reduce((sum, p) => sum + (p.total_cost || 0), 0);

            contact = {
                name: c.name,
                email: c.email,
                company: c.company,
                pipelineStage: c.pipeline_stage,
                region: c.location || guessRegion(c.email, c.company),
                totalEmails: emailCount.count || messages.length,
                totalProjects: c.total_projects || projects.length,
                totalRevenue,
                paidRevenue: typeof c.paid_revenue === 'number' ? c.paid_revenue : undefined,
                unpaidAmount: typeof c.unpaid_amount === 'number' ? c.unpaid_amount : undefined,
                contactType: c.contact_type,
                daysSinceLastContact: typeof c.days_since_last_contact === 'number' ? c.days_since_last_contact : null,
                relationshipHealth: c.relationship_health,
                clientSince: c.client_since,
                clientTier: c.client_tier,
                isClient: !!c.is_client,
                accountManagerName: am.data?.name || null,
            };
        }
    } else if (contactEmailGuess) {
        const { data: c } = await supabase
            .from('contacts')
            .select(contactCols)
            .eq('email', contactEmailGuess)
            .maybeSingle();

        if (c) {
            contact = {
                name: c.name, email: c.email, company: c.company,
                pipelineStage: c.pipeline_stage,
                region: c.location || guessRegion(c.email, c.company),
                contactType: c.contact_type,
                totalRevenue: typeof c.total_revenue === 'number' ? c.total_revenue : undefined,
                paidRevenue: typeof c.paid_revenue === 'number' ? c.paid_revenue : undefined,
                unpaidAmount: typeof c.unpaid_amount === 'number' ? c.unpaid_amount : undefined,
                totalProjects: typeof c.total_projects === 'number' ? c.total_projects : undefined,
                daysSinceLastContact: typeof c.days_since_last_contact === 'number' ? c.days_since_last_contact : null,
                relationshipHealth: c.relationship_health,
                clientSince: c.client_since,
                clientTier: c.client_tier,
                isClient: !!c.is_client,
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

    // Staleness check — Gmail webhook → email_messages insert isn't transactional with
    // the inbox UI's live thread display. If email_threads says a newer message exists
    // than what we just pulled, surface a hint so the user knows to Regenerate after sync.
    const newestSentAt = messages[messages.length - 1]?.sent_at || '';
    let staleData = false;
    try {
        const { data: threadRow } = await supabase
            .from('email_threads')
            .select('last_message_at')
            .eq('id', threadId)
            .maybeSingle();
        if (threadRow?.last_message_at && newestSentAt && new Date(threadRow.last_message_at).getTime() > new Date(newestSentAt).getTime() + 10_000) {
            staleData = true;
        }
    } catch { /* best-effort hint, never blocks the suggestion */ }

    const { suggestion, error, mode, modeSource } = await generateReplySuggestion(contact, thread, opts);
    if (!suggestion) {
        return { success: false as const, error: error || 'Jarvis could not generate a draft', staleData };
    }
    return { success: true as const, suggestion, mode: mode || 'reply', modeSource: modeSource || 'auto', staleData };
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
    } catch (err: any) {
        console.error('[jarvisActions] logJarvisFeedbackAction error:', err);
        return { success: false, error: err?.message || 'Failed to log Jarvis feedback' };
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

        const { error } = await supabase
            .from('jarvis_knowledge')
            .update(update)
            .eq('id', params.knowledgeId);

        if (error) {
            console.error('[jarvisActions] verifyKnowledgeAction update error:', error);
            return { success: false, error: error.message || 'Failed to update knowledge entry' };
        }

        return { success: true };
    } catch (err: any) {
        console.error('[jarvisActions] verifyKnowledgeAction error:', err);
        return { success: false, error: err?.message || 'Failed to verify knowledge entry' };
    }
}
