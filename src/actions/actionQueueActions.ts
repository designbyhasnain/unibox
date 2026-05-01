'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, getOwnerFilter, blockEditorAccess, isAdmin } from '../utils/accessControl';

// Phase 7 Speed Sprint: in-memory cache. Action queue is recomputed every
// 60s by the sidebar badge poller anyway — a 30s cache cuts that polling
// load in half + makes the page-load instant on second navigation.
type CacheEntry = { data: unknown; expiresAt: number };
const queueCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

export type ActionItem = {
    id: string;
    contactId: string;
    name: string;
    email: string;
    company: string | null;
    phone: string | null;
    location: string | null;
    stage: string;
    actionType: 'REPLY_NOW' | 'FOLLOW_UP' | 'WIN_BACK' | 'NEW_LEAD' | 'STALE';
    urgency: 'critical' | 'high' | 'medium' | 'low';
    reason: string;
    daysSinceContact: number;
    totalEmailsSent: number;
    totalEmailsReceived: number;
    lastEmailSubject: string | null;
    lastEmailDirection: string | null;
    estimatedValue: number | null;
    leadScore: number | null;
};

const CONTACT_FIELDS = 'id, name, email, company, phone, location, pipeline_stage, days_since_last_contact, total_emails_sent, total_emails_received, lead_score, last_message_direction';

