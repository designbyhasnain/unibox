'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, getOwnerFilter, blockEditorAccess } from '../utils/accessControl';

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

    // ── Validate Reply Now against actual email_messages (2-tier + fail closed) ──
    // Cached last_message_direction goes stale. We validate each candidate
    // against the real latest email. If we can't determine truth, EXCLUDE
    // the contact (fail closed — false negative beats false positive).
    const validated = await Promise.all(
        (rawReply || []).map(async (c): Promise<{ contact: typeof c; valid: boolean; healDirection?: string; healContactId?: string; healEmailId?: string }> => {
            // TIER 1: Fast path — check by indexed contact_id
            const { data: tier1 } = await supabase
                .from('email_messages')
                .select('direction, id')
                .eq('contact_id', c.id)
                .order('sent_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (tier1) {
                if (tier1.direction === 'RECEIVED') return { contact: c, valid: true };
                return { contact: c, valid: false, healDirection: 'SENT' };
            }

            // TIER 2: Fallback — check by email address (ILIKE on raw headers)
            if (!c.email) return { contact: c, valid: false };

            const emailPattern = `%${c.email}%`;
            const [fromRes, toRes] = await Promise.all([
                supabase.from('email_messages').select('direction, id')
                    .ilike('from_email', emailPattern)
                    .order('sent_at', { ascending: false }).limit(1).maybeSingle(),
                supabase.from('email_messages').select('direction, id')
                    .ilike('to_email', emailPattern)
                    .order('sent_at', { ascending: false }).limit(1).maybeSingle(),
            ]);

            // Pick the newer of the two results
            const candidates = [fromRes.data, toRes.data].filter(Boolean) as { direction: string; id: string }[];
            if (candidates.length === 0) {
                // No emails found at all — shouldn't be in Reply Now
                return { contact: c, valid: false, healDirection: 'zero' };
            }

            const latest = candidates[0]!;
            if (latest.direction === 'RECEIVED') {
                // Valid — also self-heal by linking this email to the contact
                return { contact: c, valid: true, healContactId: c.id, healEmailId: latest.id };
            }
            return { contact: c, valid: false, healDirection: 'SENT' };
        })
    );

    const needReply = validated.filter(v => v.valid).map(v => v.contact).slice(0, 30);

    // ── Self-heal stale data found during validation ──
    // Fix last_message_direction on contacts we filtered out
    const staleIds = validated.filter(v => !v.valid && v.healDirection === 'SENT').map(v => v.contact.id);
    if (staleIds.length > 0) {
        void supabase.from('contacts').update({ last_message_direction: 'SENT' }).in('id', staleIds).then();
    }

    // Zero out stats on contacts with no emails at all
    const zeroIds = validated.filter(v => !v.valid && v.healDirection === 'zero').map(v => v.contact.id);
    if (zeroIds.length > 0) {
        void supabase.from('contacts').update({ total_emails_received: 0, last_message_direction: null }).in('id', zeroIds).then();
    }

    // Backfill contact_id on orphan emails found via ILIKE
    for (const v of validated) {
        if (v.healContactId && v.healEmailId) {
            void supabase.from('email_messages').update({ contact_id: v.healContactId }).eq('id', v.healEmailId).is('contact_id', null).then();
        }
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

    return { actions, counts };

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
