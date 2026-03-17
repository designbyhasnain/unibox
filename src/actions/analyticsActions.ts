'use server';

import { unstable_cache } from 'next/cache';
import { supabase } from '../lib/supabase';
import { parseUserAgent } from '../../app/utils/parseUserAgent';

type ResponseTimeData = {
    avgResponseTimeHours: number | null;
    medianResponseTimeHours: number | null;
    responseDistribution: { bucket: string; count: number }[];
};

type PipelineFunnelEntry = { name: string; value: number; fill: string };

type AnalyticsResult =
    | { success: true; stats: any; funnelData: any; leaderboard: any; deliverability: any; sentimentData: any; dailyData: any; hourlyEngagement: any; topSubjects: any; accountPerformance: any; responseTimeData: ResponseTimeData; pipelineFunnel: PipelineFunnelEntry[] }
    | { success: false; error: string };

export async function getAnalyticsDataAction(params: {
    startDate: string;
    endDate: string;
    managerId: string;
    accountId: string;
}): Promise<AnalyticsResult> {
    try {
        const { startDate, endDate, managerId, accountId } = params;

        if (!startDate || !endDate || !managerId || !accountId) {
            return { success: false, error: 'startDate, endDate, managerId, and accountId are required' };
        }

        // Fix A: wrap the entire heavy computation in unstable_cache keyed on all 4 params.
        // The cache key must encode every dimension that affects the result.
        const cacheKey = `analytics-${accountId}-${managerId}-${startDate}-${endDate}`;
        const getCachedAnalytics = unstable_cache(
            () => computeAnalytics(startDate, endDate, managerId, accountId),
            [cacheKey],
            { revalidate: 300 } // 5-minute TTL
        );

        return getCachedAnalytics();
    } catch (error: any) {
        console.error('getAnalyticsDataAction error:', error);
        return { success: false, error: 'An unexpected error occurred' };
    }
}

// ─── Core analytics computation (cached via unstable_cache above) ─────────────
async function computeAnalytics(
    startDate: string,
    endDate: string,
    managerId: string,
    accountId: string
) {
    // Resolve manager → account IDs once, reused by both fetchAllMessages and fetchCoreStats
    const filterAccountIds = await resolveAccountFilter(accountId, managerId);

    // Fix C: run ALL independent heavy queries in parallel instead of sequentially.
    // fetchAllMessages, fetchManagerLeaderboard, fetchAccountPerformance, and the
    // contacts/projects sub-queries inside fetchCoreStats are all independent at this level.
    const [allMessages, leaderboard, accountPerformance, coreStatsRaw, pipelineFunnel] = await Promise.all([
        fetchAllMessages(startDate, endDate, filterAccountIds),
        fetchManagerLeaderboard(startDate, endDate),
        fetchAccountPerformance(startDate, endDate),
        fetchCoreStatsFromDB(startDate, endDate, managerId, filterAccountIds),
        fetchPipelineFunnel(startDate, endDate),
    ]);

    // ─── 0. Response Time (derived from allMessages) ───────────────────────
    const responseTimeData = computeResponseTimes(allMessages);

    // ─── 1. Core KPIs (derived from allMessages + DB counts) ───────────────
    const stats = buildCoreStats(allMessages, coreStatsRaw, responseTimeData);

    // ─── 2. Conversion Funnel ──────────────────────────────────────────────
    const funnelData = [
        { name: 'Sent', value: stats.totalOutreach, fill: '#6366f1' },
        { name: 'Opened', value: stats.openedEmails, fill: '#10b981' },
        { name: 'Clicked', value: stats.clickedEmails, fill: '#f59e0b' },
        { name: 'Replied', value: stats.totalReceived, fill: '#8b5cf6' },
        { name: 'Leads', value: stats.leadsGenerated, fill: '#06b6d4' },
    ];

    // ─── 4. Deliverability Monitor (derived from allMessages) ───────
    const deliverability = deriveDeliverability(allMessages);

    // ─── 5. AI Sentiment Analysis (Inferred from pipeline/spam) ────
    const sentimentData = [
        { name: 'Positive', value: stats.leadsGenerated, color: '#34a853' },
        { name: 'Neutral', value: Math.max(0, stats.totalReceived - stats.leadsGenerated), color: '#fbbc04' },
        { name: 'Negative', value: stats.spamCount || 0, color: '#ea4335' },
    ];

    // ─── 6. Performance Trends (all derived from allMessages) ───────
    const dailyData = deriveDailyData(allMessages, startDate, endDate);
    const hourlyEngagement = deriveHourlyEngagement(allMessages);
    const topSubjects = deriveTopSubjects(allMessages);

    return {
        success: true as const,
        stats,
        funnelData,
        leaderboard,
        deliverability,
        sentimentData,
        dailyData,
        hourlyEngagement,
        topSubjects,
        accountPerformance,
        responseTimeData,
        pipelineFunnel,
    };
}