export async function getActionQueueAction(): Promise<{
    actions: ActionItem[];
    counts: { critical: number; high: number; medium: number; low: number; total: number };
}> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);

    try {
    // Cache key per-user — different users see different scoped action sets.
    const cacheKey = `${userId}|${role}`;
    const cached = queueCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data as { actions: ActionItem[]; counts: { critical: number; high: number; medium: number; low: number; total: number } };
    }

    const accessible = await getAccessibleGmailAccountIds(userId, role);
    const accountIds = accessible === 'ALL' ? null : accessible;

    if (Array.isArray(accountIds) && accountIds.length === 0) {
        return { actions: [], counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 } };
    }

    // Automated/notification senders that should never appear as actionable contacts
    const JUNK_PATTERNS = [
        '%noreply%', '%no-reply%', '%mailer-daemon%', '%postmaster%',
        '%notification%', '%mailsuite%', '%mailtrack%', '%hubspot%',
        '%calendly%', '%zoom.us%', '%donotreply%', '%unsubscribe%',
        '%bounce%', '%feedback@%', '%support@%', '%billing@%',
        '%newsletter%', '%updates@%', '%digest@%', '%automated%',
    ];

    // 1. REPLY_NOW: They replied, you haven't responded
    let replyQuery = supabase
        .from('contacts')
        .select(CONTACT_FIELDS)
        .eq('last_message_direction', 'RECEIVED')
        .gt('total_emails_received', 0)
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED'])
        .order('days_since_last_contact', { ascending: true })
        .limit(50);
    for (const pat of JUNK_PATTERNS) {
        replyQuery = replyQuery.not('email', 'ilike', pat);
    }
    if (accountIds) replyQuery = replyQuery.eq('account_manager_id', userId);
    const { data: rawReply } = await replyQuery;

    // ── Validate Reply Now against actual email_messages — single batched query ──
    // Phase 7 Speed Sprint: was 50 contacts × 3 queries (tier-1 + tier-2-from
    // + tier-2-to) = 150 round-trips. Now a single .in('contact_id', ids)
    // query, then validate in JS. The tier-2 ILIKE fallback was a
    // self-healing path that Phase 5 C2 (orphan-email cleanup) made
    // obsolete — all 16,559 orphans were NULLed or re-linked.
    //
    // Stale-data self-heal moved to a background path: we update
    // last_message_direction inline only for the candidates we have data
    // on. We don't attempt to backfill contact_id from ILIKE matches here
    // anymore — that's slow and Phase 5 already did the bulk repair.
    const candidateIds = (rawReply || []).map(c => c.id);
    const directionByContactId = new Map<string, { direction: string; id: string }>();
    if (candidateIds.length > 0) {
        const { data: latestPerContact } = await supabase
            .from('email_messages')
            .select('contact_id, direction, id, sent_at')
            .in('contact_id', candidateIds)
            .order('sent_at', { ascending: false });
        // Walk in descending order; first seen per contact_id wins.
        for (const m of latestPerContact || []) {
            if (m.contact_id && !directionByContactId.has(m.contact_id)) {
                directionByContactId.set(m.contact_id, { direction: m.direction, id: m.id });
            }
        }
    }

    const validated = (rawReply || []).map(c => {
        const m = directionByContactId.get(c.id);
        if (!m) return { contact: c, valid: false, healDirection: 'zero' as const };
        if (m.direction === 'RECEIVED') return { contact: c, valid: true };
        return { contact: c, valid: false, healDirection: 'SENT' as const };
    });

    const needReply = validated.filter(v => v.valid).map(v => v.contact).slice(0, 30);

    // ── Self-heal stale data inline (fire-and-forget) ──
    const staleIds = validated.filter(v => !v.valid && v.healDirection === 'SENT').map(v => v.contact.id);
    if (staleIds.length > 0) {
        void supabase.from('contacts').update({ last_message_direction: 'SENT' }).in('id', staleIds).then();
    }
    const zeroIds = validated.filter(v => !v.valid && v.healDirection === 'zero').map(v => v.contact.id);
    if (zeroIds.length > 0) {
        void supabase.from('contacts').update({ total_emails_received: 0, last_message_direction: null }).in('id', zeroIds).then();
    }

    // 2. NEW_LEAD: Added in last 48h, never emailed
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    let newQuery = supabase
        .from('contacts')
        .select(CONTACT_FIELDS)
        .gte('created_at', twoDaysAgo)
        .eq('total_emails_sent', 0)
        .in('pipeline_stage', ['COLD_LEAD', 'LEAD'])
        .order('lead_score', { ascending: false })
        .limit(20);
    for (const pat of JUNK_PATTERNS) { newQuery = newQuery.not('email', 'ilike', pat); }
    if (accountIds) newQuery = newQuery.eq('account_manager_id', userId);
    const { data: newLeads } = await newQuery;

    // 3. FOLLOW_UP: You emailed, no reply, 3-14 days ago
    let followQuery = supabase
        .from('contacts')
        .select(CONTACT_FIELDS)
        .eq('last_message_direction', 'SENT')
        .eq('total_emails_received', 0)
        .gte('days_since_last_contact', 3)
        .lte('days_since_last_contact', 14)
        .gt('total_emails_sent', 0)
        .lte('total_emails_sent', 3)
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED'])
        .order('days_since_last_contact', { ascending: true })
        .limit(30);
    for (const pat of JUNK_PATTERNS) { followQuery = followQuery.not('email', 'ilike', pat); }
    if (accountIds) followQuery = followQuery.eq('account_manager_id', userId);
    const { data: needFollowUp } = await followQuery;

    // 4. WIN_BACK: Was engaged (5+ replies), went silent 30+ days
    let winQuery = supabase
        .from('contacts')
        .select(CONTACT_FIELDS)
        .gt('total_emails_received', 4)
        .gt('days_since_last_contact', 30)
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED'])
        .order('total_emails_received', { ascending: false })
        .limit(20);
    for (const pat of JUNK_PATTERNS) { winQuery = winQuery.not('email', 'ilike', pat); }
    if (accountIds) winQuery = winQuery.eq('account_manager_id', userId);
    const { data: winBack } = await winQuery;

    const actions: ActionItem[] = [];

    for (const c of needReply || []) {
        const days = c.days_since_last_contact || 0;
        actions.push({
            id: `reply-${c.id}`,
            contactId: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            phone: c.phone,
            location: c.location,
            stage: c.pipeline_stage,
            actionType: 'REPLY_NOW',
            urgency: days <= 1 ? 'critical' : days <= 3 ? 'high' : 'medium',
            reason: days === 0 ? 'Replied today \u2014 respond now!' : `Replied ${days}d ago \u2014 don\u2019t lose momentum`,
            daysSinceContact: days,
            totalEmailsSent: c.total_emails_sent || 0,
            totalEmailsReceived: c.total_emails_received || 0,
            lastEmailSubject: null,
            lastEmailDirection: c.last_message_direction,
            estimatedValue: null,
            leadScore: c.lead_score,
        });
    }

    for (const c of newLeads || []) {
        actions.push({
            id: `new-${c.id}`,
            contactId: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            phone: c.phone,
            location: c.location,
            stage: c.pipeline_stage,
            actionType: 'NEW_LEAD',
            urgency: 'high',
            reason: 'New lead \u2014 send first outreach',
            daysSinceContact: c.days_since_last_contact || 0,
            totalEmailsSent: 0,
            totalEmailsReceived: 0,
            lastEmailSubject: null,
            lastEmailDirection: null,
            estimatedValue: null,
            leadScore: c.lead_score,
        });
    }

    for (const c of needFollowUp || []) {
        actions.push({
            id: `followup-${c.id}`,
            contactId: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            phone: c.phone,
            location: c.location,
            stage: c.pipeline_stage,
            actionType: 'FOLLOW_UP',
            urgency: 'medium',
            reason: `No reply after ${c.total_emails_sent} email${(c.total_emails_sent || 0) > 1 ? 's' : ''} \u2014 follow up`,
            daysSinceContact: c.days_since_last_contact || 0,
            totalEmailsSent: c.total_emails_sent || 0,
            totalEmailsReceived: 0,
            lastEmailSubject: null,
            lastEmailDirection: 'SENT',
            estimatedValue: null,
            leadScore: c.lead_score,
        });
    }

    for (const c of winBack || []) {
        actions.push({
            id: `winback-${c.id}`,
            contactId: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            phone: c.phone,
            location: c.location,
            stage: c.pipeline_stage,
            actionType: 'WIN_BACK',
            urgency: 'low',
            reason: `Was active (${c.total_emails_received} replies), silent ${c.days_since_last_contact}d`,
            daysSinceContact: c.days_since_last_contact || 0,
            totalEmailsSent: c.total_emails_sent || 0,
            totalEmailsReceived: c.total_emails_received || 0,
            lastEmailSubject: null,
            lastEmailDirection: c.last_message_direction,
            estimatedValue: null,
            leadScore: c.lead_score,
        });
    }

    // Sort: critical first, then high, medium, low
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    actions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    const counts = {
        critical: actions.filter(a => a.urgency === 'critical').length,
        high: actions.filter(a => a.urgency === 'high').length,
        medium: actions.filter(a => a.urgency === 'medium').length,
        low: actions.filter(a => a.urgency === 'low').length,
        total: actions.length,
    };

    const result = { actions, counts };
    queueCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;

    } catch (error) {
        console.error('getActionQueueAction error:', error);
        return { actions: [], counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 } };
    }
}

