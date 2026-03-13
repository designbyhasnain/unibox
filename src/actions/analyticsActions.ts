'use server';

import { supabase } from '../lib/supabase';

export async function getAnalyticsDataAction(params: {
    startDate: string;
    endDate: string;
    managerId: string;
    accountId: string;
}) {
    try {
        const { startDate, endDate, managerId, accountId } = params;

        // ─── 1. Core KPIs ──────────────────────────────────────────────
        const stats = await fetchCoreStats(startDate, endDate, managerId, accountId);

        // ─── 2. Conversion Funnel ──────────────────────────────────────
        const funnelData = [
            { name: 'Sent', value: stats.totalOutreach, fill: '#6366f1' },
            { name: 'Opened', value: stats.openedEmails, fill: '#10b981' },
            { name: 'Clicked', value: stats.clickedEmails, fill: '#f59e0b' },
            { name: 'Replied', value: stats.totalReceived, fill: '#8b5cf6' },
            { name: 'Leads', value: stats.leadsGenerated, fill: '#06b6d4' },
        ];

        // ─── 3. Manager Leaderboard ───────────────────────────────────
        const leaderboard = await fetchManagerLeaderboard(startDate, endDate);

        // ─── 4. Deliverability Monitor ────────────────────────────────
        const deliverability = await fetchDeliverability(startDate, endDate, accountId);

        // ─── 5. AI Sentiment Analysis (Inferred from pipeline/spam) ────
        const sentimentData = [
            { name: 'Positive', value: stats.leadsGenerated, color: '#34a853' },
            { name: 'Neutral', value: Math.max(0, stats.totalReceived - stats.leadsGenerated), color: '#fbbc04' },
            { name: 'Negative', value: stats.spamCount || 0, color: '#ea4335' },
        ];

        // ─── 6. Performance Trends ────────────────────────────────────
        const dailyData = await fetchDailyData(startDate, endDate, accountId);
        const hourlyEngagement = await fetchHourlyEngagement(startDate, endDate, accountId);
        const topSubjects = await fetchTopSubjects(startDate, endDate, accountId);
        const accountPerformance = await fetchAccountPerformance(startDate, endDate);

        return {
            success: true,
            stats,
            funnelData,
            leaderboard,
            deliverability,
            sentimentData,
            dailyData,
            hourlyEngagement,
            topSubjects,
            accountPerformance,
        };
    } catch (error: any) {
        console.error('getAnalyticsDataAction error:', error);
        return { success: false, error: error.message };
    }
}

async function fetchCoreStats(startDate: string, endDate: string, managerId: string, accountId: string) {
    let sentQ = supabase.from('email_messages').select('id, opens_count, clicks_count', { count: 'exact' }).eq('direction', 'SENT').gte('sent_at', startDate).lte('sent_at', endDate);
    let recvQ = supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('direction', 'RECEIVED').gte('sent_at', startDate).lte('sent_at', endDate);
    let leadQ = supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('is_lead', true).gte('created_at', startDate).lte('created_at', endDate);
    let projQ = supabase.from('projects').select('project_value, paid_status').gte('created_at', startDate).lte('created_at', endDate);
    let spamQ = supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('is_spam', true).gte('sent_at', startDate).lte('sent_at', endDate);

    if (accountId !== 'ALL') {
        sentQ = sentQ.eq('gmail_account_id', accountId);
        recvQ = recvQ.eq('gmail_account_id', accountId);
        spamQ = spamQ.eq('gmail_account_id', accountId);
    }
    if (managerId !== 'ALL') {
        leadQ = leadQ.eq('account_manager_id', managerId);
        projQ = projQ.eq('account_manager_id', managerId);
    }

    const [sent, recv, lead, proj, spam] = await Promise.all([sentQ, recvQ, leadQ, projQ, spamQ]);
    
    const projects = proj.data || [];
    const sentMessages = sent.data || [];
    
    const totalRevenue = projects.reduce((acc, p) => acc + (p.project_value || 0), 0);
    const paidRevenue = projects.filter(p => p.paid_status === 'PAID').reduce((acc, p) => acc + (p.project_value || 0), 0);

    // Calculate REAL tracking stats
    const totalOutreach = sent.count || 0;
    const openedEmails = sentMessages.filter(m => (m.opens_count || 0) > 0).length;
    const clickedEmails = sentMessages.filter(m => (m.clicks_count || 0) > 0).length;

    const openRateNum = totalOutreach > 0 ? (openedEmails / totalOutreach) * 100 : 0;
    const clickRateNum = totalOutreach > 0 ? (clickedEmails / totalOutreach) * 100 : 0;

    return {
        totalOutreach,
        totalReceived: recv.count || 0,
        leadsGenerated: lead.count || 0,
        avgReplyRate: totalOutreach > 0 ? ((recv.count || 0) / totalOutreach * 100).toFixed(1) + '%' : '0%',
        totalRevenue,
        paidRevenue,
        closedDeals: projects.filter(p => p.paid_status === 'PAID').length,
        spamCount: spam.count || 0,
        openRate: openRateNum.toFixed(1) + '%',
        clickRate: clickRateNum.toFixed(1) + '%',
        openedEmails,
        clickedEmails
    };
}

