import 'server-only';
import { supabase } from '../lib/supabase';
import { startGmailWatch, syncGmailEmails } from './gmailSyncService';
import { refreshAccessToken } from './googleAuthService';

/**
 * Renews Gmail Pub/Sub watches that are expiring within 48 hours,
 * have expired, are inactive, or were never set up.
 *
 * Called by:
 * - /api/cron/renew-gmail-watches (every 3 days via QStash)
 * - renewAllWatchesAction (manual admin trigger)
 */
export async function renewExpiringWatches(): Promise<{
    renewed: number;
    failed: number;
    errors: string[];
}> {
    const errors: string[] = [];
    let renewed = 0;
    let failed = 0;

    const cutoff = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    // Find accounts needing watch renewal
    const { data: accounts, error } = await supabase
        .from('gmail_accounts')
        .select('id, email, access_token, watch_expiry, watch_status, connection_method, status')
        .eq('connection_method', 'OAUTH')
        .eq('status', 'ACTIVE')
        .or(`watch_expiry.is.null,watch_expiry.lte.${cutoff},watch_status.eq.EXPIRED,watch_status.eq.INACTIVE,watch_status.eq.ERROR`);

    if (error || !accounts || accounts.length === 0) {
        return { renewed, failed, errors };
    }

    console.warn(`[WatchRenewal] Found ${accounts.length} accounts to renew`);

    for (const account of accounts) {
        try {
            // Refresh access token first
            let accessToken = account.access_token;
            try {
                accessToken = await refreshAccessToken(account.id);
            } catch (refreshErr: unknown) {
                const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
                errors.push(`${account.email}: token refresh failed — ${msg}`);
                failed++;
                continue;
            }

            // Set up watch
            const result = await startGmailWatch(account.id);

            if (result.success) {
                renewed++;
                console.warn(`[WatchRenewal] Renewed for ${account.email}, expires: ${result.expiry?.toISOString()}`);

                // Non-blocking catch-up sync to pick up any missed emails
                syncGmailEmails(account.id).catch(err => {
                    console.error(`[WatchRenewal] Post-renewal sync failed for ${account.email}:`, err?.message);
                });
            } else {
                failed++;
                errors.push(`${account.email}: ${result.error}`);
            }
        } catch (err: unknown) {
            failed++;
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`${account.email}: ${msg}`);
            console.error(`[WatchRenewal] Error for ${account.email}:`, msg);
        }
    }

    return { renewed, failed, errors };
}
