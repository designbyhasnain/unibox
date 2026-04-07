'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds } from '../utils/accessControl';

export async function getSalesDashboardAction() {
    const { userId, role } = await ensureAuthenticated();
    const accessible = await getAccessibleGmailAccountIds(userId, role);
    const accountIds = accessible === 'ALL' ? null : accessible;

    if (Array.isArray(accountIds) && accountIds.length === 0) {
        return emptyDashboard();
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // ── Email Stats (this week) ─────────────────────────────────────────
    const [sentRes, repliesRes, newLeadsRes] = await Promise.all([
        buildQuery('email_messages', 'id', accountIds, userId, { direction: 'SENT', sent_at_gte: weekAgo }),
        buildQuery('email_messages', 'id', accountIds, userId, { direction: 'RECEIVED', sent_at_gte: weekAgo }),
        buildQuery('contacts', 'id', accountIds, userId, { created_at_gte: weekAgo }, true),
    ]);

    const sent = sentRes.count ?? 0;
    const replies = repliesRes.count ?? 0;
    const newLeads = newLeadsRes.count ?? 0;
    const replyRate = sent > 0 ? Math.round((replies / sent) * 100) : 0;

    // ── Revenue Data ────────────────────────────────────────────────────
    let projectsQuery = supabase.from('projects')
        .select('project_value, paid_status, project_date, client_id')
        .not('project_value', 'is', null).gt('project_value', 0);
    if (accountIds) projectsQuery = projectsQuery.eq('account_manager_id', userId);
    const { data: projects } = await projectsQuery;

    let totalRevenue = 0, totalPaid = 0, thisMonthRevenue = 0, lastMonthRevenue = 0;
    const monthlyData: Record<string, { revenue: number; count: number }> = {};

    for (const p of projects || []) {
        totalRevenue += p.project_value;
        if (p.paid_status === 'PAID') totalPaid += p.project_value;
        if (p.project_date) {
            const d = new Date(p.project_date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[key]) monthlyData[key] = { revenue: 0, count: 0 };
            monthlyData[key].revenue += p.project_value;
            monthlyData[key].count++;
            if (d >= monthStart) thisMonthRevenue += p.project_value;
            if (d >= lastMonthStart && d <= lastMonthEnd) lastMonthRevenue += p.project_value;
        }
    }

    const totalUnpaid = totalRevenue - totalPaid;
    const collectionRate = totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 100) : 0;
    const monthGrowth = lastMonthRevenue > 0 ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;
    const monthlyTarget = 10000;
    const targetProgress = Math.min(100, Math.round((thisMonthRevenue / monthlyTarget) * 100));

    // Monthly chart data (last 6 months)
    const months = Object.keys(monthlyData).sort().slice(-6);
    const revenueChart = months.map(m => ({
        month: m,
        revenue: Math.round(monthlyData[m]!.revenue),
        projects: monthlyData[m]!.count,
    }));

    // ── Pipeline Stats ──────────────────────────────────────────────────
    const stages = ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED', 'NOT_INTERESTED'];
    const pipelineCounts: Record<string, number> = {};
    for (const stage of stages) {
        let q = supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('pipeline_stage', stage);
        if (accountIds) q = q.eq('account_manager_id', userId);
        const { count } = await q;
        pipelineCounts[stage] = count ?? 0;
    }
    const totalContacts = Object.values(pipelineCounts).reduce((s, n) => s + n, 0);

    // ── Pipeline Funnel (conversion percentages) ────────────────────────
    const funnel = [
        { stage: 'Leads', count: pipelineCounts['COLD_LEAD']! + pipelineCounts['CONTACTED']! + pipelineCounts['WARM_LEAD']! + pipelineCounts['LEAD']!, pct: 100 },
        { stage: 'Contacted', count: pipelineCounts['CONTACTED']! + pipelineCounts['WARM_LEAD']! + pipelineCounts['LEAD']! + pipelineCounts['OFFER_ACCEPTED']! + pipelineCounts['CLOSED']!, pct: 0 },
        { stage: 'Proposals', count: pipelineCounts['OFFER_ACCEPTED']! + pipelineCounts['CLOSED']!, pct: 0 },
        { stage: 'Closed', count: pipelineCounts['CLOSED']!, pct: 0 },
    ];
    if (funnel[0]!.count > 0) {
        funnel[1]!.pct = Math.round((funnel[1]!.count / funnel[0]!.count) * 100);
        funnel[2]!.pct = Math.round((funnel[2]!.count / funnel[0]!.count) * 100);
        funnel[3]!.pct = Math.round((funnel[3]!.count / funnel[0]!.count) * 100);
    }

    // ── Hot Leads ───────────────────────────────────────────────────────
    let hotQuery = supabase.from('contacts')
        .select('id, name, email, company, location, open_count, pipeline_stage, total_revenue, days_since_last_contact')
        .gt('open_count', 0)
        .order('open_count', { ascending: false })
        .limit(5);
    if (accountIds) hotQuery = hotQuery.eq('account_manager_id', userId);
    const { data: hotLeads } = await hotQuery;

    // ── Needs Reply ─────────────────────────────────────────────────────
    let replyQuery = supabase.from('contacts')
        .select('id, name, email, company, location, days_since_last_contact, pipeline_stage, total_revenue', { count: 'exact' })
        .eq('last_message_direction', 'RECEIVED')
        .gt('total_emails_received', 0)
        .not('email', 'ilike', '%noreply%')
        .not('pipeline_stage', 'eq', 'NOT_INTERESTED')
        .not('pipeline_stage', 'eq', 'CLOSED')
        .order('days_since_last_contact', { ascending: true })
        .limit(5);
    if (accountIds) replyQuery = replyQuery.eq('account_manager_id', userId);
    const { data: needReply, count: replyNowCount } = await replyQuery;

    // ── Unpaid Clients ──────────────────────────────────────────────────
    let unpaidQuery = supabase.from('contacts')
        .select('id, name, email, unpaid_amount')
        .gt('unpaid_amount', 0)
        .order('unpaid_amount', { ascending: false })
        .limit(5);
    if (accountIds) unpaidQuery = unpaidQuery.eq('account_manager_id', userId);
    const { data: unpaidClients } = await unpaidQuery;

    // ── Follow-ups Due ──────────────────────────────────────────────────
    let followQuery = supabase.from('contacts')
        .select('id', { count: 'exact', head: true })
        .lte('next_followup_at', now.toISOString())
        .not('next_followup_at', 'is', null);
    if (accountIds) followQuery = followQuery.eq('account_manager_id', userId);
    const { count: followUpsDue } = await followQuery;

    // ── Recent Activity ─────────────────────────────────────────────────
    let activityQuery = supabase.from('email_messages')
        .select('id, from_email, to_email, subject, direction, sent_at, opened_at, contact_id, contacts:contact_id(name)')
        .order('sent_at', { ascending: false })
        .limit(10);
    if (accountIds) activityQuery = activityQuery.in('gmail_account_id', accountIds);
    const { data: recentActivity } = await activityQuery;

    // ── Top Clients ─────────────────────────────────────────────────────
    let topQuery = supabase.from('contacts')
        .select('id, name, email, total_revenue, total_projects, client_tier')
        .gt('total_revenue', 0)
        .order('total_revenue', { ascending: false })
        .limit(5);
    if (accountIds) topQuery = topQuery.eq('account_manager_id', userId);
    const { data: topClients } = await topQuery;

    // ── Filmmaker Pipeline Table ────────────────────────────────────────
    let pipelineQuery = supabase.from('contacts')
        .select('id, name, email, company, location, pipeline_stage, total_revenue, unpaid_amount, days_since_last_contact, relationship_health, total_emails_sent, total_emails_received')
        .not('pipeline_stage', 'eq', 'NOT_INTERESTED')
        .order('days_since_last_contact', { ascending: true })
        .limit(20);
    if (accountIds) pipelineQuery = pipelineQuery.eq('account_manager_id', userId);
    const { data: pipelineContacts } = await pipelineQuery;

    return {
        stats: { sent, replies, newLeads, replyRate },
        revenue: {
            total: totalRevenue,
            paid: totalPaid,
            unpaid: totalUnpaid,
            projects: (projects || []).length,
            collectionRate,
            thisMonth: thisMonthRevenue,
            lastMonth: lastMonthRevenue,
            monthGrowth,
            targetProgress,
            monthlyTarget,
            chart: revenueChart,
        },
        pipeline: pipelineCounts,
        pipelineTotal: totalContacts,
        funnel,
        hotLeads: hotLeads || [],
        needReply: needReply || [],
        replyNowCount: replyNowCount || 0,
        unpaidClients: unpaidClients || [],
        followUpsDue: followUpsDue || 0,
        topClients: topClients || [],
        pipelineContacts: (pipelineContacts || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
            location: c.location,
            stage: c.pipeline_stage,
            revenue: c.total_revenue || 0,
            unpaid: c.unpaid_amount || 0,
            daysSilent: c.days_since_last_contact || 0,
            health: c.relationship_health || 'neutral',
            emailsSent: c.total_emails_sent || 0,
            emailsReceived: c.total_emails_received || 0,
        })),
        recentActivity: (recentActivity || []).map((e: any) => ({
            id: e.id,
            contactName: e.contacts?.name || (e.direction === 'RECEIVED' ? e.from_email : e.to_email),
            subject: e.subject,
            direction: e.direction,
            sentAt: e.sent_at,
            opened: !!e.opened_at,
        })),
    };
}

