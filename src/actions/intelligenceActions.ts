'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';

/** 2.2 — Churn Predictor: contacts whose response speed is slowing */
export async function getChurnRisksAction() {
    await ensureAuthenticated();
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
    await ensureAuthenticated();
    const { data, error } = await supabase.rpc('detect_competitor_mentions');
    if (error) { console.error('Competitor RPC error:', error); return []; }
    return (data || []).map((r: any) => ({
        id: r.contact_id, name: r.contact_name, email: r.contact_email,
        mentionText: r.mention_text, mentionDate: r.mention_date,
    }));
}

/** 3.2 — Revenue Forecasting */
export async function getRevenueForecastAction() {
    await ensureAuthenticated();
    const { data, error } = await supabase.rpc('get_revenue_forecast');
    if (error) { console.error('Forecast RPC error:', error); return null; }
    return data;
}

/** 3.4 — Auto-Escalation Alerts */
export async function getEscalationAlertsAction() {
    await ensureAuthenticated();
    const { data, error } = await supabase.rpc('get_escalation_alerts');
    if (error) { console.error('Escalation RPC error:', error); return null; }
    return data;
}

/** Combined intelligence dashboard (single RPC — fast) */
export async function getIntelligenceDashboardAction() {
    await ensureAuthenticated();
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
