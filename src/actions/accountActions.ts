'use server';

import { google } from 'googleapis';
import { supabase } from '../lib/supabase';
import { getGoogleAuthUrl, handleAuthCallback } from '../services/googleAuthService';
import { testManualConnection } from '../services/manualEmailService';
import { encrypt, decrypt } from '../utils/encryption';
import { syncGmailEmails } from '../services/gmailSyncService';
import { syncManualEmails } from '../services/manualEmailService';

export async function getGoogleAuthUrlAction(): Promise<string> {
    return getGoogleAuthUrl();
}

export async function connectManualAccountAction(
    email: string,
    appPassword: string,
    userId: string,
    config?: {
        imapHost?: string;
        imapPort?: number;
        smtpHost?: string;
        smtpPort?: number;
    }
): Promise<{ success: boolean; error?: string; account?: any }> {
    try {
        // Test the credentials first
        const testResult = await testManualConnection(email, appPassword, config);
        if (!testResult.success) {
            return { success: false, error: testResult.error || 'Connection test failed' };
        }

        const encryptedPassword = encrypt(appPassword);

        const { data: account, error } = await supabase
            .from('gmail_accounts')
            .upsert({
                user_id: userId,
                email,
                connection_method: 'MANUAL',
                app_password: encryptedPassword,
                status: 'ACTIVE',
                smtp_host: config?.smtpHost,
                smtp_port: config?.smtpPort,
                imap_host: config?.imapHost,
                imap_port: config?.imapPort,
            }, { onConflict: 'email' })
            .select('*')
            .single();

        if (error) throw error;
        return { success: true, account };
    } catch (err: any) {
        console.error('connectManualAccountAction error:', err);
        return { success: false, error: err.message || 'Unknown error' };
    }
}




