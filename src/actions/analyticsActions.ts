'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds, blockEditorAccess } from '../utils/accessControl';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Resolve which gmail_account_ids to filter on */
async function resolveFilterAccountIds(accountId: string, managerId: string): Promise<string[] | null> {
    if (accountId !== 'ALL') return [accountId];
    if (managerId !== 'ALL') {
        const { data } = await supabase.from('gmail_accounts').select('id').eq('user_id', managerId);
        return data?.length ? data.map(a => a.id) : [];
    }
    return null; // null = all accounts
}

/** Paginate through all matching rows (Supabase caps at 1000 per request) */
async function fetchAllPaginated<T>(
    buildQuery: (from: number, to: number) => any,
    maxRows = 50000
): Promise<T[]> {
    const pageSize = 1000;
    const results: T[] = [];
    let page = 0;
    while (results.length < maxRows) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const { data } = await buildQuery(from, to);
        if (!data || data.length === 0) break;
        results.push(...data);
        if (data.length < pageSize) break;
        page++;
    }
    return results;
}

// ─── Main Analytics Action ──────────────────────────────────────────────────

export async function getAnalyticsDataAction(params: {
    startDate: string;
    endDate: string;
    managerId: string;
    accountId: string;
}) {
    const { userId, role } = await ensureAuthenticated();
    // Defense-in-depth: VIDEO_EDITOR has no analytics surface; reject early.
    blockEditorAccess(role);
    try {
        let { startDate, endDate, managerId, accountId } = params;
        if (!startDate || !endDate || !managerId || !accountId) {
            return { success: false, error: 'startDate, endDate, managerId, and accountId are required' };
        }

        // Non-admin users cannot query analytics scoped to a different manager
        if (role !== 'ADMIN' && role !== 'ACCOUNT_MANAGER') {
            if (managerId !== userId && managerId !== 'ALL') {
                return emptyAnalytics();
            }
            // Force the manager filter to the current user regardless of input
            managerId = userId;
        }

        const filterIds = await resolveFilterAccountIds(accountId, managerId);

        // Apply RBAC filter
        const accessible = await getAccessibleGmailAccountIds(userId, role);
        let effectiveFilterIds = filterIds;
        if (accessible !== 'ALL') {
            if (!effectiveFilterIds) {
                effectiveFilterIds = accessible;
            } else {
                effectiveFilterIds = effectiveFilterIds.filter(id => accessible.includes(id));
            }
            if (effectiveFilterIds.length === 0) return emptyAnalytics();
        }

        // If filtered to specific accounts and none found, return empty
        if (effectiveFilterIds && effectiveFilterIds.length === 0) {
            return emptyAnalytics();
        }

        // ─── Use RPC for all aggregations (single DB round trip) ─────────
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_analytics_summary', {
            p_start_date: startDate,
            p_end_date: endDate,
            p_account_ids: effectiveFilterIds || null,
        });

        if (rpcError) {
            console.error('Analytics RPC error:', rpcError);
            return emptyAnalytics();
        }

        const agg = rpcData || {};
        const totalOutreach = agg.total_sent || 0;
        const totalReceived = agg.total_received || 0;
        const openedEmails = agg.opened_emails || 0;
        const spamCount = agg.spam_count || 0;
        const spamSentCount = agg.spam_sent || 0;
        const unreadCountAgg = agg.unread_count || 0;

        // Email type classification from RPC
        const outreachFirstCount = agg.outreach_first || 0;
        const followUpsCount = agg.follow_ups || 0;
        const conversationalCount = agg.conversational || 0;
        const firstRepliesCount = agg.first_replies || 0;
        const continuedRepliesCount = agg.continued_replies || 0;

        // Compat shims for code below
        const spam = { length: spamCount };

        // Compat objects for classification
        const outreachFirst = { length: outreachFirstCount };
        const followUps = { length: followUpsCount };
        const conversational = { length: conversationalCount };
        const firstReplies = { length: firstRepliesCount };
        const continuedReplies = { length: continuedRepliesCount };

        // Correct reply rate: First replies / unique prospects outreached
        const uniqueProspectsOutreached = outreachFirstCount;
        const correctReplyRate = uniqueProspectsOutreached > 0
            ? ((firstRepliesCount / uniqueProspectsOutreached) * 100).toFixed(1) + '%'
            : '0%';

        // Leads, Projects, Contacts, Tracking Events (parallel)
        let leadQ = supabase.from('contacts').select('id', { count: 'exact', head: true })
            .eq('is_lead', true).gte('created_at', startDate).lte('created_at', endDate);
        let projQ = supabase.from('projects').select('project_value, paid_status, priority, final_review, project_date, due_date, created_at')
            .gte('created_at', startDate).lte('created_at', endDate).limit(5000);
        if (managerId !== 'ALL') {
            leadQ = leadQ.eq('account_manager_id', managerId);
            projQ = projQ.eq('account_manager_id', managerId);
        }
        let pipelineQ = supabase.from('contacts').select('pipeline_stage').not('pipeline_stage', 'is', null)
            .gte('created_at', startDate).lte('created_at', endDate).limit(10000);
        if (managerId !== 'ALL') {
            pipelineQ = pipelineQ.eq('account_manager_id', managerId);
        }
        const [leadRes, projRes, pipelineRes] = await Promise.all([leadQ, projQ, pipelineQ]);
        const projects = projRes.data || [];
        const leadsGenerated = leadRes.count || 0;
        const totalRevenue = projects.reduce((acc, p) => acc + (p.project_value || 0), 0);

        // Use correct reply rate if email_type data is available, fallback to old formula
        const hasClassification = outreachFirst.length > 0 || firstReplies.length > 0;
        const avgReplyRate = hasClassification
            ? correctReplyRate
            : (totalOutreach > 0 ? (totalReceived / totalOutreach * 100).toFixed(1) + '%' : '0%');

        const stats = {
            totalOutreach,
            totalReceived,
            leadsGenerated,
            avgReplyRate,
            totalRevenue,
            paidRevenue: projects.filter(p => p.paid_status === 'PAID').reduce((acc, p) => acc + (p.project_value || 0), 0),
            closedDeals: projects.filter(p => p.paid_status === 'PAID').length,
            spamCount,
            openRate: totalOutreach > 0 ? ((openedEmails / totalOutreach) * 100).toFixed(1) + '%' : '0%',
            openedEmails,
            totalEmails: agg.total_emails || 0,
            outreachFirst: outreachFirstCount,
            followUps: followUpsCount,
            conversational: conversationalCount,
            firstReplies: firstRepliesCount,
            continuedReplies: continuedRepliesCount,
            uniqueProspectsOutreached,
        };

        // ─── Funnel (uses classified data when available) ─────────────
        const funnelData = hasClassification ? [
            { name: 'Outreach (#1)', value: outreachFirst.length, fill: '#1a73e8' },
            { name: 'Follow-ups', value: followUps.length, fill: '#6366f1' },
            { name: 'Opened', value: openedEmails, fill: '#10b981' },
            { name: 'First Replies', value: firstReplies.length, fill: '#8b5cf6' },
            { name: 'Leads', value: leadsGenerated, fill: '#06b6d4' },
        ] : [
            { name: 'Sent', value: totalOutreach, fill: '#6366f1' },
            { name: 'Opened', value: openedEmails, fill: '#10b981' },
            { name: 'Replied', value: totalReceived, fill: '#8b5cf6' },
            { name: 'Leads', value: leadsGenerated, fill: '#06b6d4' },
        ];

        // ─── Outreach Breakdown (5 email types) ──────────────────────
        const outreachBreakdown = [
            { name: 'Outreach #1', value: outreachFirst.length, color: '#1a73e8' },
            { name: 'Follow-up', value: followUps.length, color: '#6366f1' },
            { name: 'Conversational', value: conversational.length, color: '#129eaf' },
            { name: 'First Reply', value: firstReplies.length, color: '#1e8e3e' },
            { name: 'Continued Reply', value: continuedReplies.length, color: '#34a853' },
        ];

        // ─── Deliverability ─────────────────────────────────────────────
        const spamSent = spamSentCount;
        const inboxRateNum = totalOutreach > 0 ? ((totalOutreach - spamSent) / totalOutreach) * 100 : 100;
        const deliverability = {
            inboxRate: inboxRateNum.toFixed(1) + '%',
            spamRate: totalOutreach > 0 ? ((spamSent / totalOutreach) * 100).toFixed(1) + '%' : '0%',
            health: inboxRateNum > 95 ? 'Excellent' : inboxRateNum > 85 ? 'Good' : 'Critical',
        };

        // ─── Sentiment ──────────────────────────────────────────────────
        const sentimentData = [
            { name: 'Positive', value: leadsGenerated, color: '#34a853' },
            { name: 'Neutral', value: Math.max(0, totalReceived - leadsGenerated), color: '#fbbc04' },
            { name: 'Negative', value: spam.length, color: '#ea4335' },
        ];

        // ─── Daily Trend (from RPC) ──────────────────────────────────────
        const dailyData = (agg.daily_data || []).map((d: any) => {
            const dateStr = d.date || '';
            const parts = dateStr.split('-');
            return {
                name: parts.length >= 3 ? `${parts[1]}/${parts[2]}` : dateStr,
                sent: d.sent || 0,
                received: d.received || 0,
                opened: d.opened || 0,
            };
        });

        // ─── Open rate vs Reply rate per day ──────────────────────────────
        // Distinct series so users can compare "how many opened" vs
        // "how many actually replied" over time.
        const openVsReplyData = dailyData.map((d: any) => ({
            name: d.name,
            openRate: d.sent > 0 ? Math.round((d.opened / d.sent) * 1000) / 10 : 0,
            replyRate: d.sent > 0 ? Math.round((d.received / d.sent) * 1000) / 10 : 0,
        }));

        // ─── Hourly Engagement (from RPC) ────────────────────────────────
        const hourlyMap = new Map<number, number>();
        (agg.hourly_data || []).forEach((h: any) => hourlyMap.set(h.hour, h.count));
        const hourlyEngagement = Array.from({ length: 24 }, (_, i) => ({
            name: `${i.toString().padStart(2, '0')}:00`,
            replies: hourlyMap.get(i) || 0,
        }));

        // ─── Top Subjects (from RPC) ─────────────────────────────────────
        const topSubjects = (agg.top_subjects || [])
            .filter((s: any) => {
                // Filter out bounce notifications and automated messages
                const subj = (s.subject || '').toLowerCase();
                return !subj.includes('delivery status notification') &&
                       !subj.includes('undeliverable') &&
                       !subj.includes('sent you a message');
            })
            .map((s: any) => ({
                name: s.subject || 'No Subject',
                replies: s.count || 0,
            }));

        // ─── Leaderboard & Account Performance (parallel) ───────────────
        const [leaderboard, accountPerformance] = await Promise.all([
            fetchManagerLeaderboard(startDate, endDate),
            fetchAccountPerformance(startDate, endDate),
        ]);

        // ─── Email Volume by Day of Week (from RPC) ─────────────────────
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const volumeByDay = dayNames.map(name => ({ name, sent: 0, received: 0 }));
        (agg.volume_by_dow || []).forEach((d: any) => {
            const entry = volumeByDay[d.dow];
            if (entry) {
                entry.sent = d.sent || 0;
                entry.received = d.received || 0;
            }
        });

        // ─── Busiest Hours Heatmap (simplified — no per-row data needed) ─
        const heatmapData: { day: string; hour: number; count: number }[] = [];
        for (let day = 0; day < 7; day++) {
            for (let hour = 0; hour < 24; hour++) {
                heatmapData.push({ day: dayNames[day] || '', hour, count: 0 });
            }
        }

        // ─── Thread Depth Analysis (from RPC) ────────────────────────────
        const ts = agg.thread_stats || {};
        const singleEmails = Number(ts.single) || 0;
        const shortThreads = Number(ts.short) || 0;
        const longThreads = Number(ts.long) || 0;
        const threadDepthData = [
            { name: 'Single (1)', value: singleEmails, color: '#e8eaed' },
            { name: 'Short (2-3)', value: shortThreads, color: '#1a73e8' },
            { name: 'Long (4+)', value: longThreads, color: '#1e8e3e' },
        ];

        // ─── Unread/Read Ratio (from RPC) ────────────────────────────────
        const unreadCount = unreadCountAgg;
        const readCount = (agg.total_emails || 0) - unreadCount;
        const unreadData = [
            { name: 'Read', value: readCount, color: '#1e8e3e' },
            { name: 'Unread', value: unreadCount, color: '#ea4335' },
        ];

        // ─── Best Subject Lines (empty — would need per-row data) ────────
        const bestSubjects: any[] = [];

        // ─── Client Engagement (empty — would need per-row data) ─────────
        const topClients: any[] = [];

        // ─── NEW: Pipeline Funnel ───────────────────────────────────────
        const pipelineCounts: Record<string, number> = {};
        (pipelineRes.data || []).forEach((c: any) => {
            const stage = c.pipeline_stage || 'UNKNOWN';
            pipelineCounts[stage] = (pipelineCounts[stage] || 0) + 1;
        });
        const pipelineOrder = ['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED', 'NOT_INTERESTED'];
        const pipelineLabels: Record<string, string> = { COLD_LEAD: 'Cold Lead', CONTACTED: 'Contacted', WARM_LEAD: 'Warm Lead', LEAD: 'Lead', OFFER_ACCEPTED: 'Offer Accepted', CLOSED: 'Closed', NOT_INTERESTED: 'Not Interested' };
        const pipelineColors: Record<string, string> = { COLD_LEAD: '#1a73e8', CONTACTED: '#6366f1', WARM_LEAD: '#f97316', LEAD: '#f9ab00', OFFER_ACCEPTED: '#1e8e3e', CLOSED: '#8430ce', NOT_INTERESTED: '#ea4335' };
        const pipelineFunnel = pipelineOrder.map(stage => ({
            name: pipelineLabels[stage] || stage,
            value: pipelineCounts[stage] || 0,
            fill: pipelineColors[stage] || '#5f6368',
        }));

        // ─── NEW: Revenue Analytics ─────────────────────────────────────
        const paidBreakdown = [
            { name: 'Paid', value: projects.filter(p => p.paid_status === 'PAID').length, color: '#1e8e3e' },
            { name: 'Partially Paid', value: projects.filter(p => p.paid_status === 'PARTIALLY_PAID').length, color: '#f9ab00' },
            { name: 'Unpaid', value: projects.filter(p => p.paid_status === 'UNPAID').length, color: '#ea4335' },
        ];
        const avgDealSize = projects.length > 0 ? totalRevenue / projects.length : 0;

        // Revenue by month
        const revenueByMonth: Record<string, number> = {};
        projects.forEach(p => {
            const month = (p.created_at || '').split('T')[0]?.substring(0, 7) || '';
            if (month) revenueByMonth[month] = (revenueByMonth[month] || 0) + (p.project_value || 0);
        });
        const revenueTrend = Object.entries(revenueByMonth)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, revenue]) => ({ name: month.split('-')[1] + '/' + month.split('-')[0]?.slice(2), revenue: Math.round(revenue) }));

        // ─── NEW: Project Analytics ─────────────────────────────────────
        const priorityDist = [
            { name: 'Low', value: projects.filter(p => p.priority === 'LOW').length, color: '#5f6368' },
            { name: 'Medium', value: projects.filter(p => p.priority === 'MEDIUM').length, color: '#1a73e8' },
            { name: 'High', value: projects.filter(p => p.priority === 'HIGH').length, color: '#f9ab00' },
            { name: 'Urgent', value: projects.filter(p => p.priority === 'URGENT').length, color: '#ea4335' },
        ];
        const reviewStats = [
            { name: 'Approved', value: projects.filter(p => p.final_review === 'APPROVED').length, color: '#1e8e3e' },
            { name: 'Pending', value: projects.filter(p => p.final_review === 'PENDING').length, color: '#f9ab00' },
            { name: 'Revisions', value: projects.filter(p => p.final_review === 'REVISIONS_NEEDED').length, color: '#ea4335' },
        ];

        // On-time vs delayed
        let onTime = 0, delayed = 0;
        projects.forEach(p => {
            if (p.due_date && p.project_date) {
                const due = new Date(p.due_date);
                const now = new Date();
                if (now <= due) onTime++;
                else delayed++;
            }
        });
        const timelinessData = [
            { name: 'On Time', value: onTime, color: '#1e8e3e' },
            { name: 'Delayed', value: delayed, color: '#ea4335' },
        ];

        // ─── Response Time (avg from thread stats) ─────────────────────
        const avgResponseHours = 0; // Would need per-row data; skip for speed
        const responseTimeBuckets = [
            { name: '<1h', value: 0, color: '#1e8e3e' },
            { name: '1-6h', value: 0, color: '#34a853' },
            { name: '6-24h', value: 0, color: '#f9ab00' },
            { name: '1-3d', value: 0, color: '#e37400' },
            { name: '3d+', value: 0, color: '#ea4335' },
        ];

        return {
            success: true,
            stats: { ...stats, avgResponseHours: avgResponseHours.toFixed(1), avgDealSize: Math.round(avgDealSize), totalThreads: Number(ts.total_threads) || 0 },
            funnelData,
            openVsReplyData,
            leaderboard,
            deliverability,
            sentimentData,
            dailyData,
            hourlyEngagement,
            topSubjects,
            accountPerformance,
            // New data
            volumeByDay,
            heatmapData,
            threadDepthData,
            unreadData,
            bestSubjects,
            topClients,
            pipelineFunnel,
            paidBreakdown,
            revenueTrend,
            priorityDist,
            reviewStats,
            timelinessData,
            responseTimeBuckets,
            outreachBreakdown,
        };
    } catch (error: any) {
        console.error('getAnalyticsDataAction error:', error);
        return { success: false, error: 'An unexpected error occurred' };
    }
}

