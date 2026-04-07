'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds } from '../utils/accessControl';

export async function getSalesDashboardAction() {
    const { userId, role } = await ensureAuthenticated();
    const accessible = await getAccessibleGmailAccountIds(userId, role);

    const accountIds = accessible === 'ALL' ? null : accessible;
    if (Array.isArray(accountIds) && accountIds.length === 0) {
        return { stats: { sent: 0, replies: 0, newLeads: 0, openRate: 0 }, hotLeads: [], recentActivity: [], followUpsDue: 0 };
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Stats: emails sent this week
    let sentQuery = supabase
        .from('email_messages')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'SENT')
        .gte('sent_at', weekAgo.toISOString());
    if (accountIds) sentQuery = sentQuery.in('gmail_account_id', accountIds);
    const { count: sent } = await sentQuery;

    // Stats: replies received this week
    let repliesQuery = supabase
        .from('email_messages')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'RECEIVED')
        .gte('sent_at', weekAgo.toISOString());
    if (accountIds) repliesQuery = repliesQuery.in('gmail_account_id', accountIds);
    const { count: replies } = await repliesQuery;

    // Stats: new leads this week
    let leadsQuery = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString());
    if (accountIds) leadsQuery = leadsQuery.eq('account_manager_id', userId);
    const { count: newLeads } = await leadsQuery;

    // Stats: open rate (tracked emails opened / tracked sent)
    let trackedQuery = supabase
        .from('email_messages')
        .select('id, opened_at', { count: 'exact' })
        .eq('direction', 'SENT')
        .eq('is_tracked', true)
        .gte('sent_at', weekAgo.toISOString());
    if (accountIds) trackedQuery = trackedQuery.in('gmail_account_id', accountIds);
    const { data: tracked, count: trackedCount } = await trackedQuery;
    const openedCount = tracked?.filter(e => e.opened_at)?.length || 0;
    const openRate = trackedCount && trackedCount > 0 ? Math.round((openedCount / trackedCount) * 100) : 0;

    // Hot leads: opened email but no reply, last 14 days
    let hotQuery = supabase
        .from('contacts')
        .select('id, name, email, open_count, last_opened_at, pipeline_stage')
        .gt('open_count', 0)
        .order('open_count', { ascending: false })
        .limit(5);
    if (accountIds) hotQuery = hotQuery.eq('account_manager_id', userId);
    const { data: hotLeads } = await hotQuery;

    // Follow-ups due
    let followUpQuery = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .lte('next_followup_at', now.toISOString())
        .not('next_followup_at', 'is', null);
    if (accountIds) followUpQuery = followUpQuery.eq('account_manager_id', userId);
    const { count: followUpsDue } = await followUpQuery;

    // Recent activity: last 10 emails
    let activityQuery = supabase
        .from('email_messages')
        .select('id, from_email, to_email, subject, direction, sent_at, opened_at, contact_id, contacts:contact_id(name)')
        .order('sent_at', { ascending: false })
        .limit(10);
    if (accountIds) activityQuery = activityQuery.in('gmail_account_id', accountIds);
    const { data: recentActivity } = await activityQuery;

    // Revenue stats — this agent's projects
    let revenueQuery = supabase
        .from('projects')
        .select('project_value, paid_status, project_date')
        .not('project_value', 'is', null)
        .gt('project_value', 0);
    if (accountIds) revenueQuery = revenueQuery.eq('account_manager_id', userId);
    const { data: projects } = await revenueQuery;

    let totalRevenue = 0, totalPaid = 0, totalUnpaid = 0, totalProjects = 0;
    let thisMonthRevenue = 0, lastMonthRevenue = 0;
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    for (const p of projects || []) {
        totalRevenue += p.project_value;
        totalProjects++;
        if (p.paid_status === 'PAID') totalPaid += p.project_value;
        else totalUnpaid += p.project_value;
        if (p.project_date) {
            const d = new Date(p.project_date);
            const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (m === thisMonth) thisMonthRevenue += p.project_value;
            if (m === lastMonth) lastMonthRevenue += p.project_value;
        }
    }

    const collectionRate = totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 100) : 0;
    const monthlyTarget = 6000; // configurable
    const targetProgress = monthlyTarget > 0 ? Math.min(100, Math.round((thisMonthRevenue / monthlyTarget) * 100)) : 0;
    const monthGrowth = lastMonthRevenue > 0 ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    // Unpaid clients (top 5)
    let unpaidQuery = supabase
        .from('contacts')
        .select('id, name, email, unpaid_amount')
        .gt('unpaid_amount', 0)
        .order('unpaid_amount', { ascending: false })
        .limit(5);
    if (accountIds) unpaidQuery = unpaidQuery.eq('account_manager_id', userId);
    const { data: unpaidClients } = await unpaidQuery;

    // Waiting for reply (they replied, you haven't)
    let replyNowQuery = supabase
        .from('contacts')
        .select('id, name, email, days_since_last_contact', { count: 'exact' })
        .eq('last_message_direction', 'RECEIVED')
        .gt('total_emails_received', 0)
        .not('email', 'ilike', '%noreply%')
        .not('pipeline_stage', 'eq', 'NOT_INTERESTED')
        .not('pipeline_stage', 'eq', 'CLOSED')
        .order('days_since_last_contact', { ascending: true })
        .limit(5);
    if (accountIds) replyNowQuery = replyNowQuery.eq('account_manager_id', userId);
    const { data: needReply, count: replyNowCount } = await replyNowQuery;

    return {
        stats: { sent: sent || 0, replies: replies || 0, newLeads: newLeads || 0, openRate },
        revenue: {
            total: totalRevenue,
            paid: totalPaid,
            unpaid: totalUnpaid,
            projects: totalProjects,
            collectionRate,
            thisMonth: thisMonthRevenue,
            lastMonth: lastMonthRevenue,
            monthGrowth,
            targetProgress,
            monthlyTarget,
        },
        hotLeads: hotLeads || [],
        recentActivity: (recentActivity || []).map((e: any) => ({
            id: e.id,
            contactName: e.contacts?.name || (e.direction === 'RECEIVED' ? e.from_email : e.to_email),
            subject: e.subject,
            direction: e.direction,
            sentAt: e.sent_at,
            opened: !!e.opened_at,
        })),
        followUpsDue: followUpsDue || 0,
        replyNowCount: replyNowCount || 0,
        needReply: needReply || [],
        unpaidClients: unpaidClients || [],
    };
}
