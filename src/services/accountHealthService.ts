import { supabase } from '../lib/supabase';

/**
 * Account Health Service (v2)
 * - Monitors bounce rates, spam rates per Gmail account
 * - Auto-pauses accounts that exceed thresholds
 * - Provides health scores for dashboard display
 */

const BOUNCE_RATE_THRESHOLD = 0.05; // 5% — auto-pause above this
const SPAM_RATE_THRESHOLD = 0.001; // 0.1% — warning above this

/** Recalculate bounce rate and health score for an account */
export async function updateAccountHealth(accountId: string): Promise<{
    bounceRate: number;
    healthScore: number;
    shouldPause: boolean;
}> {
    // Get sent email stats for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: totalSent } = await supabase
        .from('email_messages')
        .select('id', { count: 'exact', head: true })
        .eq('gmail_account_id', accountId)
        .eq('direction', 'SENT')
        .gte('sent_at', thirtyDaysAgo.toISOString());

    const { count: totalBounced } = await supabase
        .from('email_messages')
        .select('id', { count: 'exact', head: true })
        .eq('gmail_account_id', accountId)
        .eq('direction', 'SENT')
        .eq('is_spam', true)
        .gte('sent_at', thirtyDaysAgo.toISOString());

    const { count: totalOpened } = await supabase
        .from('email_messages')
        .select('id', { count: 'exact', head: true })
        .eq('gmail_account_id', accountId)
        .eq('direction', 'SENT')
        .not('opened_at', 'is', null)
        .gte('sent_at', thirtyDaysAgo.toISOString());

    const sent = totalSent || 0;
    const bounced = totalBounced || 0;
    const opened = totalOpened || 0;

    const bounceRate = sent > 0 ? bounced / sent : 0;
    const openRate = sent > 0 ? opened / sent : 0;

    // Health score: 100 base, -30 for high bounce, -20 for low opens, -10 for spam
    let healthScore = 100;
    if (bounceRate > BOUNCE_RATE_THRESHOLD) healthScore -= 30;
    else if (bounceRate > 0.02) healthScore -= 15;
    if (openRate < 0.05 && sent > 50) healthScore -= 20; // Low open rate with enough data
    if (bounceRate > SPAM_RATE_THRESHOLD) healthScore -= 10;
    healthScore = Math.max(0, Math.min(100, healthScore));

    const shouldPause = bounceRate > BOUNCE_RATE_THRESHOLD;

    // Update account
    const updates: Record<string, any> = {
        bounce_rate: Math.round(bounceRate * 10000) / 10000,
        bounce_count: bounced,
        health_score: healthScore,
    };

    if (shouldPause) {
        updates.status = 'PAUSED';
    }

    await supabase
        .from('gmail_accounts')
        .update(updates)
        .eq('id', accountId);

    return { bounceRate, healthScore, shouldPause };
}

/** Update health for all active accounts */
export async function updateAllAccountHealth(): Promise<{
    updated: number;
    paused: string[];
}> {
    const { data: accounts } = await supabase
        .from('gmail_accounts')
        .select('id')
        .eq('status', 'ACTIVE');

    if (!accounts) return { updated: 0, paused: [] };

    const paused: string[] = [];
    for (const acc of accounts) {
        const result = await updateAccountHealth(acc.id);
        if (result.shouldPause) paused.push(acc.id);
    }

    return { updated: accounts.length, paused };
}

/** Get health summary for all accounts (for dashboard) */
export async function getAccountHealthSummary(): Promise<any[]> {
    const { data } = await supabase
        .from('gmail_accounts')
        .select('id, email, status, health_score, bounce_rate, bounce_count, warmup_enabled, warmup_day, sent_count_today')
        .order('health_score', { ascending: true });

    return (data || []).map(acc => ({
        id: acc.id,
        email: acc.email,
        status: acc.status,
        healthScore: acc.health_score,
        bounceRate: acc.bounce_rate,
        bounceCount: acc.bounce_count,
        warmupEnabled: acc.warmup_enabled,
        warmupDay: acc.warmup_day,
        sentToday: acc.sent_count_today,
        healthLabel: acc.health_score >= 80 ? 'Excellent' : acc.health_score >= 60 ? 'Good' : acc.health_score >= 40 ? 'Fair' : 'Critical',
        healthColor: acc.health_score >= 80 ? '#10B981' : acc.health_score >= 60 ? '#3B82F6' : acc.health_score >= 40 ? '#F59E0B' : '#EF4444',
    }));
}