export async function snoozeActionAction(contactId: string, days: number) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);
    try {
        const snoozeUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        let q = supabase.from('contacts').update({ next_followup_at: snoozeUntil }).eq('id', contactId);
        if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
        const { error } = await q;
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('snoozeActionAction error:', error);
        return { success: false, error: 'Failed to snooze' };
    }
}

export async function markActionDoneAction(contactId: string) {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);
    try {
        let q = supabase.from('contacts').update({
            next_followup_at: null,
            auto_followup_enabled: false,
        }).eq('id', contactId);
        if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
        const { error } = await q;
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('markActionDoneAction error:', error);
        return { success: false, error: 'Failed to mark done' };
    }
}

export type LastEmail = {
    id: string;
    subject: string | null;
    snippet: string | null;
    body: string | null;
    direction: 'SENT' | 'RECEIVED';
    from_email: string | null;
    sent_at: string | null;
    thread_id: string | null;
    gmail_account_id: string | null;
};

const EMAIL_SELECT = 'id, subject, snippet, body, direction, from_email, sent_at, thread_id, gmail_account_id';

/**
 * Fetch the last emails for a contact.
 *
 * WHY THIS IS NOT TRIVIAL:
 * email_messages.contact_id is nullable — during Gmail sync, contact lookup
 * can fail (race condition, unknown sender, first-time contact). So many
 * messages have contact_id = NULL even though the contact exists.
 *
 * STRATEGY (3-tier):
 * 1. Fast path:     SELECT WHERE contact_id = ?           (indexed, O(1))
 * 2. Fallback path: SELECT WHERE from/to_email ILIKE ?    (slower but reliable)
 * 3. Self-heal:     UPDATE orphan rows SET contact_id = ?  (fixes it for next time)
 *
 * Tier 3 ensures the system converges — every fallback query patches the data
 * so the fast path works on the next request. Over time, all emails get linked.
 */
