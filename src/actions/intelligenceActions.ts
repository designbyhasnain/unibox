'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { requireAdmin } from '../utils/accessControl';

/** 2.2 — Churn Predictor: contacts whose response speed is slowing */
export async function getChurnRisksAction() {
    {
        const { role } = await ensureAuthenticated();
        requireAdmin(role);
    }
    const { data, error } = await supabase.rpc('detect_churn_risk');
    if (error) { console.error('Churn RPC error:', error); return []; }
    return (data || []).map((r: any) => ({
        id: r.contact_id, name: r.contact_name, email: r.contact_email,
        earlyAvgHours: r.avg_early_hours, recentAvgHours: r.avg_recent_hours,
        slowdownFactor: r.slowdown_factor, riskLevel: r.risk_level,
    }));
}

/** 2.4 — Competitor mentions in received emails */
export async function getCompetitorMentionsAction() {
    {
        const { role } = await ensureAuthenticated();
        requireAdmin(role);
    }
    const { data, error } = await supabase.rpc('detect_competitor_mentions');
    if (error) { console.error('Competitor RPC error:', error); return []; }
    return (data || []).map((r: any) => ({
        id: r.contact_id, name: r.contact_name, email: r.contact_email,
        mentionText: r.mention_text, mentionDate: r.mention_date,
    }));
}

/** 3.2 — Revenue Forecasting */
export async function getRevenueForecastAction() {
    {
        const { role } = await ensureAuthenticated();
        requireAdmin(role);
    }
    const { data, error } = await supabase.rpc('get_revenue_forecast');
    if (error) { console.error('Forecast RPC error:', error); return null; }
    return data;
}

/** 3.4 — Auto-Escalation Alerts */
export async function getEscalationAlertsAction() {
    {
        const { role } = await ensureAuthenticated();
        requireAdmin(role);
    }
    const { data, error } = await supabase.rpc('get_escalation_alerts');
    if (error) { console.error('Escalation RPC error:', error); return null; }
    return data;
}