// ─── Response Time Calculation ────────────────────────────────────────────────
// For each RECEIVED message in a thread, find the first subsequent SENT message
// and compute the time difference. Returns avg, median, and distribution buckets.
function computeResponseTimes(allMessages: EmailMessageRow[]): ResponseTimeData {
    // Group messages by thread
    const threadMap = new Map<string, { received: Date[]; sent: Date[] }>();
    for (const msg of allMessages) {
        if (msg.direction !== 'SENT' && msg.direction !== 'RECEIVED') continue;
        if (!msg.thread_id || !msg.sent_at) continue;
        if (!threadMap.has(msg.thread_id)) {
            threadMap.set(msg.thread_id, { received: [], sent: [] });
        }
        const entry = threadMap.get(msg.thread_id)!;
        const date = new Date(msg.sent_at);
        if (msg.direction === 'RECEIVED') entry.received.push(date);
        else entry.sent.push(date);
    }

    // For each thread, pair each RECEIVED with the first subsequent SENT.
    // Use a two-pointer approach so each SENT message is consumed at most once.
    const responseHours: number[] = [];
    for (const [, { received, sent }] of threadMap) {
        if (received.length === 0 || sent.length === 0) continue;
        // Sort both arrays by time
        received.sort((a, b) => a.getTime() - b.getTime());
        sent.sort((a, b) => a.getTime() - b.getTime());

        let sentIdx = 0;
        for (const recvDate of received) {
            // Advance past any SENT messages that are before or at this RECEIVED time
            while (sentIdx < sent.length && sent[sentIdx]!.getTime() <= recvDate.getTime()) {
                sentIdx++;
            }
            if (sentIdx < sent.length) {
                const diffHours = (sent[sentIdx]!.getTime() - recvDate.getTime()) / (1000 * 60 * 60);
                responseHours.push(diffHours);
                sentIdx++; // consume this sent message so it isn't reused
            }
        }
    }

    if (responseHours.length === 0) {
        return {
            avgResponseTimeHours: null,
            medianResponseTimeHours: null,
            responseDistribution: [
                { bucket: '< 1h', count: 0 },
                { bucket: '1-4h', count: 0 },
                { bucket: '4-12h', count: 0 },
                { bucket: '12-24h', count: 0 },
                { bucket: '1-3d', count: 0 },
                { bucket: '> 3d', count: 0 },
            ],
        };
    }

    // Calculate avg
    const avg = responseHours.reduce((sum, h) => sum + h, 0) / responseHours.length;

    // Calculate median
    const sorted = [...responseHours].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
        ? ((sorted[mid - 1]!) + (sorted[mid]!)) / 2
        : sorted[mid]!;

    // Build distribution buckets
    const buckets = [
        { bucket: '< 1h', count: 0 },
        { bucket: '1-4h', count: 0 },
        { bucket: '4-12h', count: 0 },
        { bucket: '12-24h', count: 0 },
        { bucket: '1-3d', count: 0 },
        { bucket: '> 3d', count: 0 },
    ];

    for (const h of responseHours) {
        if (h < 1) buckets[0]!.count++;
        else if (h < 4) buckets[1]!.count++;
        else if (h < 12) buckets[2]!.count++;
        else if (h < 24) buckets[3]!.count++;
        else if (h < 72) buckets[4]!.count++;
        else buckets[5]!.count++;
    }

    return {
        avgResponseTimeHours: Math.round(avg * 10) / 10,
        medianResponseTimeHours: Math.round(median * 10) / 10,
        responseDistribution: buckets,
    };
}

// ─── Pipeline Funnel ─────────────────────────────────────────────────────────
async function fetchPipelineFunnel(startDate: string, endDate: string): Promise<PipelineFunnelEntry[]> {
    const { data: pipelineContacts } = await supabase
        .from('contacts')
        .select('pipeline_stage')
        .not('pipeline_stage', 'is', null)
        .gte('created_at', startDate)
        .lte('created_at', endDate);

    const contacts = pipelineContacts || [];
    return [
        { name: 'Cold Leads', value: contacts.filter(c => c.pipeline_stage === 'COLD_LEAD').length, fill: '#6366f1' },
        { name: 'Leads', value: contacts.filter(c => c.pipeline_stage === 'LEAD').length, fill: '#f59e0b' },
        { name: 'Offer Accepted', value: contacts.filter(c => c.pipeline_stage === 'OFFER_ACCEPTED').length, fill: '#10b981' },
        { name: 'Closed', value: contacts.filter(c => c.pipeline_stage === 'CLOSED').length, fill: '#8b5cf6' },
        { name: 'Not Interested', value: contacts.filter(c => c.pipeline_stage === 'NOT_INTERESTED').length, fill: '#ef4444' },
    ];
}

