import { NextResponse } from 'next/server';
import { supabase } from '../../../../src/lib/supabase';
import { syncAccountHistory } from '../../../../src/services/gmailSyncService';

/**
 * GET /api/sync/poll
 * Lightweight polling endpoint — checks all active accounts for new emails.
 * Called by the client every 60 seconds.
 * Uses Gmail historyId to detect changes with minimal API usage.
 */
export async function GET() {
    const { data: accounts, error } = await supabase
        .from('gmail_accounts')
        .select('id, email, status, last_synced_at')
        .eq('status', 'ACTIVE');

    if (error || !accounts) {
        console.error('[Poll] Failed to fetch accounts:', error?.message, error?.code);
        return NextResponse.json({ error: 'Failed to fetch accounts', detail: error?.message }, { status: 500 });
    }

    const now = Date.now();
    let synced = 0, skipped = 0, errors = 0;
    const newEmails: string[] = [];

    for (const account of accounts) {
        // Skip if synced in the last 45 seconds (rate limit)
        if (account.last_synced_at) {
            const lastSync = new Date(account.last_synced_at).getTime();
            if (now - lastSync < 3_000) { skipped++; continue; }
        }

        // Skip accounts needing reconnect
        if (account.status === 'RECONNECT_REQUIRED') { skipped++; continue; }

        try {
            await syncAccountHistory(account.id);
            synced++;
        } catch (err: any) {
            errors++;
            console.error(`[Poll] ${account.email}:`, err.message?.slice(0, 80));
        }
    }

    return NextResponse.json({
        synced,
        skipped,
        errors,
        total: accounts.length,
        timestamp: new Date().toISOString(),
    });
}

// Allow up to 30s for this endpoint (syncing multiple accounts)
export const maxDuration = 30;
