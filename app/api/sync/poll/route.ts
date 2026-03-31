import { NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import { syncAccountHistory } from '../../../../src/services/gmailSyncService';

/**
 * GET /api/sync/poll
 * Ultra-aggressive sync — checks ALL accounts every call.
 *
 * 1. Resets stuck SYNCING accounts
 * 2. Tries to recover ERROR accounts (token might have been refreshed)
 * 3. Syncs all ACTIVE accounts in parallel
 * 4. Updates last_synced_at
 */
export async function GET() {
    // Reset stale SYNCING accounts (stuck for >5 minutes)
    await supabase
        .from('gmail_accounts')
        .update({ status: 'ACTIVE' })
        .eq('status', 'SYNCING')
        .lt('last_synced_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

    // Get ALL accounts (not just ACTIVE — we try to recover ERROR ones too)
    const { data: accounts, error } = await supabase
        .from('gmail_accounts')
        .select('id, email, status, last_synced_at')
        .in('status', ['ACTIVE', 'ERROR']);

    if (error || !accounts) {
        return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }

    const now = Date.now();
    const toSync = accounts.filter(a => {
        // Skip if synced less than 3 seconds ago
        if (a.last_synced_at && now - new Date(a.last_synced_at).getTime() < 3_000) return false;
        return true;
    });

    // Process all in parallel
    const results = await Promise.allSettled(
        toSync.map(async (a) => {
            try {
                await syncAccountHistory(a.id);
                // If it was ERROR and sync succeeded, recover it
                if (a.status === 'ERROR') {
                    await supabase
                        .from('gmail_accounts')
                        .update({ status: 'ACTIVE', last_error_message: null, sync_fail_count: 0 })
                        .eq('id', a.id);
                }
                return 'ok';
            } catch (e: any) {
                // Don't mark as ERROR on transient failures
                const msg = e?.message || '';
                if (msg.includes('invalid_grant') || msg.includes('AUTH_REQUIRED')) {
                    throw e; // genuinely dead token
                }
                // Transient error — still count as synced
                return 'transient';
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