// Helper to build filtered count queries
async function buildQuery(
    table: string, field: string, accountIds: string[] | null, userId: string,
    filters: Record<string, any>, isContactQuery = false,
) {
    let q = supabase.from(table).select(field, { count: 'exact', head: true });
    if (filters.direction) q = q.eq('direction', filters.direction);
    if (filters.sent_at_gte) q = q.gte('sent_at', filters.sent_at_gte.toISOString());
    if (filters.created_at_gte) q = q.gte('created_at', filters.created_at_gte.toISOString());
    if (isContactQuery && accountIds) q = q.eq('account_manager_id', userId);
    else if (accountIds) q = q.in('gmail_account_id', accountIds);
    return q;
}

function emptyDashboard() {
    return {
        stats: { sent: 0, replies: 0, newLeads: 0, replyRate: 0 },
        revenue: { total: 0, paid: 0, unpaid: 0, projects: 0, collectionRate: 0, thisMonth: 0, lastMonth: 0, monthGrowth: 0, targetProgress: 0, monthlyTarget: 10000, chart: [] },
        pipeline: {}, pipelineTotal: 0, funnel: [],
        hotLeads: [], needReply: [], replyNowCount: 0, unpaidClients: [],
        followUpsDue: 0, topClients: [], pipelineContacts: [], recentActivity: [],
    };
}
