import { supabase } from '../lib/supabase';
import { refreshAccessToken } from './googleAuthService';

export async function refreshAllTokens() {
    const { data: accounts, error } = await supabase
        .from('gmail_accounts')
        .select('id, email, status')
        .eq('connection_method', 'OAUTH');

    if (error || !accounts) {
        console.error('[TokenRefresh] Failed to fetch accounts:', error?.message);
        return { refreshed: 0, failed: 0, skipped: 0 };
    }

    let refreshed = 0, failed = 0, skipped = 0;

    for (const account of accounts) {
        // Skip accounts that already need reconnect
        if (account.status === 'RECONNECT_REQUIRED') { skipped++; continue; }

        try {
            await refreshAccessToken(account.id);
            refreshed++;

            // If account was in ERROR, reset to ACTIVE
            if (account.status === 'ERROR') {
                await supabase
                    .from('gmail_accounts')
                    .update({ status: 'ACTIVE', last_error_message: null, sync_fail_count: 0 })
                    .eq('id', account.id);
            }
        } catch (err: any) {
            const msg = err?.message || '';
            if (msg.includes('AUTH_REQUIRED') || msg.includes('invalid_grant')) {
                await supabase
                    .from('gmail_accounts')
                    .update({
                        status: 'RECONNECT_REQUIRED',
                        last_error_message: 'Token expired — reconnect via Accounts page',
                    })
                    .eq('id', account.id);
                failed++;
            } else {
                skipped++;
            }
        }
    }

    console.log(`[TokenRefresh] refreshed:${refreshed} failed:${failed} skipped:${skipped}`);
    return { refreshed, failed, skipped };
}
