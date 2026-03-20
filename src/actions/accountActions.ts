'use server';

import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { supabase } from '../lib/supabase';
import { getGoogleAuthUrl, generateOAuthState, handleAuthCallback } from '../services/googleAuthService';
import { testManualConnection } from '../services/manualEmailService';
import { encrypt, decrypt } from '../utils/encryption';
import { syncGmailEmails } from '../services/gmailSyncService';
import { syncManualEmails } from '../services/manualEmailService';
import { normalizeEmail } from '../utils/emailNormalizer';
import { ensureAuthenticated } from '../lib/safe-action';

export async function getGoogleAuthUrlAction(): Promise<string> {
    await ensureAuthenticated();
    const state = generateOAuthState();

    const cookieStore = await cookies();
    cookieStore.set('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
        path: '/api/auth',
    });

    return getGoogleAuthUrl(state);
}

export async function connectManualAccountAction(
    email: string,
    appPassword: string,
    config?: {
        imapHost?: string;
        imapPort?: number;
        smtpHost?: string;
        smtpPort?: number;
    }
): Promise<{ success: boolean; error?: string; account?: any }> {
    const userId = await ensureAuthenticated();
    try {
        if (!email || !appPassword) {
            return { success: false, error: 'Email and app password are required' };
        }

        const normalizedEmail = normalizeEmail(email);

        // Test the credentials first
        const testResult = await testManualConnection(normalizedEmail, appPassword, config);
        if (!testResult.success) {
            return { success: false, error: testResult.error || 'Connection test failed' };
        }

        // Check if an OAuth account already exists for this email to avoid overwriting it
        const { data: existingAccount } = await supabase
            .from('gmail_accounts')
            .select('id, connection_method')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (existingAccount && existingAccount.connection_method === 'OAUTH') {
            return { success: false, error: 'This email is already connected via OAuth. Remove the OAuth connection first before adding a manual connection.' };
        }

        const encryptedPassword = encrypt(appPassword);

        const { data: account, error } = await supabase
            .from('gmail_accounts')
            .upsert({
                user_id: userId,
                email: normalizedEmail,
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
        console.error('[accountActions] connectManualAccountAction error:', err);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}




export async function getAccountsAction() {
    const userId = await ensureAuthenticated();
    try {

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
            console.error('[accountActions] getAccountsAction database error:', error);
            return { success: false, accounts: [], error: 'An error occurred while processing your request' };
        }

        // 2. Fetch thread counts per account in a single fast query using denormalized email_threads table
        const accountIds = (rawData ?? []).map(a => a.id);
        const countsByAccount: Record<string, number> = {};
        if (accountIds.length > 0) {
            const { data: countData } = await supabase.rpc('get_account_thread_counts', {
                p_account_ids: accountIds
            });
            if (countData && typeof countData === 'object') {
                Object.assign(countsByAccount, countData);
            }
        }

        const accountsWithCounts = (rawData ?? []).map((acc) => ({
            ...acc,
            sent_count_today: acc.sent_count_today || 0,
            manager_name: acc.users?.name,
            emails_count: countsByAccount[acc.id] ?? 0
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
        console.error('[accountActions] getAccountsAction unexpected error:', err);
        return { success: false, accounts: [], error: 'An error occurred while processing your request' };
    }
}


export async function reSyncAccountAction(accountId: string, connectionMethod: 'OAUTH' | 'MANUAL'): Promise<{ success: boolean; error?: string }> {
    await ensureAuthenticated();
    if (!accountId) return { success: false, error: 'accountId is required' };
    try {
        if (connectionMethod === 'OAUTH') {
            // Trigger sync in the background so we don't block the UI forever
            syncGmailEmails(accountId).catch(console.error);
        } else {
            syncManualEmails(accountId).catch(console.error);
        }
        return { success: true };
    } catch (error: any) {
        console.error('[accountActions] reSyncAccountAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}

export async function syncAllUserAccountsAction(): Promise<{ success: boolean; accountsSynced: number }> {
    const userId = await ensureAuthenticated();
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
    await ensureAuthenticated();
    if (!accountId) return { success: false, error: 'accountId is required' };
    // Only allow toggling between ACTIVE and PAUSED states
    if (currentStatus !== 'ACTIVE' && currentStatus !== 'PAUSED') {
        return { success: false, error: `Cannot toggle from status '${currentStatus}'. Only ACTIVE and PAUSED accounts can be toggled.` };
    }
    const newStatus = currentStatus === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
    try {
        const { error } = await supabase
            .from('gmail_accounts')
            .update({ status: newStatus })
            .eq('id', accountId);

        if (error) throw error;
        return { success: true, status: newStatus };
    } catch (err: any) {
        console.error('[accountActions] toggleSyncStatusAction error:', err);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}

export async function stopSyncingAction(accountId: string) {
    await ensureAuthenticated();
    if (!accountId) return { success: false, error: 'accountId is required' };
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
        console.error('[accountActions] stopSyncingAction error:', err);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}

export async function removeAccountAction(accountId: string): Promise<{ success: boolean; error?: string }> {
    await ensureAuthenticated();
    if (!accountId) return { success: false, error: 'accountId is required' };

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
        console.error('[accountActions] removeAccountAction error:', error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
    return { success: true };
}