export async function getContactLastEmailsAction(contactId: string): Promise<{
    emails: LastEmail[];
    gmailAccountId: string | null;
}> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);
    try {
        // Fetch contact stats upfront so we can decide whether Tier 1 is enough
        let contactQuery = supabase
            .from('contacts')
            .select('email, total_emails_sent, total_emails_received, account_manager_id')
            .eq('id', contactId);
        if (ownerFilter) contactQuery = contactQuery.eq('account_manager_id', ownerFilter);
        const { data: contact } = await contactQuery.maybeSingle();
        if (!contact) return { emails: [], gmailAccountId: null };

        // ── Tier 1: Fast path — query by indexed contact_id ──
        // Fetch up to 20 so habit computation has enough signal (needs 3+ RECEIVED)
        const { data: byId } = await supabase
            .from('email_messages')
            .select(EMAIL_SELECT)
            .eq('contact_id', contactId)
            .order('sent_at', { ascending: false })
            .limit(20);

        // Trigger fallback only if contact_id returned zero but the contact
        // claims to have emails. Sasha's case: contact_id links are wrong, so
        // we need to search by email address to find the real conversation.
        const expectedTotal = (contact?.total_emails_sent || 0) + (contact?.total_emails_received || 0);
        const foundCount = byId?.length || 0;
        const tier1Sufficient = foundCount >= Math.min(20, expectedTotal);

        if (byId && byId.length > 0 && tier1Sufficient) {
            const emails = byId as LastEmail[];
            const lastSent = emails.find(e => e.direction === 'SENT');
            return {
                emails,
                gmailAccountId: lastSent?.gmail_account_id || emails[0]?.gmail_account_id || null,
            };
        }

        // ── Tier 2: Fallback — lookup by contact email address ──
        // from_email/to_email store raw RFC headers like "Name <email>"
        // Use two separate queries to avoid PostgREST .or() parsing issues
        if (!contact?.email) return { emails: [], gmailAccountId: null };

        const emailPattern = `%${contact.email}%`;

        // Run both directions in parallel
        const [fromRes, toRes] = await Promise.all([
            supabase
                .from('email_messages')
                .select(EMAIL_SELECT)
                .ilike('from_email', emailPattern)
                .order('sent_at', { ascending: false })
                .limit(20),
            supabase
                .from('email_messages')
                .select(EMAIL_SELECT)
                .ilike('to_email', emailPattern)
                .order('sent_at', { ascending: false })
                .limit(20),
        ]);

        // Merge, deduplicate, sort by date descending, take top 20
        // (enough for habit computation; UI only displays the most recent few)
        const merged = [...(fromRes.data || []), ...(toRes.data || [])];
        const seen = new Set<string>();
        const unique = merged.filter(e => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
        });
        unique.sort((a, b) => new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime());
        const emails = unique.slice(0, 20) as LastEmail[];

        // ── Tier 3: Self-heal — backfill contact_id on orphan rows ──
        if (emails.length > 0) {
            const ids = emails.map(e => e.id);
            void supabase
                .from('email_messages')
                .update({ contact_id: contactId })
                .in('id', ids)
                .is('contact_id', null)
                .then();
        }

        const lastSent = emails.find(e => e.direction === 'SENT');
        return {
            emails,
            gmailAccountId: lastSent?.gmail_account_id || emails[0]?.gmail_account_id || null,
        };
    } catch (error) {
        console.error('getContactLastEmailsAction error:', error);
        return { emails: [], gmailAccountId: null };
    }
}

// ─── AI Recommendations (fallback when queue is empty) ──────────────────────