/** Pricing Analytics — avg project values, monthly trends, best clients, price brackets */
export async function getPricingAnalyticsAction() {
    {
        const { role } = await ensureAuthenticated();
        requireAdmin(role);
    }

    // All projects with value
    const { data: projects } = await supabase
        .from('projects')
        .select('project_value, paid_status, project_date, client_id, account_manager')
        .not('project_value', 'is', null)
        .gt('project_value', 0);

    if (!projects || projects.length === 0) return null;

    // Monthly breakdown
    const monthly: Record<string, { total: number; count: number; paid: number; paidCount: number }> = {};
    projects.forEach((p: any) => {
        const month = p.project_date?.slice(0, 7) || 'unknown';
        if (!monthly[month]) monthly[month] = { total: 0, count: 0, paid: 0, paidCount: 0 };
        monthly[month].total += p.project_value;
        monthly[month].count++;
        if (p.paid_status === 'PAID') { monthly[month].paid += p.project_value; monthly[month].paidCount++; }
    });

    const monthlyData = Object.entries(monthly)
        .filter(([m]) => m !== 'unknown')
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 12)
        .map(([month, d]) => ({
            month,
            projects: d.count,
            totalRevenue: Math.round(d.total),
            avgValue: Math.round(d.total / d.count),
            paidCount: d.paidCount,
            collectionRate: Math.round((d.paidCount / d.count) * 100),
        }));

    // Overall stats
    const allValues = projects.map((p: any) => p.project_value);
    const sorted = [...allValues].sort((a, b) => a - b);
    const totalRevenue = allValues.reduce((a: number, b: number) => a + b, 0);
    const avgValue = Math.round(totalRevenue / allValues.length);
    const medianValue = Math.round(sorted[Math.floor(sorted.length / 2)]);

    // Price brackets
    const brackets = [
        { label: '$0–50', min: 0, max: 50, count: 0 },
        { label: '$51–100', min: 51, max: 100, count: 0 },
        { label: '$101–200', min: 101, max: 200, count: 0 },
        { label: '$201–500', min: 201, max: 500, count: 0 },
        { label: '$501–1000', min: 501, max: 1000, count: 0 },
        { label: '$1000+', min: 1001, max: Infinity, count: 0 },
    ];
    allValues.forEach((v: number) => {
        const b = brackets.find(b => v >= b.min && v <= b.max);
        if (b) b.count++;
    });
    const bracketData = brackets.map(b => ({
        label: b.label,
        count: b.count,
        percentage: Math.round((b.count / allValues.length) * 100),
    }));

    // Best clients by revenue
    const clientRev: Record<string, { total: number; count: number; paid: number }> = {};
    projects.forEach((p: any) => {
        if (!p.client_id) return;
        if (!clientRev[p.client_id]) clientRev[p.client_id] = { total: 0, count: 0, paid: 0 };
        clientRev[p.client_id]!.total += p.project_value;
        clientRev[p.client_id]!.count++;
        if (p.paid_status === 'PAID') clientRev[p.client_id]!.paid += p.project_value;
    });

    const topClientIds = Object.entries(clientRev)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .map(([id]) => id);

    const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name, email')
        .in('id', topClientIds);

    const contactMap = Object.fromEntries((contacts || []).map((c: any) => [c.id, c]));
    const topClients = topClientIds.map(id => {
        const d = clientRev[id]!;
        const c = contactMap[id];
        return {
            name: c?.name || 'Unknown',
            email: c?.email || '',
            projects: d.count,
            totalRevenue: Math.round(d.total),
            avgValue: Math.round(d.total / d.count),
            collected: Math.round(d.paid),
            collectionRate: Math.round((d.paid / d.total) * 100),
        };
    });

    // AM performance
    const amRev: Record<string, { total: number; count: number; paid: number }> = {};
    projects.forEach((p: any) => {
        const am = p.account_manager || 'Unassigned';
        if (!amRev[am]) amRev[am] = { total: 0, count: 0, paid: 0 };
        amRev[am].total += p.project_value;
        amRev[am].count++;
        if (p.paid_status === 'PAID') amRev[am].paid += p.project_value;
    });

    const amData = Object.entries(amRev)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, d]) => ({
            name,
            projects: d.count,
            totalRevenue: Math.round(d.total),
            avgValue: Math.round(d.total / d.count),
            collected: Math.round(d.paid),
        }));

    // Winning client profile (paid vs all)
    const paidProjects = projects.filter((p: any) => p.paid_status === 'PAID');
    const unpaidProjects = projects.filter((p: any) => p.paid_status === 'UNPAID');
    const avgPaid = paidProjects.length > 0 ? Math.round(paidProjects.reduce((a: number, p: any) => a + p.project_value, 0) / paidProjects.length) : 0;
    const avgUnpaid = unpaidProjects.length > 0 ? Math.round(unpaidProjects.reduce((a: number, p: any) => a + p.project_value, 0) / unpaidProjects.length) : 0;

    return {
        overall: { totalRevenue: Math.round(totalRevenue), avgValue, medianValue, totalProjects: allValues.length },
        monthly: monthlyData,
        brackets: bracketData,
        topClients,
        amPerformance: amData,
        winningProfile: { avgPaid, avgUnpaid, paidCount: paidProjects.length, unpaidCount: unpaidProjects.length },
    };
}

/** Combined intelligence dashboard (single RPC — fast) */
export async function getIntelligenceDashboardAction() {
    {
        const { role } = await ensureAuthenticated();
        requireAdmin(role);
    }
    const { data, error } = await supabase.rpc('get_intelligence_dashboard');
    if (error) {
        console.error('Intelligence RPC error:', error);
        return { churn: [], competitors: [], forecast: null, escalations: null };
    }
    return {
        churn: data?.churn || [],
        competitors: data?.competitors || [],
        forecast: data?.forecast || null,
        escalations: data?.escalations || null,
    };
}
