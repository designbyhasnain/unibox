import { NextResponse } from 'next/server';
import { getSession } from '../../../../src/lib/auth';
import { supabase } from '../../../../src/lib/supabase';
import { syncAccountHistory } from '../../../../src/services/gmailSyncService';

/**
 * GET /api/sync/poll
 * Polls for new emails across accounts. Called every 60s from useMailbox.
 *
 * Optimizations vs original:
 * - Requires session auth (was unauthenticated)
 * - Skips accounts synced < 30s ago (was 3s)
 * - Only syncs ACTIVE accounts (was ACTIVE + ERROR)
 * - Max 5 accounts per poll (was unlimited)
 */
export async function GET() {
    // Auth check — prevent unauthenticated CPU abuse
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Reset stale SYNCING accounts (stuck for >5 minutes)
    await supabase
        .from('gmail_accounts')
        .update({ status: 'ACTIVE' })
        .eq('status', 'SYNCING')
        .lt('last_synced_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

    // Only ACTIVE accounts — ERROR recovery belongs in hourly cron, not polling
    const { data: accounts, error } = await supabase
        .from('gmail_accounts')
        .select('id, email, status, last_synced_at')
        .eq('status', 'ACTIVE');

    if (error || !accounts) {
        return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }

    const now = Date.now();
    const toSync = accounts
        .filter(a => {
            // Skip if synced less than 30 seconds ago (was 3s — way too aggressive)
            if (a.last_synced_at && now - new Date(a.last_synced_at).getTime() < 30_000) return false;
            return true;
        })
        .slice(0, 5); // Cap at 5 accounts per poll to limit CPU

    // Process in parallel (capped at 5)
    const results = await Promise.allSettled(
        toSync.map(async (a) => {
            try {
                await syncAccountHistory(a.id);
                return 'ok';
            } catch {
                return 'error';
            }
        })
    );

    const synced = results.filter(r => r.status === 'fulfilled').length;
    const errors = results.filter(r => r.status === 'rejected').length;

    return NextResponse.json({
        synced,
        skipped: accounts.length - toSync.length,
        errors,
        total: accounts.length,
        timestamp: new Date().toISOString(),
    });
}

export const maxDuration = 30;