export async function getAccountsAction(userId: string) {
    try {
        console.log('[getAccountsAction] Fetching for:', userId);

        // 1. Fetch basic account data first
        const { data: rawData, error } = await supabase
            .from('gmail_accounts')
            .select(`
                *,
                users ( name )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[getAccountsAction] Database error:', error);
            return { success: false, accounts: [], error: error.message };
        }

        // 2. Fetch counts separately for each account to avoid slow joins/timeouts
        const accountIds = (rawData ?? []).map(a => a.id);
        const accountsWithCounts = await Promise.all((rawData ?? []).map(async (acc) => {
            try {
                // Single targeted count query per account is often faster and less prone to timeouts
                const { count, error: countErr } = await supabase
                    .from('email_messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('gmail_account_id', acc.id);

                if (countErr) {
                    console.warn(`[getAccountsAction] Could not get count for ${acc.email}:`, countErr.message);
                }

                return {
                    ...acc,
                    sent_count_today: acc.sent_count_today || 0,
                    manager_name: acc.users?.name,
                    emails_count: count ?? 0
                };
            } catch (e) {
                return { ...acc, emails_count: 0 };
            }
        }));

        // 3. Auto-fix stuck syncs (more than 15 mins or 100% progress)
        const now = new Date();
        const stuckAccounts = accountsWithCounts.filter(acc => {
            if (acc.status !== 'SYNCING') return false;
            if (acc.sync_progress === 100) return true;
            const lastUpdate = new Date(acc.updated_at);
            const minsSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
            return minsSinceUpdate > 15; // Stuck for 15+ mins
        });

        if (stuckAccounts.length > 0) {
            console.log('[getAccountsAction] Fixing stuck syncs:', stuckAccounts.length);
            // Fire and forget update
            (async () => {
                try {
                    await supabase
                        .from('gmail_accounts')
                        .update({ status: 'ACTIVE', sync_progress: 100 })
                        .in('id', stuckAccounts.map(a => a.id));
                } catch (err) {
                    console.error('[getAccountsAction] Failed to fix stuck syncs:', err);
                }
            })();

            // Reflect in the returned objects
            stuckAccounts.forEach(sa => {
                const local = accountsWithCounts.find(a => a.id === sa.id);
                if (local) {
                    local.status = 'ACTIVE';
                    local.sync_progress = 100;
                }
            });
        }

        console.log('[getAccountsAction] Found accounts:', accountsWithCounts.length);
        return { success: true, accounts: accountsWithCounts };
    } catch (err: any) {
        console.error('[getAccountsAction] Unexpected error:', err);
        return { success: false, accounts: [], error: err.message || 'Unexpected server error' };
    }
}


export async function reSyncAccountAction(accountId: string, connectionMethod: 'OAUTH' | 'MANUAL'): Promise<{ success: boolean; error?: string }> {
    try {
        if (connectionMethod === 'OAUTH') {
            // Trigger sync in the background so we don't block the UI forever
            syncGmailEmails(accountId).catch(console.error);
        } else {
            syncManualEmails(accountId).catch(console.error);
        }
        return { success: true };
    } catch (error: any) {
        console.error('reSyncAccountAction error:', error);
        return { success: false, error: error.message };
    }
}

export async function syncAllUserAccountsAction(userId: string): Promise<{ success: boolean; accountsSynced: number }> {
    const { data: accounts } = await supabase.from('gmail_accounts').select('id, connection_method').eq('user_id', userId);
    if (!accounts || accounts.length === 0) return { success: true, accountsSynced: 0 };

    for (const acc of accounts) {
        if (acc.connection_method === 'OAUTH') {
            syncGmailEmails(acc.id).catch(console.error);
        } else {
            syncManualEmails(acc.id).catch(console.error);
        }
    }
    return { success: true, accountsSynced: accounts.length };
}

export async function toggleSyncStatusAction(accountId: string, currentStatus: string) {
    const newStatus = currentStatus === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
    try {
        const { error } = await supabase
            .from('gmail_accounts')
            .update({ status: newStatus })
            .eq('id', accountId);

        if (error) throw error;
        return { success: true, status: newStatus };
    } catch (err: any) {
        console.error('toggleSyncStatusAction error:', err);
        return { success: false, error: err.message };
    }
}

export async function stopSyncingAction(accountId: string) {
    try {
        const { error } = await supabase
            .from('gmail_accounts')
            .update({
                status: 'ACTIVE',
                sync_progress: 100
            })
            .eq('id', accountId);

        if (error) throw error;
        return { success: true };
    } catch (err: any) {
        console.error('stopSyncingAction error:', err);
        return { success: false, error: err.message };
    }
}

export async function removeAccountAction(accountId: string): Promise<{ success: boolean; error?: string }> {
    const { data: account } = await supabase.from('gmail_accounts').select('*').eq('id', accountId).single();
    if (!account) return { success: false, error: 'Account not found.' };

    if (account.connection_method === 'OAUTH' && account.refresh_token) {
        try {
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );
            const decryptedToken = decrypt(account.refresh_token);
            await oauth2Client.revokeToken(decryptedToken);
        } catch (e: any) {
            console.error('Failed to revoke token', e.message);
        }
    }

    // ── Protect CRM Data ──────────────────────────────────────────────────────
    // We want to keep Projects and Contacts even if the account is removed.
    // We also want to keep the "mail history" for these clients.

    // 1. Identify and "protect" emails linked to contacts or projects 
    // by nullifying their gmail_account_id so they aren't deleted by cascade.
    await supabase
        .from('email_messages')
        .update({ gmail_account_id: null })
        .eq('gmail_account_id', accountId)
        .or('contact_id.not.is.null');
    // Note: Projects reference messages by ID, so as long as the message exists, 
    // the project link remains valid.

    // ── Final Account Deletion ────────────────────────────────────────────────
    // This will delete the account and CASCADE delete all general sync emails 
    // (the ones we didn't nullify above).

    const { error } = await supabase
        .from('gmail_accounts')
        .delete()
        .eq('id', accountId);

    if (error) {
        console.error('removeAccountAction error:', error);
        return { success: false, error: error.message };
    }
    return { success: true };
}