async function fetchManagerLeaderboard(startDate: string, endDate: string) {
    const { data: managers } = await supabase.from('users').select('id, name, avatar_url').eq('role', 'ACCOUNT_MANAGER');
    if (!managers) return [];

    const leaderboard = await Promise.all(managers.map(async (m) => {
        const { data: projs } = await supabase.from('projects').select('project_value, paid_status').eq('account_manager_id', m.id).gte('created_at', startDate).lte('created_at', endDate);
        const { count: leads } = await supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('account_manager_id', m.id).eq('is_lead', true);
        
        const rev = projs?.reduce((acc, p) => acc + (p.project_value || 0), 0) || 0;
        const closed = projs?.filter(p => p.paid_status === 'PAID').length || 0;

        return {
            name: m.name,
            avatar: m.avatar_url,
            leads: leads || 0,
            revenue: rev,
            closedDeals: closed,
            conversion: leads ? ((closed / leads) * 100).toFixed(1) + '%' : '0%'
        };
    }));

    return leaderboard.sort((a, b) => b.revenue - a.revenue);
}

async function fetchDeliverability(startDate: string, endDate: string, accountId: string) {
    let q = supabase.from('email_messages').select('is_spam, direction').eq('direction', 'SENT').gte('sent_at', startDate).lte('sent_at', endDate);
    if (accountId !== 'ALL') q = q.eq('gmail_account_id', accountId);
    
    const { data } = await q;
    const total = data?.length || 0;
    const spam = data?.filter(m => m.is_spam).length || 0;
    
    const inboxRate = total ? (((total - spam) / total) * 100).toFixed(1) : '100';
    
    return {
        inboxRate: inboxRate + '%',
        spamRate: total ? ((spam / total) * 100).toFixed(1) + '%' : '0%',
        health: parseFloat(inboxRate) > 95 ? 'Excellent' : (parseFloat(inboxRate) > 85 ? 'Good' : 'Critical')
    };
}

async function fetchTopSubjects(startDate: string, endDate: string, accountId: string) {
    let query = supabase.from('email_messages').select('subject').eq('direction', 'RECEIVED').gte('sent_at', startDate).lte('sent_at', endDate);
    if (accountId !== 'ALL') query = query.eq('gmail_account_id', accountId);
    const { data } = await query;
    const map: any = {};
    data?.forEach(m => {
        const s = (m.subject || 'No Subject').replace(/Re: |re: |Fwd: /g, '').trim();
        if (s) map[s] = (map[s] || 0) + 1;
    });
    return Object.keys(map).map(k => ({ name: k, replies: map[k] })).sort((a,b) => b.replies - a.replies).slice(0, 5);
}

async function fetchHourlyEngagement(startDate: string, endDate: string, accountId: string) {
    let query = supabase.from('email_messages').select('sent_at').eq('direction', 'RECEIVED').gte('sent_at', startDate).lte('sent_at', endDate);
    if (accountId !== 'ALL') query = query.eq('gmail_account_id', accountId);
    const { data } = await query;
    const hours = Array.from({length: 24}, (_, i) => ({ name: `${i}:00`, replies: 0 }));
    data?.forEach(m => {
        const h = new Date(m.sent_at).getHours();
        if (hours[h]) {
            hours[h].replies++;
        }
    });
    return hours;
}


async function fetchDailyData(startDate: string, endDate: string, accountId: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = [];
    let curr = new Date(start);
    while (curr <= end) {
        const dStr = curr.toISOString().split('T')[0] || '';
        let sentQ = supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('direction', 'SENT').gte('sent_at', dStr + 'T00:00:00').lte('sent_at', dStr + 'T23:59:59');
        let recvQ = supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('direction', 'RECEIVED').gte('sent_at', dStr + 'T00:00:00').lte('sent_at', dStr + 'T23:59:59');
        if (accountId !== 'ALL') { sentQ = sentQ.eq('gmail_account_id', accountId); recvQ = recvQ.eq('gmail_account_id', accountId); }
        const [s, r] = await Promise.all([sentQ, recvQ]);
        days.push({ name: (dStr || '').split('-').slice(1).join('/'), sent: s?.count || 0, received: r?.count || 0 });
        curr.setDate(curr.getDate() + 1);
    }
    return days;
}

async function fetchAccountPerformance(startDate: string, endDate: string) {
    const { data: accs } = await supabase.from('gmail_accounts').select('id, email, status').eq('status', 'ACTIVE');
    if (!accs) return [];
    return Promise.all(accs.map(async (a) => {
        const { count: s } = await supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('gmail_account_id', a.id).eq('direction', 'SENT').gte('sent_at', startDate).lte('sent_at', endDate);
        const { count: r } = await supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('gmail_account_id', a.id).eq('direction', 'RECEIVED').gte('sent_at', startDate).lte('sent_at', endDate);
        return { name: a.email.split('@')[0], email: a.email, sent: s || 0, received: r || 0, replyRate: s ? ((r || 0) / s * 100).toFixed(1) + '%' : '0%', status: a.status };
    }));
}