// ─── Resolve accountId/managerId to a list of gmail_account IDs (or null = ALL) ──
async function resolveAccountFilter(
    accountId: string,
    managerId: string
): Promise<string[] | null> {
    if (accountId !== 'ALL') {
        return [accountId];
    }
    if (managerId !== 'ALL') {
        const { data: managerAccounts } = await supabase
            .from('gmail_accounts')
            .select('id')
            .eq('user_id', managerId);
        return managerAccounts?.map(a => a.id) || [];
    }
    return null; // means "all accounts"
}

// ─── Consolidated email_messages fetch ──────────────────────────────────────
// Fix B: only the minimum columns needed for analytics are selected (no body, snippet, etc.)
type EmailMessageRow = {
    sent_at: string;
    direction: string;
    is_spam: boolean;
    subject: string | null;
    opens_count: number | null;
    clicks_count: number | null;
    thread_id: string;
};

async function fetchAllMessages(
    startDate: string,
    endDate: string,
    filterAccountIds: string[] | null
): Promise<EmailMessageRow[]> {
    let query = supabase
        .from('email_messages')
        .select('sent_at, direction, is_spam, subject, opens_count, clicks_count, thread_id')
        .gte('sent_at', startDate)
        .lte('sent_at', endDate)
        .limit(10000);

    if (filterAccountIds && filterAccountIds.length > 0) {
        if (filterAccountIds.length === 1) {
            query = query.eq('gmail_account_id', filterAccountIds[0]);
        } else {
            query = query.in('gmail_account_id', filterAccountIds);
        }
    }

    const { data } = await query;
    return (data || []) as EmailMessageRow[];
}

// ─── DB queries for core stats (contacts count + projects) ───────────────────
// These run in parallel with fetchAllMessages (Fix C). No email_messages queries here.
async function fetchCoreStatsFromDB(
    startDate: string,
    endDate: string,
    managerId: string,
    filterAccountIds: string[] | null
) {
    let leadQ = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('is_lead', true)
        .gte('created_at', startDate)
        .lte('created_at', endDate);

    let projQ = supabase
        .from('projects')
        .select('project_value, paid_status')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .limit(5000);

    if (managerId !== 'ALL') {
        leadQ = leadQ.eq('account_manager_id', managerId);
        projQ = projQ.eq('account_manager_id', managerId);
    }

    const [lead, proj] = await Promise.all([leadQ, projQ]);
    return { lead, proj };
}

// ─── Build core stats from pre-fetched messages + DB results ─────────────────
function buildCoreStats(
    allMessages: EmailMessageRow[],
    coreStatsRaw: Awaited<ReturnType<typeof fetchCoreStatsFromDB>>,
    responseTimeData: ResponseTimeData
) {
    const sentMessages = allMessages.filter(m => m.direction === 'SENT');
    const receivedMessages = allMessages.filter(m => m.direction === 'RECEIVED');
    const spamMessages = allMessages.filter(m => m.is_spam);

    const totalOutreach = sentMessages.length;
    const totalReceived = receivedMessages.length;
    const spamCount = spamMessages.length;
    const openedEmails = sentMessages.filter(m => (m.opens_count || 0) > 0).length;
    const clickedEmails = sentMessages.filter(m => (m.clicks_count || 0) > 0).length;

    const { lead, proj } = coreStatsRaw;
    const projects = proj.data || [];
    const totalRevenue = projects.reduce((acc, p) => acc + (p.project_value || 0), 0);

    const openRateNum = totalOutreach > 0 ? (openedEmails / totalOutreach) * 100 : 0;
    const clickRateNum = totalOutreach > 0 ? (clickedEmails / totalOutreach) * 100 : 0;

    return {
        totalOutreach,
        totalReceived,
        leadsGenerated: lead.count || 0,
        avgReplyRate: totalOutreach > 0 ? (totalReceived / totalOutreach * 100).toFixed(1) + '%' : '0%',
        totalRevenue,
        paidRevenue: projects.filter(p => p.paid_status === 'PAID').reduce((acc, p) => acc + (p.project_value || 0), 0),
        closedDeals: projects.filter(p => p.paid_status === 'PAID').length,
        spamCount,
        openRate: openRateNum.toFixed(1) + '%',
        clickRate: clickRateNum.toFixed(1) + '%',
        openedEmails,
        clickedEmails,
        avgResponseTimeHours: responseTimeData.avgResponseTimeHours,
        medianResponseTimeHours: responseTimeData.medianResponseTimeHours,
    };
}