export type AIRecommendation = {
    contactId: string;
    name: string;
    email: string;
    company: string | null;
    leadScore: number | null;
    pipelineStage: string;
    reason: string;
    suggestedAction: 'REACH_OUT' | 'SEND_FOLLOW_UP' | 'WIN_BACK' | 'CHECK_IN';
    totalRevenue: number | null;
};

/**
 * Smart suggestions for who to contact next when there's nothing in the queue.
 * Ranks by a composite score: lead score, past revenue, engagement signals,
 * pipeline stage value. Uses only per-user scoping (same RBAC as the queue).
 */
export async function getAIRecommendationsAction(): Promise<{
    success: boolean;
    recommendations: AIRecommendation[];
}> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);

    try {
        // Candidate pool: any contact not in a terminal stage.
        let q = supabase
            .from('contacts')
            .select('id, name, email, company, lead_score, pipeline_stage, total_revenue, days_since_last_contact, total_emails_received, total_emails_sent, last_message_direction, relationship_health')
            .not('pipeline_stage', 'is', null)
            .not('pipeline_stage', 'in', '(CLOSED,NOT_INTERESTED)')
            .not('email', 'ilike', '%noreply%')
            .not('email', 'ilike', '%mailer-daemon%');
        if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
        const { data, error } = await q.order('lead_score', { ascending: false, nullsFirst: false }).limit(150);

        if (error || !data) return { success: false, recommendations: [] };

        const stageWeight: Record<string, number> = {
            OFFER_ACCEPTED: 100, LEAD: 70, WARM_LEAD: 55, CONTACTED: 35, COLD_LEAD: 15,
        };

        const scored = data.map(c => {
            const stageScore = stageWeight[c.pipeline_stage as string] || 10;
            const leadScore = c.lead_score || 0;
            const revenueBoost = Math.min(30, Math.round((Number(c.total_revenue) || 0) / 1000));
            const recencyBoost = c.days_since_last_contact && c.days_since_last_contact < 14 ? 10 : 0;
            const engagementBoost = (c.total_emails_received || 0) > 2 ? 10 : 0;
            const total = stageScore + leadScore + revenueBoost + recencyBoost + engagementBoost;

            let suggestedAction: AIRecommendation['suggestedAction'] = 'CHECK_IN';
            let reason = 'Strong fit — worth a personal touch.';
            if (c.last_message_direction === 'RECEIVED' && (c.days_since_last_contact ?? 0) <= 5) {
                suggestedAction = 'REACH_OUT';
                reason = `They replied recently (${c.days_since_last_contact ?? 0}d ago) — keep momentum.`;
            } else if ((c.total_emails_received ?? 0) > 3 && (c.days_since_last_contact ?? 0) > 21) {
                suggestedAction = 'WIN_BACK';
                reason = `Was active (${c.total_emails_received} replies) then went quiet ${c.days_since_last_contact}d ago.`;
            } else if (c.pipeline_stage === 'OFFER_ACCEPTED') {
                suggestedAction = 'SEND_FOLLOW_UP';
                reason = 'Offer accepted — push to close.';
            } else if (c.pipeline_stage === 'WARM_LEAD' || c.pipeline_stage === 'LEAD') {
                suggestedAction = 'SEND_FOLLOW_UP';
                reason = 'Warm prospect — nudge toward next step.';
            } else if ((c.total_revenue ?? 0) > 500) {
                suggestedAction = 'CHECK_IN';
                reason = `Past revenue $${Math.round(Number(c.total_revenue) || 0)} — check in to reopen the door.`;
            }

            return { c, total, reason, suggestedAction };
        });

        scored.sort((a, b) => b.total - a.total);

        const recommendations: AIRecommendation[] = scored.slice(0, 12).map(({ c, reason, suggestedAction }) => ({
            contactId: c.id,
            name: c.name || c.email,
            email: c.email,
            company: c.company,
            leadScore: c.lead_score,
            pipelineStage: c.pipeline_stage!,
            reason,
            suggestedAction,
            totalRevenue: c.total_revenue ? Number(c.total_revenue) : null,
        }));

        return { success: true, recommendations };
    } catch (e) {
        console.error('[getAIRecommendationsAction] error:', e);
        return { success: false, recommendations: [] };
    }
}
