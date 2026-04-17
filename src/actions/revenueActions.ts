'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getOwnerFilter, blockEditorAccess } from '../utils/accessControl';

/** 1.1 — Get contacts waiting for YOUR reply (money on the table) */
export async function getWaitingForReplyAction() {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);

    let q = supabase
        .from('contacts')
        .select('id, name, email, company, pipeline_stage, total_emails_received, total_emails_sent, days_since_last_contact, relationship_health, lead_score')
        .eq('last_message_direction', 'RECEIVED')
        .gt('total_emails_received', 0)
        .not('email', 'ilike', '%rafay%')
        .not('email', 'ilike', '%mailer-daemon%')
        .not('email', 'ilike', '%noreply%')
        .not('email', 'ilike', '%notify%');
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { data } = await q.order('days_since_last_contact', { ascending: true }).limit(50);

    return (data || []).map(c => ({
        ...c,
        urgency: c.days_since_last_contact <= 1 ? 'hot' : c.days_since_last_contact <= 3 ? 'warm' : c.days_since_last_contact <= 7 ? 'cooling' : 'cold',
    }));
}

/** 1.2 — Get win-back candidates (engaged then went silent) */
export async function getWinBackCandidatesAction() {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);

    let q = supabase
        .from('contacts')
        .select('id, name, email, company, pipeline_stage, total_emails_received, total_emails_sent, days_since_last_contact, lead_score')
        .gt('total_emails_received', 4)
        .gt('days_since_last_contact', 30)
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED'])
        .not('email', 'ilike', '%rafay%')
        .not('email', 'ilike', '%mailer-daemon%');
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { data } = await q.order('total_emails_received', { ascending: false }).limit(50);

    return data || [];
}

/** 1.3 — Get stale follow-ups (sent 1-2 emails, never followed up) */
export async function getStaleFollowUpsAction() {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);

    let q = supabase
        .from('contacts')
        .select('id, name, email, company, pipeline_stage, total_emails_sent, total_emails_received, days_since_last_contact, followup_count')
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED'])
        .eq('total_emails_received', 0)
        .lte('total_emails_sent', 2)
        .gt('total_emails_sent', 0)
        .gt('days_since_last_contact', 3)
        .eq('auto_followup_enabled', true)
        .not('email', 'ilike', '%rafay%')
        .not('email', 'ilike', '%noreply%');
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { data } = await q.order('days_since_last_contact', { ascending: true }).limit(100);

    return data || [];
}

/** Revenue opportunity dashboard stats */
export async function getRevenueOpportunitiesAction() {
    const { role } = await ensureAuthenticated();
    blockEditorAccess(role);

    const [waiting, winBack, stale] = await Promise.all([
        getWaitingForReplyAction(),
        getWinBackCandidatesAction(),
        getStaleFollowUpsAction(),
    ]);

    return {
        waitingForReply: waiting,
        waitingCount: waiting.length,
        winBackCandidates: winBack,
        winBackCount: winBack.length,
        staleFollowUps: stale,
        staleCount: stale.length,
        estimatedRevenue: {
            waiting: waiting.length * 450,
            winBack: Math.round(winBack.length * 0.1 * 450),
            stale: Math.round(stale.length * 0.05 * 450),
        },
    };
}
