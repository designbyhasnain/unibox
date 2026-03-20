'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

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
    await ensureAuthenticated();
    try {
        const { startDate, endDate, managerId, accountId } = params;
        if (!startDate || !endDate || !managerId || !accountId) {
            return { success: false, error: 'startDate, endDate, managerId, and accountId are required' };
        }

        const filterIds = await resolveFilterAccountIds(accountId, managerId);

        // If filtered to specific accounts and none found, return empty
        if (filterIds && filterIds.length === 0) {
            return emptyAnalytics();
        }

        // ─── Fetch all messages in date range (paginated) ────────────────
        const allMessages = await fetchAllPaginated<EmailRow>((from, to) => {
            let q = supabase
                .from('email_messages')
                .select('sent_at, direction, is_spam, subject, thread_id, is_unread, from_email, opened_at, email_type')
                .gte('sent_at', startDate)
                .lte('sent_at', endDate)
                .range(from, to);
            if (filterIds) {
                q = filterIds.length === 1 ? q.eq('gmail_account_id', filterIds[0]) : q.in('gmail_account_id', filterIds);
            }
            return q;
        });

        // ─── Derive all stats from fetched data ─────────────────────────
        const sent = allMessages.filter(m => m.direction === 'SENT');
        const received = allMessages.filter(m => m.direction === 'RECEIVED');
        const spam = allMessages.filter(m => m.is_spam);
        const opened = sent.filter(m => !!m.opened_at);

        const totalOutreach = sent.length;
        const totalReceived = received.length;
        const openedEmails = opened.length;

        // ─── Email Type Classification Breakdown ─────────────────────
        const outreachFirst = allMessages.filter(m => m.email_type === 'OUTREACH_FIRST');
        const followUps = allMessages.filter(m => m.email_type === 'FOLLOW_UP');
        const conversational = allMessages.filter(m => m.email_type === 'CONVERSATIONAL');
        const firstReplies = allMessages.filter(m => m.email_type === 'FIRST_REPLY');
        const continuedReplies = allMessages.filter(m => m.email_type === 'CONTINUED_REPLY');

        // Correct reply rate: First replies / unique prospects outreached
        const uniqueProspectsOutreached = outreachFirst.length;
        const correctReplyRate = uniqueProspectsOutreached > 0
            ? ((firstReplies.length / uniqueProspectsOutreached) * 100).toFixed(1) + '%'
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
        const pipelineQ = supabase.from('contacts').select('pipeline_stage').not('pipeline_stage', 'is', null).limit(10000);
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
            spamCount: spam.length,
            openRate: totalOutreach > 0 ? ((openedEmails / totalOutreach) * 100).toFixed(1) + '%' : '0%',
            openedEmails,
            totalEmails: allMessages.length,
            // New classification stats
            outreachFirst: outreachFirst.length,
            followUps: followUps.length,
            conversational: conversational.length,
            firstReplies: firstReplies.length,
            continuedReplies: continuedReplies.length,
            uniqueProspectsOutreached: uniqueProspectsOutreached,
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
        const spamSent = sent.filter(m => m.is_spam).length;
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

        // ─── Daily Trend ────────────────────────────────────────────────
        const dailyData = deriveDailyData(allMessages, startDate, endDate);

        // ─── Hourly Engagement ──────────────────────────────────────────
        const hourlyEngagement = deriveHourlyEngagement(received);

        // ─── Top Subjects ───────────────────────────────────────────────
        const topSubjects = deriveTopSubjects(received);

        // ─── Leaderboard & Account Performance (parallel) ───────────────
        const [leaderboard, accountPerformance] = await Promise.all([
            fetchManagerLeaderboard(startDate, endDate),
            fetchAccountPerformance(startDate, endDate),
        ]);

        // ─── NEW: Email Volume by Day of Week ───────────────────────────
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const volumeByDay = dayNames.map(name => ({ name, sent: 0, received: 0 }));
        allMessages.forEach(m => {
            const day = new Date(m.sent_at).getDay();
            if (volumeByDay[day]) {
                if (m.direction === 'SENT') volumeByDay[day].sent++;
                else if (m.direction === 'RECEIVED') volumeByDay[day].received++;
            }
        });

        // ─── NEW: Busiest Hours Heatmap (day x hour) ────────────────────
        const heatmapData: { day: string; hour: number; count: number }[] = [];
        const heatmap: Record<string, number> = {};
        allMessages.forEach(m => {
            const d = new Date(m.sent_at);
            const key = `${d.getDay()}-${d.getHours()}`;
            heatmap[key] = (heatmap[key] || 0) + 1;
        });
        for (let day = 0; day < 7; day++) {
            for (let hour = 0; hour < 24; hour++) {
                heatmapData.push({ day: dayNames[day] || '', hour, count: heatmap[`${day}-${hour}`] || 0 });
            }
        }

        // ─── NEW: Thread Depth Analysis ─────────────────────────────────
        const threadCounts: Record<string, number> = {};
        allMessages.forEach(m => {
            threadCounts[m.thread_id] = (threadCounts[m.thread_id] || 0) + 1;
        });
        const threadDepths = Object.values(threadCounts);
        const avgThreadDepth = threadDepths.length > 0 ? (threadDepths.reduce((a, b) => a + b, 0) / threadDepths.length) : 0;
        const singleEmails = threadDepths.filter(d => d === 1).length;
        const shortThreads = threadDepths.filter(d => d >= 2 && d <= 3).length;
        const longThreads = threadDepths.filter(d => d >= 4).length;
        const threadDepthData = [
            { name: 'Single (1)', value: singleEmails, color: '#e8eaed' },
            { name: 'Short (2-3)', value: shortThreads, color: '#1a73e8' },
            { name: 'Long (4+)', value: longThreads, color: '#1e8e3e' },
        ];

        // ─── NEW: Unread/Read Ratio ─────────────────────────────────────
        const unreadCount = allMessages.filter(m => m.is_unread).length;
        const readCount = allMessages.length - unreadCount;
        const unreadData = [
            { name: 'Read', value: readCount, color: '#1e8e3e' },
            { name: 'Unread', value: unreadCount, color: '#ea4335' },
        ];

        // ─── NEW: Best Subject Lines (by open rate on sent emails) ──────
        const subjectOpens: Record<string, { sent: number; opened: number }> = {};
        sent.forEach(m => {
            const s = (m.subject || 'No Subject').replace(/^(Re: |re: |RE: |Fwd: |FW: )*/g, '').trim();
            if (!subjectOpens[s]) subjectOpens[s] = { sent: 0, opened: 0 };
            subjectOpens[s].sent++;
            if (m.opened_at) subjectOpens[s].opened++;
        });
        const bestSubjects = Object.entries(subjectOpens)
            .filter(([, v]) => v.sent >= 2)
            .map(([name, v]) => ({ name, sent: v.sent, opened: v.opened, openRate: v.sent > 0 ? Math.round((v.opened / v.sent) * 100) : 0 }))
            .sort((a, b) => b.openRate - a.openRate || b.sent - a.sent)
            .slice(0, 10);

        // ─── NEW: Client Engagement (top contacts by email count) ───────
        const contactEmails: Record<string, { email: string; sent: number; received: number }> = {};
        allMessages.forEach(m => {
            const email = m.from_email?.match(/<([^>]+)>/)?.[1] || m.from_email || '';
            if (!email) return;
            if (!contactEmails[email]) contactEmails[email] = { email, sent: 0, received: 0 };
            if (m.direction === 'RECEIVED') contactEmails[email].received++;
            else contactEmails[email].sent++;
        });
        const topClients = Object.values(contactEmails)
            .map(c => ({ ...c, total: c.sent + c.received }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        // ─── NEW: Pipeline Funnel ───────────────────────────────────────
        const pipelineCounts: Record<string, number> = {};
        (pipelineRes.data || []).forEach((c: any) => {
            const stage = c.pipeline_stage || 'UNKNOWN';
            pipelineCounts[stage] = (pipelineCounts[stage] || 0) + 1;
        });
        const pipelineOrder = ['COLD_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED', 'NOT_INTERESTED'];
        const pipelineLabels: Record<string, string> = { COLD_LEAD: 'Cold Lead', LEAD: 'Lead', OFFER_ACCEPTED: 'Offer Accepted', CLOSED: 'Closed', NOT_INTERESTED: 'Not Interested' };
        const pipelineColors: Record<string, string> = { COLD_LEAD: '#1a73e8', LEAD: '#f9ab00', OFFER_ACCEPTED: '#1e8e3e', CLOSED: '#8430ce', NOT_INTERESTED: '#ea4335' };
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

        // ─── NEW: Response Time (average hours to get reply) ────────────
        const threadFirstSent: Record<string, Date> = {};
        const threadFirstReply: Record<string, Date> = {};
        sent.forEach(m => {
            const d = new Date(m.sent_at);
            const existing = threadFirstSent[m.thread_id];
            if (!existing || d < existing) {
                threadFirstSent[m.thread_id] = d;
            }
        });
        received.forEach(m => {
            const d = new Date(m.sent_at);
            const sentTime = threadFirstSent[m.thread_id];
            if (sentTime && d > sentTime) {
                const existing = threadFirstReply[m.thread_id];
                if (!existing || d < existing) {
                    threadFirstReply[m.thread_id] = d;
                }
            }
        });
        const responseTimes: number[] = [];
        for (const tid of Object.keys(threadFirstReply)) {
            const sentTime = threadFirstSent[tid];
            const replyTime = threadFirstReply[tid];
            if (sentTime && replyTime) {
                const hours = (replyTime.getTime() - sentTime.getTime()) / (1000 * 60 * 60);
                if (hours > 0 && hours < 720) responseTimes.push(hours);
            }
        }
        const avgResponseHours = responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
        const responseTimeBuckets = [
            { name: '<1h', value: responseTimes.filter(t => t < 1).length, color: '#1e8e3e' },
            { name: '1-6h', value: responseTimes.filter(t => t >= 1 && t < 6).length, color: '#34a853' },
            { name: '6-24h', value: responseTimes.filter(t => t >= 6 && t < 24).length, color: '#f9ab00' },
            { name: '1-3d', value: responseTimes.filter(t => t >= 24 && t < 72).length, color: '#e37400' },
            { name: '3d+', value: responseTimes.filter(t => t >= 72).length, color: '#ea4335' },
        ];

        return {
            success: true,
            stats: { ...stats, avgResponseHours: avgResponseHours.toFixed(1), avgDealSize: Math.round(avgDealSize), totalThreads: threadDepths.length },
            funnelData,
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
    const { data: managers } = await supabase.from('users').select('id, name, avatar_url').eq('role', 'ACCOUNT_MANAGER');
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
        funnelData: [], leaderboard: [], deliverability: { inboxRate: '100%', spamRate: '0%', health: 'Excellent' },
        sentimentData: [], dailyData: [], hourlyEngagement: [], topSubjects: [], accountPerformance: [],
        volumeByDay: [], heatmapData: [], threadDepthData: [], unreadData: [], bestSubjects: [],
        topClients: [], pipelineFunnel: [], paidBreakdown: [], revenueTrend: [], priorityDist: [],
        reviewStats: [], timelinessData: [], responseTimeBuckets: [], outreachBreakdown: [],
    };
}