// ─── Types ──────────────────────────────────────────────────────────────────

type EmailRow = {
    sent_at: string;
    direction: string;
    is_spam: boolean;
    subject: string | null;
    opened_at: string | null;
    thread_id: string;
    is_unread: boolean;
    from_email: string;
    email_type: string | null;
};

// ─── Derived data functions ─────────────────────────────────────────────────

function deriveDailyData(allMessages: EmailRow[], startDate: string, endDate: string) {
    const dayMap: Record<string, { sent: number; received: number }> = {};
    allMessages.forEach(m => {
        const dateStr = m.sent_at?.split('T')[0];
        if (!dateStr) return;
        if (!dayMap[dateStr]) dayMap[dateStr] = { sent: 0, received: 0 };
        if (m.direction === 'SENT') dayMap[dateStr].sent++;
        else if (m.direction === 'RECEIVED') dayMap[dateStr].received++;
    });

    const days = [];
    const curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
        const dStr = curr.toISOString().split('T')[0] || '';
        const counts = dayMap[dStr] || { sent: 0, received: 0 };
        days.push({ name: dStr.split('-').slice(1).join('/'), sent: counts.sent, received: counts.received });
        curr.setDate(curr.getDate() + 1);
    }
    return days;
}

function deriveHourlyEngagement(receivedMessages: EmailRow[]) {
    const hours = Array.from({ length: 24 }, (_, i) => ({ name: `${i}:00`, replies: 0 }));
    receivedMessages.forEach(m => {
        const h = new Date(m.sent_at).getHours();
        if (hours[h]) hours[h].replies++;
    });
    return hours;
}

