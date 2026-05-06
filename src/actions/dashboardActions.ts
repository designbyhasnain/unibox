'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, blockEditorAccess } from '../utils/accessControl';

export async function getSalesDashboardAction() {
    const { userId, role } = await ensureAuthenticated();
    // Defense-in-depth: VIDEO_EDITOR has its own dashboard surface
    // (EditorTodayView). It should never call this action; the page-level
    // guard already redirects them, but if someone reaches the action via
    // direct invocation we fail closed here too.
    blockEditorAccess(role);
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

    // ── Real KPI sparklines: last 9 days, bucketed per-day ───────────────
    // Replaces the hardcoded sparkline arrays that lived in the dashboard
    // PageClient. Three small fetches — limited to 5000 rows each so an
    // admin with massive backlog doesn't pull the whole table.
    const sparkStart = new Date(now.getTime() - 9 * 86400000);
    const sparkStartIso = sparkStart.toISOString();
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);

    let sentTrendQ = supabase
        .from('email_messages')
        .select('sent_at')
        .eq('direction', 'SENT')
        .gte('sent_at', sparkStartIso)
        .order('sent_at', { ascending: false })
        .limit(5000);
    if (accountIds) sentTrendQ = sentTrendQ.in('gmail_account_id', accountIds);

    let replyTrendQ = supabase
        .from('email_messages')
        .select('sent_at')
        .eq('direction', 'RECEIVED')
        .gte('sent_at', sparkStartIso)
        .order('sent_at', { ascending: false })
        .limit(5000);
    if (accountIds) replyTrendQ = replyTrendQ.in('gmail_account_id', accountIds);

    let leadTrendQ = supabase
        .from('contacts')
        .select('created_at')
        .gte('created_at', sparkStartIso)
        .order('created_at', { ascending: false })
        .limit(5000);
    if (accountIds) leadTrendQ = leadTrendQ.eq('account_manager_id', userId);

    const [sentTrendRes, replyTrendRes, leadTrendRes] = await Promise.all([sentTrendQ, replyTrendQ, leadTrendQ]);

    const dayBuckets = (rows: { sent_at?: string; created_at?: string }[] | null, field: 'sent_at' | 'created_at') => {
        const buckets: Record<string, number> = {};
        for (let i = 8; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 86400000);
            buckets[dayKey(d)] = 0;
        }
        for (const r of rows || []) {
            const ts = r[field];
            if (!ts) continue;
            const k = dayKey(new Date(ts));
            if (k in buckets) buckets[k] = (buckets[k] || 0) + 1;
        }
        return Object.values(buckets);
    };

    const sentTrend = dayBuckets(sentTrendRes.data, 'sent_at');
    const replyTrend = dayBuckets(replyTrendRes.data, 'sent_at');
    const leadTrend = dayBuckets(leadTrendRes.data, 'created_at');

    // Today vs yesterday (last two buckets) for the KPI delta lines.
    const sentToday = sentTrend[sentTrend.length - 1] || 0;
    const sentYesterday = sentTrend[sentTrend.length - 2] || 0;
    const repliesToday = replyTrend[replyTrend.length - 1] || 0;
    const repliesYesterday = replyTrend[replyTrend.length - 2] || 0;
    const leadsToday = leadTrend[leadTrend.length - 1] || 0;
    const leadsYesterday = leadTrend[leadTrend.length - 2] || 0;

    // 9-day reply-rate trend computed point-wise from sent/reply buckets.
    const replyRateTrend = sentTrend.map((s, i) => {
        const r = replyTrend[i] || 0;
        return s > 0 ? Math.round((r / s) * 100) : 0;
    });
    const replyRateToday = replyRateTrend[replyRateTrend.length - 1] || 0;
    const replyRateYesterday = replyRateTrend[replyRateTrend.length - 2] || 0;

    // Most recently added lead (for the "new lead added X ago" KPI subtitle).
    const newestLeadAt = (leadTrendRes.data || [])[0]?.created_at || null;

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
    // Was: 7 sequential head:true count queries (one per stage), ~250-400ms.
    // First, try the get_pipeline_counts RPC (single GROUP BY). If the
    // function isn't deployed yet (migration in scripts/dashboard-pipeline-rpc.sql),
    // fall back to running the 7 counts in parallel — still ~6-7x faster
    // than sequential.
    const stages = ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED', 'NOT_INTERESTED'];
    let pipelineCounts: Record<string, number> = {};

    const rpcArgs = { p_user_id: accountIds ? userId : null };
    const { data: rpcRows, error: rpcErr } = await supabase.rpc('get_pipeline_counts', rpcArgs);
    if (!rpcErr && Array.isArray(rpcRows)) {
        for (const stage of stages) pipelineCounts[stage] = 0;
        for (const row of rpcRows as { pipeline_stage: string; count: number }[]) {
            if (row.pipeline_stage in pipelineCounts) pipelineCounts[row.pipeline_stage] = Number(row.count) || 0;
        }
    } else {
        const counts = await Promise.all(stages.map(async (stage) => {
            let q = supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('pipeline_stage', stage);
            if (accountIds) q = q.eq('account_manager_id', userId);
            const { count } = await q;
            return [stage, count ?? 0] as const;
        }));
        pipelineCounts = Object.fromEntries(counts);
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
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED'])
        .order('days_since_last_contact', { ascending: true })
        .limit(5);
    if (accountIds) replyQuery = replyQuery.eq('account_manager_id', userId);
    const { data: needReplyRaw, count: replyNowCount } = await replyQuery;

    // Enrich Need-Reply rows with the LATEST RECEIVED email's subject so
    // the dashboard table has actionable context (was rendering an empty
    // middle column because the subject was never fetched). One batched
    // query keyed on contact_id + direction='RECEIVED', take the most
    // recent per contact in JS.
    const needReplyContactIds = (needReplyRaw || []).map((c: any) => c.id);
    const lastSubjectByContact: Record<string, string> = {};
    if (needReplyContactIds.length > 0) {
        const { data: subjects } = await supabase
            .from('email_messages')
            .select('contact_id, subject, sent_at')
            .in('contact_id', needReplyContactIds)
            .eq('direction', 'RECEIVED')
            .order('sent_at', { ascending: false });
        for (const m of subjects || []) {
            if (m.contact_id && !(m.contact_id in lastSubjectByContact)) {
                lastSubjectByContact[m.contact_id] = m.subject || '';
            }
        }
    }
    const needReply = (needReplyRaw || []).map((c: any) => ({
        ...c,
        lastSubject: lastSubjectByContact[c.id] || '',
    }));

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

    // ── Outreach Metrics (today / this week / this month) ─────────────
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    if (weekStart > todayStart) weekStart.setDate(weekStart.getDate() - 7);

    const [todayRes, weekRes, monthRes] = await Promise.all([
        buildQuery('email_messages', 'id', accountIds, userId, { direction: 'SENT', sent_at_gte: todayStart }),
        buildQuery('email_messages', 'id', accountIds, userId, { direction: 'SENT', sent_at_gte: weekStart }),
        buildQuery('email_messages', 'id', accountIds, userId, { direction: 'SENT', sent_at_gte: monthStart }),
    ]);
    const outreach = {
        today: todayRes.count ?? 0,
        thisWeek: weekRes.count ?? 0,
        thisMonth: monthRes.count ?? 0,
    };

    // ── Recent Projects ─────────────────────────────────────────────────
    let recentProjQuery = supabase.from('projects')
        .select('id, project_name, project_value, paid_status, status, project_date, client_id, contacts:client_id(name)')
        .not('project_value', 'is', null)
        .gt('project_value', 0)
        .order('project_date', { ascending: false })
        .limit(5);
    if (accountIds) recentProjQuery = recentProjQuery.eq('account_manager_id', userId);
    const { data: recentProjects } = await recentProjQuery;

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
        .in('pipeline_stage', ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED'])
        .order('days_since_last_contact', { ascending: true })
        .limit(20);
    if (accountIds) pipelineQuery = pipelineQuery.eq('account_manager_id', userId);
    const { data: pipelineContacts } = await pipelineQuery;

    return {
        stats: { sent, replies, newLeads, replyRate },
        kpiTrends: {
            sent: sentTrend,
            replies: replyTrend,
            leads: leadTrend,
            replyRate: replyRateTrend,
            todayVsYesterday: {
                sent: { today: sentToday, yesterday: sentYesterday, delta: sentToday - sentYesterday },
                replies: { today: repliesToday, yesterday: repliesYesterday, delta: repliesToday - repliesYesterday },
                leads: { today: leadsToday, yesterday: leadsYesterday, delta: leadsToday - leadsYesterday },
                replyRate: { today: replyRateToday, yesterday: replyRateYesterday, delta: replyRateToday - replyRateYesterday },
            },
            newestLeadAt,
        },
        outreach,
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
        recentProjects: (recentProjects || []).map((p: any) => ({
            id: p.id,
            name: p.project_name,
            client: p.contacts?.name || 'Unknown',
            value: p.project_value || 0,
            status: p.status || 'Not Started',
            payment: p.paid_status || 'UNPAID',
            date: p.project_date,
        })),
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
    const flatNine = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const zeroDelta = { today: 0, yesterday: 0, delta: 0 };
    return {
        stats: { sent: 0, replies: 0, newLeads: 0, replyRate: 0 },
        kpiTrends: {
            sent: flatNine,
            replies: flatNine,
            leads: flatNine,
            replyRate: flatNine,
            todayVsYesterday: { sent: zeroDelta, replies: zeroDelta, leads: zeroDelta, replyRate: zeroDelta },
            newestLeadAt: null as string | null,
        },
        outreach: { today: 0, thisWeek: 0, thisMonth: 0 },
        revenue: { total: 0, paid: 0, unpaid: 0, projects: 0, collectionRate: 0, thisMonth: 0, lastMonth: 0, monthGrowth: 0, targetProgress: 0, monthlyTarget: 10000, chart: [] },
        pipeline: {}, pipelineTotal: 0, funnel: [],
        hotLeads: [], needReply: [], replyNowCount: 0, unpaidClients: [],
        followUpsDue: 0, topClients: [], recentProjects: [], pipelineContacts: [], recentActivity: [],
    };
}

/**
 * Extra dashboard cards: Active Campaigns overview + short-term Revenue Forecast.
 * Kept in a second action so first paint of the main dashboard isn't blocked.
 */
export type DashboardAddons = {
    campaigns: {
        totalActive: number;
        running: number;
        paused: number;
        sentToday: number;
        topRunning: { id: string; name: string; status: string; dailyLimit: number; createdAt: string }[];
    };
    forecast: {
        nextMonthProjected: number;
        last3MonthAvg: number;
        last6MonthAvg: number;
        trend: 'up' | 'down' | 'flat';
        trendPct: number;
        monthly: { month: string; projected: boolean; revenue: number }[];
    };
};

export async function getDashboardAddonsAction(): Promise<{ success: boolean; data?: DashboardAddons; error?: string }> {
    try {
        const { userId, role } = await ensureAuthenticated();
        const isAdmin = role === 'ADMIN' || role === 'ACCOUNT_MANAGER';

        // ── Campaigns ──────────────────────────────────────────────────────────
        let campQuery = supabase
            .from('campaigns')
            .select('id, name, status, daily_send_limit, created_at, created_by_id')
            .neq('status', 'ARCHIVED')
            .order('created_at', { ascending: false });
        if (!isAdmin) campQuery = campQuery.eq('created_by_id', userId);
        const { data: campaigns } = await campQuery;

        const activeCampaigns = (campaigns || []).filter(c => c.status !== 'COMPLETED');
        const running = activeCampaigns.filter(c => c.status === 'RUNNING');
        const paused = activeCampaigns.filter(c => c.status === 'PAUSED');

        // Count sends from today (best-effort, single query)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const activeIds = activeCampaigns.map(c => c.id);
        let sentToday = 0;
        if (activeIds.length > 0) {
            const { count } = await supabase
                .from('campaign_send_queue')
                .select('id', { count: 'estimated', head: true })
                .in('campaign_id', activeIds)
                .eq('status', 'SENT')
                .gte('sent_at', todayStart.toISOString());
            sentToday = count || 0;
        }

        // ── Forecast from the last 6 months of paid revenue ───────────────────
        const now = new Date();
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        let projQuery = supabase
            .from('projects')
            .select('project_value, paid_status, project_date, account_manager_id')
            .not('project_date', 'is', null)
            .not('project_value', 'is', null)
            .gte('project_date', sixMonthsAgo.toISOString());
        if (!isAdmin) projQuery = projQuery.eq('account_manager_id', userId);
        const { data: projects } = await projQuery;

        const buckets = new Map<string, number>();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
        }
        for (const p of projects || []) {
            if (p.paid_status !== 'PAID') continue;
            const d = new Date(p.project_date!);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + (p.project_value || 0));
        }
        const values = [...buckets.values()];
        const last3 = values.slice(-3);
        const last6 = values;
        const last3Avg = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;
        const last6Avg = last6.length ? last6.reduce((a, b) => a + b, 0) / last6.length : 0;
        // Simple projection: weighted average of last 3 months (recent) + trend from last 2 months
        const latest = values[values.length - 1] || 0;
        const prev = values[values.length - 2] || 0;
        const momChange = prev > 0 ? (latest - prev) / prev : 0;
        const nextMonthProjected = Math.max(0, Math.round(last3Avg * (1 + momChange * 0.5)));
        const trendPct = prev > 0 ? Math.round(((latest - prev) / prev) * 100) : 0;
        const trend: 'up' | 'down' | 'flat' = trendPct > 3 ? 'up' : trendPct < -3 ? 'down' : 'flat';

        const monthly = [...buckets.entries()].map(([k, v]) => ({ month: k, revenue: Math.round(v), projected: false }));
        // Append next month projection
        const future = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        monthly.push({
            month: `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}`,
            revenue: nextMonthProjected,
            projected: true,
        });

        return {
            success: true,
            data: {
                campaigns: {
                    totalActive: activeCampaigns.length,
                    running: running.length,
                    paused: paused.length,
                    sentToday,
                    topRunning: running.slice(0, 5).map(c => ({
                        id: c.id, name: c.name, status: c.status,
                        dailyLimit: c.daily_send_limit, createdAt: c.created_at,
                    })),
                },
                forecast: {
                    nextMonthProjected,
                    last3MonthAvg: Math.round(last3Avg),
                    last6MonthAvg: Math.round(last6Avg),
                    trend,
                    trendPct,
                    monthly,
                },
            },
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load dashboard addons';
        return { success: false, error: msg };
    }
}
