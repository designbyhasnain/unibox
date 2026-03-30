import { NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import { syncAccountHistory } from '../../../../src/services/gmailSyncService';

/**
 * GET /api/sync/poll
 * Fallback polling endpoint — syncs all active accounts in parallel.
 * Called by the client every 30 seconds as a safety net for missed webhooks.
 */
export async function GET() {
    // Reset stale SYNCING accounts (stuck for >10 minutes)
    await supabase
        .from('gmail_accounts')
        .update({ status: 'ACTIVE' })
        .eq('status', 'SYNCING')
        .lt('last_synced_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    const { data: accounts, error } = await supabase
        .from('gmail_accounts')
        .select('id, email, status, last_synced_at')
        .eq('status', 'ACTIVE');

    if (error || !accounts) {
        return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }

    const now = Date.now();
    const toSync = accounts.filter(a => {
        if (!a.last_synced_at) return true;
        return now - new Date(a.last_synced_at).getTime() > 10_000; // skip if synced <10s ago
    });

    // Process in parallel — much faster than sequential
    const results = await Promise.allSettled(
        toSync.map(a => syncAccountHistory(a.id))
    );

    const synced = results.filter(r => r.status === 'fulfilled').length;
    const errors = results.filter(r => r.status === 'rejected').length;

    return NextResponse.json({
        synced,
        skipped: accounts.length - toSync.length,
        errors,
        total: accounts.length,
    });
}

export const maxDuration = 30;