// ─── Manager Leaderboard ──────────────────────────────────────────────────────
// Fix 1: Batch query instead of N+1 per manager
async function fetchManagerLeaderboard(startDate: string, endDate: string) {
    const { data: managers } = await supabase.from('users').select('id, name, avatar_url').eq('role', 'ACCOUNT_MANAGER');
    if (!managers || managers.length === 0) return [];

    const managerIds = managers.map(m => m.id);

    // Batch: get all projects and leads for these managers in TWO queries total (instead of 2*N)
    const [projResult, leadResult] = await Promise.all([
        supabase
            .from('projects')
            .select('account_manager_id, project_value, paid_status')
            .in('account_manager_id', managerIds)
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .limit(5000),
        supabase
            .from('contacts')
            .select('account_manager_id')
            .in('account_manager_id', managerIds)
            .eq('is_lead', true)
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .limit(5000),
    ]);

    const allProjects = projResult.data || [];
    const allLeads = leadResult.data || [];

    // Aggregate in JS
    const leaderboard = managers.map(m => {
        const projs = allProjects.filter(p => p.account_manager_id === m.id);
        const leads = allLeads.filter(l => l.account_manager_id === m.id).length;
        const rev = projs.reduce((acc, p) => acc + (p.project_value || 0), 0);
        const closed = projs.filter(p => p.paid_status === 'PAID').length;

        return {
            name: m.name,
            avatar: m.avatar_url,
            leads,
            revenue: rev,
            closedDeals: closed,
            conversion: leads ? ((closed / leads) * 100).toFixed(1) + '%' : '0%'
        };
    });

    return leaderboard.sort((a, b) => b.revenue - a.revenue);
}

// ─── Derived analytics functions (no DB queries, operate on pre-fetched data) ─

function deriveDeliverability(allMessages: EmailMessageRow[]) {
    const sentMessages = allMessages.filter(m => m.direction === 'SENT');
    const total = sentMessages.length;
    const spam = sentMessages.filter(m => m.is_spam).length;

    const inboxRate = total ? (((total - spam) / total) * 100).toFixed(1) : '100';

    return {
        inboxRate: inboxRate + '%',
        spamRate: total ? ((spam / total) * 100).toFixed(1) + '%' : '0%',
        health: parseFloat(inboxRate) > 95 ? 'Excellent' : (parseFloat(inboxRate) > 85 ? 'Good' : 'Critical')
    };
}

function deriveTopSubjects(allMessages: EmailMessageRow[]) {
    const receivedMessages = allMessages.filter(m => m.direction === 'RECEIVED');
    const map: Record<string, number> = {};
    receivedMessages.forEach(m => {
        const s = (m.subject || 'No Subject').replace(/Re: |re: |Fwd: /g, '').trim();
        if (s) map[s] = (map[s] || 0) + 1;
    });
    return Object.keys(map).map(k => ({ name: k, replies: map[k] ?? 0 })).sort((a, b) => b.replies - a.replies).slice(0, 5);
}

function deriveHourlyEngagement(allMessages: EmailMessageRow[]) {
    const receivedMessages = allMessages.filter(m => m.direction === 'RECEIVED');
    const hours = Array.from({ length: 24 }, (_, i) => ({ name: `${i}:00`, replies: 0 }));
    receivedMessages.forEach(m => {
        const h = new Date(m.sent_at).getHours();
        if (hours[h]) {
            hours[h].replies++;
        }
    });
    return hours;
}

function deriveDailyData(allMessages: EmailMessageRow[], startDate: string, endDate: string) {
    // Build a map of date -> { sent, received }
    const dayMap: Record<string, { sent: number; received: number }> = {};
    allMessages.forEach(m => {
        if (m.direction !== 'SENT' && m.direction !== 'RECEIVED') return;
        const dateStr = m.sent_at ? m.sent_at.split('T')[0] : null;
        if (!dateStr) return;
        if (!dayMap[dateStr]) dayMap[dateStr] = { sent: 0, received: 0 };
        if (m.direction === 'SENT') dayMap[dateStr].sent++;
        else if (m.direction === 'RECEIVED') dayMap[dateStr].received++;
    });

    // Build the result array for every day in the range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = [];
    let curr = new Date(start);
    while (curr <= end) {
        const dStr = curr.toISOString().split('T')[0] || '';
        const counts = dayMap[dStr] || { sent: 0, received: 0 };
        days.push({ name: (dStr || '').split('-').slice(1).join('/'), sent: counts.sent, received: counts.received });
        curr.setDate(curr.getDate() + 1);
    }
    return days;
}

