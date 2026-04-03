import { supabase } from '../lib/supabase';
import { refreshAccessToken } from './googleAuthService';
import { google } from 'googleapis';

/**
 * KEEP-ALIVE SYSTEM — ensures all accounts stay connected permanently
 *
 * 1. Proactively refreshes ALL tokens (including ERROR accounts — they may have been reconnected)
 * 2. Validates each token actually works by calling Gmail API
 * 3. Auto-recovers accounts that were wrongly marked ERROR
 * 4. Renews Gmail watches before they expire
 * 5. Resets sync failures so accounts don't stay stuck
 */
export async function refreshAllTokens() {
    const { data: accounts, error } = await supabase
        .from('gmail_accounts')
        .select('id, email, status, watch_expiry, watch_status, sync_fail_count, last_synced_at, history_id')
        .eq('connection_method', 'OAUTH');

    if (error || !accounts) {
        console.error('[KeepAlive] Failed to fetch accounts:', error?.message);
        return { refreshed: 0, failed: 0, recovered: 0, watchesRenewed: 0 };
    }

    let refreshed = 0, failed = 0, recovered = 0, watchesRenewed = 0;

    for (const account of accounts) {
        try {
            // Step 1: Refresh the token (try ALL accounts, not just ACTIVE)
            await refreshAccessToken(account.id);
            refreshed++;

            // Step 2: If account was ERROR but token works → auto-recover
            if (account.status === 'ERROR') {
                await supabase
                    .from('gmail_accounts')
                    .update({
                        status: 'ACTIVE',
                        last_error_message: null,
                        sync_fail_count: 0,
                    })
                    .eq('id', account.id);
                recovered++;
                console.log(`[KeepAlive] RECOVERED ${account.email} — was ERROR, token valid`);
            }

            // Step 3: Reset sync fail count if it's high (prevents stuck accounts)
            if ((account.sync_fail_count || 0) >= 3) {
                await supabase
                    .from('gmail_accounts')
                    .update({ sync_fail_count: 0 })
                    .eq('id', account.id);
            }

            // Step 4: Renew Gmail watch if expiring within 2 days
            if (account.watch_expiry) {
                const expiresIn = new Date(account.watch_expiry).getTime() - Date.now();
                const twoDays = 2 * 24 * 60 * 60 * 1000;
                if (expiresIn < twoDays) {
                    try {
                        await renewWatch(account.id);
                        watchesRenewed++;
                        console.log(`[KeepAlive] Watch renewed for ${account.email}`);
                    } catch (e: any) {
                        console.error(`[KeepAlive] Watch renewal failed for ${account.email}:`, e.message);
                    }
                }
            }

        } catch (err: any) {
            const msg = err?.message || '';
            if (msg.includes('AUTH_REQUIRED') || msg.includes('invalid_grant')) {
                // Only mark as ERROR if it was previously ACTIVE
                // (don't keep re-marking ERROR accounts)
                if (account.status === 'ACTIVE') {
                    await supabase
                        .from('gmail_accounts')
                        .update({
                            status: 'ERROR',
                            last_error_message: 'Token expired — reconnect via Accounts page',
                        })
                        .eq('id', account.id);
                    console.error(`[KeepAlive] ${account.email} token EXPIRED — needs reconnect`);
                }
                failed++;
            } else {
                // Transient error — don't mark as ERROR, just log
                console.error(`[KeepAlive] ${account.email} transient error:`, msg.slice(0, 100));
            }
        }
    }

    console.log(`[KeepAlive] refreshed:${refreshed} recovered:${recovered} failed:${failed} watches:${watchesRenewed}`);
    return { refreshed, failed, recovered, watchesRenewed };
}

/**
 * Renew Gmail push notification watch for an account
 */
async function renewWatch(accountId: string) {
    const { data: account } = await supabase
        .from('gmail_accounts')
        .select('id, email, refresh_token, access_token, history_id')
        .eq('id', accountId)
        .single();

    if (!account) throw new Error('Account not found');

    const { decrypt } = await import('../utils/encryption');
    const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: decrypt(account.refresh_token) });
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);

    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    // Stop existing watch
    try { await gmail.users.stop({ userId: 'me' }); } catch (e) { /* ignore */ }

    // Get topic from env or use hardcoded fallback
    const topic = process.env.GOOGLE_PUBSUB_TOPIC || 'projects/unibox-app/topics/gmail-push';

    // Create new watch
    const watch = await gmail.users.watch({
        userId: 'me',
        requestBody: {
            topicName: topic,
            labelIds: ['INBOX', 'SENT'],
        },
    });

    const expiry = watch.data.expiration
        ? new Date(parseInt(watch.data.expiration)).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Only set history_id if the account doesn't already have one.
    // Overwriting would break incremental sync by creating a gap.
    const updateData: Record<string, unknown> = {
        watch_status: 'ACTIVE',
        watch_expiry: expiry,
    };
    if (!account.history_id) {
        updateData.history_id = watch.data.historyId?.toString();
    }

    await supabase
        .from('gmail_accounts')
        .update(updateData)
        .eq('id', accountId);
}

/**
 * Health check — validates all accounts can actually access Gmail
 * Call this separately from token refresh for deep validation
 */
export async function validateAllAccounts() {
    const { data: accounts } = await supabase
        .from('gmail_accounts')
        .select('id, email, status, refresh_token')
        .eq('connection_method', 'OAUTH');

    if (!accounts) return { total: 0, active: 0, dead: 0 };

    const { decrypt } = await import('../utils/encryption');
    let active = 0, dead = 0;

    for (const account of accounts) {
        try {
            const oauth2 = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET
            );
            oauth2.setCredentials({ refresh_token: decrypt(account.refresh_token) });
            const { credentials } = await oauth2.refreshAccessToken();
            oauth2.setCredentials(credentials);

            const gmail = google.gmail({ version: 'v1', auth: oauth2 });
            await gmail.users.getProfile({ userId: 'me' });

            // Token works — ensure status is ACTIVE
            if (account.status !== 'ACTIVE') {
                await supabase
                    .from('gmail_accounts')
                    .update({ status: 'ACTIVE', last_error_message: null, sync_fail_count: 0 })
                    .eq('id', account.id);
            }
            active++;
        } catch (e) {
            dead++;
        }
    }

    return { total: accounts.length, active, dead };
}
