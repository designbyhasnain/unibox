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

// ─── Pipeline Visualization ──────────────────────────────────────────────────

export type PipelineStageSummary = {
    stage: string;
    label: string;
    color: string;
    count: number;
    estimatedValue: number;
    samples: { id: string; name: string; email: string; company: string | null; estimatedValue: number; daysSince: number; leadScore: number | null }[];
};

/**
 * Return pipeline stages with counts, estimated values, and top 5 deals per stage.
 * Used by /opportunities for a visual funnel/kanban.
 */
export async function getPipelineVisualizationAction(): Promise<{
    success: boolean;
    stages: PipelineStageSummary[];
    totalValue: number;
    totalDeals: number;
}> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);
    const ownerFilter = getOwnerFilter(userId, role);

    const STAGES: { key: string; label: string; color: string }[] = [
        { key: 'COLD_LEAD', label: 'Cold', color: '#94a3b8' },
        { key: 'CONTACTED', label: 'Contacted', color: '#3b82f6' },
        { key: 'WARM_LEAD', label: 'Warm', color: '#f59e0b' },
        { key: 'LEAD', label: 'Engaged', color: '#8b5cf6' },
        { key: 'OFFER_ACCEPTED', label: 'Proposal', color: '#10b981' },
        { key: 'CLOSED', label: 'Won', color: '#22c55e' },
    ];

    let q = supabase
        .from('contacts')
        .select('id, name, email, company, pipeline_stage, estimated_value, total_revenue, days_since_last_contact, lead_score')
        .in('pipeline_stage', STAGES.map(s => s.key))
        .not('email', 'ilike', '%noreply%')
        .not('email', 'ilike', '%mailer-daemon%')
        .order('lead_score', { ascending: false, nullsFirst: false })
        .limit(5000);
    if (ownerFilter) q = q.eq('account_manager_id', ownerFilter);
    const { data, error } = await q;
    if (error || !data) return { success: false, stages: [], totalValue: 0, totalDeals: 0 };

    const byStage = new Map<string, typeof data>();
    for (const s of STAGES) byStage.set(s.key, []);
    for (const c of data) byStage.get(c.pipeline_stage as string)?.push(c);

    // Stage-based default deal value (used when estimated_value is null)
    const defaultValue: Record<string, number> = {
        COLD_LEAD: 150, CONTACTED: 250, WARM_LEAD: 400, LEAD: 600, OFFER_ACCEPTED: 800, CLOSED: 900,
    };

    let totalValue = 0;
    let totalDeals = 0;
    const stages: PipelineStageSummary[] = STAGES.map(s => {
        const rows = byStage.get(s.key) || [];
        const estimatedValue = rows.reduce((sum, c) => {
            const ev = Number(c.estimated_value) || Number(c.total_revenue) || defaultValue[s.key] || 200;
            return sum + ev;
        }, 0);
        totalValue += estimatedValue;
        totalDeals += rows.length;
        return {
            stage: s.key,
            label: s.label,
            color: s.color,
            count: rows.length,
            estimatedValue: Math.round(estimatedValue),
            samples: rows.slice(0, 5).map(c => ({
                id: c.id,
                name: c.name || c.email,
                email: c.email,
                company: c.company,
                estimatedValue: Math.round(Number(c.estimated_value) || Number(c.total_revenue) || defaultValue[s.key] || 200),
                daysSince: c.days_since_last_contact || 0,
                leadScore: c.lead_score,
            })),
        };
    });

    return { success: true, stages, totalValue: Math.round(totalValue), totalDeals };
}
