import { NextRequest, NextResponse } from 'next/server';
import { syncGmailEmails, syncAccountHistory } from '../../../src/services/gmailSyncService';
import { syncManualEmails } from '../../../src/services/manualEmailService';
import { supabase } from '../../../src/lib/supabase';

/**
 * POST /api/sync
 * Body: { accountId: string }
 *
 * Triggers a fast partial sync if history_id is available,
 * otherwise falls back to a full background sync.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { accountId } = body;

        if (!accountId) {
            return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
        }

        console.log(`[Sync API] Manual sync triggered for account ${accountId}`);

        const { data: account } = await supabase
            .from('gmail_accounts')
            .select('history_id, connection_method, last_synced_at')
            .eq('id', accountId)
            .single();

        if (account?.connection_method === 'MANUAL') {
            console.log(`[Sync API] Running manual IMAP sync for ${accountId}`);
            syncManualEmails(accountId).catch((err) => {
                console.error(`[Sync API] Background manual sync error for ${accountId}:`, err?.message);
            });
        } else if (account?.history_id && account?.last_synced_at) {
            // Fast partial sync
            console.log(`[Sync API] Running fast partial sync for ${accountId}`);
            await syncAccountHistory(accountId);
        } else {
            // Full sync (runs in background because it takes a long time)
            console.log(`[Sync API] Running full sync in background for ${accountId}`);
            syncGmailEmails(accountId).catch((err) => {
                console.error(`[Sync API] Background full sync error for ${accountId}:`, err?.message);
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Sync completed or started successfully.',
        });
    } catch (err: any) {
        console.error('[Sync API] Error:', err);
        return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
    }
}