// ─── Account Performance ─────────────────────────────────────────────────────
// Fix 2: Batch query instead of N+1 per account.
// Previously fetched up to 50K rows per direction just to count in JS.
// Now we fetch only the gmail_account_id column and use a tighter limit,
// which is still correct since the result is aggregated in JS.
async function fetchAccountPerformance(startDate: string, endDate: string) {
    const { data: accs } = await supabase.from('gmail_accounts').select('id, email, status').eq('status', 'ACTIVE');
    if (!accs || accs.length === 0) return [];

    const accIds = accs.map(a => a.id);

    // Fetch counts: only the account ID column for aggregation, within the date range.
    // Limit is per-query; with a small number of active accounts this is safe.
    const [sentResult, recvResult] = await Promise.all([
        supabase
            .from('email_messages')
            .select('gmail_account_id')
            .in('gmail_account_id', accIds)
            .eq('direction', 'SENT')
            .gte('sent_at', startDate)
            .lte('sent_at', endDate)
            .limit(50000),
        supabase
            .from('email_messages')
            .select('gmail_account_id')
            .in('gmail_account_id', accIds)
            .eq('direction', 'RECEIVED')
            .gte('sent_at', startDate)
            .lte('sent_at', endDate)
            .limit(50000),
    ]);

    // Count in JS
    const sentCounts: Record<string, number> = {};
    const recvCounts: Record<string, number> = {};
    (sentResult.data || []).forEach(r => { sentCounts[r.gmail_account_id] = (sentCounts[r.gmail_account_id] || 0) + 1; });
    (recvResult.data || []).forEach(r => { recvCounts[r.gmail_account_id] = (recvCounts[r.gmail_account_id] || 0) + 1; });

    return accs.map(a => {
        const s = sentCounts[a.id] || 0;
        const r = recvCounts[a.id] || 0;
        return {
            name: a.email.split('@')[0],
            email: a.email,
            sent: s,
            received: r,
            replyRate: s ? ((r / s) * 100).toFixed(1) + '%' : '0%',
            status: a.status
        };
    });
}

export async function getDeviceAnalyticsAction(params: {
    accountId: string;
    startDate: string;
    endDate: string;
}) {
    try {
        const { accountId, startDate, endDate } = params;

        let query = supabase
            .from('email_tracking_events')
            .select('user_agent')
            .in('event_type', ['open', 'click'])
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .limit(5000);

        // If a specific account is selected, filter by tracking IDs belonging to that account's messages
        if (accountId !== 'ALL') {
            const { data: trackingIds } = await supabase
                .from('email_messages')
                .select('tracking_id')
                .eq('gmail_account_id', accountId)
                .not('tracking_id', 'is', null)
                .limit(5000);

            if (trackingIds && trackingIds.length > 0) {
                const ids = trackingIds.map(t => t.tracking_id).filter(Boolean);
                if (ids.length > 0) {
                    query = query.in('tracking_id', ids);
                } else {
                    return { success: true, devices: [], browsers: [], os: [] };
                }
            } else {
                return { success: true, devices: [], browsers: [], os: [] };
            }
        }

        const { data: events, error } = await query;
        if (error || !events) return { success: true, devices: [], browsers: [], os: [] };

        const deviceCounts: Record<string, number> = {};
        const browserCounts: Record<string, number> = {};
        const osCounts: Record<string, number> = {};

        for (const event of events) {
            const parsed = parseUserAgent(event.user_agent || '');
            deviceCounts[parsed.deviceType] = (deviceCounts[parsed.deviceType] || 0) + 1;
            browserCounts[parsed.browser] = (browserCounts[parsed.browser] || 0) + 1;
            osCounts[parsed.os] = (osCounts[parsed.os] || 0) + 1;
        }

        const toSorted = (counts: Record<string, number>) =>
            Object.entries(counts)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

        return {
            success: true,
            devices: toSorted(deviceCounts),
            browsers: toSorted(browserCounts),
            os: toSorted(osCounts),
        };
    } catch (error: any) {
        console.error('getDeviceAnalyticsAction error:', error);
        return { success: false, devices: [], browsers: [], os: [], error: 'An unexpected error occurred' };
    }
}
