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

        if (!accountId || typeof accountId !== 'string') {
            return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
        }

        // Basic UUID format validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(accountId)) {
            return NextResponse.json({ error: 'Invalid accountId format' }, { status: 400 });
        }

        console.log(`[Sync API] Manual sync triggered for account ${accountId}`);

        // Basic validation: verify the account exists and belongs to a valid user
        const { data: account, error: accountError } = await supabase
            .from('gmail_accounts')
            .select('history_id, connection_method, last_synced_at, user_id')
            .eq('id', accountId)
            .single();

        if (accountError || !account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        if (!account.user_id) {
            return NextResponse.json({ error: 'Account has no associated user' }, { status: 403 });
        }

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
