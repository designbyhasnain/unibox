import { NextRequest, NextResponse } from 'next/server';
import { syncGmailEmails, syncAccountHistory } from '../../../src/services/gmailSyncService';
import { syncManualEmails } from '../../../src/services/manualEmailService';
import { supabase } from '../../../src/lib/supabase';
import { getSession } from '../../../src/lib/auth';
import { DEFAULT_USER_ID } from '../../constants/config';

/**
 * POST /api/sync
 * Body: { accountId: string }
 *
 * Triggers a fast partial sync if history_id is available,
 * otherwise falls back to a full background sync.
 */
export async function POST(req: NextRequest) {
    try {
        // Verify the user is authenticated
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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

        // Verify the account exists and belongs to the authenticated user's workspace
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

        // Verify the account belongs to the workspace (shared dashboard uses DEFAULT_USER_ID)
        if (account.user_id !== DEFAULT_USER_ID) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const shortId = accountId.substring(0, 8);
        if (account?.connection_method === 'MANUAL') {
            syncManualEmails(accountId).catch((err) => {
                console.error(`[Sync API] Manual sync error for ${shortId}:`, err?.message);
            });
        } else if (account?.history_id && account?.last_synced_at) {
            await syncAccountHistory(accountId);
        } else {
            syncGmailEmails(accountId).catch((err) => {
                console.error(`[Sync API] Full sync error for ${shortId}:`, err?.message);
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