function deriveTopSubjects(receivedMessages: EmailRow[]) {
    const map: Record<string, number> = {};
    receivedMessages.forEach(m => {
        const s = (m.subject || 'No Subject').replace(/^(Re: |re: |RE: |Fwd: |FW: )*/g, '').trim();
        if (s) map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
        .map(([name, replies]) => ({ name, replies }))
        .sort((a, b) => b.replies - a.replies)
        .slice(0, 10);
}

// ─── Manager Leaderboard ────────────────────────────────────────────────────

async function fetchManagerLeaderboard(startDate: string, endDate: string) {
    const { data: managers } = await supabase.from('users').select('id, name, avatar_url').in('role', ['ADMIN', 'ACCOUNT_MANAGER']);
    if (!managers || managers.length === 0) return [];

    const managerIds = managers.map(m => m.id);

    // Batch: get all account IDs for managers, then sent/received counts
    const { data: managerAccounts } = await supabase
        .from('gmail_accounts')
        .select('id, user_id')
        .in('user_id', managerIds);

    const accToManager: Record<string, string> = {};
    (managerAccounts || []).forEach(a => { accToManager[a.id] = a.user_id; });
    const allAccIds = Object.keys(accToManager);

    // Fetch sent/received per manager via email_messages
    const [sentData, recvData, projResult, leadResult] = await Promise.all([
        allAccIds.length > 0
            ? fetchAllPaginated<{ gmail_account_id: string }>((from, to) =>
                supabase.from('email_messages').select('gmail_account_id')
                    .in('gmail_account_id', allAccIds).eq('direction', 'SENT')
                    .gte('sent_at', startDate).lte('sent_at', endDate).range(from, to))
            : Promise.resolve([]),
        allAccIds.length > 0
            ? fetchAllPaginated<{ gmail_account_id: string }>((from, to) =>
                supabase.from('email_messages').select('gmail_account_id')
                    .in('gmail_account_id', allAccIds).eq('direction', 'RECEIVED')
                    .gte('sent_at', startDate).lte('sent_at', endDate).range(from, to))
            : Promise.resolve([]),
        supabase.from('projects').select('account_manager_id, project_value, paid_status')
            .in('account_manager_id', managerIds)
            .gte('created_at', startDate).lte('created_at', endDate).limit(5000),
        supabase.from('contacts').select('account_manager_id')
            .in('account_manager_id', managerIds).eq('is_lead', true)
            .gte('created_at', startDate).lte('created_at', endDate).limit(5000),
    ]);

    // Aggregate per manager
    const sentCounts: Record<string, number> = {};
    const recvCounts: Record<string, number> = {};
    (sentData as any[]).forEach(r => {
        const mid = accToManager[r.gmail_account_id];
        if (mid) sentCounts[mid] = (sentCounts[mid] || 0) + 1;
    });
    (recvData as any[]).forEach(r => {
        const mid = accToManager[r.gmail_account_id];
        if (mid) recvCounts[mid] = (recvCounts[mid] || 0) + 1;
    });

    const allProjects = projResult.data || [];
    const allLeads = leadResult.data || [];

    return managers.map(m => {
        const projs = allProjects.filter(p => p.account_manager_id === m.id);
        const leads = allLeads.filter(l => l.account_manager_id === m.id).length;
        const rev = projs.reduce((acc, p) => acc + (p.project_value || 0), 0);
        const closed = projs.filter(p => p.paid_status === 'PAID').length;
        const s = sentCounts[m.id] || 0;
        const r = recvCounts[m.id] || 0;

        return {
            name: m.name,
            avatar: m.avatar_url,
            leads,
            revenue: rev,
            closedDeals: closed,
            sent: s,
            received: r,
            replyRate: s > 0 ? ((r / s) * 100).toFixed(1) + '%' : '0%',
            conversion: leads ? ((closed / leads) * 100).toFixed(1) + '%' : '0%',
        };
    }).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads || b.sent - a.sent);
}

// ─── Account Performance ────────────────────────────────────────────────────

async function fetchAccountPerformance(startDate: string, endDate: string) {
    const { data: accs } = await supabase.from('gmail_accounts').select('id, email, status').eq('status', 'ACTIVE');
    if (!accs || accs.length === 0) return [];

    const accIds = accs.map(a => a.id);

    const [sentData, recvData] = await Promise.all([
        fetchAllPaginated<{ gmail_account_id: string }>((from, to) =>
            supabase.from('email_messages').select('gmail_account_id')
                .in('gmail_account_id', accIds).eq('direction', 'SENT')
                .gte('sent_at', startDate).lte('sent_at', endDate).range(from, to)),
        fetchAllPaginated<{ gmail_account_id: string }>((from, to) =>
            supabase.from('email_messages').select('gmail_account_id')
                .in('gmail_account_id', accIds).eq('direction', 'RECEIVED')
                .gte('sent_at', startDate).lte('sent_at', endDate).range(from, to)),
    ]);

    const sentCounts: Record<string, number> = {};
    const recvCounts: Record<string, number> = {};
    sentData.forEach(r => { sentCounts[r.gmail_account_id] = (sentCounts[r.gmail_account_id] || 0) + 1; });
    recvData.forEach(r => { recvCounts[r.gmail_account_id] = (recvCounts[r.gmail_account_id] || 0) + 1; });

    return accs.map(a => {
        const s = sentCounts[a.id] || 0;
        const r = recvCounts[a.id] || 0;
        return {
            name: a.email.split('@')[0],
            email: a.email,
            sent: s,
            received: r,
            replyRate: s ? ((r / s) * 100).toFixed(1) + '%' : '0%',
            status: a.status,
        };
    });
}

// ─── Empty analytics response ───────────────────────────────────────────────

function emptyAnalytics() {
    return {
        success: true,
        stats: {
            totalOutreach: 0, totalReceived: 0, leadsGenerated: 0,
            avgReplyRate: '0%', totalRevenue: 0, paidRevenue: 0, closedDeals: 0,
            spamCount: 0, openRate: '0%', openedEmails: 0, totalEmails: 0,
            avgResponseHours: '0', avgDealSize: 0, totalThreads: 0,
            outreachFirst: 0, followUps: 0, conversational: 0,
            firstReplies: 0, continuedReplies: 0, uniqueProspectsOutreached: 0,
        },
        funnelData: [], openVsReplyData: [], leaderboard: [], deliverability: { inboxRate: '100%', spamRate: '0%', health: 'Excellent' },
        sentimentData: [], dailyData: [], hourlyEngagement: [], topSubjects: [], accountPerformance: [],
        volumeByDay: [], heatmapData: [], threadDepthData: [], unreadData: [], bestSubjects: [],
        topClients: [], pipelineFunnel: [], paidBreakdown: [], revenueTrend: [], priorityDist: [],
        reviewStats: [], timelinessData: [], responseTimeBuckets: [], outreachBreakdown: [],
    };
}
