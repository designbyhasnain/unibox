import 'server-only';
import { supabase } from '../lib/supabase';

/**
 * Account Rotation Service (v2)
 * - Round-robin across agent's accounts
 * - Once a prospect is contacted from Account A, all follow-ups use Account A
 * - Respects warmup limits and daily send caps
 */

/** Get the effective daily send limit considering warmup mode */
export function getEffectiveDailyLimit(account: {
    warmup_enabled: boolean;
    warmup_day: number;
    daily_send_limit?: number;
}): number {
    if (!account.warmup_enabled) return account.daily_send_limit || 500;
    // Start at 20, increase by ~10 per week (1.43/day)
    const warmupLimit = Math.min(20 + Math.floor(account.warmup_day * 10 / 7), 500);
    return Math.min(warmupLimit, account.daily_send_limit || 500);
}

/** Select the best Gmail account to send from for a given prospect */
export async function selectAccountForProspect(
    agentId: string,
    prospectEmail: string
): Promise<string | null> {
    // 1. Check if prospect was already contacted from a specific account
    const { data: existing } = await supabase
        .from('email_messages')
        .select('gmail_account_id')
        .ilike('to_email', `%${prospectEmail}%`)
        .eq('direction', 'SENT')
        .order('sent_at', { ascending: false })
        .limit(1);

    if (existing && existing.length > 0 && existing[0]!.gmail_account_id) {
        return existing[0]!.gmail_account_id;
    }

    // 2. Get agent's assigned accounts with send counts
    const { data: assignments } = await supabase
        .from('user_gmail_assignments')
        .select('gmail_account_id')
        .eq('user_id', agentId);

    if (!assignments || assignments.length === 0) {
        // Fallback: get accounts created by this user
        const { data: owned } = await supabase
            .from('gmail_accounts')
            .select('id, sent_count_today, warmup_enabled, warmup_day, status')
            .eq('user_id', agentId)
            .eq('status', 'ACTIVE');
        if (!owned || owned.length === 0) return null;
        return pickBestAccount(owned);
    }

    const accountIds = assignments.map(a => a.gmail_account_id);
    const { data: accounts } = await supabase
        .from('gmail_accounts')
        .select('id, sent_count_today, warmup_enabled, warmup_day, status, health_score')
        .in('id', accountIds)
        .eq('status', 'ACTIVE')
        .order('sent_count_today', { ascending: true });

    if (!accounts || accounts.length === 0) return null;
    return pickBestAccount(accounts);
}

/** Pick the account with the most remaining capacity */
function pickBestAccount(accounts: any[]): string | null {
    let bestAccount: any = null;
    let bestRemaining = -1;

    for (const acc of accounts) {
        if (acc.health_score < 50) continue; // Skip unhealthy accounts
        const limit = getEffectiveDailyLimit(acc);
        const remaining = limit - (acc.sent_count_today || 0);
        if (remaining > bestRemaining) {
            bestRemaining = remaining;
            bestAccount = acc;
        }
    }

    return bestAccount?.id || accounts[0]?.id || null;
}

/** Reset daily send counts (call at midnight via cron) */
export async function resetDailySendCounts(): Promise<void> {
    await supabase
        .from('gmail_accounts')
        .update({ sent_count_today: 0, last_send_reset_at: new Date().toISOString() })
        .neq('sent_count_today', 0);
}

/** Increment warmup day for all accounts in warmup mode */
export async function incrementWarmupDays(): Promise<void> {
    const { data: accounts } = await supabase
        .from('gmail_accounts')
        .select('id, warmup_day')
        .eq('warmup_enabled', true);

    if (!accounts) return;
    for (const acc of accounts) {
        const newDay = acc.warmup_day + 1;
        const limit = Math.min(20 + Math.floor(newDay * 10 / 7), 500);
        await supabase
            .from('gmail_accounts')
            .update({
                warmup_day: newDay,
                // Auto-disable warmup when fully warmed up
                warmup_enabled: limit < 500,
            })
            .eq('id', acc.id);
    }
}
